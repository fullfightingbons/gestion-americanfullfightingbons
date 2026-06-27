/**
 * Worker Gestion AFFBC
 * Back-office : adhérents, comptabilité, achats, factures, diplômes.
 */

export interface Env {
  DB: D1Database;              // affbc-production (tables locales : adherents, journal_comptable, etc.)
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;      // secret HMAC pour la signature des tokens JWT (wrangler secret put SESSION_SECRET)
  PASSWORD_PEPPER: string;     // pepper PBKDF2 (wrangler secret put PASSWORD_PEPPER)
  BREVO_API_KEY?: string;      // clé API Brevo pour l'envoi d'emails (wrangler secret put BREVO_API_KEY)
  BREVO_FROM_EMAIL?: string;   // adresse expéditeur Brevo (wrangler secret put BREVO_FROM_EMAIL)
  BREVO_FROM_NAME?: string;    // nom expéditeur Brevo (wrangler secret put BREVO_FROM_NAME)
  ASSETS: Fetcher;
  R2_STORAGE?: R2Bucket;
  R2_PDF?: R2Bucket;
}

import {verifyPassword, createSessionToken, parseSessionToken, hashPassword, prepareUserWriteValues, hasStoragePermission, isPublicStorageObject} from './lib/security';

// ─── Helpers ────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function requireAuth(request: Request, env: Env): Promise<boolean> {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  const payload = await parseSessionToken(token, env as any);
  if (!payload || Number(payload.expiresAt) <= Date.now()) return false;
  // Vérifier que le token n'a pas été révoqué (liste noire dans admin_sessions)
  const revoked = await env.DB
    .prepare(`SELECT token FROM admin_sessions WHERE token = ? AND expires_at > datetime('now') LIMIT 1`)
    .bind(`__revoked__${token}`)
    .first();
  if (revoked) return false;
  return true;
}

// ─── /api/bootstrap & /api/db/:table — allowlist et permissions ─────────────
// Reconstruit après une régression (cf. historique git) qui avait fait
// disparaître ces routes : le frontend (app.js → CloudflareQueryBuilder)
// dépend entièrement de /api/db/:table pour toutes les données de l'appli.

type PermissionMatrix = Record<string, Record<string, string>>;

const DB_TABLES = new Set([
  'adherents', 'achats', 'audit_logs', 'club_info', 'comptes_bancaires',
  'diplomes', 'exercices', 'factures', 'feedback_campaigns', 'feedback_recipients', 'feedback_responses',
  'inscriptions_publiques',
  'journal_comptable', 'transactions', 'utilisateurs',
]);

const DB_PRIMARY_KEYS: Record<string, string> = {
  adherents: 'id', achats: 'id', audit_logs: 'id', club_info: 'cle',
  comptes_bancaires: 'id', diplomes: 'id', exercices: 'id', factures: 'id',
  feedback_campaigns: 'id', feedback_recipients: 'id', feedback_responses: 'id',
  inscriptions_publiques: 'id', journal_comptable: 'id', transactions: 'id',
  utilisateurs: 'id',
};

const DB_TABLE_PERMISSIONS: Record<string, { read: string; write: string }> = {
  adherents: { read: 'perm_adherents', write: 'perm_adherents' },
  achats: { read: 'perm_achats', write: 'perm_achats' },
  audit_logs: { read: 'perm_administration', write: 'perm_administration' },
  club_info: { read: 'perm_administration', write: 'perm_administration' },
  comptes_bancaires: { read: 'perm_banque', write: 'perm_banque' },
  diplomes: { read: 'perm_adherents', write: 'perm_adherents' },
  exercices: { read: 'perm_comptabilite', write: 'perm_comptabilite' },
  factures: { read: 'perm_facturation', write: 'perm_facturation' },
  feedback_campaigns: { read: 'perm_administration', write: 'perm_administration' },
  feedback_recipients: { read: 'perm_administration', write: 'perm_administration' },
  feedback_responses: { read: 'perm_administration', write: 'perm_administration' },
  inscriptions_publiques: { read: 'perm_administration', write: 'perm_administration' },
  journal_comptable: { read: 'perm_comptabilite', write: 'perm_comptabilite' },
  transactions: { read: 'perm_banque', write: 'perm_banque' },
  utilisateurs: { read: 'perm_administration', write: 'perm_administration' },
};

