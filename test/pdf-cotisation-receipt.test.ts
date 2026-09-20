// Tests du reçu de cotisation PDF (bouton « Reçu » de l'onglet Adhérents) :
//   1. moteur PDF : accents et € (ils étaient supprimés : « Mickaël » → « Mickael »,
//      « 250,00 € » → « 250,00 ») et intégrité de la structure du fichier ;
//   2. buildCotisationReceipt() : contenu, numéro stable, saison, cas limites ;
//   3. GET /api/adherents/:id/recu-cotisation : authentification, permissions, erreurs,
//      et réponse application/pdf — via le vrai Worker (export default .fetch).

import { describe, it, expect } from "vitest";
import worker from "../src/index";
import { safe, measureTextWidth } from "../src/lib/pdf/pdf-engine";
import { buildDocumentPdfBytes } from "../src/lib/pdf/document-template";
import { buildCotisationReceipt, seasonLabelFromIso } from "../src/lib/pdf/cotisation-receipt";
import { createSessionToken } from "../src/lib/security";

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

// ── 1. Moteur PDF ─────────────────────────────────────────────────────────────
describe("moteur PDF — accents et symbole €", () => {
  it("conserve les lettres accentuées du français et traduit € en octet WinAnsi 0x80", () => {
    expect(safe("Mickaël Élise Çelik Noël œuvre")).toBe("Mickaël Élise Çelik Noël \u009Cuvre");
    expect(safe("250,00 €")).toBe("250,00 \u0080");
    expect(safe("Reçu de cotisation — saison")).toBe("Reçu de cotisation - saison"); // tiret long → '-' (inchangé)
  });

  it("est idempotent : safe(safe(x)) === safe(x) (textWrapped puis text() repassent chacun dans safe)", () => {
    for (const s of ["Mickaël — 12,50 €", "Œuvre  nº 3", "ő ł Nguyễn", "  espaces   multiples  "]) {
      expect(safe(safe(s))).toBe(safe(s));
    }
  });

  it("hors WinAnsi : garde la lettre de base si elle existe, sinon une espace ; jamais d'octet > 0xFF", () => {
    expect(safe("Nguyễn")).toBe("Nguyen");
    expect(safe("A\u{1F600}B")).toBe("A B"); // emoji
    for (const ch of safe("日本 Ł ő Ž ñ é €")) expect(ch.charCodeAt(0)).toBeLessThanOrEqual(0xff);
  });

  it("mesure une lettre accentuée comme sa lettre de base (alignements à droite exacts)", () => {
    const w = (s: string) => measureTextWidth(s, "F1", 10);
    expect(w("é")).toBeCloseTo(w("e"), 5);
    expect(w("É")).toBeCloseTo(w("E"), 5);
    expect(w("\u0080")).toBeGreaterThan(0); // €
  });
});

// Vérifie que chaque entrée de la table xref pointe bien sur « N 0 obj » : ajouter le bloc
// /Info (métadonnées) ne doit décaler aucun octet.
function assertXrefIsConsistent(bytes: Uint8Array) {
  const txt = latin1(bytes);
  const startxref = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(txt)?.[1]);
  expect(Number.isFinite(startxref)).toBe(true);
  expect(txt.slice(startxref, startxref + 4)).toBe("xref");
  const [, count] = /xref\s+0 (\d+)/.exec(txt.slice(startxref))!.map(Number);
  const entries = [...txt.slice(startxref).matchAll(/(\d{10}) \d{5} ([nf]) /g)];
  expect(entries).toHaveLength(count);
  entries.forEach((m, i) => {
    if (m[2] === "n") expect(txt.slice(Number(m[1]), Number(m[1]) + `${i} 0 obj`.length)).toBe(`${i} 0 obj`);
  });
  const size = Number(/\/Size (\d+)/.exec(txt)![1]);
  expect(size).toBe(count);
}

