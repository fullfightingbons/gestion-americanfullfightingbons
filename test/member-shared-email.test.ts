// Espace membre : deux adhérents (père et fils) qui partagent la même adresse
// e-mail doivent rester deux personnes distinctes.
//
// Contrairement aux tests unitaires de member-identity.test.ts, celui-ci fait
// tourner les VRAIES routes /api/member/* du Worker (export default.fetch) sur
// une base SQLite construite avec toutes les migrations de migrations/ — donc
// avec le vrai schéma et les vraies requêtes SQL (clauses IN, jointures, clés
// étrangères). Il n'existe pas de mock de D1 ici : node:sqlite fait le travail.
// node:sqlite demande Node ≥ 22.5 (le CI utilise Node 22) ; en dessous, la
// suite est simplement ignorée.
//
// Avant le correctif, sur le même jeu de données : le père voyait la fiche de
// son fils (inscrit en dernier), les diplômes et présences des deux mélangés,
// pouvait télécharger le diplôme de l'autre, et une modification de ses
// coordonnées s'écrivait sur la fiche de son fils ; le sélecteur de profils
// perdait Emma (dédoublonnage par e-mail).

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createSessionToken } from "../src/lib/security";
import worker from "../src/index";

let DatabaseSync: any = null;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  /* Node trop ancien : suite ignorée ci-dessous */
}

const SHARED = "famille@example.fr";

function makeDb() {
  const db = new DatabaseSync(":memory:");
  const dir = path.join(__dirname, "../migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) db.exec(readFileSync(path.join(dir, f), "utf8"));
  const stmt = (sql: string, vals: unknown[] = []): any => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    all: async () => ({ results: db.prepare(sql).all(...vals) }),
    first: async () => db.prepare(sql).get(...vals) ?? null,
    run: async () => { const r = db.prepare(sql).run(...vals); return { success: true, meta: { changes: Number(r.changes) } }; },
  });
  return { raw: db, d1: { prepare: (sql: string) => stmt(sql), batch: async (list: any[]) => Promise.all(list.map((s) => s.run())) } };
}

// Père (1980) et fils (2012) + sœur (2014) sur la même adresse, deux saisons pour
// le père et le fils ; Lucas est l'inscrit le plus récent de l'adresse.
function seedFamily(db: any, opts: { compte?: "pere" | "fils" | null } = { compte: "pere" }) {
  const ins = db.prepare(`INSERT INTO adherents (id, nom, prenom, naissance, email, statut, date_inscription, certificat_date, cotisation, paiement)
                          VALUES (?,?,?,?,?,'Actif',?,?,?, 'Payé')`);
  ins.run("f-24", "MARTIN", "Lucas", "2012-07-21", SHARED, "2024-09-10", "2024-02-02", 60);
  ins.run("p-24", "MARTIN", "Marc", "1980-03-04", SHARED, "2024-09-10", "2023-01-10", 100);
  ins.run("p-25", "MARTIN", "Marc", "1980-03-04", SHARED, "2025-09-12", "2025-01-10", 120);
  ins.run("e-25", "MARTIN", "Emma", "2014-02-02", SHARED, "2025-09-10", "2025-03-03", 70);
  ins.run("f-25", "MARTIN", "Lucas", "2012-07-21", SHARED, "2025-09-15", "2025-06-01", 70);
  if (opts.compte) {
    db.prepare(`INSERT INTO adherent_comptes (id, adherent_id, email, mot_de_passe, email_verifie, password_changed_at) VALUES ('c1', ?, ?, 'x', 1, '2025-01-01')`)
      .run(opts.compte === "pere" ? "p-24" : "f-24", SHARED);
    // Tutelle posée par le bureau : les enfants rattachés au compte du père.
    if (opts.compte === "pere") db.prepare(`UPDATE adherents SET guardian_compte_id = 'c1' WHERE id IN ('f-24','f-25','e-25')`).run();
  }
  const dip = db.prepare(`INSERT INTO diplomes (id, adherent_id, nom, prenom, titre, ceinture, date_emission, saison, pdf_storage_path) VALUES (?,?,?,?,?,?,?,?,?)`);
  dip.run("d-pere", "p-24", "MARTIN", "Marc", "Ceinture bleue", "Bleue", "2024-06-01", "2023-2024", "diplomes/pere.pdf");
  dip.run("d-fils", "f-25", "MARTIN", "Lucas", "Ceinture jaune", "Jaune", "2025-06-01", "2024-2025", "diplomes/fils.pdf");
  const pre = db.prepare(`INSERT INTO presences (id, adherent_id, date_seance, creneau, present) VALUES (?,?,?,?,1)`);
  pre.run("s1", "p-25", "2025-10-01", "Adultes");
  pre.run("s2", "f-25", "2025-10-02", "Enfants");
  pre.run("s3", "f-25", "2025-10-09", "Enfants");
}