const DB_DEFAULT_ROLE_PERMS: PermissionMatrix = {
  admin: { perm_adherents: 'write', perm_banque: 'write', perm_comptabilite: 'write', perm_achats: 'write', perm_facturation: 'write', perm_administration: 'write' },
  tresorier: { perm_adherents: 'write', perm_banque: 'write', perm_comptabilite: 'write', perm_achats: 'write', perm_facturation: 'write', perm_administration: 'none' },
  secretaire: { perm_adherents: 'write', perm_banque: 'none', perm_comptabilite: 'none', perm_achats: 'none', perm_facturation: 'none', perm_administration: 'none' },
  entraineur: { perm_adherents: 'read', perm_banque: 'none', perm_comptabilite: 'none', perm_achats: 'none', perm_facturation: 'none', perm_administration: 'none' },
  membre: { perm_adherents: 'none', perm_banque: 'none', perm_comptabilite: 'none', perm_achats: 'none', perm_facturation: 'none', perm_administration: 'none' },
};

const PUBLIC_CLUB_INFO_KEYS = new Set(['nom', 'logo', 'email', 'telephone', 'adresse', 'siret', 'diplome_signature_url', 'diplome_layouts']);

const DB_MAX_QUERY_LIMIT = 5000;

function dbQuoteIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Identifiant invalide: ${value}`);
  return `"${value}"`;
}

function dbNormalizeValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value;
}

async function getCurrentUserFromBearer(request: Request, env: Env): Promise<Record<string, any> | null> {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const session = await parseSessionToken(token, env as any);
  if (!session || !session.userId || Number(session.expiresAt) < Date.now()) return null;
  const user = await env.DB.prepare(`SELECT * FROM utilisateurs WHERE id = ? AND actif = 1`).bind(session.userId).first<Record<string, any>>();
  if (!user) return null;
  if (session.pwdStamp !== undefined) {
    const currentStamp = String(user.password_changed_at || '');
    if (String(session.pwdStamp) !== currentStamp) return null;
  }
  return user;
}

async function getRolePerms(env: Env): Promise<PermissionMatrix> {
  try {
    const row = await env.DB.prepare(`SELECT valeur FROM club_info WHERE cle = 'role_permissions'`).first<{ valeur: string }>();
    if (row?.valeur) {
      const parsed = JSON.parse(String(row.valeur));
      if (parsed && typeof parsed === 'object') return { ...DB_DEFAULT_ROLE_PERMS, ...parsed };
    }
  } catch {
    // ignore — on retombe sur les permissions par défaut
  }
  return DB_DEFAULT_ROLE_PERMS;
}

function getPermLevel(user: Record<string, any>, key: string, rolePerms: PermissionMatrix): string {
  const direct = String(user[key] ?? '');
  if (direct === 'write' || direct === 'read' || direct === 'none') return direct;
  const role = String(user.role || '');
  return rolePerms[role]?.[key] || 'none';
}

function dbHasPermission(user: Record<string, any>, permKey: string, mode: 'read' | 'write', rolePerms: PermissionMatrix): boolean {
  if (String(user.role || '') === 'admin') return true;
  const level = getPermLevel(user, permKey, rolePerms);
  if (mode === 'read') return level === 'read' || level === 'write';
  return level === 'write';
}

async function handleDbApi(request: Request, env: Env, table: string): Promise<Response> {
  if (!DB_TABLES.has(table)) return err('Table inconnue', 404);

  const user = await getCurrentUserFromBearer(request, env);
  if (!user) return err('Unauthorized', 401);

  let body: any;
  try { body = await request.json(); } catch { return err('Invalid JSON body', 400); }

  const op: string = body?.op || 'select';
  const rolePerms = await getRolePerms(env);
  const perms = DB_TABLE_PERMISSIONS[table] || { read: 'perm_administration', write: 'perm_administration' };
  const mode: 'read' | 'write' = op === 'select' ? 'read' : 'write';
  const permKey = mode === 'read' ? perms.read : perms.write;
  if (!dbHasPermission(user, permKey, mode, rolePerms)) {
    return err('Permission refusée', 403);
  }

  const primaryKey = DB_PRIMARY_KEYS[table] || 'id';
  const filters: Array<{ op: string; column: string; value: unknown }> = Array.isArray(body?.filters) ? body.filters : [];

  function buildWhere(): { sql: string; params: unknown[] } {
    if (!filters.length) return { sql: '', params: [] };
    const parts: string[] = [];
    const params: unknown[] = [];
    for (const f of filters) {
      const col = dbQuoteIdentifier(String(f.column));
      if (f.op === 'in' && Array.isArray(f.value)) {
        if (!f.value.length) { parts.push('0'); continue; }
        parts.push(`${col} IN (${f.value.map(() => '?').join(',')})`);
        params.push(...f.value.map(dbNormalizeValue));
      } else {
        parts.push(`${col} = ?`);
        params.push(dbNormalizeValue(f.value));
      }
    }
    return { sql: ` WHERE ${parts.join(' AND ')}`, params };
  }

  try {
    if (op === 'select') {
      const { sql: whereSql, params } = buildWhere();
      let columnsSql = '*';
      if (typeof body?.columns === 'string' && body.columns.trim() && body.columns.trim() !== '*') {
        columnsSql = body.columns.split(',').map((c: string) => dbQuoteIdentifier(c.trim())).join(', ');
      }
      let sql = `SELECT ${columnsSql} FROM ${dbQuoteIdentifier(table)}${whereSql}`;
      if (body?.order?.column) {
        sql += ` ORDER BY ${dbQuoteIdentifier(String(body.order.column))} ${body.order.ascending === false ? 'DESC' : 'ASC'}`;
      }
      const limit = Math.min(Number(body?.limit) || DB_MAX_QUERY_LIMIT, DB_MAX_QUERY_LIMIT);
      sql += ` LIMIT ${body?.single ? 1 : limit}`;
      const { results } = await env.DB.prepare(sql).bind(...params).all();
      const rows = results || [];
      return json({ data: body?.single ? (rows[0] ?? null) : rows, error: null });
    }

    if (op === 'insert' || op === 'upsert') {
      let rows: Record<string, unknown>[] = Array.isArray(body?.payload) ? body.payload : [body?.payload || {}];
      if (table === 'utilisateurs') {
        rows = await Promise.all(rows.map((r) => prepareUserWriteValues(r, env as any, 'pbkdf2_sha256', 100000)));
      }
      const inserted: unknown[] = [];
      for (const row of rows) {
        const cols = Object.keys(row);
        if (!cols.length) continue;
        const colsSql = cols.map(dbQuoteIdentifier).join(', ');
        const placeholders = cols.map(() => '?').join(', ');
        const values = cols.map((c) => dbNormalizeValue(row[c]));
        let sql = `INSERT INTO ${dbQuoteIdentifier(table)} (${colsSql}) VALUES (${placeholders})`;
        if (op === 'upsert') {
          const conflictCols: string[] = Array.isArray(body?.onConflict) ? body.onConflict : [body?.onConflict || primaryKey];
          const updateCols = cols.filter((c) => !conflictCols.includes(c));
          if (updateCols.length) {
            sql += ` ON CONFLICT(${conflictCols.map(dbQuoteIdentifier).join(',')}) DO UPDATE SET ${updateCols.map((c) => `${dbQuoteIdentifier(c)} = excluded.${dbQuoteIdentifier(c)}`).join(', ')}`;
          } else {
            sql += ` ON CONFLICT(${conflictCols.map(dbQuoteIdentifier).join(',')}) DO NOTHING`;
          }
        }
        sql += ' RETURNING *';
        const result = await env.DB.prepare(sql).bind(...values).first();
        inserted.push(result);
      }
      const data = body?.single ? (inserted[0] ?? null) : inserted;
      return json({ data, error: null });
    }

    if (op === 'update') {
      let row: Record<string, unknown> = body?.payload || {};
      if (table === 'utilisateurs') {
        row = await prepareUserWriteValues(row, env as any, 'pbkdf2_sha256', 100000);
      }
      const cols = Object.keys(row);
      if (!cols.length) return json({ data: body?.single ? null : [], error: null });
      const setSql = cols.map((c) => `${dbQuoteIdentifier(c)} = ?`).join(', ');
      const setValues = cols.map((c) => dbNormalizeValue(row[c]));
      const { sql: whereSql, params: whereParams } = buildWhere();
      const sql = `UPDATE ${dbQuoteIdentifier(table)} SET ${setSql}${whereSql} RETURNING *`;
      const { results } = await env.DB.prepare(sql).bind(...setValues, ...whereParams).all();
      const rows = results || [];
      return json({ data: body?.single ? (rows[0] ?? null) : rows, error: null });
    }

    if (op === 'delete') {
      const { sql: whereSql, params } = buildWhere();
      if (!whereSql) return err('DELETE sans filtre refusé', 400);
      const sql = `DELETE FROM ${dbQuoteIdentifier(table)}${whereSql} RETURNING *`;
      const { results } = await env.DB.prepare(sql).bind(...params).all();
      return json({ data: results || [], error: null });
    }

    return err(`Opération inconnue: ${op}`, 400);
  } catch (e) {
    console.error('[db:' + table + ']', e instanceof Error ? e.message : String(e));
    return err('Erreur base de données', 500);
  }
}

// ─── /api/storage/:bucket/* — proxy R2 (upload / liste / lecture d'objet) ───
// Le frontend (app.js → CloudflareQueryBuilder.storage) appelle :
//   GET  /api/storage/:bucket/list?prefix=...      (liste, auth + perm read)
//   POST /api/storage/:bucket/upload?path=...      (upload, auth + perm write)
//   GET  /api/storage/:bucket/<chemin/objet>        (lecture, publique pour
//                                                     branding/*, sinon perm read)
// Buckets exposés : "storage" (R2_STORAGE) et "fullfighting-pdf" (R2_PDF).

const STORAGE_BUCKETS: Record<string, 'R2_STORAGE' | 'R2_PDF'> = {
  storage: 'R2_STORAGE',
  'fullfighting-pdf': 'R2_PDF',
};

function getStorageBucket(env: Env, bucketName: string): R2Bucket | null {
  const binding = STORAGE_BUCKETS[bucketName];
  if (!binding) return null;
  return env[binding] ?? null;
}

function r2ContentType(key: string, fallback?: string | null): string {
  if (fallback) return fallback;
  const ext = (key.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf', json: 'application/json',
  };
  return map[ext] || 'application/octet-stream';
}

async function handleStorageApi(request: Request, env: Env, bucketName: string, rest: string): Promise<Response> {
  const bucket = getStorageBucket(env, bucketName);
  if (!bucket) return err('Bucket inconnu', 404);

  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  // ── POST /api/storage/:bucket/upload?path=... ──────────────────────────
  if (method === 'POST' && rest === 'upload') {
    const path = url.searchParams.get('path');
    if (!path) return err('Paramètre "path" requis', 400);

    const user = await getCurrentUserFromBearer(request, env);
    if (!user) return err('Unauthorized', 401);
    const rolePerms = await getRolePerms(env);
    if (!hasStoragePermission(user, bucketName, path, 'write', rolePerms)) {
      return err('Permission refusée', 403);
    }

    let form: FormData;
    try { form = await request.formData(); } catch { return err('Corps multipart invalide', 400); }
    const file = form.get('file');
    if (!(file instanceof File)) return err('Fichier manquant (champ "file")', 400);

    const key = path.replace(/^\/+/, '');
    await bucket.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: r2ContentType(key, file.type) },
    });
    return json({ data: { path: key }, error: null }, 201);
  }

  // ── GET /api/storage/:bucket/list?prefix=... ────────────────────────────
  if (method === 'GET' && rest === 'list') {
    const prefix = url.searchParams.get('prefix') || '';

    const user = await getCurrentUserFromBearer(request, env);
    if (!user) return err('Unauthorized', 401);
    const rolePerms = await getRolePerms(env);
    if (!hasStoragePermission(user, bucketName, prefix, 'read', rolePerms)) {
      return err('Permission refusée', 403);
    }

    const listed = await bucket.list({ prefix, limit: 1000 });
    const files = listed.objects.map((obj) => ({
      name: obj.key.slice(prefix.length).replace(/^\/+/, '') || obj.key,
      id: obj.key,
      metadata: { mimetype: obj.httpMetadata?.contentType || '', size: obj.size },
    }));
    return json({ data: files, error: null });
  }

  // ── GET /api/storage/:bucket/<chemin> — lecture d'un objet ──────────────
  if (method === 'GET' && rest) {
    const key = rest.replace(/^\/+/, '');

    if (!isPublicStorageObject(bucketName, key)) {
      const user = await getCurrentUserFromBearer(request, env);
      if (!user) return err('Unauthorized', 401);
      const rolePerms = await getRolePerms(env);
      if (!hasStoragePermission(user, bucketName, key, 'read', rolePerms)) {
        return err('Permission refusée', 403);
      }
    }

    const object = await bucket.get(key);
    if (!object) return err('Fichier introuvable', 404);
    return new Response(object.body, {
      headers: {
        'Content-Type': r2ContentType(key, object.httpMetadata?.contentType),
        'Cache-Control': isPublicStorageObject(bucketName, key) ? 'public, max-age=3600' : 'private, no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  return err('Method Not Allowed', 405);
}

// NOTE : syncInscriptionsValidees(env) a été retirée le 2026-06-27. Elle
// synchronisait les inscriptions HelloAsso validées vers un schéma legacy
// (tables membres / ecritures_compta / ventes_inscription / sync_log) jamais
// présent en base de production (cf. migrations/0002_inscription_sync.sql,
// non appliquée — voir le dashboard D1 réel et le README, qui ne listent que
// adherents, achats, audit_logs, club_info, comptes_bancaires, diplomes,
// exercices, factures, inscriptions_publiques, journal_comptable,
// transactions, utilisateurs). Aucun trigger cron n'était d'ailleurs défini
// dans wrangler.json, donc cette fonction n'a jamais réellement tourné en
// production. Si une synchronisation automatique HelloAsso → adhérents est
// encore souhaitée, elle doit être réécrite contre le vrai schéma
// (table adherents, journal_comptable) et le binding AFFBC_DB doit d'abord
// être corrigé pour pointer vers la base réelle du worker
// inscription-americanfullfightingbons (actuellement il pointe par erreur
// vers le même database_id que DB, donc vers affbc-production).

// ─── Handler principal ───────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // ── /api/bootstrap & /api/db/:table ────────────────────────────────────

    if (path === '/api/bootstrap' && (method === 'GET' || method === 'HEAD')) {
      if (method === 'HEAD') return new Response(null, { status: 200 });
      try {
        const user = await getCurrentUserFromBearer(request, env);
        const clubInfoRows = await env.DB.prepare(`SELECT * FROM club_info`).all();
        const clubInfo: Record<string, unknown> = {};
        for (const row of (clubInfoRows.results || []) as Record<string, any>[]) {
          clubInfo[String(row.cle)] = row.valeur;
        }
        const finalClubInfo = user
          ? clubInfo
          : Object.fromEntries(Object.entries(clubInfo).filter(([k]) => PUBLIC_CLUB_INFO_KEYS.has(k)));
        const exercices = user
          ? (await env.DB.prepare(`SELECT * FROM exercices ORDER BY date_debut DESC`).all()).results
          : [];
        return json({ data: { clubInfo: finalClubInfo, exercices, currentUser: user || null }, error: null });
      } catch (e) {
        console.error('[bootstrap]', e instanceof Error ? e.message : String(e));
        return json({ data: null, error: { message: 'Database unavailable' } }, 503);
      }
    }

    const dbMatch = path.match(/^\/api\/db\/([A-Za-z0-9_]+)$/);
    if (dbMatch) {
      if (method !== 'POST') return err('Method Not Allowed', 405);
      return await handleDbApi(request, env, dbMatch[1]);
    }

    // ── /api/storage/:bucket/* ───────────────────────────────────────────
    const storageMatch = path.match(/^\/api\/storage\/([A-Za-z0-9_-]+)\/(.*)$/);
    if (storageMatch) {
      return await handleStorageApi(request, env, storageMatch[1], decodeURIComponent(storageMatch[2]));
    }

    // ── Authentification ──────────────────────────────────────────────────

    // POST /api/admin/login
    if (method === 'POST' && path === '/api/admin/login') {
      const body = await request.json<{ password?: string }>();
      if (!body?.password) return err('Mot de passe requis', 400);

      // Comparaison en temps constant
      const encoder = new TextEncoder();
      const a = encoder.encode(body.password);
      const b = encoder.encode(env.ADMIN_PASSWORD);
      let same = a.length === b.length;
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) same = false;
      }
      if (!same) return err('Mot de passe incorrect', 401);

      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

      await env.DB
        .prepare(
          `INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)`
        )
        .bind(token, expiresAt)
        .run();

      // Purge des sessions expirées
      await env.DB
        .prepare(`DELETE FROM admin_sessions WHERE expires_at < datetime('now')`)
        .run();

      return json({ token, expires_at: expiresAt });
    }

    // POST /api/admin/reset-password
    // Réinitialise le mot de passe d'un utilisateur en le hachant avec le
    // PASSWORD_PEPPER réellement actif sur ce Worker (contrairement à un hash
    // inséré à la main en SQL, qui ne peut jamais matcher si le pepper diffère).
    // Protégée par ADMIN_PASSWORD : c'est la seule clé "maître" indépendante
    // des comptes utilisateurs, donc utilisable même si plus personne ne peut
    // se connecter via /api/auth/login.
    if (method === 'POST' && path === '/api/admin/reset-password') {
      const body = await request.json<{ adminPassword?: string; email?: string; newPassword?: string }>();
      if (!body?.adminPassword || !body?.email || !body?.newPassword) {
        return err('adminPassword, email et newPassword sont requis', 400);
      }

      // Comparaison en temps constant, identique à /api/admin/login
      const encoder = new TextEncoder();
      const a = encoder.encode(body.adminPassword);
      const b = encoder.encode(env.ADMIN_PASSWORD);
      let same = a.length === b.length;
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) same = false;
      }
      if (!same) return err('Mot de passe admin incorrect', 401);

      if (body.newPassword.length < 8) {
        return err('Le nouveau mot de passe doit faire au moins 8 caractères', 400);
      }

      const emailNormalized = body.email.trim().toLowerCase();
      const user = await env.DB
        .prepare(`SELECT id FROM utilisateurs WHERE LOWER(TRIM(email))=?`)
        .bind(emailNormalized)
        .first<any>();
      if (!user) return err('Utilisateur introuvable', 404);

      const newHash = await hashPassword(body.newPassword, env as any, 'pbkdf2_sha256', 100000);
      await env.DB
        .prepare(`UPDATE utilisateurs SET mot_de_passe=?, password_changed_at=? WHERE id=?`)
        .bind(newHash, new Date().toISOString(), user.id)
        .run();

      return json({ ok: true });
    }

    // POST /api/auth/login
    if (method === 'POST' && path === '/api/auth/login') {
      const body= await request.json<any>();
      const emailNormalized = String(body?.email || '').trim().toLowerCase();
      const user= await env.DB.prepare(`SELECT * FROM utilisateurs WHERE LOWER(TRIM(email))=? AND (actif=1 OR actif IS NULL)`).bind(emailNormalized).first<any>();
      if(!user) return err('Utilisateur introuvable',401);
      const check= await verifyPassword(body.password,user.mot_de_passe,env as any,'pbkdf2_sha256',100000,/^[a-f0-9]{64}$/i);
      if(!check.valid) return err('Email ou mot de passe incorrect',401);
      const token= await createSessionToken({userId:user.id,expiresAt:Date.now()+86400000,pwdStamp:user.password_changed_at||''},env as any);
      return json({token,user:{id:user.id,prenom:user.prenom,nom:user.nom,email:user.email,role:user.role,must_change_password:user.must_change_password||0}})
    }

    // GET /api/auth/session — vérifie un token Bearer et retourne l'utilisateur courant.
    // Appelé au chargement de la page pour restaurer une session persistée en localStorage.
    if (method === 'GET' && path === '/api/auth/session') {
      const user = await getCurrentUserFromBearer(request, env);
      if (!user) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);
      return json({
        data: {
          user: {
            id: user.id, prenom: user.prenom, nom: user.nom,
            email: user.email, role: user.role,
            must_change_password: user.must_change_password || 0,
          },
        },
        error: null,
      });
    }

    // POST /api/auth/password — changement du mot de passe utilisateur connecté.
    // Vérifie l'ancien mot de passe avant d'appliquer le nouveau ; révoque la session
    // courante afin que les autres onglets/appareils soient déconnectés.
    if (method === 'POST' && path === '/api/auth/password') {
      const user = await getCurrentUserFromBearer(request, env);
      if (!user) return err('Unauthorized', 401);

      const body = await request.json<{ currentPassword?: string; nextPassword?: string }>();
      if (!body?.currentPassword || !body?.nextPassword) {
        return err('currentPassword et nextPassword sont requis', 400);
      }
      if (String(body.nextPassword).length < 8) {
        return err('Le nouveau mot de passe doit faire au moins 8 caractères', 400);
      }

      const check = await verifyPassword(
        body.currentPassword, user.mot_de_passe, env as any,
        'pbkdf2_sha256', 100000, /^[a-f0-9]{64}$/i,
      );
      if (!check.valid) return err('Mot de passe actuel incorrect', 401);

      const newHash = await hashPassword(body.nextPassword, env as any, 'pbkdf2_sha256', 100000);
      const now = new Date().toISOString();
      await env.DB
        .prepare(`UPDATE utilisateurs SET mot_de_passe=?, password_changed_at=?, must_change_password=0, updated_at=? WHERE id=?`)
        .bind(newHash, now, now, user.id)
        .run();

      return json({ data: { ok: true }, error: null });
    }

    // POST /api/email/send — envoi d'email transactionnel via Brevo.
    // Utilisé pour : envoi de diplôme, relance de paiement, envoi de facture.
    if (method === 'POST' && path === '/api/email/send') {
      const user = await getCurrentUserFromBearer(request, env);
      if (!user) return err('Unauthorized', 401);

      if (!env.BREVO_API_KEY) {
        return err('Service email non configuré (BREVO_API_KEY manquant)', 503);
      }

      const body = await request.json<{
        to: Array<{ email: string; name?: string }>;
        subject: string;
        html: string;
        attachments?: Array<{ name: string; content: string; type?: string }>;
      }>();

      if (!body?.to?.length || !body.subject || !body.html) {
        return err('Champs requis : to (tableau), subject, html', 400);
      }

      const fromEmail = env.BREVO_FROM_EMAIL || 'noreply@americanfullfightingbons.fr';
      const fromName  = env.BREVO_FROM_NAME  || 'AFFBC — Gestion du club';

      const brevoPayload: Record<string, unknown> = {
        sender:      { email: fromEmail, name: fromName },
        to:          body.to,
        subject:     body.subject,
        htmlContent: body.html,
      };
      if (body.attachments?.length) {
        brevoPayload.attachment = body.attachments.map((a) => ({
          name:    a.name,
          content: a.content,  // base64
          type:    a.type || 'application/octet-stream',
        }));
      }

      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key':      env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(brevoPayload),
      });

      if (!brevoRes.ok) {
        const detail = await brevoRes.text().catch(() => '');
        console.error('[email/send] Brevo error', brevoRes.status, detail);
        return err(`Échec envoi email (Brevo ${brevoRes.status})`, 502);
      }
      return json({ data: { ok: true }, error: null });
    }

    // POST /api/admin/restore — restauration complète de la base depuis un export JSON.
    // OPÉRATION DESTRUCTIVE : protégée par le mot de passe admin en plus du token Bearer.
    // Le frontend envoie { confirmText, adherents:[], achats:[], ... }.
    if (method === 'POST' && path === '/api/admin/restore') {
      const user = await getCurrentUserFromBearer(request, env);
      if (!user) return err('Unauthorized', 401);
      if (String(user.role || '') !== 'admin') return err('Réservé aux administrateurs', 403);

      const body = await request.json<Record<string, unknown>>();
      if (String(body?.confirmText || '').trim().toUpperCase() !== 'RESTAURER') {
        return err('Confirmation invalide (attendu : RESTAURER)', 400);
      }

      // Vérification mot de passe admin en plus du Bearer
      const adminPwd = String(body?.adminPassword || '');
      if (!adminPwd) return err('adminPassword requis pour la restauration', 400);
      const encoder = new TextEncoder();
      const a = encoder.encode(adminPwd);
      const b = encoder.encode(env.ADMIN_PASSWORD);
      let same = a.length === b.length;
      for (let i = 0; i < Math.min(a.length, b.length); i++) { if (a[i] !== b[i]) same = false; }
      if (!same) return err('Mot de passe admin incorrect', 401);

      // Tables restaurables (dans l'ordre pour respecter les FK)
      const RESTORE_ORDER: string[] = [
        'exercices', 'adherents', 'comptes_bancaires', 'transactions',
        'journal_comptable', 'achats', 'factures', 'diplomes',
        'feedback_campaigns', 'feedback_recipients', 'feedback_responses',
        'inscriptions_publiques', 'club_info',
      ];

      for (const table of RESTORE_ORDER) {
        const rows = body[table];
        if (!Array.isArray(rows) || !rows.length) continue;
        if (!DB_TABLES.has(table)) continue;

        // Vide la table puis réinsère
        await env.DB.prepare(`DELETE FROM ${dbQuoteIdentifier(table)}`).run();

        for (const row of rows as Record<string, unknown>[]) {
          const cols = Object.keys(row);
          if (!cols.length) continue;
          const colsSql = cols.map(dbQuoteIdentifier).join(', ');
          const placeholders = cols.map(() => '?').join(', ');
          const values = cols.map((c) => dbNormalizeValue(row[c]));
          await env.DB
            .prepare(`INSERT OR IGNORE INTO ${dbQuoteIdentifier(table)} (${colsSql}) VALUES (${placeholders})`)
            .bind(...values)
            .run();
        }
      }

      return json({ data: { ok: true }, error: null });
    }
    }

    // POST /api/admin/logout  (sessions admin legacy — clé UUID stockée en base)
    // POST /api/auth/logout   (sessions utilisateur — JWT HMAC ; on les place en liste noire
    //                          en réutilisant la table admin_sessions avec type='jwt')
    if (method === 'POST' && (path === '/api/admin/logout' || path === '/api/auth/logout')) {
      const auth = request.headers.get('Authorization') ?? '';
      const token = auth.replace(/^Bearer\s+/i, '').trim();
      if (token) {
        // On tente de supprimer le token s'il était stocké (sessions admin UUID),
        // ET on l'inscrit en liste noire pour invalider les JWT signés avant expiration.
        await env.DB
          .prepare(`DELETE FROM admin_sessions WHERE token = ?`)
          .bind(token)
          .run();
        // Insère le token en liste noire (type jwt) avec une expiration = maintenant + 25h
        // pour couvrir la durée de vie maximale d'un token (24h + marge).
        const blacklistExpiry = new Date(Date.now() + 25 * 3600 * 1000).toISOString();
        await env.DB
          .prepare(`INSERT OR IGNORE INTO admin_sessions (token, expires_at, created_at) VALUES (?, ?, datetime('now'))`)
          .bind(`__revoked__${token}`, blacklistExpiry)
          .run();
      }
      // Purge des entrées expirées
      await env.DB
        .prepare(`DELETE FROM admin_sessions WHERE expires_at < datetime('now')`)
        .run();
      return json({ ok: true });
    }

     // ── Santé ─────────────────────────────────────────────────────────────

   if (method === 'GET' && path === '/api/health') {
    return json({
        ok: true,
        ts: new Date().toISOString(),
        data: {
            bindings: {
                hasDb: !!env.DB
            }
        }
    });
}

   if (method === 'GET' && path === '/api/version') {
    return json({
        ok: true,
        data: {
            service: 'gestion-americanfullfightingbons',
            version: '1.0.0',
        }
    });
}
    // ── Routes protégées ──────────────────────────────────────────────────

    // Toutes les routes /api/* (sauf login/logout) nécessitent un token
    const publicApiRoutes = new Set([
  "/api/admin/login",
  "/api/admin/reset-password",
  "/api/admin/logout",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/health",
  "/api/version",
]);

if (path.startsWith("/api/") && !publicApiRoutes.has(path)) {
    const authed = await requireAuth(request, env);
    if (!authed) {
        return err("Non autorisé", 401);
    }
}

    // NOTE : les anciennes routes /api/sync/*, /api/membres*, /api/compta
    // (legacy) et /api/ventes* ont été retirées le 2026-06-27 : elles
    // interrogeaient des tables (membres, ventes_inscription, sync_log,
    // ecritures_compta) issues d'un schéma jamais appliqué en production
    // (migrations/0002_inscription_sync.sql, non reflété dans le D1 réel ni
    // dans le README). Aucune route du frontend actuel ne les appelait ; elles
    // auraient échoué en 500 ("no such table") au premier appel. Le vrai
    // modèle de données (adhérents, comptabilité via journal_comptable, etc.)
    // passe par /api/db/:table, déjà branché plus haut.

    // NOTE : /api/inscriptions-en-attente a été retirée le 2026-06-27, pour
    // la même raison (table "inscriptions" inexistante ; binding AFFBC_DB
    // pointant d'ailleurs vers le même database_id que DB, donc vers
    // affbc-production, pas vers une base distincte du worker inscription).
    // La donnée correspondante côté gestion est inscriptions_publiques,
    // déjà exposée via /api/db/inscriptions_publiques.

    // ── Fallback : servir le front-office HTML ────────────────────────────
    // (le fichier index.html est servi via env.ASSETS si configuré,
    //  sinon on renvoie une réponse minimale)
   if (env.ASSETS) {
  return env.ASSETS.fetch(request);
}

return new Response('Not Found', { status: 404 });
    },
} satisfies ExportedHandler<Env>;
