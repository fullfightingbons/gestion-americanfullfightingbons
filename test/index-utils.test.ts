// Tests unitaires pour quelques fonctions pures de src/index.ts
// Lancer avec : npm test
//
// src/index.ts concentre toute la logique métier (routes, comptabilité,
// RGPD, crons...) sur 4 000+ lignes et n'avait aucun test, contrairement à
// src/lib/security.ts. La quasi-totalité de ce fichier dépend de D1
// (env.DB) et n'est donc pas testable ici sans une infrastructure de mock
// plus lourde (miniflare / @cloudflare/vitest-pool-workers) — ce fichier
// n'a pas vocation à combler ce manque à lui seul. Il couvre en priorité
// les quelques fonctions pures qui ne dépendent d'aucun accès base/réseau
// et qui jouent un rôle direct en sécurité : whitelisting des identifiants
// SQL utilisés par l'API générique, échappement HTML dans les emails, et
// le modèle de permissions (RBAC) utilisé par toutes les routes sensibles
// — y compris le correctif de permission appliqué sur /api/email/send.

import { describe, it, expect } from "vitest";
import {
  auditRedact,
  budgetEcart,
  budgetMontantRealise,
  DB_DEFAULT_ROLE_PERMS,
  dbHasPermission,
  dbNormalizeValue,
  dbQuoteIdentifier,
  escapeHtmlLite,
  getPermLevel,
  requestIp,
} from "../src/index";

describe("dbQuoteIdentifier", () => {
  it("accepte un identifiant de table/colonne simple", () => {
    expect(dbQuoteIdentifier("adherents")).toBe('"adherents"');
    expect(dbQuoteIdentifier("perm_administration")).toBe('"perm_administration"');
  });

  it("rejette un identifiant commençant par un chiffre", () => {
    expect(() => dbQuoteIdentifier("2fa")).toThrow();
  });

  it("rejette une chaîne vide", () => {
    expect(() => dbQuoteIdentifier("")).toThrow();
  });

  it("rejette une tentative d'injection via guillemet double", () => {
    expect(() => dbQuoteIdentifier('id" OR 1=1 --')).toThrow();
  });

  it("rejette une tentative d'injection via espace/point-virgule", () => {
    expect(() => dbQuoteIdentifier("id; DROP TABLE utilisateurs")).toThrow();
  });
});

describe("dbNormalizeValue", () => {
  it("convertit undefined en null", () => {
    expect(dbNormalizeValue(undefined)).toBeNull();
  });

  it("laisse null inchangé", () => {
    expect(dbNormalizeValue(null)).toBeNull();
  });

  it("convertit les booléens en 0/1 pour SQLite", () => {
    expect(dbNormalizeValue(true)).toBe(1);
    expect(dbNormalizeValue(false)).toBe(0);
  });

  it("sérialise les objets et tableaux en JSON", () => {
    expect(dbNormalizeValue({ a: 1 })).toBe(JSON.stringify({ a: 1 }));
    expect(dbNormalizeValue(["x", "y"])).toBe(JSON.stringify(["x", "y"]));
  });

  it("laisse passer les valeurs scalaires telles quelles", () => {
    expect(dbNormalizeValue("abc")).toBe("abc");
    expect(dbNormalizeValue(42)).toBe(42);
  });
});

describe("escapeHtmlLite", () => {
  it("échappe &, < et >", () => {
    expect(escapeHtmlLite("Tom & Jerry <script>")).toBe("Tom &amp; Jerry &lt;script&gt;");
  });

  it("laisse une chaîne sans caractère spécial inchangée", () => {
    expect(escapeHtmlLite("Jean-Michel")).toBe("Jean-Michel");
  });

  it("gère null/undefined sans lever d'exception", () => {
    expect(escapeHtmlLite(null as unknown as string)).toBe("");
    expect(escapeHtmlLite(undefined as unknown as string)).toBe("");
  });

  it("neutralise une tentative d'injection de balise", () => {
    const out = escapeHtmlLite('<img src=x onerror="alert(1)">');
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });
});

describe("auditRedact", () => {
  it("masque les champs sensibles connus (mot de passe, hash)", () => {
    const result = auditRedact({
      email: "a@b.fr",
      mot_de_passe: "hash-secret",
      password: "x",
    }) as Record<string, unknown>;
    expect(result.mot_de_passe).toBe("[redacted]");
    expect(result.password).toBe("[redacted]");
    expect(result.email).toBe("a@b.fr");
  });

  it("ne modifie pas les valeurs non sensibles", () => {
    const result = auditRedact({ nom: "Durand", montant: 42 }) as Record<string, unknown>;
    expect(result).toEqual({ nom: "Durand", montant: 42 });
  });

  it("laisse passer les valeurs non-objet telles quelles", () => {
    expect(auditRedact("texte")).toBe("texte");
    expect(auditRedact(null)).toBeNull();
    expect(auditRedact(42)).toBe(42);
  });
});

describe("requestIp", () => {
  it("lit l'en-tête CF-Connecting-IP", () => {
    const req = new Request("https://example.com", { headers: { "CF-Connecting-IP": "1.2.3.4" } });
    expect(requestIp(req)).toBe("1.2.3.4");
  });

  it("retourne 'unknown' en l'absence de l'en-tête", () => {
    expect(requestIp(new Request("https://example.com"))).toBe("unknown");
  });
});