describe("document PDF — contenu et structure", () => {
  const doc = buildCotisationReceipt(
    {
      id: "ab12cd34-5678-4abc-9def-0123456789ab",
      nom: "andrieu",
      prenom: "Mickaël",
      cotisation: 220,
      montant_pass_region: 30,
      paiement: "HelloAsso",
      date_inscription: "2026-09-08",
      date_fin_adhesion: "2027-06-30",
    },
    new Date("2026-09-20T10:00:00Z")
  );

  it("le reçu contient le nom accentué, le titre « REÇU » et les montants avec €", () => {
    if (!doc.ok) throw new Error(doc.message);
    const bytes = buildDocumentPdfBytes(doc.doc);
    const txt = latin1(bytes);
    expect(txt.startsWith("%PDF-")).toBe(true);
    expect(txt).toContain("(Mickaël ANDRIEU)");
    expect(txt).toContain("REÇU DE COTISATION");
    expect(txt).toContain("220,00 \u0080");
    expect(txt).toContain("30,00 \u0080");
    expect(txt).toContain("250,00 \u0080"); // total
    expect(txt).toContain("/WinAnsiEncoding");
  });

  it("porte un titre dans les métadonnées (onglet du navigateur), en UTF-16BE", () => {
    if (!doc.ok) throw new Error(doc.message);
    const txt = latin1(buildDocumentPdfBytes(doc.doc));
    const hex = /\/Title <FEFF([0-9A-F]+)>/.exec(txt)?.[1];
    expect(hex).toBeTruthy();
    const title = Buffer.from(hex!, "hex").swap16().toString("utf16le");
    expect(title).toBe("Reçu de cotisation REC-2026-2027-AB12CD34 — Mickaël ANDRIEU");
    expect(txt).toContain("/Info ");
  });

  it("la table xref reste exacte avec le bloc /Info (le reçu ET les autres types de document)", () => {
    if (!doc.ok) throw new Error(doc.message);
    assertXrefIsConsistent(buildDocumentPdfBytes(doc.doc));
    assertXrefIsConsistent(
      buildDocumentPdfBytes({
        type: "facture",
        numero: "VTE-2026-001",
        dateLabel: "Émis le 20/09/2026",
        destinataire: { nom: "Élise Barbosa", lignes: [] },
        lignes: [{ designation: "T-shirt", qte: 1, pu: 25, total: 25 }],
        total: 25,
      })
    );
  });
});

// ── 2. Constructeur de reçu ───────────────────────────────────────────────────
const ADH = {
  id: "ab12cd34-5678-4abc-9def-0123456789ab",
  nom: "andrieu",
  prenom: "Mickaël",
  adresse: "12 chemin des Grands Prés",
  code_postal: "74200",
  ville: "Thonon-les-Bains",
  discipline: "Club",
  cotisation: 250,
  montant_pass_region: 0,
  paiement: "HelloAsso",
  date_inscription: "2026-09-08",
  date_fin_adhesion: "2027-06-30",
};
const NOW = new Date("2026-09-20T10:00:00Z");