function harness(seed: (db: any) => void) {
  const { raw, d1 } = makeDb();
  seed(raw);
  const env: any = {
    DB: d1,
    SESSION_SECRET: "test-secret-test-secret-test-secret-1234",
    R2_PDF: { get: async (k: string) => ({ body: "%PDF-" + k }) },
  };
  const ctx: any = { waitUntil: (p: any) => p?.catch?.(() => {}), passThroughOnException() {} };
  const call = async (method: string, p: string, token?: string, body?: unknown) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await worker.fetch(new Request("https://gestion.test" + p, { method, headers, body: body ? JSON.stringify(body) : undefined }), env, ctx);
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  };
  const tokenFor = (compteId: string, email: string) =>
    createSessionToken({ kind: "member", adherentCompteId: compteId, email, expiresAt: Date.now() + 3_600_000, pwdStamp: "2025-01-01" }, env);
  const switchTo = async (token: string, adherentId: string) => (await call("POST", "/api/member/profiles/switch", token, { adherentId })).json?.data?.token as string;
  return { raw, call, tokenFor, switchTo };
}

describe.skipIf(!DatabaseSync)("espace membre — père et fils sur la même adresse e-mail", () => {
  it("le père voit sa propre fiche, ses diplômes, ses présences et ses saisons (pas ceux de son fils)", async () => {
    const h = harness(seedFamily);
    const dash = (await h.call("GET", "/api/member/dashboard", await h.tokenFor("c1", SHARED))).json.data;
    expect(dash.me.prenom).toBe("Marc");
    expect(dash.me.certificat_date).toBe("2025-01-10");
    expect(dash.diplomes.map((d: any) => d.titre)).toEqual(["Ceinture bleue"]);
    expect(dash.presences.map((p: any) => p.date_seance)).toEqual(["2025-10-01"]);
    expect(dash.cotisations).toHaveLength(2); // ses deux saisons, pas les 5 lignes de l'adresse
  });

  it("le sélecteur de profils garde les deux enfants (avant : le plus récent écrasait l'autre)", async () => {
    const h = harness(seedFamily);
    const res = await h.call("GET", "/api/member/profiles", await h.tokenFor("c1", SHARED));
    expect(res.json.data.profiles.map((p: any) => p.prenom).sort()).toEqual(["Emma", "Lucas", "Marc"]);
    expect(res.json.data.profiles.filter((p: any) => p.isSelf).map((p: any) => p.prenom)).toEqual(["Marc"]);
  });

  it("après bascule sur Lucas, tout est celui de Lucas", async () => {
    const h = harness(seedFamily);
    const father = await h.tokenFor("c1", SHARED);
    const son = await h.switchTo(father, "f-24"); // fiche liée : une saison plus ancienne que la plus récente
    const dash = (await h.call("GET", "/api/member/dashboard", son)).json.data;
    expect(dash.me.prenom).toBe("Lucas");
    expect(dash.me.certificat_date).toBe("2025-06-01"); // sa saison la plus récente (f-25), pas celle liée
    expect(dash.diplomes.map((d: any) => d.titre)).toEqual(["Ceinture jaune"]);
    expect(dash.presences.map((p: any) => p.date_seance)).toEqual(["2025-10-09", "2025-10-02"]);
  });

  it("on ne peut pas télécharger le diplôme de l'autre personne de l'adresse, mais bien le sien", async () => {
    const h = harness(seedFamily);
    const son = await h.switchTo(await h.tokenFor("c1", SHARED), "f-24");
    expect((await h.call("GET", "/api/member/documents/diplome/d-pere", son)).status).toBe(404);
    expect((await h.call("GET", "/api/member/documents/diplome/d-fils", son)).status).toBe(200);
  });

  it("l'attestation de présence ne compte que les séances de la personne (Emma n'en a aucune)", async () => {
    const h = harness(seedFamily);
    const emma = await h.switchTo(await h.tokenFor("c1", SHARED), "e-25");
    expect((await h.call("GET", "/api/member/documents/attestation-presence", emma)).status).toBe(404);
  });

  it("une modification de coordonnées s'écrit sur la fiche de la bonne personne", async () => {
    const h = harness(seedFamily);
    const father = await h.tokenFor("c1", SHARED);
    await h.call("PATCH", "/api/member/me", father, { telephone: "0611111111" });
    const son = await h.switchTo(father, "f-24");
    await h.call("PATCH", "/api/member/me", son, { telephone: "0622222222" });
    const owner = (tel: string) => (h.raw.prepare(`SELECT id FROM adherents WHERE telephone = ?`).all(tel) as any[]).map((r) => r.id);
    expect(owner("0611111111")).toEqual(["p-25"]);
    expect(owner("0622222222")).toEqual(["f-25"]);
  });
});

