/**
 * Worker Gestion AFFBC
 * Back-office : adhérents, comptabilité, ventes.
 * Lit la base d'inscription (AFFBC_DB = affbc-prod) via un second binding D1
 * pour synchroniser automatiquement les dossiers validés.
 */

export interface Env {
  DB: D1Database;         // gestion-americanfullfightingbonsdb (tables locales)
  AFFBC_DB: D1Database;   // affbc-prod (inscriptions validées par HelloAsso)
  ADMIN_PASSWORD: string;
  BREVO_API_KEY?: string;
  ASSETS: Fetcher;
  R2_STORAGE?: R2Bucket;
  R2_PDF?: R2Bucket;
}

import {verifyPassword, createSessionToken, parseSessionToken, hashPassword, prepareUserWriteValues} from './lib/security';

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

async function requireAuth(request: Request, env: Env): Promise<boolean> { const auth=request.headers.get('Authorization')??''; const token=auth.replace(/^Bearer\s+/i,'').trim(); if(!token) return false; const payload= await parseSessionToken(token,env as any); return !!payload && Number(payload.expiresAt)>Date.now(); }

// ─── /api/bootstrap & /api/db/:table — allowlist et permissions ─────────────
// Reconstruit après une régression (cf. historique git) qui avait fait
// disparaître ces routes : le frontend (app.js → CloudflareQueryBuilder)
// dépend entièrement de /api/db/:table pour toutes les données de l'appli.

type PermissionMatrix = Record<string, Record<string, string>>;

const DB_TABLES = new Set([
  'adherents', 'achats', 'audit_logs', 'club_info', 'comptes_bancaires',
  'diplomes', 'exercices', 'factures', 'inscriptions_publiques',
  'journal_comptable', 'transactions', 'utilisateurs',
]);

