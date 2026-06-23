import {
  createSessionToken,
  getCurrentUser,
  hashPassword,
  hasPermission,
  hasStoragePermission,
  isPublicStorageObject,
  prepareUserWriteValues,
  secureEquals,
  verifyPassword,
} from "./lib/security";

// // ─────────────────────────────────────────────────────────────
// Worker principal — AFFBC Gestion du club
// ─────────────────────────────────────────────────────────────

const SESSION_COOKIE = "affbc_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_HASH_PREFIX = "pbkdf2_sha256";
const PASSWORD_HASH_ITERATIONS = 1e5;
const MAX_PBKDF2_ITERATIONS = 1e5;
const LEGACY_SHA256_RE = /^[a-f0-9]{64}$/i;

// Anti brute-force sur /api/auth/login (s'appuie sur la table auth_rate_limits)
const LOGIN_MAX_FAILURES = 8;
const LOGIN_BLOCK_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_FAILURE_WINDOW_MS = 60 * 60 * 1000; // au-delà d'1h sans échec, on repart de zéro

// Plafond de sécurité sur toute requête SELECT générique (anti dérapage mémoire/CPU
// si un écran oublie de paginer ses résultats). Très large pour ne rien casser
// côté frontend actuel, qui ne pagine pas encore.
const MAX_QUERY_LIMIT = 5000;

type DbFilterOp = "eq" | "in";

interface DbFilter {
  column: string;
  op: DbFilterOp;
  value: unknown;
}

interface DbOrder {
  column: string;
  ascending?: boolean;
}

interface DbRequestBody {
  action?: "query" | "insert" | "update" | "delete" | "upsert";
  op?: string;
  payload?: unknown;
  filters?: DbFilter[];
  order?: DbOrder;
  limit?: number;
  single?: boolean;
  values?: unknown;
  select?: boolean;
  onConflict?: string | string[];
}

const TABLES = new Set([
  "adherents",
  "achats",
  "audit_logs",
  "club_info",
  "comptes_bancaires",
  "diplomes",
  "exercices",
  "factures",
  "inscriptions_publiques",
  "journal_comptable",
  "transactions",
  "utilisateurs",
]);

const PRIMARY_KEYS: Record<string, string> = {
  adherents: "id",
  achats: "id",
  audit_logs: "id",
  club_info: "cle",
  comptes_bancaires: "id",
  exercices: "id",
  factures: "id",
  inscriptions_publiques: "id",
  journal_comptable: "id",
  transactions: "id",
  utilisateurs: "id",
};

const TABLE_PERMISSIONS: Record<string, { read: string; write: string }> = {
  adherents: { read: "perm_adherents", write: "perm_adherents" },
  achats: { read: "perm_achats", write: "perm_achats" },
  audit_logs: { read: "perm_administration", write: "perm_administration" },
  club_info: { read: "perm_administration", write: "perm_administration" },
  comptes_bancaires: { read: "perm_banque", write: "perm_banque" },
  diplomes: { read: "perm_adherents", write: "perm_adherents" },
  exercices: { read: "perm_comptabilite", write: "perm_comptabilite" },
  factures: { read: "perm_facturation", write: "perm_facturation" },
  inscriptions_publiques: { read: "perm_administration", write: "perm_administration" },
  journal_comptable: { read: "perm_comptabilite", write: "perm_comptabilite" },
  transactions: { read: "perm_banque", write: "perm_banque" },
  utilisateurs: { read: "perm_administration", write: "perm_administration" },
};

const DEFAULT_ROLE_PERMS: Record<string, Record<string, string>> = {
  admin: {
    perm_adherents: "write",
    perm_banque: "write",
    perm_comptabilite: "write",
    perm_achats: "write",
    perm_facturation: "write",
    perm_administration: "write",
  },
  tresorier: {
    perm_adherents: "write",
    perm_banque: "write",
    perm_comptabilite: "write",
    perm_achats: "write",
    perm_facturation: "write",
    perm_administration: "none",
  },
  secretaire: {
    perm_adherents: "write",
    perm_banque: "none",
    perm_comptabilite: "none",
    perm_achats: "none",
    perm_facturation: "none",
    perm_administration: "none",
  },
  entraineur: {
    perm_adherents: "read",
    perm_banque: "none",
    perm_comptabilite: "none",
    perm_achats: "none",
    perm_facturation: "none",
    perm_administration: "none",
  },
  membre: {
    perm_adherents: "none",
    perm_banque: "none",
    perm_comptabilite: "none",
    perm_achats: "none",
    perm_facturation: "none",
    perm_administration: "none",
  },
};

