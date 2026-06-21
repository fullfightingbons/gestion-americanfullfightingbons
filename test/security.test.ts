// Tests unitaires pour src/lib/security.ts
// Lancer avec : npx vitest run (après `npm install -D vitest`)
//
// Ce module est le plus critique du projet (hashage de mots de passe,
// signature de session, contrôle d'accès) et n'avait aucun test avant ce
// patch. Les tests ci-dessous couvrent les chemins qui, s'ils régressaient,
// auraient un impact direct sur la sécurité de l'application.

import { describe, it, expect, beforeAll } from "vitest";
import {
  createSessionToken,
  hashPassword,
  hasPermission,
  prepareUserWriteValues,
  secureEquals,
  verifyPassword,
} from "../src/lib/security";

const PASSWORD_HASH_PREFIX = "pbkdf2_sha256";
const PASSWORD_HASH_ITERATIONS = 1000; // réduit pour la vitesse des tests
const MAX_PBKDF2_ITERATIONS = 100000;
const LEGACY_SHA256_RE = /^[a-f0-9]{64}$/i;

// Environnement minimal requis par security.ts (SESSION_SECRET >= 32 car., PASSWORD_PEPPER)
const fakeEnv = {
  SESSION_SECRET: "a".repeat(32),
  PASSWORD_PEPPER: "test-pepper-affbc",
} as any;

describe("secureEquals", () => {
  it("retourne true pour deux chaînes identiques", () => {
    expect(secureEquals("abc123", "abc123")).toBe(true);
  });

  it("retourne false pour des chaînes différentes de même longueur", () => {
    expect(secureEquals("abc123", "abc124")).toBe(false);
  });

  it("retourne false pour des chaînes de longueurs différentes", () => {
    expect(secureEquals("abc", "abcd")).toBe(false);
  });
});

describe("hashPassword / verifyPassword (PBKDF2)", () => {
  it("hash un mot de passe avec le bon préfixe et format", async () => {
    const hash = await hashPassword("MonMotDePasse!", fakeEnv, PASSWORD_HASH_PREFIX, PASSWORD_HASH_ITERATIONS);
    const parts = hash.split("$");
    expect(parts[0]).toBe(PASSWORD_HASH_PREFIX);
    expect(parts[1]).toBe(String(PASSWORD_HASH_ITERATIONS));
    expect(parts).toHaveLength(4); // prefix$iterations$salt$hash
  });

  it("vérifie correctement un mot de passe valide", async () => {
    const hash = await hashPassword("CorrectHorseBattery", fakeEnv, PASSWORD_HASH_PREFIX, PASSWORD_HASH_ITERATIONS);
    const result = await verifyPassword("CorrectHorseBattery", hash, fakeEnv, PASSWORD_HASH_PREFIX, MAX_PBKDF2_ITERATIONS, LEGACY_SHA256_RE);
    expect(result.valid).toBe(true);
    expect(result.upgradedHash).toBeNull(); // déjà au bon format, pas besoin d'upgrade
  });

  it("rejette un mot de passe incorrect", async () => {
    const hash = await hashPassword("CorrectHorseBattery", fakeEnv, PASSWORD_HASH_PREFIX, PASSWORD_HASH_ITERATIONS);
    const result = await verifyPassword("WrongPassword", hash, fakeEnv, PASSWORD_HASH_PREFIX, MAX_PBKDF2_ITERATIONS, LEGACY_SHA256_RE);
    expect(result.valid).toBe(false);
  });

  it("rejette un hash avec un nombre d'itérations supérieur à la limite (anti-DoS)", async () => {
    const fakeHash = `${PASSWORD_HASH_PREFIX}$999999999$c2FsdA$aGFzaA`;
    const result = await verifyPassword("anything", fakeHash, fakeEnv, PASSWORD_HASH_PREFIX, MAX_PBKDF2_ITERATIONS, LEGACY_SHA256_RE);
    expect(result.valid).toBe(false);
  });

  it("rejette un mot de passe vide stocké", async () => {
    const result = await verifyPassword("test", "", fakeEnv, PASSWORD_HASH_PREFIX, MAX_PBKDF2_ITERATIONS, LEGACY_SHA256_RE);
    expect(result.valid).toBe(false);
  });
});