describe("buildCotisationReceipt", () => {
  it("construit le reçu : numéro, destinataire « Prénom NOM », lignes, total, mode de paiement", () => {
    const r = buildCotisationReceipt(ADH, NOW);
    if (!r.ok) throw new Error(r.message);
    expect(r.doc.type).toBe("cotisation");
    expect(r.doc.numero).toBe("REC-2026-2027-AB12CD34");
    expect(r.doc.destinataire?.nom).toBe("Mickaël ANDRIEU");
    expect(r.doc.destinataire?.lignes).toEqual([
      "12 chemin des Grands Prés",
      "74200 Thonon-les-Bains",
      "Adhérent n°AB12CD34",
      "Saison 2026-2027",
    ]);
    expect(r.doc.dateLabel).toBe("Émis le 20/09/2026");
    expect(r.doc.objet).toContain("saison 2026-2027");
    expect(r.doc.objet).toContain("inscription du 08/09/2026");
    expect(r.doc.lignes).toEqual([{ designation: "Cotisation Club — saison 2026-2027", total: 250 }]);
    expect(r.doc.total).toBe(250);
    expect(r.doc.footerNote).toBe("Mode de paiement : HelloAsso");
  });

  it("ajoute la ligne Pass Région et cumule le total (comme l'ancien reçu et le reçu de l'espace membre)", () => {
    const r = buildCotisationReceipt({ ...ADH, cotisation: 220, montant_pass_region: 30 }, NOW);
    if (!r.ok) throw new Error(r.message);
    expect(r.doc.lignes.map((l) => l.designation)).toEqual(["Cotisation Club — saison 2026-2027", "Pass Région"]);
    expect(r.doc.total).toBe(250);
  });

  it("le numéro est STABLE : ré-émettre le reçu, un autre jour, ne change pas son numéro", () => {
    const a = buildCotisationReceipt(ADH, NOW);
    const b = buildCotisationReceipt(ADH, new Date("2027-02-03T08:00:00Z"));
    if (!a.ok || !b.ok) throw new Error("reçu attendu");
    expect(a.doc.numero).toBe(b.doc.numero);
    expect(a.doc.dateLabel).not.toBe(b.doc.dateLabel); // seule la date d'émission diffère
  });

  it("saison sportive juillet → juin, identique à la colonne « Saison » du tableau", () => {
    expect(seasonLabelFromIso("2027-06-30")).toBe("2026-2027");
    expect(seasonLabelFromIso("2027-07-01")).toBe("2027-2028");
    expect(seasonLabelFromIso("2026-09-08T10:00:00.000Z")).toBe("2026-2027");
    expect(seasonLabelFromIso("n'importe quoi")).toBe("");
    // repli : date_fin_adhesion absente → date d'inscription → date du jour
    const noEnd = buildCotisationReceipt({ ...ADH, date_fin_adhesion: null }, NOW);
    const nothing = buildCotisationReceipt({ ...ADH, date_fin_adhesion: null, date_inscription: null }, NOW);
    if (!noEnd.ok || !nothing.ok) throw new Error("reçu attendu");
    expect(noEnd.doc.numero).toBe("REC-2026-2027-AB12CD34");
    expect(nothing.doc.numero).toBe("REC-2026-2027-AB12CD34");
  });

  it("refuse d'émettre un reçu de 0 € (membre du bureau exonéré, cotisation non saisie)", () => {
    const r = buildCotisationReceipt({ ...ADH, cotisation: 0, montant_pass_region: 0 }, NOW);
    expect(r).toMatchObject({ ok: false, status: 404 });
    if (!r.ok) expect(r.message).toMatch(/Aucune cotisation enregistrée/);
    expect(buildCotisationReceipt({ ...ADH, cotisation: null }, NOW).ok).toBe(false);
  });

  it("une adresse longue passe sur plusieurs lignes (≤ 44 caractères, 3 lignes max) au lieu de déborder", () => {
    const r = buildCotisationReceipt(
      { ...ADH, adresse: "Résidence Les Alpages Bâtiment B appartement 12 chemin des Grands Prés lieu-dit Les Vignes Hautes" },
      NOW
    );
    if (!r.ok) throw new Error(r.message);
    const addr = r.doc.destinataire!.lignes!.slice(0, -3); // hors « CP ville », « Adhérent n° », « Saison »
    expect(addr.length).toBeGreaterThan(1);
    expect(addr.length).toBeLessThanOrEqual(3);
    addr.forEach((l) => expect(l.length).toBeLessThanOrEqual(44));
  });

  it("nom de fichier ASCII sûr (pas d'accent, d'espace ni de caractère spécial)", () => {
    const r = buildCotisationReceipt({ ...ADH, nom: "d'Aubigné Müller", prenom: "Zoé" }, NOW);
    if (!r.ok) throw new Error(r.message);
    expect(r.filename).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(r.filename).toBe("Recu-cotisation-Zoe-D-AUBIGNE-MULLER-2026-2027.pdf");
  });

  it("champs facultatifs absents : pas de ligne d'adresse vide, pas de mention de paiement", () => {
    const r = buildCotisationReceipt({ id: "zz", nom: "X", prenom: "Y", cotisation: 10 }, NOW);
    if (!r.ok) throw new Error(r.message);
    expect(r.doc.destinataire!.lignes).toEqual(["Adhérent n°ZZ", `Saison 2026-2027`]);
    expect(r.doc.footerNote).toBeUndefined();
    expect(r.doc.objet).not.toContain("inscription du");
  });

  // ── Ventes liées à l'inscription (tenue, passeport, articles boutique) ─────
  it("ajoute les ventes liées à l'inscription (tenue, passeport...) après Cotisation/Pass Région, et les cumule au total", () => {
    const r = buildCotisationReceipt({ ...ADH, cotisation: 220, montant_pass_region: 30 }, NOW, [
      { desc: "Vente t-shirt club AFFBC (M)", qte: 1, pu: 25 },
      { desc: "Vente pantalon club AFFBC (M)", qte: 1, pu: 15 },
      { desc: "Vente passeport sportif", qte: 1, pu: 25 },
    ]);
    if (!r.ok) throw new Error(r.message);
    expect(r.doc.lignes.map((l) => l.designation)).toEqual([
      "Cotisation Club — saison 2026-2027",
      "Pass Région",
      "Vente t-shirt club AFFBC (M)",
      "Vente pantalon club AFFBC (M)",
      "Vente passeport sportif",
    ]);
    expect(r.doc.lignes.slice(2)).toEqual([
      { designation: "Vente t-shirt club AFFBC (M)", qte: 1, pu: 25, total: 25 },
      { designation: "Vente pantalon club AFFBC (M)", qte: 1, pu: 15, total: 15 },
      { designation: "Vente passeport sportif", qte: 1, pu: 25, total: 25 },
    ]);
    expect(r.doc.total).toBe(315); // 220 + 30 + 25 + 15 + 25
  });

  it("émet quand même un reçu à cotisation nulle si des ventes liées à l'inscription existent (ex. membre du Bureau ayant commandé une tenue)", () => {
    const r = buildCotisationReceipt({ ...ADH, cotisation: 0, montant_pass_region: 0 }, NOW, [
      { desc: "Vente t-shirt club AFFBC (L)", qte: 1, pu: 25 },
      { desc: "Vente pantalon club AFFBC (L)", qte: 1, pu: 15 },
    ]);
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) throw new Error("reçu attendu");
    expect(r.doc.lignes[0]).toEqual({ designation: "Cotisation Club — saison 2026-2027", total: 0 });
    expect(r.doc.total).toBe(40);
  });

  it("sans ventes liées à l'inscription (paramètre par défaut), comportement strictement inchangé", () => {
    const withDefault = buildCotisationReceipt(ADH, NOW);
    const withEmptyArray = buildCotisationReceipt(ADH, NOW, []);
    if (!withDefault.ok || !withEmptyArray.ok) throw new Error("reçu attendu");
    expect(withDefault.doc).toEqual(withEmptyArray.doc);
  });

  it("ignore une ligne de vente à quantité ou prix unitaire nul/absent (donnée mal formée, ne doit pas polluer le reçu)", () => {
    const r = buildCotisationReceipt(ADH, NOW, [
      { desc: "Ligne vide", qte: 0, pu: 25 },
      { desc: "Ligne sans prix", qte: 1, pu: 0 },
      { desc: "Ligne valide", qte: 1, pu: 25 },
    ]);
    if (!r.ok) throw new Error(r.message);
    expect(r.doc.lignes.map((l) => l.designation)).toEqual(["Cotisation Club — saison 2026-2027", "Ligne valide"]);
    expect(r.doc.total).toBe(275); // 250 + 25 seulement
  });
});

