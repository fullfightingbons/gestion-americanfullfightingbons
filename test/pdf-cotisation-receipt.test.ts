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
import { buildCotisationReceipt, seasonLabelFromIso, registrationSeason, paymentNote } from "../src/lib/pdf/cotisation-receipt";
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
    expect(r.doc.lignes).toEqual([{ designation: "Cotisation Club — saison 2026-2027", qte: 1, pu: 250, total: 250 }]);
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
});

// ── 2 bis. Articles commandés à l'inscription (t-shirt, pantalon, passeport…) ─
// Contexte : la fiche `adherents` ne garde que la cotisation ; t-shirt et pantalon
// (obligatoires pour une nouvelle adhésion) n'existent que dans
// inscriptions_publiques.dossier_json. Le reçu doit refléter ce qui a été payé.
const reg = (dossier: unknown, over: Record<string, unknown> = {}) => ({
  id: "r1",
  statut: "payee",
  submitted_at: "2026-09-08T10:00:00.000Z",
  created_at: "2026-09-08T10:00:00.000Z",
  updated_at: "2026-09-08T10:05:00.000Z",
  dossier_json: typeof dossier === "string" ? dossier : JSON.stringify(dossier),
  ...over,
});

// Ce que calculateTotals() (repo inscription) stocke pour un nouvel adhérent : 1 t-shirt + 1 pantalon.
const NEW_MEMBER = {
  clothingOrder: { tshirtQty: 1, tshirtSize: "M", pantalonQty: 1, pantalonSize: "L" },
  computedTotals: {
    cotisation: 250, passRegionAmount: 0, passport: 0, clothingTotal: 40, extraProductsTotal: 0,
    tshirtQty: 1, pantalonQty: 1, pricingTshirt: 25, pricingPantalon: 15, orderItems: [], total: 290,
  },
};
const lines = (r: ReturnType<typeof buildCotisationReceipt>) => {
  if (!r.ok) throw new Error(r.message);
  return r.doc.lignes.map((l) => [l.designation, l.qte, l.pu, l.total]);
};