describe("verifyPassword — migration depuis l'ancien format SHA-256", () => {
  async function sha256Hex(value: string): Promise<string> {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  it("accepte un mot de passe correct stocké en legacy SHA-256 et propose un hash PBKDF2 de remplacement", async () => {
    const legacyHash = await sha256Hex("OldStylePassword");
    const result = await verifyPassword("OldStylePassword", legacyHash, fakeEnv, PASSWORD_HASH_PREFIX, MAX_PBKDF2_ITERATIONS, LEGACY_SHA256_RE);
    expect(result.valid).toBe(true);
    expect(result.upgradedHash).not.toBeNull();
    expect(result.upgradedHash!.startsWith(`${PASSWORD_HASH_PREFIX}$`)).toBe(true);
  });

  it("rejette un mot de passe incorrect contre un hash legacy SHA-256", async () => {
    const legacyHash = await sha256Hex("OldStylePassword");
    const result = await verifyPassword("WrongGuess", legacyHash, fakeEnv, PASSWORD_HASH_PREFIX, MAX_PBKDF2_ITERATIONS, LEGACY_SHA256_RE);
    expect(result.valid).toBe(false);
  });
});

describe("prepareUserWriteValues", () => {
  it("bloque une écriture directe sur mot_de_passe sans mot_de_passe_plain (anti-bypass)", async () => {
    await expect(
      prepareUserWriteValues({ mot_de_passe: "hash-injecte-directement" }, fakeEnv, PASSWORD_HASH_PREFIX, PASSWORD_HASH_ITERATIONS)
    ).rejects.toThrow(/Direct password writes are blocked/);
  });

  it("hash mot_de_passe_plain et retire le champ en clair du résultat", async () => {
    const result = await prepareUserWriteValues(
      { mot_de_passe_plain: "NouveauMotDePasse", email: "test@affbc.fr" },
      fakeEnv,
      PASSWORD_HASH_PREFIX,
      PASSWORD_HASH_ITERATIONS
    );
    expect(result.mot_de_passe_plain).toBeUndefined();
    expect(typeof result.mot_de_passe).toBe("string");
    expect((result.mot_de_passe as string).startsWith(PASSWORD_HASH_PREFIX)).toBe(true);
    expect(result.email).toBe("test@affbc.fr");
    expect(result.password_changed_at).toBeTruthy();
  });

  it("laisse passer une mise à jour sans toucher au mot de passe", async () => {
    const result = await prepareUserWriteValues({ email: "new@affbc.fr" }, fakeEnv, PASSWORD_HASH_PREFIX, PASSWORD_HASH_ITERATIONS);
    expect(result.mot_de_passe).toBeUndefined();
    expect(result.email).toBe("new@affbc.fr");
  });
});

describe("createSessionToken", () => {
  it("produit un token au format payload.signature", async () => {
    const token = await createSessionToken({ userId: "u1", expiresAt: Date.now() + 1000 }, fakeEnv);
    expect(token.split(".")).toHaveLength(2);
  });

  it("rejette si SESSION_SECRET est absent ou trop court", async () => {
    const weakEnv = { SESSION_SECRET: "tropcourt" } as any;
    await expect(createSessionToken({ userId: "u1", expiresAt: Date.now() }, weakEnv)).rejects.toThrow();
  });
});

describe("hasPermission", () => {
  const defaultRolePerms = {
    tresorier: { perm_comptabilite: "write", perm_adherents: "read" },
    membre: { perm_comptabilite: "none" },
  };

  it("un admin a toujours accès, quel que soit le verrou de permission", () => {
    const admin = { role: "admin" } as any;
    expect(hasPermission(admin, "perm_comptabilite", "write", defaultRolePerms)).toBe(true);
  });

  it("respecte une permission explicite sur l'utilisateur même si différente du rôle", () => {
    const user = { role: "membre", perm_comptabilite: "write" } as any;
    expect(hasPermission(user, "perm_comptabilite", "write", defaultRolePerms)).toBe(true);
  });

  it("retombe sur la permission par défaut du rôle si rien n'est défini sur l'utilisateur", () => {
    const user = { role: "tresorier" } as any;
    expect(hasPermission(user, "perm_comptabilite", "write", defaultRolePerms)).toBe(true);
    expect(hasPermission(user, "perm_adherents", "write", defaultRolePerms)).toBe(false); // read only
  });

  it("refuse l'accès si aucune règle ne matche (none)", () => {
    const user = { role: "membre" } as any;
    expect(hasPermission(user, "perm_comptabilite", "read", defaultRolePerms)).toBe(false);
  });
});
