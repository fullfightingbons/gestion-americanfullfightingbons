// Tests de l'imputation multi-opérations du rapprochement bancaire
// (Banque › Rapprochement, public/assets/app.js).
//
// Même principe que gl-accounting.test.ts : app.js est un script classique
// (aucun export), on le charge tel quel dans un bac à sable node:vm avec un DOM
// minimal, puis on appelle les VRAIES fonctions de production. Seules les
// fonctions pures sont testées ici (recherche, candidats, équilibre) ; les
// écrans eux-mêmes (fenêtre, cases à cocher) manipulent le DOM.

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

// Évalue des requêtes de recherche et renvoie les booléens (sérialisés pour éviter
// les comparaisons d'objets entre deux « realms » JS).
function matches(cases: Array<[string, Record<string, unknown>]>): boolean[] {
  const out = loadAppAndRun(`
    const cases = ${JSON.stringify(cases)};
    capture(JSON.stringify(cases.map(([q, f]) => rapprMatchesQuery(q, f))));
  `);
  return JSON.parse(out);
}

describe("rapprMatchesQuery() — recherche par nom, montant ou date", () => {
  it("une recherche vide laisse tout passer", () => {
    expect(matches([["", { text: "x" }], ["   ", { text: "x" }]])).toEqual([true, true]);
  });

  it("cherche un nom sans tenir compte de la casse ni des accents", () => {
    const f = { text: "VIR HELLOASSO Léa DUPONT" };
    expect(matches([["lea dupont", f], ["DUPONT", f], ["martin", f]])).toEqual([true, true, false]);
  });

  it("cherche un montant par son début : 45 trouve 45,00 et 45,50 mais pas 145,00", () => {
    expect(
      matches([
        ["45", { amounts: [45] }],
        ["45", { amounts: [45.5] }],
        ["45", { amounts: [145] }],
        ["45", { amounts: [14.5] }],
      ])
    ).toEqual([true, true, false, false]);
  });

  it("accepte la virgule ou le point, et un montant précis (45,5 ≠ 45,00)", () => {
    expect(
      matches([
        ["45,5", { amounts: [45.5] }],
        ["45.50", { amounts: [45.5] }],
        ["45,5", { amounts: [45] }],
        ["45,", { amounts: [45] }], // saisie en cours
      ])
    ).toEqual([true, true, false, true]);
  });

  it("ignore le signe, le symbole € et le séparateur de milliers collé depuis l'appli", () => {
    expect(
      matches([
        ["-45", { amounts: [45] }], // débit saisi en négatif
        ["45 €", { amounts: [45] }],
        ["1\u202f250,00 €", { amounts: [1250] }],
      ])
    ).toEqual([true, true, true]);
  });

  it("un nombre court ne cherche que dans les montants, un nombre ≥ 4 chiffres aussi dans le libellé", () => {
    const f = { text: "ref 12345", amounts: [99] };
    expect(matches([["45", f], ["12345", f], ["99", f]])).toEqual([false, true, true]);
  });

  it("cherche une date : jour/mois, mois/année ou format ISO", () => {
    const f = { dates: ["2026-10-05"] };
    expect(
      matches([["05/10", f], ["10/2026", f], ["05/10/2026", f], ["2026-10", f], ["06/10", f]])
    ).toEqual([true, true, true, true, false]);
  });

  it("combine plusieurs mots (ET) : nom + montant", () => {
    const f = { text: "Cotisation DUPONT", amounts: [45] };
    expect(matches([["dupont 45", f], ["dupont 46", f], ["martin 45", f]])).toEqual([true, false, false]);
  });
});