// ── 3. Route GET /api/adherents/:id/recu-cotisation ───────────────────────────
const SECRET = "s".repeat(40);

// `factures` simule la table réelle : les tests posent { exercice_id, notes, lignes }
// (lignes déjà en JSON.stringify, comme en base) pour vérifier que la route les
// retrouve (ou pas) exactement comme loadVentesInscriptionLignes le ferait sur D1.
function makeEnv(opts: { users: Record<string, any>; adherents: Record<string, any>; factures?: Record<string, any>[] }) {
  const db = {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt: any = {
        bind(...args: unknown[]) {
          binds = args;
          return stmt;
        },
        async first() {
          if (/FROM utilisateurs/.test(sql)) return opts.users[String(binds[0])] ?? null;
          if (/FROM adherents WHERE id/.test(sql)) return opts.adherents[String(binds[0])] ?? null;
          return null; // club_info / role_permissions : permissions par défaut
        },
        async all() {
          if (/FROM factures/.test(sql)) {
            // reproduit `WHERE exercice_id = ? AND notes LIKE ?` (binds[1] = "%<adherentId>%")
            const [exerciceId, likePattern] = binds;
            const needle = String(likePattern ?? "").replace(/^%|%$/g, "");
            const results = (opts.factures || []).filter(
              (f) => f.exercice_id === exerciceId && String(f.notes ?? "").includes(needle)
            );
            return { results };
          }
          return { results: [] };
        },
        async run() {
          return { success: true };
        },
      };
      return stmt;
    },
  };
  return { DB: db, SESSION_SECRET: SECRET, PASSWORD_PEPPER: "pepper" } as any;
}
const ctx = { waitUntil() {}, passThroughOnException() {} } as any;