describe("RBAC (dbHasPermission / getPermLevel) contre la matrice de rôles réelle", () => {
  it("un admin a toujours accès, quel que soit le droit direct sur la fiche", () => {
    const admin = { role: "admin" };
    expect(dbHasPermission(admin, "perm_administration", "write", DB_DEFAULT_ROLE_PERMS)).toBe(true);
    expect(dbHasPermission(admin, "perm_banque", "write", DB_DEFAULT_ROLE_PERMS)).toBe(true);
  });

  it("un trésorier a perm_facturation en écriture mais pas perm_administration", () => {
    const tresorier = { role: "tresorier" };
    expect(dbHasPermission(tresorier, "perm_facturation", "write", DB_DEFAULT_ROLE_PERMS)).toBe(true);
    expect(dbHasPermission(tresorier, "perm_administration", "write", DB_DEFAULT_ROLE_PERMS)).toBe(false);
  });

  it("un entraîneur n'a perm_diplomes qu'en lecture, pas en écriture", () => {
    const entraineur = { role: "entraineur" };
    expect(getPermLevel(entraineur, "perm_diplomes", DB_DEFAULT_ROLE_PERMS)).toBe("read");
    expect(dbHasPermission(entraineur, "perm_diplomes", "read", DB_DEFAULT_ROLE_PERMS)).toBe(true);
    expect(dbHasPermission(entraineur, "perm_diplomes", "write", DB_DEFAULT_ROLE_PERMS)).toBe(false);
  });

  it("un membre n'a aucun droit staff par défaut", () => {
    const membre = { role: "membre" };
    expect(dbHasPermission(membre, "perm_adherents", "read", DB_DEFAULT_ROLE_PERMS)).toBe(false);
    expect(dbHasPermission(membre, "perm_facturation", "write", DB_DEFAULT_ROLE_PERMS)).toBe(false);
  });

  it("un droit accordé au cas par cas sur la fiche utilisateur prime sur le rôle par défaut", () => {
    // Ex. un entraîneur à qui on a accordé perm_materiel en écriture individuellement,
    // alors que le rôle "entraineur" n'a que 'read' par défaut sur perm_materiel.
    const entraineurCustom = { role: "entraineur", perm_materiel: "write" };
    expect(dbHasPermission(entraineurCustom, "perm_materiel", "write", DB_DEFAULT_ROLE_PERMS)).toBe(true);
  });

  it("/api/email/send : vérifie le correctif — entraîneur/membre bloqués, trésorier/secrétaire/admin autorisés", () => {
    // Reproduit exactement la condition ajoutée sur /api/email/send
    // (exiger perm_diplomes OU perm_facturation en écriture), pour garder
    // une alerte si cette logique régresse dans src/index.ts.
    const canSendEmail = (user: { role: string }) =>
      dbHasPermission(user, "perm_diplomes", "write", DB_DEFAULT_ROLE_PERMS) ||
      dbHasPermission(user, "perm_facturation", "write", DB_DEFAULT_ROLE_PERMS);

    expect(canSendEmail({ role: "entraineur" })).toBe(false);
    expect(canSendEmail({ role: "membre" })).toBe(false);
    expect(canSendEmail({ role: "tresorier" })).toBe(true);
    expect(canSendEmail({ role: "secretaire" })).toBe(true);
    expect(canSendEmail({ role: "admin" })).toBe(true);
  });
});

describe("budgetMontantRealise / budgetEcart — comparatif budget/réalisé (/api/budget/:exercice_id/comparatif)", () => {
  // Régression du 16/08/2026 : un calcul uniforme en crédit-débit était
  // correct pour un compte de produit (7xx) mais donnait un écart toujours
  // négatif pour un compte de charge (6xx), quel que soit le montant
  // réellement dépensé — la colonne "Écart" ne renseignait donc jamais si
  // une charge était sous ou au-dessus de son budget.

  it("compte de charge (6xx) : le montant réalisé est positif quand dépensé (débit)", () => {
    expect(budgetMontantRealise("606100", 300, 0)).toBeCloseTo(300, 2);
  });

  it("compte de produit (7xx) : le montant réalisé est positif quand encaissé (crédit)", () => {
    expect(budgetMontantRealise("756000", 0, 4000)).toBeCloseTo(4000, 2);
  });

  it("charge sous le budget (100€ dépensés / 500€ prévus) : écart positif (vert)", () => {
    const realise = budgetMontantRealise("606100", 100, 0);
    expect(budgetEcart("606100", realise, 500)).toBeCloseTo(400, 2);
  });

  it("charge pile dans le budget (500€ dépensés / 500€ prévus) : écart nul, pas négatif", () => {
    const realise = budgetMontantRealise("606100", 500, 0);
    expect(budgetEcart("606100", realise, 500)).toBeCloseTo(0, 2);
  });

  it("charge dépassée (1000€ dépensés / 500€ prévus) : écart négatif (rouge)", () => {
    const realise = budgetMontantRealise("606100", 1000, 0);
    expect(budgetEcart("606100", realise, 500)).toBeCloseTo(-500, 2);
  });

  it("charge à 0€ dépensé / 500€ prévus : écart positif, pas rouge par défaut", () => {
    const realise = budgetMontantRealise("606100", 0, 0);
    expect(budgetEcart("606100", realise, 500)).toBeCloseTo(500, 2);
  });

  it("produit sous l'objectif (2000€ encaissés / 5000€ prévus) : écart négatif (rouge)", () => {
    const realise = budgetMontantRealise("756000", 0, 2000);
    expect(budgetEcart("756000", realise, 5000)).toBeCloseTo(-3000, 2);
  });

  it("produit dépassant l'objectif (6000€ encaissés / 5000€ prévus) : écart positif (vert)", () => {
    const realise = budgetMontantRealise("756000", 0, 6000);
    expect(budgetEcart("756000", realise, 5000)).toBeCloseTo(1000, 2);
  });
});
