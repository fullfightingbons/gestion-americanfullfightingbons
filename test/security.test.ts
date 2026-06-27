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
  hasStoragePermission,
  isPublicStorageObject,
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

// Tests pour les routes /api/storage/:bucket/* (upload, list, lecture) du
// Worker, ajoutées le 2026-06-27 et dont les décisions d'accès reposent
// entièrement sur ces deux fonctions.
describe("hasStoragePermission", () => {
  const defaultRolePerms = {
    admin: { perm_adherents: "write", perm_administration: "write", perm_diplomes: "write" },
    entraineur: { perm_adherents: "read", perm_administration: "none", perm_diplomes: "read" },
    membre: { perm_adherents: "none", perm_administration: "none", perm_diplomes: "none" },
  };

  it("bucket fullfighting-pdf, chemin achats/ → perm_achats", () => {
    const user = { role: "membre", perm_achats: "write" } as any;
    expect(hasStoragePermission(user, "fullfighting-pdf", "achats/facture.pdf", "write", defaultRolePerms)).toBe(true);
  });

  it("bucket fullfighting-pdf, chemin adherents/ → perm_adherents", () => {
    const lecteur = { role: "entraineur" } as any;
    expect(hasStoragePermission(lecteur, "fullfighting-pdf", "adherents/diplomes/x.pdf", "read", defaultRolePerms)).toBe(true);
    expect(hasStoragePermission(lecteur, "fullfighting-pdf", "adherents/diplomes/x.pdf", "write", defaultRolePerms)).toBe(false);
  });

  it("bucket fullfighting-pdf, chemin hors achats/adherents → perm_administration (refusé pour un rôle sans ce droit)", () => {
    const entraineur = { role: "entraineur" } as any;
    expect(hasStoragePermission(entraineur, "fullfighting-pdf", "autre/dossier.pdf", "read", defaultRolePerms)).toBe(false);
  });

  it("bucket storage, chemin diplome/ → perm_diplomes", () => {
    const entraineur = { role: "entraineur" } as any;
    expect(hasStoragePermission(entraineur, "storage", "diplome/modele.png", "read", defaultRolePerms)).toBe(true);
  });

  it("bucket storage, chemin branding/ → perm_administration", () => {
    const membre = { role: "membre" } as any;
    expect(hasStoragePermission(membre, "storage", "branding/logo.png", "write", defaultRolePerms)).toBe(false);
    const admin = { role: "admin" } as any;
    expect(hasStoragePermission(admin, "storage", "branding/logo.png", "write", defaultRolePerms)).toBe(true);
  });

  it("normalise un chemin commençant par un ou plusieurs slashes", () => {
    const entraineur = { role: "entraineur" } as any;
    expect(hasStoragePermission(entraineur, "storage", "///diplome/x.png", "read", defaultRolePerms)).toBe(true);
  });

  it("refuse tout accès pour un bucket inconnu", () => {
    const admin = { role: "admin" } as any;
    expect(hasStoragePermission(admin, "un-bucket-qui-n-existe-pas", "x", "read", defaultRolePerms)).toBe(false);
  });
});

describe("isPublicStorageObject", () => {
  it("considère les objets sous storage/branding/ comme publics", () => {
    expect(isPublicStorageObject("storage", "branding/logo.png")).toBe(true);
    expect(isPublicStorageObject("storage", "/branding/logo.png")).toBe(true);
  });

  it("considère les modèles de diplômes (storage/diplome/) comme publics", () => {
    // Chargés via <img src=...> et fetch() sans en-tête Authorization côté
    // frontend (vignettes + aperçu canvas de l'onglet Diplômes) : il est
    // impossible d'y joindre un Bearer token, donc ils doivent être publics.
    // Ce ne sont que des images de fond génériques, sans donnée personnelle.
    expect(isPublicStorageObject("storage", "diplome/modele.png")).toBe(true);
    expect(isPublicStorageObject("storage", "diplome")).toBe(true);
  });

  it("considère les assets d'identité visuelle du club (storage/club-assets/) comme publics", () => {
    expect(isPublicStorageObject("storage", "club-assets/signature/x.png")).toBe(true);
  });

  it("ne considère pas un chemin non listé comme public", () => {
    expect(isPublicStorageObject("storage", "autre-dossier/fichier.png")).toBe(false);
  });

  it("ne considère jamais fullfighting-pdf comme public, même sous un chemin similaire", () => {
    expect(isPublicStorageObject("fullfighting-pdf", "branding/x.pdf")).toBe(false);
    expect(isPublicStorageObject("fullfighting-pdf", "diplome/x.pdf")).toBe(false);
  });
});