const PUBLIC_CLUB_INFO_KEYS = new Set([
  "nom",
  "logo",
  "email",
  "telephone",
  "adresse",
  "siret",
  "diplome_signature_url",
  "diplome_layouts",
]);

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers((init.headers as HeadersInit) || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function badRequest(message: string, status = 400): Response {
  return json({ data: null, error: { message } }, { status });
}

function quoteIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid identifier: ${value}`);
  }
  return `"${value}"`;
}

function getBucket(env: Env, bucketName: string): R2Bucket | null {
  if (bucketName === "storage") return env.R2_STORAGE ?? null;
  if (bucketName === "fullfighting-pdf") return env.R2_PDF ?? null;
  return null;
}

function normalizeDbValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object" && !(value instanceof ArrayBuffer)) {
    return JSON.stringify(value);
  }
  return value;
}

function sanitizeRow(
  table: string,
  row: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!row) return row;
  const next = { ...row };
  if (table === "factures" && typeof next.lignes === "string") {
    try {
      const parsed = JSON.parse(String(next.lignes || ""));
      next.lignes = Array.isArray(parsed) ? parsed : [];
    } catch {
      next.lignes = [];
    }
  }
  if (table !== "utilisateurs") return next;
  delete next.mot_de_passe;
  return next;
}

function sanitizeData(table: string, data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map((item) =>
      item && typeof item === "object"
        ? sanitizeRow(table, item as Record<string, unknown>)
        : item
    );
  }
  if (data && typeof data === "object") {
    return sanitizeRow(table, data as Record<string, unknown>);
  }
  return data;
}

function filterClubInfoForPublic(clubInfo: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(clubInfo || {})) {
    if (PUBLIC_CLUB_INFO_KEYS.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}


function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self' https://americanfullfightingbons.fr https://inscription.americanfullfightingbons.fr https://calendrier.americanfullfightingbons.fr https://boutique.americanfullfightingbons.fr",
    ].join("; "),
  );
  return new Response(response.body, { status: response.status, headers });
}

function buildWhereClause(
  filters: DbFilter[] = [],
  bindings: unknown[]
): string {
  const parts: string[] = [];
  for (const filter of filters) {
    const column = quoteIdentifier(filter.column);
    if (filter.op === "eq") {
      parts.push(`${column} = ?`);
      bindings.push(normalizeDbValue(filter.value));
      continue;
    }
    if (filter.op === "in") {
      if (!Array.isArray(filter.value)) {
        // Erreur explicite plutôt qu'un silencieux "0 résultat" si le client
        // envoie une valeur mal formée (ex: une string au lieu d'un tableau).
        throw new Error(`Filter op "in" on column "${filter.column}" requires an array value`);
      }
      const values = filter.value;
      if (!values.length) {
        parts.push("1 = 0");
        continue;
      }
      parts.push(`${column} IN (${values.map(() => "?").join(", ")})`);
      bindings.push(...values.map((v) => normalizeDbValue(v)));
      continue;
    }
    throw new Error(`Unsupported filter op: ${filter.op}`);
  }
  return parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
}

async function queryRows(
  db: D1Database,
  table: string,
  body: DbRequestBody
): Promise<{ data: unknown; error: unknown }> {
  const bindings: unknown[] = [];
  let sql = `SELECT * FROM ${quoteIdentifier(table)}`;
  sql += buildWhereClause(body.filters, bindings);
  if (body.order?.column) {
    sql += ` ORDER BY ${quoteIdentifier(body.order.column)} ${
      body.order.ascending === false ? "DESC" : "ASC"
    }`;
  }
  const requestedLimit = body.limit && body.limit > 0 ? Math.floor(body.limit) : MAX_QUERY_LIMIT;
  sql += ` LIMIT ${Math.min(requestedLimit, MAX_QUERY_LIMIT)}`;
  const result = await db.prepare(sql).bind(...bindings).all();
  const rows = result.results || [];
  if (body.single) {
    return {
      data: sanitizeData(table, rows[0] || null),
      error: rows[0] ? null : { message: "No rows found" },
    };
  }
  return { data: sanitizeData(table, rows), error: null };
}

async function insertRows(
  db: D1Database,
  env: Env,
  table: string,
  body: DbRequestBody
): Promise<{ data: unknown; error: unknown; ids: string[] }> {
  const rows = Array.isArray(body.values) ? body.values : [body.values];
  const inserted: Record<string, unknown>[] = [];
  const ids: string[] = [];
  const primaryKey = PRIMARY_KEYS[table];
  const statements: D1PreparedStatement[] = [];

  for (const input of rows as Record<string, unknown>[]) {
    const row =
      table === "utilisateurs"
        ? await prepareUserWriteValues(input, env, PASSWORD_HASH_PREFIX, PASSWORD_HASH_ITERATIONS)
        : { ...input };
    if (primaryKey === "id" && !row.id) row.id = crypto.randomUUID();
    const columns = Object.keys(row);
    if (!columns.length) continue;
    const values = columns.map((c) => normalizeDbValue(row[c]));
    const quotedColumns = columns.map((c) => quoteIdentifier(c)).join(", ");
    const placeholders = columns.map(() => "?").join(", ");
    let sql = `INSERT INTO ${quoteIdentifier(table)} (${quotedColumns}) VALUES (${placeholders})`;
    if (body.action === "upsert" && body.onConflict) {
      const conflictCols: string[] = Array.isArray(body.onConflict)
        ? body.onConflict
        : [body.onConflict];
      const conflict = conflictCols.map((c) => quoteIdentifier(c)).join(", ");
      const updateColumns = columns
        .filter((c) => !conflictCols.includes(c))
        .map((c) => `${quoteIdentifier(c)} = excluded.${quoteIdentifier(c)}`)
        .join(", ");
      sql += updateColumns
        ? ` ON CONFLICT(${conflict}) DO UPDATE SET ${updateColumns}`
        : ` ON CONFLICT(${conflict}) DO NOTHING`;
    }
    statements.push(db.prepare(sql).bind(...values));
    inserted.push(row);
    if (primaryKey && row[primaryKey] !== undefined) ids.push(String(row[primaryKey]));
  }

  // db.batch() exécute toutes les requêtes en une seule transaction/round-trip D1
  // au lieu d'un await séquentiel par ligne — plus rapide pour les imports
  // multi-lignes (ex: import CSV de 50 adhérents). L'ordre des statements
  // correspond exactement à l'ordre de inserted[]/ids[] construit ci-dessus.
  if (statements.length === 1) {
    await statements[0].run();
  } else if (statements.length > 1) {
    await db.batch(statements);
  }

  const payload = sanitizeData(table, body.single ? inserted[0] || null : inserted);
  return { data: body.select ? payload : null, error: null, ids };
}

async function updateRows(
  db: D1Database,
  env: Env,
  table: string,
  body: DbRequestBody
): Promise<{ data: unknown; error: unknown }> {
  const filters = body.filters || [];
  if (!filters.length) throw new Error("Unsafe update blocked: missing filters");
  const values: Record<string, unknown> =
    table === "utilisateurs"
      ? await prepareUserWriteValues((body.values as Record<string, unknown>) || {}, env, PASSWORD_HASH_PREFIX, PASSWORD_HASH_ITERATIONS)
      : (body.values as Record<string, unknown>) || {};
  const columns = Object.keys(values);
  if (!columns.length) return { data: body.single ? null : [], error: null };
  const bindings = columns.map((c) => normalizeDbValue(values[c]));
  const setClause = columns.map((c) => `${quoteIdentifier(c)} = ?`).join(", ");
  let sql = `UPDATE ${quoteIdentifier(table)} SET ${setClause}`;
  sql += buildWhereClause(filters, bindings);
  await db.prepare(sql).bind(...bindings).run();
  if (!body.select) return { data: null, error: null };
  return queryRows(db, table, {
    action: "query",
    filters,
    single: body.single,
    limit: body.single ? 1 : undefined,
  });
}

async function deleteRows(
  db: D1Database,
  table: string,
  body: DbRequestBody
): Promise<{ data: unknown; error: unknown }> {
  const filters = body.filters || [];
  if (!filters.length) throw new Error("Unsafe delete blocked: missing filters");
  const bindings: unknown[] = [];
  let sql = `DELETE FROM ${quoteIdentifier(table)}`;
  sql += buildWhereClause(filters, bindings);
  await db.prepare(sql).bind(...bindings).run();
  return { data: null, error: null };
}

function extractFilterId(filters: DbFilter[] = []): string | null {
  const idFilter = filters.find((f) => f.column === "id" && f.op === "eq");
  return idFilter ? String(idFilter.value ?? "") : null;
}

async function logAudit(
  db: D1Database,
  user: Record<string, unknown> | null,
  ip: string,
  action: string,
  table: string,
  entityId: string | null,
  details: unknown
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        user ? String(user.id || "") : null,
        action,
        table,
        entityId,
        JSON.stringify(details ?? {}),
        ip,
        new Date().toISOString()
      )
      .run();
  } catch {
    // L'audit ne doit jamais faire échouer l'opération métier elle-même.
  }
}

// Erreurs "métier" volontairement levées par nos propres fonctions (filtres
// manquants, action non supportée, etc.) — sûres à renvoyer telles quelles.
// Tout le reste (erreurs D1/SQLite brutes) est loggé côté Worker et remplacé
// par un message générique pour ne pas exposer le schéma de la base au client.
const SAFE_ERROR_PREFIXES = [
  "Unsafe update blocked",
  "Unsafe delete blocked",
  "Unsupported filter op",
  "Unsupported action",
  "Filter op \"in\"",
  "Invalid identifier",
  "Direct password writes are blocked",
];

function isSafeErrorMessage(message: string): boolean {
  return SAFE_ERROR_PREFIXES.some((prefix) => message.startsWith(prefix));
}

async function handleDbApi(request: Request, env: Env, table: string): Promise<Response> {
  if (!TABLES.has(table)) return badRequest("Unknown table", 404);
  const user = await getCurrentUser(request, env, SESSION_COOKIE);
  if (!user) return badRequest("Unauthorized", 401);
  let body: DbRequestBody;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  // Traduire le format frontend (op/payload) vers le format interne (action/values)
  if (body.op && !body.action) {
    const opMap: Record<string, DbRequestBody["action"]> = {
      select: "query",
      insert: "insert",
      update: "update",
      delete: "delete",
      upsert: "upsert",
    };
    body.action = opMap[body.op] || (body.op as DbRequestBody["action"]);
    if (body.payload !== undefined && body.values === undefined) {
      body.values = body.payload;
    }
  }
  const permission = TABLE_PERMISSIONS[table];
  const mode = body.action === "query" ? "read" : "write";
  if (mode === "write") {
    let allowed = hasPermission(user, permission.write, "write", DEFAULT_ROLE_PERMS);
    if (!allowed && table === "utilisateurs" && body.action === "update") {
      const filters = body.filters || [];
      const ownUserUpdate =
        filters.length === 1 &&
        filters[0].op === "eq" &&
        filters[0].column === "id" &&
        String(filters[0].value || "") === String(user.id || "");
      const values = (body.values as Record<string, unknown>) || {};
      const columns = Object.keys(values);
      const allowedColumns = [
        "mot_de_passe_plain",
        "updated_at",
        "password_changed_at",
        "must_change_password",
      ];
      allowed =
        ownUserUpdate &&
        columns.length > 0 &&
        columns.every((c) => allowedColumns.includes(c));
    }
    if (!allowed) return badRequest("Forbidden", 403);
  }
  try {
    const db = env.DB;
    if (body.action === "query") return json(await queryRows(db, table, body));

    if (body.action === "insert" || body.action === "upsert") {
      const result = await insertRows(db, env, table, body);
      if (table !== "audit_logs") {
        await logAudit(
          db,
          user,
          getClientIp(request),
          body.action,
          table,
          result.ids.length === 1 ? result.ids[0] : null,
          { ids: result.ids }
        );
      }
      return json({ data: result.data, error: result.error });
    }

    if (body.action === "update") {
      const result = await updateRows(db, env, table, body);
      if (table !== "audit_logs") {
        await logAudit(
          db,
          user,
          getClientIp(request),
          "update",
          table,
          extractFilterId(body.filters),
          { filters: body.filters, columns: Object.keys((body.values as Record<string, unknown>) || {}) }
        );
      }
      return json(result);
    }

    if (body.action === "delete") {
      const result = await deleteRows(db, table, body);
      if (table !== "audit_logs") {
        await logAudit(
          db,
          user,
          getClientIp(request),
          "delete",
          table,
          extractFilterId(body.filters),
          { filters: body.filters }
        );
      }
      return json(result);
    }

    return badRequest("Unsupported action");
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Unexpected database error";
    // Toujours logger le détail réel côté Worker pour pouvoir investiguer.
    console.error(`[handleDbApi] table=${table} action=${body.action}:`, rawMessage);
    const safeMessage = isSafeErrorMessage(rawMessage) ? rawMessage : "Erreur serveur lors de l'accès aux données";
    return badRequest(safeMessage, 500);
  }
}

function getClientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function getLoginBlock(db: D1Database, ip: string): Promise<number> {
  const row = (await db
    .prepare(`SELECT blocked_until FROM auth_rate_limits WHERE ip = ?`)
    .bind(ip)
    .first()) as { blocked_until: string | null } | null;
  if (!row?.blocked_until) return 0;
  const blockedUntil = Date.parse(row.blocked_until);
  return Number.isFinite(blockedUntil) ? blockedUntil : 0;
}

async function registerLoginFailure(db: D1Database, ip: string): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const row = (await db
    .prepare(`SELECT failures, last_failure_at FROM auth_rate_limits WHERE ip = ?`)
    .bind(ip)
    .first()) as { failures: number; last_failure_at: string | null } | null;

  const lastFailureAt = row?.last_failure_at ? Date.parse(row.last_failure_at) : 0;
  const withinWindow =
    Number.isFinite(lastFailureAt) && now.getTime() - lastFailureAt < LOGIN_FAILURE_WINDOW_MS;
  const failures = (row && withinWindow ? row.failures : 0) + 1;
  const blockedUntil =
    failures >= LOGIN_MAX_FAILURES ? new Date(now.getTime() + LOGIN_BLOCK_MS).toISOString() : null;

  await db
    .prepare(
      `INSERT INTO auth_rate_limits (ip, failures, last_failure_at, blocked_until, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(ip) DO UPDATE SET
         failures = excluded.failures,
         last_failure_at = excluded.last_failure_at,
         blocked_until = excluded.blocked_until,
         updated_at = excluded.updated_at`
    )
    .bind(ip, failures, nowIso, blockedUntil, nowIso, nowIso)
    .run();
}

async function clearLoginFailures(db: D1Database, ip: string): Promise<void> {
  await db.prepare(`DELETE FROM auth_rate_limits WHERE ip = ?`).bind(ip).run();
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const db = env.DB;
  const ip = getClientIp(request);

  const blockedUntil = await getLoginBlock(db, ip);
  if (blockedUntil > Date.now()) {
    const retryAfterSec = Math.ceil((blockedUntil - Date.now()) / 1000);
    const response = badRequest(
      "Trop de tentatives de connexion. Réessayez dans quelques minutes.",
      429
    );
    response.headers.set("Retry-After", String(retryAfterSec));
    return response;
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const email = String(payload.email || "").trim().toLowerCase();
  if (!email) return badRequest("Email requis");
  const passwordPlain = String(payload.passwordPlain || payload.password || "");
  const passwordHash = String(payload.passwordHash || "").trim().toLowerCase();
  if (!passwordPlain && !passwordHash) return badRequest("Mot de passe requis");
  const user = (await db
    .prepare(`SELECT * FROM utilisateurs WHERE email = ? AND actif = 1 LIMIT 1`)
    .bind(email)
    .first()) as Record<string, unknown> | null;
  if (!user) {
    await registerLoginFailure(db, ip);
    return badRequest("Email ou mot de passe incorrect", 401);
  }
  const stored = String(user.mot_de_passe || "");
  let passwordCheck: { valid: boolean; upgradedHash: string | null } = {
    valid: false,
    upgradedHash: null,
  };
  if (passwordPlain) {
    passwordCheck = await verifyPassword(passwordPlain, stored, env, PASSWORD_HASH_PREFIX, MAX_PBKDF2_ITERATIONS, LEGACY_SHA256_RE);
  } else if (
    passwordHash &&
    LEGACY_SHA256_RE.test(stored) &&
    secureEquals(passwordHash, stored.toLowerCase())
  ) {
    passwordCheck = { valid: true, upgradedHash: null };
  }
  if (!passwordCheck.valid) {
    await registerLoginFailure(db, ip);
    return badRequest("Email ou mot de passe incorrect", 401);
  }
  await clearLoginFailures(db, ip);
  if (passwordCheck.upgradedHash) {
    await db
      .prepare(`UPDATE utilisateurs SET mot_de_passe = ?, updated_at = ? WHERE id = ?`)
      .bind(passwordCheck.upgradedHash, new Date().toISOString(), user.id)
      .run();
    user.mot_de_passe = passwordCheck.upgradedHash;
  }
  const token = await createSessionToken(
    {
      userId: String(user.id || ""),
      expiresAt: Date.now() + SESSION_TTL_MS,
      // Capturé au moment du login : si le mot de passe change ensuite,
      // password_changed_at en base ne correspondra plus à cette valeur
      // et getCurrentUser() invalidera automatiquement ce token.
      pwdStamp: String(user.password_changed_at || ""),
    },
    env
  );
  const response = json({ data: { user: sanitizeRow("utilisateurs", user) }, error: null });
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${Math.floor(
      SESSION_TTL_MS / 1000
    )}; SameSite=Lax; Secure`
  );
  return response;
}