async function callRoute(env: any, adherentId: string, userId?: string, opts: { cookie?: boolean } = {}) {
  const headers: Record<string, string> = {};
  if (userId) {
    const token = await createSessionToken({ userId, expiresAt: Date.now() + 60_000 }, env);
    if (opts.cookie) headers["Cookie"] = `affbc_gestion_session=${token}`;
    else headers["Authorization"] = `Bearer ${token}`;
  }
  return worker.fetch(new Request(`https://gestion.test/api/adherents/${adherentId}/recu-cotisation`, { headers }), env, ctx);
}

describe("GET /api/adherents/:id/recu-cotisation", () => {
  const users = {
    admin1: { id: "admin1", role: "admin", actif: 1 },
    secr1: { id: "secr1", role: "secretaire", actif: 1 },
    coach1: { id: "coach1", role: "entraineur", actif: 1 },
    membre1: { id: "membre1", role: "membre", actif: 1 },
  };
  const adherents = {
    a1: ADH,
    gratuit: { ...ADH, id: "gratuit", cotisation: 0, montant_pass_region: 0 },
  };
  const env = makeEnv({ users, adherents });

  it("401 sans session", async () => {
    const res = await callRoute(env, "a1");
    expect(res.status).toBe(401);
  });

  it("403 pour un rôle sans droit sur les adhérents (membre)", async () => {
    const res = await callRoute(env, "a1", "membre1");
    expect(res.status).toBe(403);
  });

  it("404 si l'adhérent n'existe pas", async () => {
    const res = await callRoute(env, "inconnu", "admin1");
    expect(res.status).toBe(404);
    // err() renvoie { error: "message" } (chaîne) : c'est cette forme que lit openPdfFromApi
    expect((await res.json()) as any).toEqual({ error: "Adhérent introuvable" });
  });

  it("404 explicite quand il n'y a aucune cotisation à reçu (message affiché tel quel dans l'interface)", async () => {
    const res = await callRoute(env, "gratuit", "admin1");
    expect(res.status).toBe(404);
    const body: any = await res.json();
    expect(body.error).toMatch(/Aucune cotisation enregistrée/);
  });

  it.each([
    ["admin", "admin1"],
    ["secrétaire", "secr1"],
    ["entraîneur (lecture seule sur les adhérents)", "coach1"],
  ])("200 application/pdf pour %s", async (_label, uid) => {
    const res = await callRoute(env, "a1", uid);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe('inline; filename="Recu-cotisation-Mickael-ANDRIEU-2026-2027.pdf"');
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const txt = latin1(bytes);
    expect(txt.startsWith("%PDF-")).toBe(true);
    expect(txt).toContain("(Mickaël ANDRIEU)");
    expect(txt).toContain("250,00 \u0080");
    assertXrefIsConsistent(bytes);
  });

  it("la session peut aussi arriver par le cookie HttpOnly (navigation directe / window.open)", async () => {
    const res = await callRoute(env, "a1", "admin1", { cookie: true });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("un cookie falsifié est refusé (401), même sur une fiche existante", async () => {
    const res = await worker.fetch(
      new Request("https://gestion.test/api/adherents/a1/recu-cotisation", { headers: { Cookie: "affbc_gestion_session=forge.forge" } }),
      env,
      ctx
    );
    expect(res.status).toBe(401);
  });

  it("le PDF est identique d'un appel à l'autre (hors date d'émission) : même numéro de reçu", async () => {
    const t = async () => latin1(new Uint8Array(await (await callRoute(env, "a1", "admin1")).arrayBuffer()));
    const [a, b] = [await t(), await t()];
    expect(a).toContain("REC-2026-2027-AB12CD34");
    expect(b).toContain("REC-2026-2027-AB12CD34");
  });
});

// ── Ventes liées à l'inscription (tenue, passeport...) intégrées au reçu ────
describe("GET /api/adherents/:id/recu-cotisation — ventes liées à l'inscription", () => {
  const users = { admin1: { id: "admin1", role: "admin", actif: 1 } };

  const adherentHelloAsso = { ...ADH, id: "ab12cd34-5678-4abc-9def-0123456789ab", exercice_id: "ex-2026-2027" };
  const adherentBureau = { ...adherentHelloAsso, id: "bureau-0001-0002-0003-000000000009", cotisation: 0, montant_pass_region: 0 };
  const adherentSansVente = { ...adherentHelloAsso, id: "solo-0001-0002-0003-000000000010" };
  const adherentLigneCorrompue = { ...adherentHelloAsso, id: "corrompu-01-02-03-000000000011" };

  const factures = [
    {
      // parcours HelloAsso (insertInscriptionSales) : format de `notes` réel du repo inscription
      exercice_id: "ex-2026-2027",
      notes: `Vente générée automatiquement lors de l'inscription web. Paiement HelloAsso validé. Registration ID : reg-1. Adhérent ID : ${adherentHelloAsso.id}`,
      lignes: JSON.stringify([
        { desc: "Vente t-shirt club AFFBC (M)", qte: 1, pu: 25 },
        { desc: "Vente pantalon club AFFBC (M)", qte: 1, pu: 15 },
      ]),
    },
    {
      // parcours renouvellement gratuit Membre du Bureau (insertFreeSalesIfAny) : format de `notes` DIFFÉRENT
      exercice_id: "ex-2026-2027",
      notes: `Inscription web publique #reg2000 — adherent ${adherentBureau.id}`,
      lignes: JSON.stringify([
        { desc: "Vente t-shirt club AFFBC (L)", qte: 1, pu: 25 },
        { desc: "Vente pantalon club AFFBC (L)", qte: 1, pu: 15 },
      ]),
    },
    {
      // même adhérent, mais saison précédente : ne doit PAS apparaître sur le reçu de la saison en cours
      exercice_id: "ex-2025-2026",
      notes: `Adhérent ID : ${adherentHelloAsso.id}`,
      lignes: JSON.stringify([{ desc: "Vente t-shirt club AFFBC — saison précédente", qte: 1, pu: 25 }]),
    },
    {
      // ligne JSON corrompue : ne doit jamais faire échouer la génération du reçu
      exercice_id: "ex-2026-2027",
      notes: `Adhérent ID : ${adherentLigneCorrompue.id}`,
      lignes: "{ ceci n'est pas du JSON valide",
    },
  ];

  const env = makeEnv({
    users,
    adherents: {
      [adherentHelloAsso.id]: adherentHelloAsso,
      [adherentBureau.id]: adherentBureau,
      [adherentSansVente.id]: adherentSansVente,
      [adherentLigneCorrompue.id]: adherentLigneCorrompue,
    },
    factures,
  });

  it("inclut la tenue commandée à l'inscription (parcours HelloAsso) et exclut la vente d'une autre saison", async () => {
    const res = await callRoute(env, adherentHelloAsso.id, "admin1");
    expect(res.status).toBe(200);
    const txt = latin1(new Uint8Array(await res.arrayBuffer()));
    // Le moteur PDF échappe les parenthèses (`(M)` → `\(M\)`, cf. pdf-engine.ts) :
    // on cherche donc le texte hors parenthèses, pas la désignation complète.
    expect(txt).toContain("Vente t-shirt club AFFBC");
    expect(txt).toContain("Vente pantalon club AFFBC");
    expect(txt).not.toContain("saison précédente");
    expect(txt).toContain("290,00 \u0080"); // 250 (cotisation) + 25 + 15
  });

  it("reconnaît aussi le format de notes du renouvellement gratuit Membre du Bureau, et émet un reçu même à cotisation nulle", async () => {
    const res = await callRoute(env, adherentBureau.id, "admin1");
    expect(res.status).toBe(200); // sans ce correctif : 404 « Aucune cotisation enregistrée »
    const txt = latin1(new Uint8Array(await res.arrayBuffer()));
    expect(txt).toContain("Vente t-shirt club AFFBC");
    expect(txt).toContain("Vente pantalon club AFFBC");
    expect(txt).toContain("40,00 \u0080"); // 0 (cotisation) + 25 + 15
  });

  it("adhérent sans vente liée à son inscription : reçu inchangé (cotisation seule)", async () => {
    const res = await callRoute(env, adherentSansVente.id, "admin1");
    expect(res.status).toBe(200);
    const txt = latin1(new Uint8Array(await res.arrayBuffer()));
    expect(txt).not.toContain("Vente t-shirt");
    expect(txt).toContain("250,00 \u0080");
  });

  it("une ligne de vente au JSON corrompu ne fait pas échouer la génération du reçu (repli silencieux)", async () => {
    const res = await callRoute(env, adherentLigneCorrompue.id, "admin1");
    expect(res.status).toBe(200);
    const txt = latin1(new Uint8Array(await res.arrayBuffer()));
    expect(txt.startsWith("%PDF-")).toBe(true);
    expect(txt).toContain("250,00 \u0080"); // cotisation seule, la ligne corrompue est ignorée
  });
});
