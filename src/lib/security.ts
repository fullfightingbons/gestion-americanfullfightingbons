type AnyEnv = {
  DB?: D1Database;
  PASSWORD_PEPPER?: unknown;
  SESSION_SECRET?: unknown;
};
type PermissionMatrix = Record<string, Record<string, string>>;
type UserRow = Record<string, unknown>;

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
      }),
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

function getSessionSecret(env: AnyEnv): string {
  const secret = String(env.SESSION_SECRET || "");
  if (secret.length < 32) throw new Error("SESSION_SECRET missing or too short");
  return secret;
}

async function hmacSha256Base64Url(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(signature);
}

function getPasswordPepper(env: AnyEnv): string {
  const pepper = String(env.PASSWORD_PEPPER || "");
  if (!pepper) {
    console.warn("[security] PASSWORD_PEPPER is not set — PBKDF2 pepper is empty. Set it as a Cloudflare Worker secret.");
  }
  return pepper;
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
  iterations: number,
  env: AnyEnv,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${password}${getPasswordPepper(env)}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

async function hashPassword(
  password: string,
  env: AnyEnv,
  passwordHashPrefix: string,
  passwordHashIterations: number,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt, passwordHashIterations, env);
  return `${passwordHashPrefix}$${passwordHashIterations}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

async function verifyPassword(
  password: string,
  storedPassword: unknown,
  env: AnyEnv,
  passwordHashPrefix: string,
  maxPbkdf2Iterations: number,
  legacySha256Re: RegExp,
): Promise<{ valid: boolean; upgradedHash: string | null }> {
  const stored = String(storedPassword || "").trim();
  if (!stored) return { valid: false, upgradedHash: null };

  if (stored.startsWith(`${passwordHashPrefix}$`)) {
    const [, iterationsRaw, saltRaw, hashRaw] = stored.split("$");
    const iterations = Number.parseInt(iterationsRaw || "", 10);
    if (!iterations || !saltRaw || !hashRaw || iterations > maxPbkdf2Iterations) {
      return { valid: false, upgradedHash: null };
    }
    const saltBytes=new TextEncoder().encode(saltRaw);
    const derived = await derivePasswordHash(password,saltBytes,iterations,env);
    let binary=''; for (const b of derived) binary+=String.fromCharCode(b);
    const djangoHash=btoa(binary);
    return { valid: secureEquals(djangoHash, hashRaw), upgradedHash: null };
  }

  if (legacySha256Re.test(stored)) {
    const legacyHash = await sha256Hex(password);
    if (!secureEquals(legacyHash, stored.toLowerCase())) {
      return { valid: false, upgradedHash: null };
    }
    return {
      valid: true,
      upgradedHash: await hashPassword(password, env, passwordHashPrefix, maxPbkdf2Iterations),
    };
  }

  // Hash non reconnu (ni PBKDF2 ni SHA-256 legacy) : rejeter sans fallback en clair.
  // Cela protège contre un stockage corrompu ou un format inconnu qui pourrait
  // être comparé directement contre le mot de passe en clair.
  console.error("[security] verifyPassword: format de hash non reconnu, connexion refusée.");
  return { valid: false, upgradedHash: null };
}

async function prepareUserWriteValues(
  values: Record<string, unknown>,
  env: AnyEnv,
  passwordHashPrefix: string,
  passwordHashIterations: number,
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
  next.mot_de_passe = await hashPassword(plainPassword, env, passwordHashPrefix, passwordHashIterations);
  if (!next.password_changed_at) next.password_changed_at = new Date().toISOString();
  return next;
}

async function createSessionToken(
  session: Record<string, unknown>,
  env: AnyEnv,
): Promise<string> {
  const payload = toBase64Url(JSON.stringify(session));
  const signature = await hmacSha256Base64Url(getSessionSecret(env), payload);
  return `${payload}.${signature}`;
}

async function parseSessionToken(
  token: string,
  env: AnyEnv,
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
  env: AnyEnv,
  sessionCookie: string,
): Promise<UserRow | null> {
  const token = parseCookies(request)[sessionCookie];
  if (!token) return null;
  const session = await parseSessionToken(token, env);
  if (!session || !session.userId || Number(session.expiresAt) < Date.now()) return null;
  const user = await (env.DB as D1Database).prepare(
    `SELECT * FROM utilisateurs WHERE id = ? AND actif = 1`,
  )
    .bind(session.userId)
    .first<UserRow>();
  if (!user) return null;
  // Si le token contient un horodatage de mot de passe (sessions émises après
  // ce correctif) et qu'il ne correspond plus à password_changed_at en base,
  // la session est révoquée : un changement de mot de passe invalide donc
  // immédiatement toutes les anciennes sessions actives.
  const sessionPwdStamp = session.pwdStamp;
  if (sessionPwdStamp !== undefined) {
    const currentPwdStamp = String(user.password_changed_at || "");
    if (String(sessionPwdStamp) !== currentPwdStamp) return null;
  }
  return user;
}

function getPermissionLevel(user: UserRow, key: string, defaultRolePerms: PermissionMatrix): string {
  const direct = String(user[key] || "");
  if (direct === "write" || direct === "read" || direct === "none") return direct;
  const role = String(user.role || "");
  return defaultRolePerms[role]?.[key] || "none";
}

function hasPermission(
  user: UserRow,
  permKey: string,
  mode: "read" | "write",
  defaultRolePerms: PermissionMatrix,
): boolean {
  if (String(user.role || "") === "admin") return true;
  const level = getPermissionLevel(user, permKey, defaultRolePerms);
  if (mode === "read") return level === "read" || level === "write";
  return level === "write";
}

function hasStoragePermission(
  user: UserRow,
  bucketName: string,
  keyOrPrefix: string,
  mode: "read" | "write",
  defaultRolePerms: PermissionMatrix,
): boolean {
  const normalized = String(keyOrPrefix || "").replace(/^\/+/, "");
  if (bucketName === "fullfighting-pdf") {
    if (normalized.startsWith("achats/")) return hasPermission(user, "perm_achats", mode, defaultRolePerms);
    if (normalized.startsWith("adherents/")) return hasPermission(user, "perm_adherents", mode, defaultRolePerms);
    return hasPermission(user, "perm_administration", mode, defaultRolePerms);
  }
  if (bucketName === "storage") {
    if (normalized.startsWith("diplome/") || normalized === "diplome") {
      return hasPermission(user, "perm_adherents", mode, defaultRolePerms);
    }
    if (normalized.startsWith("branding/") || normalized === "branding") {
      return hasPermission(user, "perm_administration", mode, defaultRolePerms);
    }
    return hasPermission(user, "perm_administration", mode, defaultRolePerms);
  }
  return false;
}

function isPublicStorageObject(bucketName: string, key: string): boolean {
  const normalized = String(key || "").replace(/^\/+/, "");
  return bucketName === "storage" && normalized.startsWith("branding/");
}

export {
  createSessionToken,
  parseSessionToken,
  getCurrentUser,
  hashPassword,
  hasPermission,
  hasStoragePermission,
  isPublicStorageObject,
  prepareUserWriteValues,
  secureEquals,
  verifyPassword,
};