async function handleSession(request: Request, env: Env): Promise<Response> {
  const user = await getCurrentUser(request, env, SESSION_COOKIE);
  if (!user) return badRequest("Unauthorized", 401);
  return json({ data: { user: sanitizeRow("utilisateurs", user) }, error: null });
}

async function handleLogout(_request: Request, _env: Env): Promise<Response> {
  const response = json({ data: { ok: true }, error: null });
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure`
  );
  return response;
}

async function handleChangePassword(request: Request, env: Env): Promise<Response> {
  const user = await getCurrentUser(request, env, SESSION_COOKIE);
  if (!user) return badRequest("Unauthorized", 401);
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const currentPassword = String(payload.currentPassword || "");
  const nextPassword = String(payload.nextPassword || "");
  if (!currentPassword) return badRequest("Mot de passe actuel requis");
  if (!nextPassword) return badRequest("Nouveau mot de passe requis");
  if (nextPassword.length < 6)
    return badRequest("Le nouveau mot de passe doit contenir au moins 6 caractères");
  const stored = String(user.mot_de_passe || "");
  const passwordCheck = await verifyPassword(currentPassword, stored, env, PASSWORD_HASH_PREFIX, MAX_PBKDF2_ITERATIONS, LEGACY_SHA256_RE);
  if (!passwordCheck.valid) return badRequest("Mot de passe actuel incorrect", 401);
  const nextPasswordHash = await hashPassword(nextPassword, env, PASSWORD_HASH_PREFIX, PASSWORD_HASH_ITERATIONS);
  const newPwdStamp = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE utilisateurs SET mot_de_passe = ?, updated_at = ?, password_changed_at = ?, must_change_password = 0 WHERE id = ?`
  )
    .bind(nextPasswordHash, newPwdStamp, newPwdStamp, user.id)
    .run();
  // Toutes les AUTRES sessions actives (sur d'autres appareils) portent l'ancien
  // pwdStamp et seront rejetées par getCurrentUser() dès leur prochaine requête.
  // On réémet ici un cookie frais pour que la session courante reste valide.
  const token = await createSessionToken(
    { userId: String(user.id || ""), expiresAt: Date.now() + SESSION_TTL_MS, pwdStamp: newPwdStamp },
    env
  );
  const response = json({ data: { ok: true }, error: null });
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${Math.floor(
      SESSION_TTL_MS / 1000
    )}; SameSite=Lax; Secure`
  );
  return response;
}

async function handleStorageList(
  request: Request,
  env: Env,
  bucketName: string
): Promise<Response> {
  const user = await getCurrentUser(request, env, SESSION_COOKIE);
  if (!user) return badRequest("Unauthorized", 401);
  const bucket = getBucket(env, bucketName);
  if (!bucket) return badRequest("Unknown bucket", 404);
  const url = new URL(request.url);
  let prefix = url.searchParams.get("prefix") || "";
  if (bucketName === "storage" && !prefix) prefix = "diplome/";
  if (!hasStoragePermission(user, bucketName, prefix, "read", DEFAULT_ROLE_PERMS))
    return badRequest("Forbidden", 403);
  const result = await bucket.list({ prefix });
  const data = (result.objects || []).map((object) => ({
    name: object.key.slice(prefix.length).replace(/^\/+/, ""),
    metadata: { size: object.size },
    id: object.etag,
  }));
  return json({ data, error: null });
}

async function handleStorageUpload(
  request: Request,
  env: Env,
  bucketName: string
): Promise<Response> {
  const user = await getCurrentUser(request, env, SESSION_COOKIE);
  if (!user) return badRequest("Unauthorized", 401);
  const bucket = getBucket(env, bucketName);
  if (!bucket) return badRequest("Unknown bucket", 404);
  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "";
  if (!path) return badRequest("Storage path missing");
  if (!hasStoragePermission(user, bucketName, path, "write", DEFAULT_ROLE_PERMS))
    return badRequest("Forbidden", 403);
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return badRequest("File missing");
  await bucket.put(path, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  return json({
    data: { path, publicUrl: `${url.origin}/api/storage/${bucketName}/${path}` },
    error: null,
  });
}

async function handleStorageGet(
  request: Request,
  env: Env,
  bucketName: string,
  key: string
): Promise<Response> {
  const isPublic = isPublicStorageObject(bucketName, key);
  const user = isPublic ? null : await getCurrentUser(request, env, SESSION_COOKIE);
  if (!isPublic && !user) return new Response("Unauthorized", { status: 401 });
  if (!isPublic && user && !hasStoragePermission(user, bucketName, key, "read", DEFAULT_ROLE_PERMS)) {
    return new Response("Forbidden", { status: 403 });
  }
  const bucket = getBucket(env, bucketName);
  if (!bucket) return new Response("Not Found", { status: 404 });
  const object = await bucket.get(key);
  if (!object) return new Response("Not Found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", isPublic ? "public, max-age=3600" : "private, max-age=60");
  return new Response(object.body, { headers });
}

interface EmailRecipient {
  email: string;
  name?: string;
}

interface EmailAttachment {
  /** Nom de fichier proposé au destinataire (ex. "diplome.pdf") */
  name: string;
  /** Contenu encodé en base64 (sans préfixe data:) */
  content: string;
}

interface EmailSendBody {
  to?: EmailRecipient[];
  subject?: string;
  html?: string;
  attachments?: EmailAttachment[];
}

// Envoi d'email transactionnel via Brevo (ex-Sendinblue), réutilisé par plusieurs
// fonctionnalités du back-office (relance de vente impayée, envoi de diplôme PDF...).
// Doc : https://developers.brevo.com/reference/sendtransacemail
async function handleEmailSend(request: Request, env: Env): Promise<Response> {
  const user = await getCurrentUser(request, env, SESSION_COOKIE);
  if (!user) return badRequest("Unauthorized", 401);
  if (!env.BREVO_API_KEY) {
    return badRequest("Service d'email non configuré (secret BREVO_API_KEY manquant)", 503);
  }
  let body: EmailSendBody;
  try {
    body = (await request.json()) as EmailSendBody;
  } catch {
    return badRequest("Corps de requête JSON invalide");
  }
  const recipients = Array.isArray(body.to) ? body.to.filter((r) => r?.email) : [];
  if (!recipients.length) return badRequest("Destinataire manquant");
  if (!body.subject) return badRequest("Sujet manquant");
  if (!body.html) return badRequest("Contenu HTML manquant");

  const payload: Record<string, unknown> = {
    sender: {
      name: env.BREVO_FROM_NAME || "AFFBC",
      email: env.BREVO_FROM_EMAIL,
    },
    to: recipients.map((r) => ({ email: r.email, name: r.name || r.email })),
    subject: body.subject,
    htmlContent: body.html,
  };
  if (Array.isArray(body.attachments) && body.attachments.length) {
    payload.attachment = body.attachments
      .filter((a) => a?.name && a?.content)
      .map((a) => ({ name: a.name, content: a.content }));
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text();
      return json({ data: null, error: { message: `Brevo error ${res.status}: ${errText}` } }, { status: 502 });
    }
    return json({ data: { sent: true }, error: null });
  } catch (err) {
    return json({ data: null, error: { message: err instanceof Error ? err.message : String(err) } }, { status: 502 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();


    if (path === "/api/health" && (method === "GET" || method === "HEAD")) {
      const response = withSecurityHeaders(json({ ok: true, data: { service: "gestion-americanfullfightingbons", date: new Date().toISOString(), bindings: { hasDb: !!env.DB } } }));
      return method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
    }

    if (path === "/api/version" && (method === "GET" || method === "HEAD")) {
      const response = withSecurityHeaders(json({ ok: true, data: { service: "gestion-americanfullfightingbons", version: "1.0.0" } }));
      return method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
    }

    if (path === "/api/bootstrap" && (method === "GET" || method === "HEAD")) {
      if (method === "HEAD") {
        // Pas besoin d'interroger D1 juste pour répondre à un HEAD : on renvoie
        // un 200 vide immédiatement plutôt que de calculer tout le payload bootstrap.
        return withSecurityHeaders(new Response(null, { status: 200 }));
      }
      try {
        const user = await getCurrentUser(request, env, SESSION_COOKIE);
        const db = env.DB;

        const clubInfoRows = await db.prepare(`SELECT * FROM club_info`).all();
        const clubInfo: Record<string, unknown> = {};
        for (const row of clubInfoRows.results || []) {
          const r = row as Record<string, unknown>;
          clubInfo[String(r.cle)] = r.valeur;
        }

        const exercices = user
          ? (await db.prepare(`SELECT * FROM exercices ORDER BY date_debut DESC`).all()).results
          : [];

        return withSecurityHeaders(json({
          data: {
            clubInfo: user ? clubInfo : filterClubInfoForPublic(clubInfo),
            exercices,
            currentUser: user ? sanitizeRow("utilisateurs", user) : null,
          },
          error: null,
        }));
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : "Database unavailable";
        console.error("[bootstrap]", rawMessage);
        return withSecurityHeaders(json({ data: null, error: { message: "Database unavailable" } }, { status: 503 }));
      }
    }

    if (path === "/api/auth/login" && method === "POST") {
      return withSecurityHeaders(await handleLogin(request, env));
    }
    if (path === "/api/auth/session" && (method === "GET" || method === "HEAD")) {
      return withSecurityHeaders(await handleSession(request, env));
    }
    if (path === "/api/auth/logout" && method === "POST") {
      return withSecurityHeaders(await handleLogout(request, env));
    }
    if ((path === "/api/auth/change-password" || path === "/api/auth/password") && method === "POST") {
      return withSecurityHeaders(await handleChangePassword(request, env));
    }
    if (path === "/api/email/send" && method === "POST") {
      return withSecurityHeaders(await handleEmailSend(request, env));
    }

    const dbMatch = path.match(/^\/api\/db\/([A-Za-z0-9_]+)$/);
    if (dbMatch) {
      if (method !== "POST")
        return withSecurityHeaders(new Response("Method Not Allowed", { status: 405 }));
      return withSecurityHeaders(await handleDbApi(request, env, dbMatch[1]));
    }

    const storageListMatch = path.match(/^\/api\/storage\/([A-Za-z0-9_-]+)\/list$/);
    if (storageListMatch && (method === "GET" || method === "HEAD")) {
      return withSecurityHeaders(await handleStorageList(request, env, storageListMatch[1]));
    }

    const storageUploadMatch = path.match(/^\/api\/storage\/([A-Za-z0-9_-]+)\/upload$/);
    if (storageUploadMatch && method === "POST") {
      return withSecurityHeaders(await handleStorageUpload(request, env, storageUploadMatch[1]));
    }

    const storageGetMatch = path.match(/^\/api\/storage\/([A-Za-z0-9_-]+)\/(.+)$/);
    if (storageGetMatch && (method === "GET" || method === "HEAD")) {
      return withSecurityHeaders(
        await handleStorageGet(request, env, storageGetMatch[1], decodeURIComponent(storageGetMatch[2]))
      );
    }

    if (env.ASSETS) {
      return await env.ASSETS.fetch(request);
    }

    return withSecurityHeaders(new Response("Not Found", { status: 404 }));
  },

  // Sauvegarde automatique programmée (Cron Trigger, cf. wrangler.json "triggers").
  // Complète le bouton de sauvegarde manuel existant : ici, dump complet de toutes
  // les tables (y compris diplômes, audit, transactions — absents de l'export manuel
  // côté interface) vers R2, sans dépendre de la mémoire d'un humain pour la déclencher.
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const db = env.DB;
    const dump: Record<string, unknown> = {
      version: "auto-1",
      generated_at: new Date().toISOString(),
    };
    for (const table of TABLES) {
      try {
        const { results } = await db.prepare(`SELECT * FROM ${table}`).all();
        dump[table] = results;
      } catch (err) {
        dump[table] = { error: err instanceof Error ? err.message : String(err) };
      }
    }
    const dateLabel = new Date().toISOString().slice(0, 10);
    const path = `backups/auto/backup_${dateLabel}.json`;
    await env.R2_STORAGE.put(path, JSON.stringify(dump, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });
  },
} satisfies ExportedHandler<Env>;
