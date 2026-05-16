// ─────────────────────────────────────────────────────────────
// Worker principal — AFFBC Gestion du club
// ─────────────────────────────────────────────────────────────

const SESSION_COOKIE = "affbc_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_HASH_PREFIX = "pbkdf2_sha256";
const PASSWORD_HASH_ITERATIONS = 1e5;
const MAX_PBKDF2_ITERATIONS = 1e5;
const LEGACY_SHA256_RE = /^[a-f0-9]{64}$/i;

const TABLES = new Set([
  "adherents",
  "achats",
  "club_info",
  "comptes_bancaires",
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
  club_info: { read: "perm_administration", write: "perm_administration" },
  comptes_bancaires: { read: "perm_banque", write: "perm_banque" },
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
  if (bucketName === "storage") return (env as any).R2_STORAGE ?? (env as any).STORAGE ?? null;
  if (bucketName === "fullfighting-pdf") return (env as any).R2_PDF ?? null;
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

function parseCookies(request: Request): Record<string, string> {
  const raw = request.headers.get("Cookie") || "";
  return Object.fromEntries(
    raw
      .split(";")
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const index = chunk.indexOf("=");
        if (index < 0) return [chunk, ""];
        return [chunk.slice(0, index), decodeURIComponent(chunk.slice(index + 1))];
      })
  );
}

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesToBase64Url(value: Uint8Array | ArrayBuffer): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return atob(padded);
}