const DB_PRIMARY_KEYS: Record<string, string> = {
  adherents: 'id', achats: 'id', audit_logs: 'id', club_info: 'cle',
  comptes_bancaires: 'id', diplomes: 'id', exercices: 'id', factures: 'id',
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

// Saison courante : si on est après le 1er septembre → saison N/N+1, sinon N-1/N
function currentSaison(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

// ─── Synchronisation inscription → gestion ──────────────────────────────────

/**
 * Récupère toutes les inscriptions validées (paiement_status = 'valide')
 * depuis affbc-prod qui ne sont pas encore synchronisées dans gestion.
 * Crée le membre, l'écriture compta et la ligne de vente correspondants.
 */
async function syncInscriptionsValidees(env: Env): Promise<{
  synced: number;
  skipped: number;
  errors: string[];
}> {
  const stats = { synced: 0, skipped: 0, errors: [] as string[] };

  // Lire les inscriptions validées dans affbc-prod
  // La table s'appelle "inscriptions" dans affbc-prod (worker inscription)
  let inscriptions: Array<Record<string, unknown>> = [];
  try {
    const result = await env.AFFBC_DB
      .prepare(
        `SELECT
           i.id,
           i.nom, i.prenom, i.email, i.telephone,
           i.date_naissance, i.is_mineur,
           i.categorie, i.niveau, i.licence_ffk,
           i.ceinture_actuelle,
           i.montant_total,
           i.helloasso_ref,
           i.saison,
           i.statut,
           i.created_at
         FROM inscriptions i
         WHERE i.statut = 'valide'
           AND i.helloasso_ref IS NOT NULL
         ORDER BY i.created_at ASC`
      )
      .all<Record<string, unknown>>();
    inscriptions = result.results ?? [];
  } catch (e) {
    stats.errors.push(`Lecture AFFBC_DB impossible: ${String(e)}`);
    return stats;
  }

  for (const insc of inscriptions) {
    const ref = String(insc.helloasso_ref ?? '');
    if (!ref) {
      stats.skipped++;
      continue;
    }

    // Idempotence : déjà synchronisé ?
    const existing = await env.DB
      .prepare(`SELECT id FROM membres WHERE inscription_ref = ?`)
      .bind(ref)
      .first<{ id: number }>();

    if (existing) {
      stats.skipped++;
      continue;
    }

    const saison = String(insc.saison ?? currentSaison());
    const montant = Number(insc.montant_total ?? 0);

    try {
      // 1. Créer le membre
      const membreResult = await env.DB
        .prepare(
          `INSERT INTO membres
             (inscription_ref, inscription_id, nom, prenom, email, telephone,
              date_naissance, is_mineur, saison, categorie, niveau,
              licence_ffk, ceinture_actuelle, date_adhesion)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,date('now'))
           RETURNING id`
        )
        .bind(
          ref,
          Number(insc.id),
          String(insc.nom ?? ''),
          String(insc.prenom ?? ''),
          String(insc.email ?? ''),
          String(insc.telephone ?? ''),
          String(insc.date_naissance ?? ''),
          Number(insc.is_mineur ?? 0),
          saison,
          String(insc.categorie ?? ''),
          String(insc.niveau ?? ''),
          String(insc.licence_ffk ?? ''),
          String(insc.ceinture_actuelle ?? ''),
        )
        .first<{ id: number }>();

      const membreId = membreResult?.id ?? null;

      // 2. Écriture comptable (recette cotisation)
      if (montant > 0) {
        await env.DB
          .prepare(
            `INSERT INTO ecritures_compta
               (date_ecriture, libelle, montant, categorie, source, source_ref, source_id, membre_id)
             VALUES (date('now'), ?, ?, 'cotisation', 'inscription', ?, ?, ?)`
          )
          .bind(
            `Cotisation ${saison} — ${String(insc.prenom)} ${String(insc.nom)}`,
            montant,
            ref,
            Number(insc.id),
            membreId,
          )
          .run();
      }

      // 3. Ligne de vente
      await env.DB
        .prepare(
          `INSERT INTO ventes_inscription
             (membre_id, inscription_ref, saison, produit, montant, statut_paiement)
           VALUES (?, ?, ?, 'Cotisation annuelle', ?, 'valide')`
        )
        .bind(membreId, ref, saison, montant)
        .run();

      // 4. Log de sync
      await env.DB
        .prepare(
          `INSERT INTO sync_log (action, inscription_id, helloasso_ref, status)
           VALUES ('inscription_validated', ?, ?, 'ok')`
        )
        .bind(Number(insc.id), ref)
        .run();

      stats.synced++;
    } catch (e) {
      const errMsg = `Inscription #${insc.id} (${ref}): ${String(e)}`;
      stats.errors.push(errMsg);
      await env.DB
        .prepare(
          `INSERT INTO sync_log (action, inscription_id, helloasso_ref, status, detail)
           VALUES ('inscription_validated', ?, ?, 'error', ?)`
        )
        .bind(Number(insc.id), ref, errMsg)
        .run();
    }
  }

  return stats;
}

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
      const check= await verifyPassword(body.password,user.mot_de_passe,env as any,'pbkdf2_sha256',2000000,/^[a-f0-9]{64}$/i);
      if(!check.valid) return err('Email ou mot de passe incorrect',401);
      const token= await createSessionToken({userId:user.id,expiresAt:Date.now()+86400000,pwdStamp:user.password_changed_at||''},env as any);
      return json({token,user:{id:user.id,prenom:user.prenom,nom:user.nom,email:user.email,role:user.role}})
    }

    // POST /api/admin/logout
    if (method === 'POST' && path === '/api/admin/logout') {
      const auth = request.headers.get('Authorization') ?? '';
      const token = auth.replace(/^Bearer\s+/i, '').trim();
      if (token) {
        await env.DB
          .prepare(`DELETE FROM admin_sessions WHERE token = ?`)
          .bind(token)
          .run();
      }
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
    // ── Routes protégées ──────────────────────────────────────────────────

    // Toutes les routes /api/* (sauf login/logout) nécessitent un token
    const publicApiRoutes = new Set([
  "/api/admin/login",
  "/api/admin/reset-password",
  "/api/auth/login",
  "/api/auth/session",
  "/api/health"
]);

if (path.startsWith("/api/") && !publicApiRoutes.has(path)) {
    const authed = await requireAuth(request, env);
    if (!authed) {
        return err("Non autorisé", 401);
    }
}

    // ── Synchronisation ───────────────────────────────────────────────────

    // POST /api/sync/inscriptions  — déclenche la sync manuellement (ou via cron)
    if (method === 'POST' && path === '/api/sync/inscriptions') {
      const stats = await syncInscriptionsValidees(env);
      return json(stats);
    }

    // GET /api/sync/log
    if (method === 'GET' && path === '/api/sync/log') {
      const rows = await env.DB
        .prepare(
          `SELECT * FROM sync_log ORDER BY created_at DESC LIMIT 100`
        )
        .all();
      return json(rows.results);
    }

    // ── Adhérents ─────────────────────────────────────────────────────────

    // GET /api/membres
    if (method === 'GET' && path === '/api/membres') {
      const saison = url.searchParams.get('saison') ?? currentSaison();
      const statut = url.searchParams.get('statut');
      const q = url.searchParams.get('q');

      let query = `SELECT * FROM membres WHERE saison = ?`;
      const params: unknown[] = [saison];

      if (statut) {
        query += ` AND statut = ?`;
        params.push(statut);
      }
      if (q) {
        query += ` AND (nom LIKE ? OR prenom LIKE ? OR email LIKE ?)`;
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }
      query += ` ORDER BY nom, prenom`;

      const stmt = env.DB.prepare(query);
      const rows = await stmt.bind(...params).all();
      return json(rows.results);
    }

    // GET /api/membres/:id
    if (method === 'GET' && /^\/api\/membres\/\d+$/.test(path)) {
      const id = path.split('/').pop();
      const row = await env.DB
        .prepare(`SELECT * FROM membres WHERE id = ?`)
        .bind(id)
        .first();
      if (!row) return err('Membre introuvable', 404);
      return json(row);
    }

    // PATCH /api/membres/:id  — mise à jour partielle (ceinture, statut, etc.)
    if (method === 'PATCH' && /^\/api\/membres\/\d+$/.test(path)) {
      const id = path.split('/').pop();
      const body = await request.json<Record<string, unknown>>();
      const allowed = ['statut', 'ceinture_actuelle', 'licence_ffk', 'telephone', 'email', 'niveau'];
      const updates: string[] = [];
      const vals: unknown[] = [];
      for (const key of allowed) {
        if (key in body) {
          updates.push(`${key} = ?`);
          vals.push(body[key]);
        }
      }
      if (updates.length === 0) return err('Aucun champ modifiable fourni', 400);
      updates.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`);
      vals.push(id);
      await env.DB
        .prepare(`UPDATE membres SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...vals)
        .run();
      return json({ ok: true });
    }

    // GET /api/membres/stats
    if (method === 'GET' && path === '/api/membres/stats') {
      const saison = url.searchParams.get('saison') ?? currentSaison();
      const stats = await env.DB
        .prepare(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN statut = 'actif' THEN 1 ELSE 0 END) AS actifs,
             SUM(CASE WHEN is_mineur = 1 THEN 1 ELSE 0 END) AS mineurs,
             SUM(CASE WHEN is_mineur = 0 THEN 1 ELSE 0 END) AS adultes
           FROM membres WHERE saison = ?`
        )
        .bind(saison)
        .first();
      return json(stats);
    }

    // ── Comptabilité ──────────────────────────────────────────────────────

    // GET /api/compta
    if (method === 'GET' && path === '/api/compta') {
      const annee = url.searchParams.get('annee') ?? String(new Date().getFullYear());
      const categorie = url.searchParams.get('categorie');

      let query = `SELECT * FROM ecritures_compta WHERE strftime('%Y', date_ecriture) = ?`;
      const params: unknown[] = [annee];
      if (categorie) {
        query += ` AND categorie = ?`;
        params.push(categorie);
      }
      query += ` ORDER BY date_ecriture DESC`;

      const rows = await env.DB.prepare(query).bind(...params).all();
      return json(rows.results);
    }

    // GET /api/compta/resume
    if (method === 'GET' && path === '/api/compta/resume') {
      const annee = url.searchParams.get('annee') ?? String(new Date().getFullYear());
      const resume = await env.DB
        .prepare(
          `SELECT
             categorie,
             source,
             COUNT(*) AS nb,
             SUM(montant) AS total
           FROM ecritures_compta
           WHERE strftime('%Y', date_ecriture) = ?
           GROUP BY categorie, source
           ORDER BY total DESC`
        )
        .bind(annee)
        .all();

      const solde = await env.DB
        .prepare(
          `SELECT SUM(montant) AS solde
           FROM ecritures_compta
           WHERE strftime('%Y', date_ecriture) = ?`
        )
        .bind(annee)
        .first<{ solde: number | null }>();

      return json({ annee, solde: solde?.solde ?? 0, details: resume.results });
    }

    // POST /api/compta  — écriture manuelle
    if (method === 'POST' && path === '/api/compta') {
      const body = await request.json<{
        libelle?: string;
        montant?: number;
        categorie?: string;
        date_ecriture?: string;
        commentaire?: string;
      }>();
      if (!body?.libelle || body?.montant === undefined) {
        return err('libelle et montant requis', 400);
      }
      await env.DB
        .prepare(
          `INSERT INTO ecritures_compta
             (date_ecriture, libelle, montant, categorie, source, commentaire)
           VALUES (?, ?, ?, ?, 'manuel', ?)`
        )
        .bind(
          body.date_ecriture ?? new Date().toISOString().slice(0, 10),
          body.libelle,
          body.montant,
          body.categorie ?? 'autre',
          body.commentaire ?? null,
        )
        .run();
      return json({ ok: true }, 201);
    }

    // ── Ventes ────────────────────────────────────────────────────────────

    // GET /api/ventes
    if (method === 'GET' && path === '/api/ventes') {
      const saison = url.searchParams.get('saison') ?? currentSaison();
      const rows = await env.DB
        .prepare(
          `SELECT
             v.*,
             m.nom, m.prenom, m.email, m.categorie
           FROM ventes_inscription v
           LEFT JOIN membres m ON m.id = v.membre_id
           WHERE v.saison = ?
           ORDER BY v.date_vente DESC`
        )
        .bind(saison)
        .all();
      return json(rows.results);
    }

    // GET /api/ventes/stats
    if (method === 'GET' && path === '/api/ventes/stats') {
      const saison = url.searchParams.get('saison') ?? currentSaison();
      const stats = await env.DB
        .prepare(
          `SELECT
             COUNT(*) AS nb_ventes,
             SUM(montant) AS chiffre_affaires,
             SUM(CASE WHEN statut_paiement = 'valide' THEN montant ELSE 0 END) AS encaisse
           FROM ventes_inscription WHERE saison = ?`
        )
        .bind(saison)
        .first();
      return json(stats);
    }

    // ── Inscriptions brutes (lecture depuis AFFBC_DB) ─────────────────────

    // GET /api/inscriptions-en-attente
    // Inscriptions dans affbc-prod dont le statut n'est pas encore 'valide'
    if (method === 'GET' && path === '/api/inscriptions-en-attente') {
      try {
        const rows = await env.AFFBC_DB
          .prepare(
            `SELECT id, nom, prenom, email, montant_total, statut, created_at
             FROM inscriptions
             WHERE statut != 'valide'
             ORDER BY created_at DESC
             LIMIT 100`
          )
          .all();
        return json(rows.results);
      } catch (e) {
        return err(`Impossible de lire AFFBC_DB: ${String(e)}`, 500);
      }
    }

    // ── Fallback : servir le front-office HTML ────────────────────────────
    // (le fichier index.html est servi via env.ASSETS si configuré,
    //  sinon on renvoie une réponse minimale)
   if (env.ASSETS) {
  return env.ASSETS.fetch(request);
}

return new Response('Not Found', { status: 404 });
    },

  // ── Cron trigger : sync automatique toutes les heures ───────────────────
  async scheduled(
  _controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
    ctx.waitUntil(syncInscriptionsValidees(env));
  },
} satisfies ExportedHandler<Env>;