describe("reçu — articles commandés à l'inscription", () => {
  it("nouvel adhérent : t-shirt et pantalon (avec tailles) s'ajoutent à la cotisation, le total est ce qui a été facturé", () => {
    const r = buildCotisationReceipt(ADH, NOW, [reg(NEW_MEMBER)]);
    expect(lines(r)).toEqual([
      ["Cotisation Club — saison 2026-2027", 1, 250, 250],
      ["T-shirt club AFFBC (taille M)", 1, 25, 25],
      ["Pantalon club AFFBC (taille L)", 1, 15, 15],
    ]);
    if (!r.ok) throw new Error(r.message);
    expect(r.doc.total).toBe(290);
    expect(r.doc.total).toBe(NEW_MEMBER.computedTotals.total); // = montant payé à l'inscription
    expect(r.doc.objet).toBe("Inscription saison 2026-2027 : cotisation et articles commandés (inscription du 08/09/2026)");
  });

  it("sans inscription en ligne (fiche saisie/importée) : cotisation seule, comme avant", () => {
    const r = buildCotisationReceipt(ADH, NOW, []);
    expect(lines(r)).toEqual([["Cotisation Club — saison 2026-2027", 1, 250, 250]]);
    if (!r.ok) throw new Error(r.message);
    expect(r.doc.objet).toContain("Cotisation à l'association");
    expect(r.doc.objet).not.toContain("articles");
  });

  it("quantités multiples : 2 t-shirts → qte 2, prix unitaire 25, total 50", () => {
    const d = structuredClone(NEW_MEMBER);
    d.computedTotals.tshirtQty = 2;
    d.computedTotals.total = 250 + 50 + 15;
    const r = buildCotisationReceipt(ADH, NOW, [reg(d)]);
    expect(lines(r)[1]).toEqual(["T-shirt club AFFBC (taille M)", 2, 25, 50]);
    if (!r.ok) throw new Error(r.message);
    expect(r.doc.total).toBe(315);
  });

  it("passeport sportif + produit en option + Pass Région : tout figure, le total = valeur, et le pied indique le réglé par l'adhérent", () => {
    const d = {
      clothingOrder: { tshirtQty: 1, tshirtSize: "S", pantalonQty: 1, pantalonSize: "M" },
      computedTotals: {
        cotisation: 220, passRegionAmount: 30, passport: 25, clothingTotal: 40, extraProductsTotal: 12,
        tshirtQty: 1, pantalonQty: 1, pricingTshirt: 25, pricingPantalon: 15,
        orderItems: [{ id: "p1", name: "Gourde AFFBC", quantity: 1, unitPrice: 12, size: "", total: 12 }],
        total: 220 + 25 + 40 + 12,
      },
    };
    const r = buildCotisationReceipt({ ...ADH, cotisation: 220, montant_pass_region: 30 }, NOW, [reg(d)]);
    expect(lines(r).map((l) => l[0])).toEqual([
      "Cotisation Club — saison 2026-2027",
      "Pass Région",
      "Passeport sportif",
      "T-shirt club AFFBC (taille S)",
      "Pantalon club AFFBC (taille M)",
      "Gourde AFFBC",
    ]);
    if (!r.ok) throw new Error(r.message);
    expect(r.doc.total).toBe(327);
    // réconciliation avec le paiement en ligne : total − Pass Région = montant payé (HelloAsso)
    expect(r.doc.total! - 30).toBe(d.computedTotals.total);
    expect(r.doc.footerNote).toBe("Mode de paiement : HelloAsso (dont Pass Région : 30,00 €, soit 297,00 € réglés par l'adhérent)");
  });

  it("Pass Région sans article : le pied précise quand même la part réglée par l'adhérent", () => {
    const r = buildCotisationReceipt({ ...ADH, cotisation: 220, montant_pass_region: 30, paiement: "" }, NOW, []);
    if (!r.ok) throw new Error(r.message);
    expect(r.doc.total).toBe(250);
    expect(r.doc.footerNote).toBe("Dont Pass Région : 30,00 €, soit 220,00 € réglés par l'adhérent");
  });

  it("sans Pass Région, le pied reste « Mode de paiement : … » (inchangé)", () => {
    const r = buildCotisationReceipt(ADH, NOW, [reg(NEW_MEMBER)]);
    if (!r.ok) throw new Error(r.message);
    expect(r.doc.footerNote).toBe("Mode de paiement : HelloAsso");
  });

  it("inscription d'avant le 10/09/2026 : le « kit nouvel adhérent » réellement payé est repris", () => {
    const d = structuredClone(NEW_MEMBER) as any;
    d.computedTotals.newMemberKit = 40;
    d.computedTotals.total = 250 + 40 + 40; // ancien calcul : kit + t-shirt + pantalon
    const r = buildCotisationReceipt(ADH, NOW, [reg(d)]);
    expect(lines(r).map((l) => l[0])).toContain("Kit nouvel adhérent");
    if (!r.ok) throw new Error(r.message);
    expect(r.doc.total).toBe(330);
  });

  it("ancien format de dossier (prix absents) : le reste facturé part en « Autres articles », rien n'est perdu", () => {
    const d = structuredClone(NEW_MEMBER) as any;
    delete d.computedTotals.pricingTshirt;
    delete d.computedTotals.pricingPantalon;
    const r = buildCotisationReceipt(ADH, NOW, [reg(d)]);
    expect(lines(r)).toEqual([
      ["Cotisation Club — saison 2026-2027", 1, 250, 250],
      ["Autres articles", 1, 40, 40],
    ]);
    if (!r.ok) throw new Error(r.message);
    expect(r.doc.total).toBe(290);
  });

  it("aucune ligne « Autres articles » quand tout est détaillé", () => {
    expect(lines(buildCotisationReceipt(ADH, NOW, [reg(NEW_MEMBER)])).map((l) => l[0])).not.toContain("Autres articles");
  });

  it("taille absente : pas de « (taille …) » vide", () => {
    const d = structuredClone(NEW_MEMBER) as any;
    d.clothingOrder = { tshirtQty: 1, pantalonQty: 1 };
    expect(lines(buildCotisationReceipt(ADH, NOW, [reg(d)])).map((l) => l[0])).toEqual([
      "Cotisation Club — saison 2026-2027",
      "T-shirt club AFFBC",
      "Pantalon club AFFBC",
    ]);
  });

  it("une inscription d'une AUTRE saison n'ajoute pas ses articles (renouvellement par le bureau)", () => {
    const old = reg(NEW_MEMBER, { submitted_at: "2025-09-10T09:00:00.000Z", created_at: "2025-09-10T09:00:00.000Z" });
    expect(lines(buildCotisationReceipt(ADH, NOW, [old]))).toEqual([["Cotisation Club — saison 2026-2027", 1, 250, 250]]);
  });

  it("inscription déposée en JUIN pour la saison suivante : rattachée à la saison de son exercice, ses articles figurent", () => {
    // La date de dépôt (20/06/2026, avant le 1er juillet) la rangerait dans 2025-2026 ; son exercice
    // se termine le 30/06/2027 : c'est la même source que date_fin_adhesion de la fiche.
    const june = reg(NEW_MEMBER, {
      submitted_at: "2026-06-20T09:00:00.000Z", created_at: "2026-06-20T09:00:00.000Z",
      updated_at: "2026-06-20T09:05:00.000Z", exercice_date_fin: "2027-06-30",
    });
    expect(registrationSeason(june)).toBe("2026-2027");
    expect(lines(buildCotisationReceipt(ADH, NOW, [june]))).toHaveLength(3);
  });

  it("saison de l'inscription : l'exercice prime sur la date de dépôt ; sans exercice exploitable, repli sur la date de dépôt", () => {
    expect(registrationSeason(reg(NEW_MEMBER, { exercice_date_fin: "2026-06-30" }))).toBe("2025-2026"); // dépôt sept. 2026, exercice précédent
    expect(registrationSeason(reg(NEW_MEMBER, { exercice_date_fin: null }))).toBe("2026-2027");
    expect(registrationSeason(reg(NEW_MEMBER, { exercice_date_fin: "n/a" }))).toBe("2026-2027");
    expect(registrationSeason(reg(NEW_MEMBER, { exercice_date_fin: "" }))).toBe("2026-2027");
    // exercice de la saison précédente : les articles de l'an dernier ne sont pas repris
    expect(lines(buildCotisationReceipt(ADH, NOW, [reg(NEW_MEMBER, { exercice_date_fin: "2026-06-30" })]))).toHaveLength(1);
  });

  it("les inscriptions non abouties (brouillon, paiement en attente, échec, abandonnée) sont ignorées", () => {
    for (const statut of ["brouillon", "paiement_en_attente", "traitement_paiement", "echec_creation", "abandonnee"]) {
      const r = buildCotisationReceipt(ADH, NOW, [reg(NEW_MEMBER, { statut })]);
      expect(lines(r)).toHaveLength(1);
    }
    expect(lines(buildCotisationReceipt(ADH, NOW, [reg(NEW_MEMBER, { statut: "payee" })]))).toHaveLength(3);
  });

  it("dossier_json illisible, vide ou sans totaux : ignoré sans planter", () => {
    for (const bad of ["{pas du json", "", null, "[]", JSON.stringify({ clothingOrder: {} })]) {
      const r = buildCotisationReceipt(ADH, NOW, [reg(bad as any)]);
      expect(lines(r)).toHaveLength(1);
    }
  });

  it("plusieurs inscriptions dans la saison : la plus récente fait foi", () => {
    const first = reg(NEW_MEMBER, { id: "r1", updated_at: "2026-09-08T10:05:00.000Z" });
    const d2 = structuredClone(NEW_MEMBER) as any;
    d2.clothingOrder.tshirtSize = "XL";
    const second = reg(d2, { id: "r2", updated_at: "2026-09-12T08:00:00.000Z" });
    expect(lines(buildCotisationReceipt(ADH, NOW, [first, second]))[1][0]).toBe("T-shirt club AFFBC (taille XL)");
    expect(lines(buildCotisationReceipt(ADH, NOW, [second, first]))[1][0]).toBe("T-shirt club AFFBC (taille XL)");
  });

  it("la cotisation suit la fiche (corrigée à la main), les articles restent ceux de l'inscription", () => {
    const r = buildCotisationReceipt({ ...ADH, cotisation: 200 }, NOW, [reg(NEW_MEMBER)]);
    expect(lines(r)[0]).toEqual(["Cotisation Club — saison 2026-2027", 1, 200, 200]);
    if (!r.ok) throw new Error(r.message);
    expect(r.doc.total).toBe(240);
  });

  it("cotisation à 0 mais articles payés : reçu des articles seulement, sans ligne « cotisation 0,00 »", () => {
    const r = buildCotisationReceipt({ ...ADH, cotisation: 0 }, NOW, [reg(NEW_MEMBER)]);
    expect(lines(r).map((l) => l[0])).toEqual(["T-shirt club AFFBC (taille M)", "Pantalon club AFFBC (taille L)"]);
    if (!r.ok) throw new Error(r.message);
    expect(r.doc.total).toBe(40);
  });

  it("rien à recevoir (cotisation 0 et aucun article) : toujours refusé", () => {
    expect(buildCotisationReceipt({ ...ADH, cotisation: 0 }, NOW, []).ok).toBe(false);
  });

  it("le PDF contient les articles avec leur taille et le total en €", () => {
    const r = buildCotisationReceipt(ADH, NOW, [reg(NEW_MEMBER)]);
    if (!r.ok) throw new Error(r.message);
    const txt = latin1(buildDocumentPdfBytes(r.doc));
    expect(txt).toContain("(T-shirt club AFFBC \\(taille M\\))");
    expect(txt).toContain("(Pantalon club AFFBC \\(taille L\\))");
    expect(txt).toContain("25,00 \u0080");
    expect(txt).toContain("15,00 \u0080");
    expect(txt).toContain("290,00 \u0080"); // total
    expect(txt).toContain("cotisation et articles command\u00e9s");
  });
});