function bytesFromBase64Url(value: string): Uint8Array {
  const binary = fromBase64Url(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function secureEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let delta = 0;
  for (let i = 0; i < left.length; i++) delta |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return delta === 0;
}

function getSessionSecret(env: Env): string {
  const secret = String((env as any).SESSION_SECRET || "");
  if (secret.length < 32) throw new Error("SESSION_SECRET missing or too short");
  return secret;
}

async function hmacSha256Base64Url(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(signature);
}

function getPasswordPepper(env: Env): string {
  return String((env as any).PASSWORD_PEPPER || "");
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
  iterations: number,
  env: Env
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${password}${getPasswordPepper(env)}`),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

async function hashPassword(password: string, env: Env): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt, PASSWORD_HASH_ITERATIONS, env);
  return `${PASSWORD_HASH_PREFIX}$${PASSWORD_HASH_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

async function verifyPassword(
  password: string,
  storedPassword: unknown,
  env: Env
): Promise<{ valid: boolean; upgradedHash: string | null }> {
  const stored = String(storedPassword || "").trim();
  if (!stored) return { valid: false, upgradedHash: null };

  if (stored.startsWith(`${PASSWORD_HASH_PREFIX}$`)) {
    const [, iterationsRaw, saltRaw, hashRaw] = stored.split("$");
    const iterations = Number.parseInt(iterationsRaw || "", 10);
    if (!iterations || !saltRaw || !hashRaw || iterations > MAX_PBKDF2_ITERATIONS) {
      return { valid: false, upgradedHash: null };
    }
    const derived = await derivePasswordHash(
      password,
      bytesFromBase64Url(saltRaw),
      iterations,
      env
    );
    return { valid: secureEquals(bytesToBase64Url(derived), hashRaw), upgradedHash: null };
  }

  if (LEGACY_SHA256_RE.test(stored)) {
    const legacyHash = await sha256Hex(password);
    if (!secureEquals(legacyHash, stored.toLowerCase()))
      return { valid: false, upgradedHash: null };
    return { valid: true, upgradedHash: await hashPassword(password, env) };
  }

  if (!secureEquals(password, stored)) return { valid: false, upgradedHash: null };
  return { valid: true, upgradedHash: await hashPassword(password, env) };
}

async function prepareUserWriteValues(
  values: Record<string, unknown>,
  env: Env
): Promise<Record<string, unknown>> {
  const next = { ...values };
  const hasPlainPassword = Object.prototype.hasOwnProperty.call(next, "mot_de_passe_plain");
  if (Object.prototype.hasOwnProperty.call(next, "mot_de_passe") && !hasPlainPassword) {
    throw new Error("Direct password writes are blocked; use mot_de_passe_plain");
  }
  if (!hasPlainPassword) {
    delete next.mot_de_passe_plain;
    return next;
  }
  const plainPassword = String(next.mot_de_passe_plain || "");
  delete next.mot_de_passe_plain;
  delete next.mot_de_passe;
  if (!plainPassword) return next;
  next.mot_de_passe = await hashPassword(plainPassword, env);
  if (!next.password_changed_at) next.password_changed_at = new Date().toISOString();
  return next;
}

async function createSessionToken(
  session: Record<string, unknown>,
  env: Env
): Promise<string> {
  const payload = toBase64Url(JSON.stringify(session));
  const signature = await hmacSha256Base64Url(getSessionSecret(env), payload);
  return `${payload}.${signature}`;
}

async function parseSessionToken(
  token: string,
  env: Env
): Promise<Record<string, unknown> | null> {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  const expected = await hmacSha256Base64Url(getSessionSecret(env), payload);
  if (!secureEquals(expected, signature)) return null;
  try {
    return JSON.parse(fromBase64Url(payload));
  } catch {
    return null;
  }
}

async function getCurrentUser(
  request: Request,
  env: Env
): Promise<Record<string, unknown> | null> {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const session = await parseSessionToken(token, env);
  if (!session || !session.userId || (session.expiresAt as number) < Date.now()) return null;
  return (env as any).DB.prepare(
    `SELECT * FROM utilisateurs WHERE id = ? AND actif = 1`
  )
    .bind(session.userId)
    .first();
}

function getPermissionLevel(user: Record<string, unknown>, key: string): string {
  const direct = String(user[key] || "");
  if (direct === "write" || direct === "read" || direct === "none") return direct;
  const role = String(user.role || "");
  return DEFAULT_ROLE_PERMS[role]?.[key] || "none";
}

function hasPermission(
  user: Record<string, unknown>,
  permKey: string,
  mode: "read" | "write"
): boolean {
  if (String(user.role || "") === "admin") return true;
  const level = getPermissionLevel(user, permKey);
  if (mode === "read") return level === "read" || level === "write";
  return level === "write";
}

function hasStoragePermission(
  user: Record<string, unknown>,
  bucketName: string,
  keyOrPrefix: string,
  mode: "read" | "write"
): boolean {
  const normalized = String(keyOrPrefix || "").replace(/^\/+/, "");
  if (bucketName === "fullfighting-pdf") {
    if (normalized.startsWith("achats/")) return hasPermission(user, "perm_achats", mode);
    if (normalized.startsWith("adherents/")) return hasPermission(user, "perm_adherents", mode);
    return hasPermission(user, "perm_administration", mode);
  }
  if (bucketName === "storage") {
    if (normalized.startsWith("Diplôme/") || normalized === "Diplôme")
      return hasPermission(user, "perm_adherents", mode);
    if (normalized.startsWith("branding/") || normalized === "branding")
      return hasPermission(user, "perm_administration", mode);
    return hasPermission(user, "perm_administration", mode);
  }
  return false;
}

function isPublicStorageObject(bucketName: string, key: string): boolean {
  const normalized = String(key || "").replace(/^\/+/, "");
  return bucketName === "storage" && normalized.startsWith("branding/");
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Frame-Options", "DENY");
  return new Response(response.body, { status: response.status, headers });
}

function buildWhereClause(
  filters: Array<{ column: string; op: string; value: unknown }> = [],
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
      const values = Array.isArray(filter.value) ? filter.value : [];
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
  body: any
): Promise<{ data: unknown; error: unknown }> {
  const bindings: unknown[] = [];
  let sql = `SELECT * FROM ${quoteIdentifier(table)}`;
  sql += buildWhereClause(body.filters, bindings);
  if (body.order?.column) {
    sql += ` ORDER BY ${quoteIdentifier(body.order.column)} ${
      body.order.ascending === false ? "DESC" : "ASC"
    }`;
  }
  if (body.limit && body.limit > 0) sql += ` LIMIT ${Math.floor(body.limit)}`;
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
  body: any
): Promise<{ data: unknown; error: unknown }> {
  const rows = Array.isArray(body.values) ? body.values : [body.values];
  const inserted: Record<string, unknown>[] = [];
  const primaryKey = PRIMARY_KEYS[table];
  for (const input of rows) {
    const row =
      table === "utilisateurs"
        ? await prepareUserWriteValues(input, env)
        : { ...input };
    if (primaryKey === "id" && !row.id) row.id = crypto.randomUUID();
    const columns = Object.keys(row);
    if (!columns.length) continue;
    const values = columns.map((c) => normalizeDbValue(row[c]));
    const quotedColumns = columns.map((c) => quoteIdentifier(c)).join(", ");
    const placeholders = columns.map(() => "?").join(", ");
    let sql = `INSERT INTO ${quoteIdentifier(table)} (${quotedColumns}) VALUES (${placeholders})`;
    if (body.action === "upsert" && body.onConflict) {
      const conflict = quoteIdentifier(body.onConflict);
      const updateColumns = columns
        .filter((c) => c !== body.onConflict)
        .map((c) => `${quoteIdentifier(c)} = excluded.${quoteIdentifier(c)}`)
        .join(", ");
      sql += updateColumns
        ? ` ON CONFLICT(${conflict}) DO UPDATE SET ${updateColumns}`
        : ` ON CONFLICT(${conflict}) DO NOTHING`;
    }
    await db.prepare(sql).bind(...values).run();
    inserted.push(row);
  }
  const payload = sanitizeData(table, body.single ? inserted[0] || null : inserted);
  return { data: body.select ? payload : null, error: null };
}

async function updateRows(
  db: D1Database,
  env: Env,
  table: string,
  body: any
): Promise<{ data: unknown; error: unknown }> {
  const filters = body.filters || [];
  if (!filters.length) throw new Error("Unsafe update blocked: missing filters");
  const values =
    table === "utilisateurs"
      ? await prepareUserWriteValues(body.values || {}, env)
      : body.values || {};
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
    limit: body.single ? 1 : null,
  });
}

async function deleteRows(
  db: D1Database,
  table: string,
  body: any
): Promise<{ data: unknown; error: unknown }> {
  const filters = body.filters || [];
  if (!filters.length) throw new Error("Unsafe delete blocked: missing filters");
  const bindings: unknown[] = [];
  let sql = `DELETE FROM ${quoteIdentifier(table)}`;
  sql += buildWhereClause(filters, bindings);
  await db.prepare(sql).bind(...bindings).run();
  return { data: null, error: null };
}

async function handleDbApi(request: Request, env: Env, table: string): Promise<Response> {
  if (!TABLES.has(table)) return badRequest("Unknown table", 404);
  const user = await getCurrentUser(request, env);
  if (!user) return badRequest("Unauthorized", 401);
  let body: any;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const permission = TABLE_PERMISSIONS[table];
  const mode = body.action === "query" ? "read" : "write";
  if (mode === "write") {
    let allowed = hasPermission(user, permission.write, "write");
    if (!allowed && table === "utilisateurs" && body.action === "update") {
      const filters = body.filters || [];
      const ownUserUpdate =
        filters.length === 1 &&
        filters[0].op === "eq" &&
        filters[0].column === "id" &&
        String(filters[0].value || "") === String(user.id || "");
      const columns = Object.keys(body.values || {});
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
    const db = (env as any).DB as D1Database;
    if (body.action === "query") return json(await queryRows(db, table, body));
    if (body.action === "insert" || body.action === "upsert")
      return json(await insertRows(db, env, table, body));
    if (body.action === "update") return json(await updateRows(db, env, table, body));
    if (body.action === "delete") return json(await deleteRows(db, table, body));
    return badRequest("Unsupported action");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected database error";
    return badRequest(message, 500);
  }
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const email = String(payload.email || "").trim().toLowerCase();
  if (!email) return badRequest("Email requis");
  const passwordPlain = String(payload.passwordPlain || "");
  const passwordHash = String(payload.passwordHash || "").trim().toLowerCase();
  if (!passwordPlain && !passwordHash) return badRequest("Mot de passe requis");
  const user = (await (env as any).DB.prepare(
    `SELECT * FROM utilisateurs WHERE email = ? AND actif = 1 LIMIT 1`
  )
    .bind(email)
    .first()) as Record<string, unknown> | null;
  if (!user) return badRequest("Email ou mot de passe incorrect", 401);
  const stored = String(user.mot_de_passe || "");
  let passwordCheck: { valid: boolean; upgradedHash: string | null } = {
    valid: false,
    upgradedHash: null,
  };
  if (passwordPlain) {
    passwordCheck = await verifyPassword(passwordPlain, stored, env);
  } else if (
    passwordHash &&
    LEGACY_SHA256_RE.test(stored) &&
    secureEquals(passwordHash, stored.toLowerCase())
  ) {
    passwordCheck = { valid: true, upgradedHash: null };
  }
  if (!passwordCheck.valid) return badRequest("Email ou mot de passe incorrect", 401);
  if (passwordCheck.upgradedHash) {
    await (env as any).DB.prepare(
      `UPDATE utilisateurs SET mot_de_passe = ?, updated_at = ? WHERE id = ?`
    )
      .bind(passwordCheck.upgradedHash, new Date().toISOString(), user.id)
      .run();
    user.mot_de_passe = passwordCheck.upgradedHash;
  }
  const token = await createSessionToken(
    { userId: String(user.id || ""), expiresAt: Date.now() + SESSION_TTL_MS },
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
  const user = await getCurrentUser(request, env);
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
  const user = await getCurrentUser(request, env);
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
  const passwordCheck = await verifyPassword(currentPassword, stored, env);
  if (!passwordCheck.valid) return badRequest("Mot de passe actuel incorrect", 401);
  const nextPasswordHash = await hashPassword(nextPassword, env);
  await (env as any).DB.prepare(
    `UPDATE utilisateurs SET mot_de_passe = ?, updated_at = ?, password_changed_at = ?, must_change_password = 0 WHERE id = ?`
  )
    .bind(nextPasswordHash, new Date().toISOString(), new Date().toISOString(), user.id)
    .run();
  return json({ data: { ok: true }, error: null });
}

async function handleStorageList(
  request: Request,
  env: Env,
  bucketName: string
): Promise<Response> {
  const user = await getCurrentUser(request, env);
  if (!user) return badRequest("Unauthorized", 401);
  const bucket = getBucket(env, bucketName);
  if (!bucket) return badRequest("Unknown bucket", 404);
  const url = new URL(request.url);
  let prefix = url.searchParams.get("prefix") || "";
  if (bucketName === "storage" && !prefix) prefix = "Diplôme/";
  if (!hasStoragePermission(user, bucketName, prefix, "read"))
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
  const user = await getCurrentUser(request, env);
  if (!user) return badRequest("Unauthorized", 401);
  const bucket = getBucket(env, bucketName);
  if (!bucket) return badRequest("Unknown bucket", 404);
  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "";
  if (!path) return badRequest("Storage path missing");
  if (!hasStoragePermission(user, bucketName, path, "write"))
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
  const user = isPublic ? null : await getCurrentUser(request, env);
  if (!isPublic && !user) return new Response("Unauthorized", { status: 401 });
  if (!isPublic && user && !hasStoragePermission(user, bucketName, key, "read")) {
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (path === "/api/health") {
      return withSecurityHeaders(json({ data: { ok: true }, error: null }));
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
    if (path === "/api/auth/change-password" && method === "POST") {
      return withSecurityHeaders(await handleChangePassword(request, env));
    }

    const dbMatch = path.match(/^\/api\/db\/([A-Za-z0-9_]+)$/);
    if (dbMatch) {
      if (method !== "POST")
        return withSecurityHeaders(new Response("Method Not Allowed", { status: 405 }));
      return withSecurityHeaders(await handleDbApi(request, env, dbMatch[1]));
    }

    const storageListMatch = path.match(/^\/api\/storage\/([A-Za-z0-9_-]+)\/list$/);
    if (storageListMatch && (method === "GET" || method === "HEAD")) {
      return withSecurityHeaders(
        await handleStorageList(request, env, storageListMatch[1])
      );
    }

    const storageUploadMatch = path.match(/^\/api\/storage\/([A-Za-z0-9_-]+)\/upload$/);
    if (storageUploadMatch && method === "POST") {
      return withSecurityHeaders(
        await handleStorageUpload(request, env, storageUploadMatch[1])
      );
    }

    const storageGetMatch = path.match(/^\/api\/storage\/([A-Za-z0-9_-]+)\/(.+)$/);
    if (storageGetMatch && (method === "GET" || method === "HEAD")) {
      return withSecurityHeaders(
        await handleStorageGet(
          request,
          env,
          storageGetMatch[1],
          decodeURIComponent(storageGetMatch[2])
        )
      );
    }

    if ((env as any).ASSETS) {
      return withSecurityHeaders(await (env as any).ASSETS.fetch(request));
    }

    return withSecurityHeaders(new Response("Not Found", { status: 404 }));
  },
} satisfies ExportedHandler<Env>;