describe("rapprPieceCandidates() — écritures proposées à l'imputation", () => {
  const setup = `
    D.journal = [
      {id:'j1', piece:'ENC-1', compte:'512000', debit:100, credit:0, date_op:'2026-01-05', libelle:'Cotisation A'},
      {id:'j2', piece:'ENC-1-COT', compte:'706000', debit:0, credit:100, date_op:'2026-01-05', libelle:'Cotisation A'},
      {id:'j3', piece:'ACH-1', compte:'512000', debit:0, credit:40, date_op:'2026-01-10', libelle:'Achat fournitures'},
      {id:'j4', piece:'ENC-2', compte:'512000', debit:30, credit:0, date_op:'2026-01-07', libelle:'Cotisation B'},
      {id:'j5', piece:'SPLIT', compte:'512000', debit:20, credit:0, date_op:'2026-01-08', libelle:'Pièce à deux lignes'},
      {id:'j6', piece:'SPLIT', compte:'512000', debit:15, credit:0, date_op:'2026-01-08', libelle:'Pièce à deux lignes'},
    ];
    D.comptes = [{nom:'CM', transactions:[
      {id:'t1', rapproche:true, ecriture_piece:'ENC-2', ecriture_pieces_json:JSON.stringify(['ENC-2'])},
    ]}];
  `;

  it("ne propose que le compte 512 non rapproché, vu de la banque (+ encaissement, − paiement), du plus récent au plus ancien", () => {
    const out = JSON.parse(
      loadAppAndRun(`${setup} capture(JSON.stringify(rapprPieceCandidates().map(c => [c.piece, c.amount])));`)
    );
    // ENC-2 est déjà rapprochée, ENC-1-COT est sur le compte 706
    expect(out).toEqual([["ACH-1", -40], ["SPLIT", 35], ["ENC-1", 100]]);
  });

  it("regroupe les lignes d'une même pièce en une seule entrée", () => {
    const out = JSON.parse(
      loadAppAndRun(`${setup} capture(JSON.stringify(rapprPieceCandidates().filter(c => c.piece === 'SPLIT').length));`)
    );
    expect(out).toBe(1);
  });

  it("« tous les comptes » ajoute les autres écritures, sans réintroduire les pièces déjà rapprochées", () => {
    const out = JSON.parse(
      loadAppAndRun(`${setup} capture(JSON.stringify(rapprPieceCandidates({includeAllAccounts:true}).map(c => c.piece).sort()));`)
    );
    expect(out).toEqual(["ACH-1", "ENC-1", "ENC-1-COT", "SPLIT"]);
  });

  it("une pièce liée via ecriture_pieces_json (multi-rapprochement) est aussi exclue", () => {
    const out = JSON.parse(
      loadAppAndRun(`
        ${setup}
        D.comptes[0].transactions.push({id:'t2', rapproche:true, ecriture_piece:'ENC-1', ecriture_pieces_json:JSON.stringify(['ENC-1','SPLIT'])});
        capture(JSON.stringify(rapprPieceCandidates().map(c => c.piece)));
      `)
    );
    expect(out).toEqual(["ACH-1"]);
  });
});

describe("rapprMultiBalance() — total des opérations bancaires vs écritures cochées", () => {
  const balance = (txs: unknown, pieces: unknown) =>
    JSON.parse(
      loadAppAndRun(`capture(JSON.stringify(rapprMultiBalance(${JSON.stringify(txs)}, ${JSON.stringify(pieces)})));`)
    );

  it("est équilibré quand les totaux concordent (virement groupé de 2 opérations ↔ 3 écritures)", () => {
    const r = balance(
      [{ credit: 300, debit: 0 }, { credit: 200, debit: 0 }],
      [{ amount: 100 }, { amount: 150 }, { amount: 250 }]
    );
    expect(r).toEqual({ txTotal: 500, selTotal: 500, diff: 0, balanced: true });
  });

  it("signale l'écart quand ça ne colle pas (frais bancaires, écriture oubliée…)", () => {
    const r = balance([{ credit: 500, debit: 0 }], [{ amount: 100 }, { amount: 399.5 }]);
    expect(r.diff).toBeCloseTo(-0.5, 2);
    expect(r.balanced).toBe(false);
  });

  it("gère un débit (paiement) : −40 € côté banque = −40 € côté écritures", () => {
    const r = balance([{ credit: 0, debit: 40 }], [{ amount: -40 }]);
    expect(r).toEqual({ txTotal: -40, selTotal: -40, diff: 0, balanced: true });
  });

  it("ne se trompe pas sur les arrondis flottants (0,1 + 0,2)", () => {
    const r = balance([{ credit: 0.3, debit: 0 }], [{ amount: 0.1 }, { amount: 0.2 }]);
    expect(r.balanced).toBe(true);
  });
});