// ── 2 ter. Paiement en plusieurs fois : ce qui est réglé, ce qui reste ─────────
// La fiche est créée dès la 1re échéance ; un reçu émis à ce moment-là ne doit pas laisser croire
// que tout est encaissé. Montants en centimes, tels que persistés dans dossier_json.payment.
describe("reçu — paiement en plusieurs fois", () => {
  const withPayment = (payment: Record<string, unknown>, statut = "paiement_planifie") =>
    reg({ ...NEW_MEMBER, payment }, { statut });
  const footer = (r: ReturnType<typeof buildCotisationReceipt>) => {
    if (!r.ok) throw new Error(r.message);
    return r.doc.footerNote;
  };

  it("en 3 fois, 1re échéance réglée : « réglés à ce jour » et « à prélever »", () => {
    const r = buildCotisationReceipt(ADH, NOW, [withPayment({ installmentCount: 3, paidAmountCents: 9667, remainingAmountCents: 19333 })]);
    expect(footer(r)).toBe("Mode de paiement : HelloAsso en 3 fois - 96,67 € réglés à ce jour, 193,33 € à prélever");
  });

  it("le total du tableau reste la valeur de l'adhésion (290 €), pas le montant déjà encaissé", () => {
    const r = buildCotisationReceipt(ADH, NOW, [withPayment({ installmentCount: 3, paidAmountCents: 9667, remainingAmountCents: 19333 })]);
    if (!r.ok) throw new Error(r.message);
    expect(r.doc.total).toBe(290);
  });

  it("avec un Pass Région, la part de la Région est ajoutée", () => {
    const d = { ...NEW_MEMBER, computedTotals: { ...NEW_MEMBER.computedTotals, cotisation: 220, passRegionAmount: 30, total: 260 }, payment: { installmentCount: 2, paidAmountCents: 13000, remainingAmountCents: 13000 } };
    const r = buildCotisationReceipt({ ...ADH, cotisation: 220, montant_pass_region: 30 }, NOW, [reg(d, { statut: "paiement_planifie" })]);
    expect(footer(r)).toBe("Mode de paiement : HelloAsso en 2 fois - 130,00 € réglés à ce jour, 130,00 € à prélever - dont Pass Région : 30,00 €");
  });

  it("toutes les échéances réglées : « intégralement réglé »", () => {
    const r = buildCotisationReceipt(ADH, NOW, [withPayment({ installmentCount: 3, paidAmountCents: 29000, remainingAmountCents: 0 }, "payee")]);
    expect(footer(r)).toBe("Mode de paiement : HelloAsso en 3 fois - intégralement réglé");
  });

  it("échéancier connu mais montants réglés inconnus : on n'invente aucun chiffre", () => {
    const r = buildCotisationReceipt(ADH, NOW, [withPayment({ installmentCount: 3 })]);
    expect(footer(r)).toBe("Mode de paiement : HelloAsso en 3 fois");
  });

  it("un paiement en une fois (ou ancien dossier sans échéancier) garde la mention d'origine", () => {
    expect(footer(buildCotisationReceipt(ADH, NOW, [withPayment({ installmentCount: 1 }, "payee")]))).toBe("Mode de paiement : HelloAsso");
    expect(footer(buildCotisationReceipt(ADH, NOW, [reg(NEW_MEMBER)]))).toBe("Mode de paiement : HelloAsso");
  });

  it("l'état fourni par l'appelant (envoi juste après le paiement) prime sur celui du dossier", () => {
    // Dans le worker inscription, le dossier lu au début de la requête n'a pas encore les montants réglés.
    const r = buildCotisationReceipt(ADH, NOW, [withPayment({ installmentCount: 3 })], {
      payment: { installmentCount: 3, paidAmountCents: 9667, remainingAmountCents: 19333 },
    });
    expect(footer(r)).toContain("96,67 € réglés à ce jour");
  });

  it("sans mode de paiement enregistré : « Paiement en N fois »", () => {
    const r = buildCotisationReceipt({ ...ADH, paiement: "" }, NOW, [withPayment({ installmentCount: 2, paidAmountCents: 100, remainingAmountCents: 100 })]);
    expect(footer(r)).toBe("Mode de paiement : Paiement en 2 fois - 1,00 € réglés à ce jour, 1,00 € à prélever");
  });

  it("le pied de page ne déborde jamais de la page, même dans le pire cas (long mode, 3 fois, gros montants, Pass Région)", () => {
    const worst = paymentNote("Virement bancaire", 60, 1234.5, { installmentCount: 3, paidAmountCents: 123450, remainingAmountCents: 246900 })!;
    // Pied de page : Helvetica 7,3 pt, centré ; marges de 14 mm sur une page de 210 mm → 182 mm utiles.
    expect(measureTextWidth(worst, "F1", 7.3)).toBeLessThanOrEqual(182 * 2.8346);
    for (const paiement of ["HelloAsso", "Chèque", "Espèces", ""]) {
      for (const pr of [0, 30, 60]) {
        const n = paymentNote(paiement, pr, 999.99, { installmentCount: 3, paidAmountCents: 33333, remainingAmountCents: 66666 })!;
        expect(measureTextWidth(n, "F1", 7.3)).toBeLessThanOrEqual(182 * 2.8346);
      }
    }
  });
});

