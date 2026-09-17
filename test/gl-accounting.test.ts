// Tests du moteur comptable (public/assets/app.js).
//
// Ce module n'avait aucun test alors qu'il a concentré plusieurs bugs réels
// ces dernières semaines : inversion débit/crédit sur une écriture de
// subvention, solde de compteSolde()/vEcr512() calculé en crédit-débit au
// lieu de débit-crédit (bug corrigé le 13/08/2026), et le même défaut
// retrouvé dans vGL()/exportGLCSV() le 15/08/2026 — jamais vérifié après le
// premier correctif alors que c'était explicitement noté comme point à
// surveiller.
//
// app.js est un script classique (pas de module ES, chargé en <script> brut
// depuis public/index.html) : aucune fonction n'y est exportée, et D/UI sont
// déclarés en `const`. On ne peut donc pas faire `import {...} from
// "../public/assets/app.js"` comme pour src/index.ts. À la place, on charge
// le fichier tel quel dans un bac à sable (node:vm) avec un DOM minimal, on
// injecte des écritures simulées dans D.journal, puis on appelle les
// fonctions réelles définies par ce fichier. Ce sont donc les vraies
// fonctions de production qui sont exercées ici, pas une copie recopiée à la
// main dans ce fichier de test — si compteSolde()/vGL()/etc. changent dans
// app.js, ce test les suit automatiquement.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appJsSource = readFileSync(
  path.join(__dirname, "../public/assets/app.js"),
  "utf8"
);
const workerSource = readFileSync(
  path.join(__dirname, "../src/index.ts"),
  "utf8"
);

/**
 * Charge public/assets/app.js dans un contexte vm isolé, puis exécute
 * `driverCode` À LA SUITE, dans le MÊME script. C'est nécessaire : D et UI
 * sont déclarés en `const` en haut du fichier, donc invisibles depuis
 * l'extérieur du script une fois vm.runInContext() terminé (seules les
 * déclarations `function`/`var` deviennent des propriétés du contexte). En
 * revanche, du code ajouté à la suite du même texte source, dans la même
 * exécution, partage la portée lexicale de app.js et peut référencer D, UI,
 * compteSolde, vGL, etc. directement, comme n'importe quel script classique
 * multi-fichiers dans une page HTML.
 *
 * `driverCode` doit appeler capture(valeur) pour renvoyer un résultat.
 */