describe.skipIf(!DatabaseSync)("espace membre — adresse portée par une seule personne (aucun changement)", () => {
  it("toutes les saisons d'une même personne restent reliées, y compris avec une casse/accents différents sur le prénom", async () => {
    const h = harness((db) => {
      const ins = db.prepare(`INSERT INTO adherents (id, nom, prenom, naissance, email, statut, date_inscription, cotisation, paiement) VALUES (?,?,?,?,?,'Actif',?,?, 'Payé')`);
      ins.run("z-23", "DURAND", "Zoé", "2005-01-01", "zoe@example.fr", "2023-09-01", 90);
      ins.run("z-24", "DURAND", "zoe", "2005-01-01", "ZOE@example.fr ", "2024-09-01", 95);
      ins.run("z-25", "DURAND", "Zoé", "2005-01-01", "zoe@example.fr", "2025-09-01", 100);
      db.prepare(`INSERT INTO adherent_comptes (id, adherent_id, email, mot_de_passe, email_verifie, password_changed_at) VALUES ('c2','z-23','zoe@example.fr','x',1,'2025-01-01')`).run();
    });
    const dash = (await h.call("GET", "/api/member/dashboard", await h.tokenFor("c2", "zoe@example.fr"))).json.data;
    expect(dash.me.prenom).toBe("Zoé");
    expect(dash.me.date_inscription).toBe("2025-09-01"); // fiche la plus récente, comme avant
    expect(dash.cotisations).toHaveLength(3);
  });
});

describe.skipIf(!DatabaseSync)("activation du compte quand l'adresse est partagée", () => {
  const accountsFor = (h: ReturnType<typeof harness>) =>
    h.raw.prepare(`SELECT adherent_id, activation_token FROM adherent_comptes WHERE email = ?`).all(SHARED) as any[];

  it("le compte est ancré sur le père (le plus âgé), même si l'enfant est inscrit en premier", async () => {
    const h = harness((db) => seedFamily(db, { compte: null }));
    const res = await h.call("POST", "/api/member/activation/request", undefined, { email: SHARED });
    expect(res.status).toBe(200);
    const rows = accountsFor(h);
    expect(rows).toHaveLength(1);
    expect(rows[0].adherent_id).toBe("p-25"); // sa fiche la plus récente
    expect(rows[0].activation_token).toBeTruthy();
  });

  it("un compte déjà ancré ailleurs (cas historique) est réutilisé : pas de doublon, pas d'erreur sur l'e-mail unique", async () => {
    const h = harness((db) => seedFamily(db, { compte: "fils" }));
    const res = await h.call("POST", "/api/member/activation/request", undefined, { email: SHARED });
    expect(res.status).toBe(200);
    const rows = accountsFor(h);
    expect(rows).toHaveLength(1);
    expect(rows[0].adherent_id).toBe("f-24"); // ancrage inchangé : à corriger par le bureau, jamais en douce
    expect(rows[0].activation_token).toBeTruthy();
  });
});