// ── 3. Route GET /api/adherents/:id/recu-cotisation ───────────────────────────
const SECRET = "s".repeat(40);

function makeEnv(opts: {
  users: Record<string, any>;
  adherents: Record<string, any>;
  registrations?: Record<string, any[]>; // par adherent_id → lignes inscriptions_publiques
  comptes?: Record<string, any>; // par id de compte → enregistrement membre
  sqlLog?: string[]; // requêtes reçues par la base simulée
}) {
  const db = {
    prepare(sql: string) {
      opts.sqlLog?.push(sql);
      let binds: unknown[] = [];
      const stmt: any = {
        bind(...args: unknown[]) {
          binds = args;
          return stmt;
        },
        async first() {
          if (/FROM utilisateurs/.test(sql)) return opts.users[String(binds[0])] ?? null;
          if (/FROM adherents WHERE id/.test(sql)) return opts.adherents[String(binds[0])] ?? null;
          if (/FROM adherent_comptes/.test(sql)) return opts.comptes?.[String(binds[0])] ?? null;
          return null; // club_info / role_permissions : permissions par défaut
        },
        async all() {
          if (/FROM inscriptions_publiques/.test(sql)) return { results: opts.registrations?.[String(binds[0])] ?? [] };
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

describe("les deux reçus (back-office et espace membre) montrent les mêmes articles et le même total", () => {
  const dossier = JSON.stringify(NEW_MEMBER);
  const inscriptionPayee = [
    {
      id: "r1", statut: "payee", submitted_at: "2026-09-08T10:00:00.000Z", created_at: "2026-09-08T10:00:00.000Z",
      updated_at: "2026-09-08T10:05:00.000Z", dossier_json: dossier,
    },
  ];
  // La route back-office charge les inscriptions par l'id de la FICHE (adherent.id) ; l'espace membre
  // par member.adherent_id (ici « a1 »).
  const registrations = { [ADH.id]: inscriptionPayee, a1: inscriptionPayee };
  const users = { admin1: { id: "admin1", role: "admin", actif: 1 } };
  const compteMembre = {
    id: "cpt1", adherent_id: "a1", nom: "ANDRIEU", prenom: "Mickaël", cotisation: 250, montant_pass_region: 0,
    discipline: "Club", date_fin_adhesion: "2027-06-30", date_inscription: "2026-09-08", paiement: "HelloAsso",
  };
  const env = makeEnv({ users, adherents: { a1: ADH }, registrations, comptes: { cpt1: compteMembre } });

  const pdfText = async (res: Response) => latin1(new Uint8Array(await res.arrayBuffer()));

  it("back-office : GET /api/adherents/:id/recu-cotisation contient t-shirt, pantalon et le total payé", async () => {
    const res = await callRoute(env, "a1", "admin1");
    expect(res.status).toBe(200);
    const txt = await pdfText(res);
    expect(txt).toContain("(T-shirt club AFFBC \\(taille M\\))");
    expect(txt).toContain("(Pantalon club AFFBC \\(taille L\\))");
    expect(txt).toContain("290,00 \u0080");
    expect(txt).toContain("REC-2026-2027-AB12CD34"); // numéro REC- inchangé
  });

  it("la requête des inscriptions joint l'exercice (date_fin) pour rattacher l'inscription à la bonne saison", async () => {
    const sqlLog: string[] = [];
    const envSpy = makeEnv({ users, adherents: { a1: ADH }, registrations, sqlLog });
    await callRoute(envSpy, "a1", "admin1");
    const q = sqlLog.find((s) => /FROM inscriptions_publiques/.test(s)) ?? "";
    expect(q).toMatch(/FROM exercices e WHERE e\.id = ip\.exercice_id\) AS exercice_date_fin/);
    expect(q).toMatch(/WHERE ip\.adherent_id = \?/);
  });

  it("back-office : une inscription de juin (exercice suivant) est prise en compte de bout en bout", async () => {
    const juin = [{ ...inscriptionPayee[0], submitted_at: "2026-06-20T09:00:00.000Z", created_at: "2026-06-20T09:00:00.000Z", exercice_date_fin: "2027-06-30" }];
    const envJuin = makeEnv({ users, adherents: { a1: ADH }, registrations: { [ADH.id]: juin } });
    const txt = await pdfText(await callRoute(envJuin, "a1", "admin1"));
    expect(txt).toContain("(T-shirt club AFFBC \\(taille M\\))");
  });

  it("back-office : une fiche sans inscription en ligne donne toujours le reçu de la cotisation seule", async () => {
    const env2 = makeEnv({ users, adherents: { a1: ADH }, registrations: {} });
    const txt = await pdfText(await callRoute(env2, "a1", "admin1"));
    expect(txt).not.toContain("T-shirt");
    expect(txt).toContain("250,00 \u0080");
  });

  it("espace membre : GET /api/member/documents/recu-cotisation — mêmes articles, même total, numérotation COT- conservée", async () => {
    const token = await createSessionToken({ kind: "member", adherentCompteId: "cpt1", expiresAt: Date.now() + 60_000 }, env);
    const res = await worker.fetch(
      new Request("https://gestion.test/api/member/documents/recu-cotisation", { headers: { Authorization: `Bearer ${token}` } }),
      env,
      ctx
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    const txt = await pdfText(res);
    expect(txt).toContain("(T-shirt club AFFBC \\(taille M\\))");
    expect(txt).toContain("(Pantalon club AFFBC \\(taille L\\))");
    expect(txt).toContain("290,00 \u0080");
    expect(txt).toContain(`COT-${new Date().getFullYear()}-A1`);
    expect(txt).toContain("(Adhérent n°A1)");
  });

  it("espace membre : sans cotisation ni article, toujours 404 avec le message d'origine", async () => {
    const envVide = makeEnv({
      users,
      adherents: {},
      registrations: {},
      comptes: { cpt1: { ...compteMembre, cotisation: 0, montant_pass_region: 0 } },
    });
    const token = await createSessionToken({ kind: "member", adherentCompteId: "cpt1", expiresAt: Date.now() + 60_000 }, envVide);
    const res = await worker.fetch(
      new Request("https://gestion.test/api/member/documents/recu-cotisation", { headers: { Authorization: `Bearer ${token}` } }),
      envVide,
      ctx
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as any).error).toBe("Aucune cotisation enregistrée pour le moment");
  });
});