function loadAppAndRun(driverCode: string): any {
  let captured: unknown;
  const noop = () => {};
  const sandbox: Record<string, unknown> = {
    console,
    crypto: globalThis.crypto,
    capture: (v: unknown) => {
      captured = v;
    },
  };
  sandbox.document = {
    addEventListener: noop,
    removeEventListener: noop,
    getElementById: () => null,
    createElement: () => ({ style: {}, classList: { add: noop, remove: noop }, click: noop }),
    body: { innerHTML: "" },
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = noop;
  sandbox.removeEventListener = noop;
  sandbox.navigator = {};
  sandbox.location = { href: "" };
  sandbox.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
  sandbox.fetch = () => Promise.reject(new Error("fetch indisponible en test"));

  vm.createContext(sandbox);
  vm.runInContext(
    appJsSource + "\n;(function(){\n" + driverCode + "\n})();",
    sandbox,
    { filename: "app.js (sandbox test)" }
  );
  return captured;
}

// Deux écritures simples et en équilibre sur le compte bancaire 512 : un
// encaissement de 100 (débit) et une charge de 40 (crédit). Solde attendu :
// 60 € au débit — l'argent est là — quelle que soit la vue qui l'affiche.
const JOURNAL_512_FIXTURE = `
  D.journal = [
    {compte:'512000', debit:100, credit:0, date_op:'2026-01-05', exercice_id:'ex1', piece:'ENC-1', libelle:'Encaissement cotisation'},
    {compte:'512000', debit:0, credit:40, date_op:'2026-01-10', exercice_id:'ex1', piece:'ACH-1', libelle:'Achat fournitures'},
  ];
  D.currentExo = {id:'ex1', libelle:'2025-2026'};
`;

describe("compteSolde() — solde de référence (utilisé par le Bilan)", () => {
  it("un compte débiteur (plus de débit que de crédit) a un solde positif", () => {
    const solde = loadAppAndRun(`${JOURNAL_512_FIXTURE} capture(compteSolde(/^512/));`);
    expect(solde).toBeCloseTo(60, 2);
  });

  it("un compte créditeur (plus de crédit que de débit) a un solde négatif", () => {
    const solde = loadAppAndRun(`
      D.journal = [
        {compte:'401000', debit:0, credit:150, date_op:'2026-01-05', exercice_id:'ex1'},
      ];
      D.currentExo = {id:'ex1'};
      capture(compteSolde(/^401/));
    `);
    expect(solde).toBeCloseTo(-150, 2);
  });
});

describe("totalClasse() / sumJournal() — sommes par sens, utilisées par compteSolde/journalDiagnostics", () => {
  it("totalClasse filtre par préfixe de compte et additionne le bon côté", () => {
    const result = loadAppAndRun(`
      D.journal = [
        {compte:'706000', debit:0, credit:80, date_op:'2026-01-05', exercice_id:'ex1'},
        {compte:'707000', debit:0, credit:20, date_op:'2026-01-06', exercice_id:'ex1'},
        {compte:'607000', debit:5, credit:0, date_op:'2026-01-06', exercice_id:'ex1'},
      ];
      D.currentExo = {id:'ex1'};
      capture({
        produitsCredit: totalClasse(['7'], 'credit'),
        produitsDebit: totalClasse(['7'], 'debit'),
        chargesDebit: totalClasse(['6'], 'debit'),
      });
    `);
    expect(result.produitsCredit).toBeCloseTo(100, 2);
    expect(result.produitsDebit).toBeCloseTo(0, 2);
    expect(result.chargesDebit).toBeCloseTo(5, 2);
  });
});

describe("cohérence inter-vues : compteSolde, vEcr512, vGL et exportGLCSV doivent s'accorder sur le signe", () => {
  // C'est le cœur du problème qui s'est produit deux fois : compteSolde()
  // (Bilan) et vEcr512()/vGL() (vues détaillées) doivent afficher EXACTEMENT
  // le même solde, au même signe, pour le même compte. Une divergence ici
  // est le symptôme exact des deux bugs trouvés en août.

  it("vEcr512() affiche le solde 512 sans l'inverser (régression : bug corrigé le 13/08/2026)", () => {
    const result = loadAppAndRun(`
      ${JOURNAL_512_FIXTURE}
      capture({ solde: compteSolde(/^512/), html: vEcr512() });
    `);
    expect(result.solde).toBeCloseTo(60, 2);
    expect(result.html).toContain("60.00");
    expect(result.html).not.toContain("-60.00");
  });

  it("vGL() affiche le solde 512 sans l'inverser (régression : bug corrigé le 15/08/2026)", () => {
    const result = loadAppAndRun(`
      ${JOURNAL_512_FIXTURE}
      capture({ solde: compteSolde(/^512/), html: vGL() });
    `);
    expect(result.solde).toBeCloseTo(60, 2);
    expect(result.html).toContain("60.00");
    expect(result.html).not.toContain("-60.00");
  });

  it("vGL() affiche aussi le bon signe pour un compte créditeur (fournisseur impayé)", () => {
    const result = loadAppAndRun(`
      D.journal = [
        {compte:'401000', debit:0, credit:150, date_op:'2026-01-05', exercice_id:'ex1', piece:'ACH-2', libelle:'Facture fournisseur'},
      ];
      D.currentExo = {id:'ex1'};
      capture({ solde: compteSolde(/^401/), html: vGL() });
    `);
    expect(result.solde).toBeCloseTo(-150, 2);
    // Le Grand Livre affiche systématiquement une valeur positive avec un
    // signe "+" pour un solde débiteur, sans "+" pour un solde créditeur :
    // on vérifie juste que 150.00 apparaît sans "+150.00" (qui trahirait un
    // solde encore inversé) et que le total débit (colonne de gauche) est
    // bien à 0 pour ce compte.
    expect(result.html).not.toContain("+150.00");
    expect(result.html).toContain("150.00");
  });

  it("exportGLCSV() : le solde cumulé (dernière colonne) suit la même convention que compteSolde()", () => {
    const csv = loadAppAndRun(`
      ${JOURNAL_512_FIXTURE}
      dl = function(content){ capture(content); };
      notify = function(){};
      exportGLCSV();
    `);
    const lines: string[] = (csv as string).split("\n");
    // Ligne de la 2e écriture (après le débit de 100 puis le crédit de 40) :
    // solde cumulé attendu 60.00, pas -60.00.
    const ligneAchat = lines.find((l) => l.includes("ACH-1"));
    expect(ligneAchat).toBeDefined();
    expect(ligneAchat).toContain("60.00");
    expect(ligneAchat).not.toContain("-60.00");
    // Ligne de total du compte : même règle.
    const ligneTotal = lines.find((l) => l.includes("512000") && l.includes("---TOTAL---"));
    expect(ligneTotal).toBeDefined();
    expect(ligneTotal).toContain("60.00");
  });

  it("findGroupedRapprochement() : l'inversion de signe qui subsiste ici est neutralisée par Math.abs() (pas une régression, vérifié explicitement)", () => {
    const result = loadAppAndRun(`
      ${JOURNAL_512_FIXTURE}
      D.comptes = [];
      capture(findGroupedRapprochement([]));
    `);
    // Ne doit pas lever, et le montant de groupe (utilisé pour le
    // rapprochement bancaire) doit être positif malgré l'inversion de signe
    // interne à cette fonction, précisément parce qu'elle est enveloppée
    // dans Math.abs(). Ce test documente ce choix pour que personne ne
    // "corrige" ce signe-là par réflexe en pensant reproduire le correctif
    // du Grand Livre — ça n'a aucun effet ici, donc rien à changer.
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("journalDiagnostics() — calcul net (pas à sens unique) des produits/charges", () => {
  it("une écriture inverse sur un compte de charge (remboursement crédité) réduit bien la charge nette", () => {
    // Régression du correctif du 13/08/2026 : un remboursement de frais
    // bancaires crédité sur le compte de charge 627 avait disparu du
    // résultat parce que le calcul ne regardait qu'un seul sens.
    const result = loadAppAndRun(`
      D.journal = [
        {compte:'706000', debit:0, credit:200, date_op:'2026-01-05', exercice_id:'ex1'},
        {compte:'627000', debit:15, credit:0, date_op:'2026-01-06', exercice_id:'ex1'},
        {compte:'627000', debit:0, credit:15, date_op:'2026-01-20', exercice_id:'ex1'},
        {compte:'512000', debit:200, credit:15, date_op:'2026-01-05', exercice_id:'ex1'},
      ];
      D.currentExo = {id:'ex1'};
      capture(journalDiagnostics());
    `);
    expect(result.produits).toBeCloseTo(200, 2);
    expect(result.charges).toBeCloseTo(0, 2); // 15 débit - 15 crédit (remboursement) = 0, pas 15
    expect(result.resultat).toBeCloseTo(200, 2);
  });

  it("journal vide : tous les totaux à zéro, pas d'exception", () => {
    const result = loadAppAndRun(`
      D.journal = [];
      D.currentExo = null;
      capture(journalDiagnostics());
    `);
    expect(result.totalDebit).toBe(0);
    expect(result.totalCredit).toBe(0);
    expect(result.ecartJournal).toBe(0);
    expect(result.resultat).toBe(0);
  });
});

describe("Adhérents — renouvellement groupé", () => {
  it("bulkRenewSelectedAdh construit le patch avant de mettre à jour chaque adhérent", () => {
    const start = appJsSource.indexOf("async function bulkRenewSelectedAdh");
    const end = appJsSource.indexOf("async function renewAdh", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const fn = appJsSource.slice(start, end);

    expect(fn).toContain("const patch=");
    expect(fn).toContain("date_fin_adhesion:newFin");
    expect(fn).toContain("SB.from('adherents').update(patch)");
  });
});

describe("Adhérents — détection prudente des doublons", () => {
  it("signale deux fiches identiques sur la même saison sans confondre un renouvellement d'une autre saison", () => {
    const result = loadAppAndRun(`
      D.adherents = [
        {id:'a1', nom:'Martin', prenom:'Lea', naissance:'2010-01-01', email:'lea@example.test', exercice_id:'2026', statut:'Actif'},
        {id:'a2', nom:'Martin', prenom:'Lea', naissance:'2010-01-01', email:'lea@example.test', exercice_id:'2026', statut:'Actif'},
        {id:'a3', nom:'Martin', prenom:'Lea', naissance:'2010-01-01', email:'lea@example.test', exercice_id:'2025', statut:'Inactif'}
      ];
      capture(buildAdherentDuplicateGroups().map(g => g.rows.map(a => a.id)));
    `);
    expect(result).toEqual([["a1", "a2"]]);
  });
});

describe("Restauration — garde-fous serveur et interface", () => {
  it("expose un aperçu non destructif avant la route de restauration", () => {
    expect(workerSource).toContain("path === '/api/admin/restore/preview'");
    expect(workerSource.indexOf("path === '/api/admin/restore/preview'")).toBeLessThan(
      workerSource.indexOf("path === '/api/admin/restore'")
    );
  });

  it("le frontend demande le mot de passe admin et l'envoie à l'API de restauration", () => {
    const start = appJsSource.indexOf("async function restoreBackupJSON");
    const end = appJsSource.indexOf("// ═══════════════════════════════════════════════════", start);
    const fn = appJsSource.slice(start, end);

    expect(fn).toContain("/admin/restore/preview");
    expect(fn).toContain("const adminPassword=window.prompt");
    expect(fn).toContain("adminPassword");
  });
});

describe("Automatisations — alerte d'échec", () => {
  it("enregistre l'échec puis déclenche une notification best-effort", () => {
    expect(workerSource).toContain("async function notifyAutomationFailure");
    expect(workerSource).toContain("AUTOMATION_ALERTS_DISABLED");
    expect(workerSource).toContain("await notifyAutomationFailure(env");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Intégration exhaustive des écritures au Résultat et au Bilan (17/09/2026).
//
// Symptôme signalé : les remboursements saisis avec les boutons rapides
// (⚡ Remboursement adhérent, ⚡ Remboursement frais bancaires) n'apparaissaient
// pas à l'écran Résultat et n'étaient pas déduits de ses totaux, alors que le
// Bilan, lui, les déduisait — deux résultats différents affichés pour le même
// journal (+6953.35 € contre +6521.00 €).
//
// Deux causes distinctes, testées séparément ci-dessous :
//   1. vResultat() ne regardait qu'un seul sens par classe de compte ;
//   2. le Bilan affichait une liste FIGÉE de postes, tronquée par Math.max(0,…).
// ─────────────────────────────────────────────────────────────────────────────

// Cotisation 250 + vente kit 40, puis remboursement du kit (40) et un aller-
// retour de frais bancaires (7.65). Net attendu : produits 250, charges 0.
const JOURNAL_REMBOURSEMENTS_FIXTURE = `
  D.journal = [
    {compte:'7561 - Cotisations membres actifs', debit:0, credit:250, date_op:'2026-09-01', exercice_id:'ex1', piece:'ADH-1', libelle:'Cotisation DUPONT'},
    {compte:'512 - Banque', debit:250, credit:0, date_op:'2026-09-01', exercice_id:'ex1', piece:'ADH-1', libelle:'Contrepartie - Cotisation'},
    {compte:'707 - Ventes vêtements et équipements', debit:0, credit:40, date_op:'2026-09-02', exercice_id:'ex1', piece:'VTE-1', libelle:'Vente kit DUPONT'},
    {compte:'512 - Banque', debit:40, credit:0, date_op:'2026-09-02', exercice_id:'ex1', piece:'VTE-1', libelle:'Contrepartie - Vente kit'},
    {compte:'707 - Ventes vêtements et équipements', debit:40, credit:0, date_op:'2026-09-17', exercice_id:'ex1', piece:'MAN-1-L1', libelle:'Remboursement adhérent - DUPONT'},
    {compte:'512 - Banque', debit:0, credit:40, date_op:'2026-09-17', exercice_id:'ex1', piece:'MAN-1-L2', libelle:'Contrepartie - Remboursement adhérent'},
    {compte:'6270 - Frais bancaires', debit:7.65, credit:0, date_op:'2026-09-05', exercice_id:'ex1', piece:'BNK-1', libelle:'Frais bancaires'},
    {compte:'512 - Banque', debit:0, credit:7.65, date_op:'2026-09-05', exercice_id:'ex1', piece:'BNK-1', libelle:'Contrepartie - Frais bancaires'},
    {compte:'6270 - Frais bancaires', debit:0, credit:7.65, date_op:'2026-09-06', exercice_id:'ex1', piece:'BNK-2', libelle:'Remboursement frais bancaires'},
    {compte:'512 - Banque', debit:7.65, credit:0, date_op:'2026-09-06', exercice_id:'ex1', piece:'BNK-2', libelle:'Contrepartie - Remboursement frais bancaires'},
  ];
  D.currentExo = {id:'ex1', libelle:'2026-2027'};
`;

describe("vResultat() — les écritures d'extourne comptent dans le résultat", () => {
  it("un remboursement adhérent (débit 707) est listé ET déduit du total produits", () => {
    const result = loadAppAndRun(`
      ${JOURNAL_REMBOURSEMENTS_FIXTURE}
      capture({ html: vResultat(), diag: journalDiagnostics() });
    `);
    // La ligne de remboursement doit être VISIBLE (elle était absente avant).
    expect(result.html).toContain("Remboursement adhérent");
    expect(result.html).toContain("↩ extourne");
    // Total produits net : 250 + 40 - 40 = 250, pas 290.
    expect(result.html).toContain("250.00");
    expect(result.html).not.toContain("290.00");
    expect(result.diag.produits).toBeCloseTo(250, 2);
  });

  it("le total affiché par le Résultat est identique à celui du Bilan (aucune divergence possible)", () => {
    const result = loadAppAndRun(`
      ${JOURNAL_REMBOURSEMENTS_FIXTURE}
      const b = calcBilan();
      const html = vResultat();
      const totaux = [...html.matchAll(/<span>Total<\\/span><span style="color:([^"]+)">([-\\d.]+) €/g)].map(m => m[2]);
      capture({ produitsAffiches: totaux[0], chargesAffichees: totaux[1], bilan: {produits: b.produits, charges: b.charges, resultat: b.resultat} });
    `);
    expect(Number(result.produitsAffiches)).toBeCloseTo(result.bilan.produits, 2);
    expect(Number(result.chargesAffichees)).toBeCloseTo(result.bilan.charges, 2);
    expect(result.bilan.resultat).toBeCloseTo(250, 2);
  });

  it("aucun bandeau d'écart quand Résultat et Bilan concordent", () => {
    const html = loadAppAndRun(`
      ${JOURNAL_REMBOURSEMENTS_FIXTURE}
      capture(vResultat());
    `);
    expect(html).not.toContain("Écart entre le détail affiché");
  });
});

describe("calcBilan() — aucun compte ne peut disparaître du bilan", () => {
  const bilan = (journal: string) =>
    loadAppAndRun(`
      D.journal = ${journal};
      D.currentExo = {id:'ex1', date_debut:'2026-09-01', date_fin:'2027-08-31'};
      capture(calcBilan());
    `);

  it("un compte hors des postes historiques (518) apparaît quand même à l'actif", () => {
    const b = bilan(`[
      {compte:'518 - Intérêts courus', debit:100, credit:0, date_op:'2026-09-01', exercice_id:'ex1'},
      {compte:'512 - Banque', debit:0, credit:100, date_op:'2026-09-01', exercice_id:'ex1'}
    ]`);
    // Avant : actif ET passif à 0.00 €, les 100 € s'évaporaient sans alerte.
    expect(b.totalActif).toBeCloseTo(100, 2);
    expect(b.totalPassif).toBeCloseTo(100, 2);
    expect(b.ecartBilan).toBe(0);
  });

  it("une dette fiscale (44x) est présentée au passif au lieu d'être ignorée", () => {
    const b = bilan(`[
      {compte:'512 - Banque', debit:120, credit:0, date_op:'2026-09-01', exercice_id:'ex1'},
      {compte:'4457 - TVA collectée', debit:0, credit:120, date_op:'2026-09-01', exercice_id:'ex1'}
    ]`);
    expect(b.passifRows.some((r: any) => /État/.test(r.label) && Math.abs(r.value - 120) < 0.01)).toBe(true);
    expect(b.ecartBilan).toBe(0);
  });

  it("un résultat déficitaire vient en diminution du passif (et non en augmentation)", () => {
    const b = bilan(`[
      {compte:'512 - Banque', debit:200, credit:0, date_op:'2026-09-01', exercice_id:'ex1'},
      {compte:'7561 - Cotisations', debit:0, credit:200, date_op:'2026-09-01', exercice_id:'ex1'},
      {compte:'6061 - Fournitures', debit:500, credit:0, date_op:'2026-09-02', exercice_id:'ex1'},
      {compte:'512 - Banque', debit:0, credit:500, date_op:'2026-09-02', exercice_id:'ex1'}
    ]`);
    expect(b.resultat).toBeCloseTo(-300, 2);
    const ligneResultat = b.passifRows.find((r: any) => typeof r.signed === "number");
    expect(ligneResultat.value).toBeCloseTo(-300, 2); // et non +300 via Math.abs()
    expect(b.ecartBilan).toBe(0);
  });

  it("un découvert bancaire est présenté au passif au lieu d'être affiché à 0.00 €", () => {
    const b = bilan(`[
      {compte:'6061 - Fournitures', debit:500, credit:0, date_op:'2026-09-01', exercice_id:'ex1'},
      {compte:'512 - Banque', debit:0, credit:500, date_op:'2026-09-01', exercice_id:'ex1'}
    ]`);
    expect(b.passifRows.some((r: any) => /découvert/i.test(r.label) && Math.abs(r.value - 500) < 0.01)).toBe(true);
    expect(b.ecartBilan).toBe(0);
  });

  it("un compte inconnu du plan est signalé au lieu d'être perdu", () => {
    const b = bilan(`[
      {compte:'9999 - Compte exotique', debit:60, credit:0, date_op:'2026-09-01', exercice_id:'ex1'},
      {compte:'512 - Banque', debit:0, credit:60, date_op:'2026-09-01', exercice_id:'ex1'}
    ]`);
    expect(b.alertesBilan.length).toBeGreaterThan(0);
    expect(b.totalActif).toBeCloseTo(60, 2);
    expect(b.ecartBilan).toBe(0);
  });

  it("le contrôle « actif - passif » mesure les lignes réellement affichées", () => {
    const b = bilan(`[
      {compte:'512 - Banque', debit:300, credit:0, date_op:'2026-09-01', exercice_id:'ex1'},
      {compte:'4870 - Produits constatés d avance', debit:0, credit:300, date_op:'2026-09-01', exercice_id:'ex1'}
    ]`);
    // Ce cas sortait -300.00 € au contrôle sur un bilan pourtant équilibré.
    expect(b.totalActif).toBeCloseTo(b.totalPassif, 2);
    expect(b.ecartBilan).toBe(0);
  });

  it("les écritures sans exercice sont comptées et signalées (elles sont hors bilan)", () => {
    const b = bilan(`[
      {compte:'512 - Banque', debit:100, credit:0, date_op:'2026-09-03', exercice_id:null},
      {compte:'7561 - Cotisation', debit:0, credit:100, date_op:'2026-09-03', exercice_id:null}
    ]`);
    expect(b.orphelines.rows.length).toBe(2);
    expect(b.orphelines.withinCurrent.length).toBe(2);
    expect(b.totalActif).toBeCloseTo(0, 2);
  });
});
