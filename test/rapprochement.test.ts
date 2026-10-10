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

// ─── Suggestions de rapprochement : sens « vu de la banque », compte 512 uniquement ───

// Variante asynchrone du bac à sable (pour les fonctions `async` comme setFactureStatus) :
// `capture` résout la promesse renvoyée.
function loadAppAndRunAsync(driverCode: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const noop = () => {};
    const sandbox: Record<string, unknown> = {
      console,
      crypto: globalThis.crypto,
      capture: (v: unknown) => resolve(v),
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
    try {
      vm.runInContext(
        appJsSource + "\n;(async function(){\n" + driverCode + "\n})().catch(e => { throw e; });",
        sandbox,
        { filename: "app.js (sandbox test async)" }
      );
    } catch (e) {
      reject(e);
    }
    setTimeout(() => reject(new Error("timeout du test asynchrone")), 4000);
  });
}

describe("bestRapprochementEntry() — l'écriture proposée est la ligne 512, dans le bon sens", () => {
  // Vente de 45 € encaissée par virement : 4 lignes de journal de même montant et même date.
  const journal = `
    D.journal = [
      {id:'a1', piece:'VTE-1', compte:'411 - Adhérents et clients', debit:45, credit:0, date_op:'2026-10-05', libelle:'Vente Dupont maillot'},
      {id:'a2', piece:'VTE-1-VTE', compte:'707 - Ventes vêtements et équipements', debit:0, credit:45, date_op:'2026-10-05', libelle:'Vente Dupont maillot'},
      {id:'a3', piece:'PAY-1-BNQ', compte:'512 - Banque', debit:45, credit:0, date_op:'2026-10-05', libelle:'Encaissement Dupont maillot'},
      {id:'a4', piece:'PAY-1-CLI', compte:'411 - Adhérents et clients', debit:0, credit:45, date_op:'2026-10-05', libelle:'Encaissement Dupont maillot'},
    ];
    D.comptes = [{nom:'CM', transactions:[]}];
  `;
  const best = (tx: unknown) =>
    JSON.parse(
      loadAppAndRun(`
        ${journal}
        const r = bestRapprochementEntry(${JSON.stringify(tx)});
        capture(JSON.stringify(r ? {piece: r.entry.piece, auto: r.auto, score: r.score} : null));
      `)
    );

  it("un encaissement (crédit bancaire) est rapproché de la ligne 512, pas des lignes 411/707 de la vente", () => {
    const r = best({ id: 't1', date_op: '2026-10-05', libelle: 'VIR Dupont maillot', debit: 0, credit: 45 });
    expect(r.piece).toBe("PAY-1-BNQ");
    expect(r.auto).toBe(true);
  });

  it("un paiement (débit bancaire) de 45 € ne se rapproche pas d'un encaissement de 45 €", () => {
    const r = best({ id: 't2', date_op: '2026-10-05', libelle: 'VIR Dupont maillot', debit: 45, credit: 0 });
    expect(r).toBeNull();
  });

  it("deux écritures 512 aussi plausibles → suggestion non automatique (ambiguë)", () => {
    const r = JSON.parse(
      loadAppAndRun(`
        D.journal = [
          {id:'b1', piece:'COT-A', compte:'512 - Banque', debit:45, credit:0, date_op:'2026-10-05', libelle:'Cotisation'},
          {id:'b2', piece:'COT-B', compte:'512 - Banque', debit:45, credit:0, date_op:'2026-10-05', libelle:'Cotisation'},
        ];
        D.comptes = [{nom:'CM', transactions:[]}];
        const r = bestRapprochementEntry({id:'t3', date_op:'2026-10-05', libelle:'VIR divers', debit:0, credit:45});
        capture(JSON.stringify({auto: r.auto, ambiguous: r.ambiguous}));
      `)
    );
    expect(r).toEqual({ auto: false, ambiguous: true });
  });

  it("ne propose pas une pièce déjà rapprochée", () => {
    const r = JSON.parse(
      loadAppAndRun(`
        ${journal}
        D.comptes = [{nom:'CM', transactions:[{id:'t0', rapproche:true, ecriture_piece:'PAY-1-BNQ'}]}];
        capture(JSON.stringify(bestRapprochementEntry({id:'t1', date_op:'2026-10-05', libelle:'VIR Dupont', debit:0, credit:45})));
      `)
    );
    expect(r).toBeNull();
  });
});

describe("findGroupedRapprochement() — regroupements bancaires", () => {
  const group = (txs: unknown) =>
    JSON.parse(
      loadAppAndRun(`
        D.journal = [
          {id:'g1', piece:'HA-GRP', compte:'512 - Banque', debit:45, credit:0, date_op:'2026-10-05', libelle:'Virement HelloAsso'},
          {id:'g2', piece:'HA-GRP-COT', compte:'7561 - Cotisations', debit:0, credit:45, date_op:'2026-10-05', libelle:'Cotisation'},
        ];
        D.comptes = [{nom:'CM', transactions:${JSON.stringify(txs)}}];
        capture(JSON.stringify(findGroupedRapprochement(D.comptes[0].transactions).map(g => [g.piece, g.transactionIds.sort()])));
      `)
    );

  it("regroupe des encaissements dont la somme correspond à la pièce 512", () => {
    const out = group([
      { id: 't1', credit: 30, debit: 0 },
      { id: 't2', credit: 15, debit: 0 },
    ]);
    expect(out).toEqual([["HA-GRP", ["t1", "t2"]]]);
  });

  it("ne mélange pas un encaissement et un paiement (30 € reçus + 15 € payés ≠ 45 €)", () => {
    const out = group([
      { id: 't1', credit: 30, debit: 0 },
      { id: 't2', credit: 0, debit: 15 },
    ]);
    expect(out).toEqual([]);
  });

  it("ne propose pas de regroupement vers une ligne qui n'est pas du compte 512", () => {
    const out = JSON.parse(
      loadAppAndRun(`
        D.journal = [{id:'g9', piece:'VTE-9-VTE', compte:'707 - Ventes', debit:0, credit:45, date_op:'2026-10-05', libelle:'Vente'}];
        D.comptes = [{nom:'CM', transactions:[{id:'t1', credit:30, debit:0},{id:'t2', credit:15, debit:0}]}];
        capture(JSON.stringify(findGroupedRapprochement(D.comptes[0].transactions)));
      `)
    );
    expect(out).toEqual([]);
  });
});

describe("rapprPieceCandidates() — pièce équilibrée sur plusieurs comptes", () => {
  it("« tous les comptes » ne compte plus 45 € deux fois (512 débit 45 + 7561 crédit 45 = 45, pas 90)", () => {
    const out = JSON.parse(
      loadAppAndRun(`
        D.journal = [
          {id:'x1', piece:'ENC-X', compte:'512 - Banque', debit:45, credit:0, date_op:'2026-10-05', libelle:'Encaissement'},
          {id:'x2', piece:'ENC-X', compte:'7561 - Cotisations', debit:0, credit:45, date_op:'2026-10-05', libelle:'Cotisation'},
        ];
        D.comptes = [];
        capture(JSON.stringify(rapprPieceCandidates({includeAllAccounts:true}).map(c => [c.piece, c.amount, c.compte])));
      `)
    );
    expect(out).toEqual([["ENC-X", 45, "512 - Banque"]]);
  });
});

// ─── Ventes : passage en « Payée » ───

describe("setFactureStatus() — une vente doit pouvoir passer en « Payée » même si la base a dérivé", () => {
  // `missing` = colonnes que la base « n'a pas » (l'UPDATE qui les contient échoue).
  const run = (missing: string[], prompts: string[], facture = "{id:'f1', statut:'Émise', date_op:'2026-10-01', notes_paiement:''}") =>
    loadAppAndRunAsync(`
      hasPerm = () => true;
      render = () => {};
      notify = () => {};
      alert = (m) => { alertMsg = m; };
      var alertMsg = '';
      const answers = ${JSON.stringify(prompts)};
      window.prompt = () => answers.shift();
      const calls = [];
      D.factures = [${facture}];
      SB = { from: () => ({ update: (patch) => ({ eq: async () => {
        calls.push(Object.keys(patch));
        const bad = ${JSON.stringify(missing)}.find(c => c in patch);
        return bad ? { data: null, error: { message: 'Colonne absente : ' + bad } } : { data: [patch], error: null };
      } }) }) };
      await setFactureStatus('f1', 'Payée');
      capture(JSON.stringify({ calls, statut: D.factures[0].statut, notes: D.factures[0].notes_paiement, date: D.factures[0].date_paiement || null, alertMsg }));
    `).then((v) => JSON.parse(v));

  it("cas nominal : statut, date et mode enregistrés en une seule requête", async () => {
    const r = await run([], ["2026-10-09", "1"]);
    expect(r.calls).toHaveLength(1);
    expect(r.statut).toBe("Payée");
    expect(r.date).toBe("2026-10-09");
    expect(r.notes).toBe("Payée le 2026-10-09 — Virement");
  });

  it("colonne date_paiement absente en base : la vente passe quand même en Payée (date conservée dans notes_paiement)", async () => {
    const r = await run(["date_paiement"], ["2026-10-09", "2"]);
    expect(r.statut).toBe("Payée");
    expect(r.alertMsg).toBe("");
    expect(r.notes).toBe("Payée le 2026-10-09 — Chèque");
    expect(r.calls).toHaveLength(2);
  });

  it("colonnes date_paiement ET notes_paiement absentes : le statut seul est enregistré", async () => {
    const r = await run(["date_paiement", "notes_paiement"], ["2026-10-09", ""]);
    expect(r.statut).toBe("Payée");
    expect(r.alertMsg).toBe("");
    expect(r.calls).toHaveLength(3);
  });

  it("accepte une date saisie en JJ/MM/AAAA", async () => {
    const r = await run([], ["09/10/2026", "3"]);
    expect(r.date).toBe("2026-10-09");
  });

  it("refuse une date illisible sans rien enregistrer", async () => {
    const r = await run([], ["demain", "3"]);
    expect(r.calls).toHaveLength(0);
    expect(r.statut).toBe("Émise");
    expect(r.alertMsg).toContain("Date de paiement non reconnue");
  });

  it("conserve l'historique des relances au lieu de l'écraser", async () => {
    const r = await run([], ["2026-10-09", "1"], "{id:'f1', statut:'En retard', date_op:'2026-09-01', notes_paiement:'[Relance envoyée le 2026-09-20 à a@b.fr]'}");
    expect(r.notes).toBe("[Relance envoyée le 2026-09-20 à a@b.fr]\nPayée le 2026-10-09 — Virement");
  });

  it("si même le statut ne peut pas être enregistré, l'erreur est affichée (et l'écran n'est pas modifié)", async () => {
    const r = await run(["statut"], ["2026-10-09", "1"]);
    expect(r.alertMsg).toContain("Erreur");
    expect(r.statut).toBe("Émise");
  });
});

describe("facturePaidDate()", () => {
  const paid = (f: unknown) => loadAppAndRun(`capture(facturePaidDate(${JSON.stringify(f)}));`);
  it("préfère la colonne date_paiement, sinon relit notes_paiement (dernière occurrence)", () => {
    expect(paid({ date_paiement: "2026-10-09" })).toBe("2026-10-09");
    expect(paid({ notes_paiement: "Payée le 2026-09-01 — CB\nPayée le 2026-10-09 — Virement" })).toBe("2026-10-09");
    expect(paid({ notes_paiement: "[Relance envoyée]" })).toBe("");
    expect(paid({})).toBe("");
  });
});

describe("parseBankCsvAmount() — montants du CSV bancaire", () => {
  const parse = (vals: string[]) =>
    JSON.parse(loadAppAndRun(`capture(JSON.stringify(${JSON.stringify(vals)}.map(parseBankCsvAmount)));`));

  it("lit les formats courants : 45,00 / -45,00 / vide", () => {
    expect(parse(["45,00", "-45,00", "", "0,50", "-0,50"])).toEqual([45, 45, 0, 0.5, 0.5]);
  });

  it("ne tronque plus les montants ≥ 1 000 € (espace, espace insécable ou point de milliers)", () => {
    expect(parse(["1 234,56", "1\u00a0234,56", "1\u202f234,56", "1.234,56", "-1 234,56", "1234,56"])).toEqual([
      1234.56, 1234.56, 1234.56, 1234.56, 1234.56, 1234.56,
    ]);
  });

  it("garde un point décimal quand il n'y a pas de virgule (1234.56)", () => {
    expect(parse(["1234.56", "45.5"])).toEqual([1234.56, 45.5]);
  });

  it("ignore les valeurs illisibles au lieu de produire NaN", () => {
    expect(parse(["abc", "—"])).toEqual([0, 0]);
  });
});

describe("une écriture rapprochée disparaît des écritures en attente (anti-doublon)", () => {
  const setup = `
    D.journal = [
      {id:'j1', piece:'PAY-1-BNQ', compte:'512 - Banque', debit:45, credit:0, date_op:'2026-10-05', libelle:'Encaissement Dupont'},
      {id:'j2', piece:'PAY-2-BNQ', compte:'512 - Banque', debit:30, credit:0, date_op:'2026-10-06', libelle:'Encaissement Martin'},
    ];
    D.comptes = [{nom:'CM', transactions:[
      {id:'t1', date_op:'2026-10-05', libelle:'VIR Dupont', debit:0, credit:45, rapproche:false},
      {id:'t2', date_op:'2026-10-06', libelle:'VIR Martin', debit:0, credit:30, rapproche:false},
    ]}];
  `;
  const link = `const t=D.comptes[0].transactions[0]; t.rapproche=true; t.ecriture_piece='PAY-1-BNQ'; t.ecriture_pieces_json=JSON.stringify(['PAY-1-BNQ']);`;

  it("compteurs « en attente de relevé », suggestions et imputation multi n'incluent plus la pièce liée", () => {
    const out = JSON.parse(
      loadAppAndRun(`${setup} ${link}
        capture(JSON.stringify({
          pending: pendingBankPieces().map(j => j.piece),
          cands: rapprPieceCandidates().map(c => c.piece),
          sugg: (bestRapprochementEntry({id:'tx', date_op:'2026-10-05', libelle:'VIR Dupont', debit:0, credit:45}) || {}).entry?.piece || null,
        }));`)
    );
    expect(out).toEqual({ pending: ["PAY-2-BNQ"], cands: ["PAY-2-BNQ"], sugg: null });
  });

  it("le menu « Pièce unique » des autres opérations ne propose plus la pièce déjà liée", () => {
    const html = loadAppAndRun(`${setup} ${link}
      RAPPR_CONSUMED = null; RAPPR_POOL = null; RAPPR_SUGG = new Map();
      capture(rapprBodyHtml(rapprAllTransactions()));`);
    const rowT2 = html.split("<tr").find((r: string) => r.includes('id="ecr-t2"')) as string;
    expect(rowT2).toBeDefined();
    expect(rowT2).toContain('value="PAY-2-BNQ"');
    expect(rowT2).not.toContain('value="PAY-1-BNQ"');
  });

  it("rapprocher() demande confirmation si l'écriture est déjà liée à une autre opération", async () => {
    const r = await loadAppAndRunAsync(`${setup} ${link}
      var asked = '';
      confirmModal = async (m) => { asked = m; return false; };
      notify = () => {}; render = () => {};
      var updates = 0;
      SB = { from: () => ({ update: () => ({ eq: async () => { updates++; return { data: [], error: null }; } }) }) };
      document.getElementById = (id) => id === 'ecr-t2' ? { value: 'PAY-1-BNQ' } : null;
      await rapprocher('t2');
      capture(JSON.stringify({ asked, updates, rapproche: D.comptes[0].transactions[1].rapproche }));`);
    const out = JSON.parse(r);
    expect(out.asked).toContain("déjà rapprochée");
    expect(out.updates).toBe(0);
    expect(out.rapproche).toBe(false);
  });
});

describe("écritures types « Transfert d'épargne » (deux sens)", () => {
  it("le plan comptable contient 5121 après 512 (findPlanCompte('512') retrouve toujours « 512 - Banque »)", () => {
    const out = JSON.parse(
      loadAppAndRun(`capture(JSON.stringify({
        i512: PLAN.indexOf('512 - Banque'),
        i5121: PLAN.indexOf('5121 - Livret d épargne'),
        found: findPlanCompte('512'),
      }));`)
    );
    expect(out.i5121).toBe(out.i512 + 1);
    expect(out.found).toBe("512 - Banque");
  });

  it("compte courant → épargne : 5121 au débit, 512 au crédit ; épargne → compte courant : l'inverse", () => {
    const t = JSON.parse(
      loadAppAndRun(`capture(JSON.stringify({vers: ECRITURE_TYPES.transfert_vers_epargne, depuis: ECRITURE_TYPES.transfert_depuis_epargne}));`)
    );
    expect(t.vers.lignes).toEqual([
      expect.objectContaining({ compte: "5121 - Livret d épargne", sens: "debit" }),
      expect.objectContaining({ compte: "512 - Banque", sens: "credit" }),
    ]);
    expect(t.depuis.lignes).toEqual([
      expect.objectContaining({ compte: "512 - Banque", sens: "debit" }),
      expect.objectContaining({ compte: "5121 - Livret d épargne", sens: "credit" }),
    ]);
  });

  it("l'ancien modèle unique n'existe plus", () => {
    expect(loadAppAndRun(`capture(String('transfert_epargne' in ECRITURE_TYPES));`)).toBe("false");
  });

  it("openEcritureType() préremplit la modale dans chaque sens", () => {
    const open = (type: string) =>
      JSON.parse(
        loadAppAndRun(`
          requireWritePerm = () => true; renderModal = () => {}; setTimeout = () => 0;
          openEcritureType(${JSON.stringify(type)});
          capture(JSON.stringify(UI.editObj));`)
      );
    const vers = open("transfert_vers_epargne");
    expect([vers.compte, vers.contrepartie, vers.libelle]).toEqual(["5121 - Livret d épargne", "512 - Banque", "Transfert vers épargne"]);
    expect(vers._typeHint).toContain("compte courant vers le livret");
    const depuis = open("transfert_depuis_epargne");
    expect([depuis.compte, depuis.contrepartie, depuis.libelle]).toEqual(["512 - Banque", "5121 - Livret d épargne", "Transfert depuis épargne"]);
    expect(depuis._typeHint).toContain("livret vers le compte courant");
  });

  it("le journal affiche les deux boutons rapides pour qui a le droit d'écriture, et aucun sinon", () => {
    const html = loadAppAndRun(`hasPerm = () => true; D.journal = []; capture(vJournal());`);
    expect(html).toContain("openEcritureType('transfert_vers_epargne')");
    expect(html).toContain("⚡ Compte courant → Épargne");
    expect(html).toContain("openEcritureType('transfert_depuis_epargne')");
    expect(html).toContain("⚡ Épargne → Compte courant");
    const sans = loadAppAndRun(`hasPerm = () => false; D.journal = []; capture(vJournal());`);
    expect(sans).not.toContain("epargne')");
  });

  it("rapprochement : les deux lignes du transfert se rapprochent chacune de leur relevé (compte courant −, livret +)", () => {
    const out = JSON.parse(
      loadAppAndRun(`
        D.journal = [
          {id:'e1', piece:'MAN-1-L1', compte:'5121 - Livret d épargne', debit:500, credit:0, date_op:'2026-10-08', libelle:'Transfert vers épargne'},
          {id:'e2', piece:'MAN-1-L2', compte:'512 - Banque', debit:0, credit:500, date_op:'2026-10-08', libelle:'Contrepartie - Transfert vers épargne'},
        ];
        D.comptes = [];
        const best = (tx) => { const r = bestRapprochementEntry(tx); return r ? r.entry.piece : null; };
        capture(JSON.stringify({
          cc:     best({id:'t1', date_op:'2026-10-08', libelle:'VIR EPARGNE', debit:500, credit:0}),
          livret: best({id:'t2', date_op:'2026-10-08', libelle:'VIR COMPTE COURANT', debit:0, credit:500}),
        }));`)
    );
    expect(out).toEqual({ cc: "MAN-1-L2", livret: "MAN-1-L1" });
  });
});

describe("écritures types « Transfert d'épargne » — enregistrement", () => {
  const save = (type: string) =>
    loadAppAndRunAsync(`
      requireWritePerm = () => true; requireExerciceActif = () => true; renderModal = () => {}; setTimeout = () => 0;
      closeModal = () => {}; render = () => {};
      D.journal = []; D.currentExo = { id: 'exo1' };
      let rows = null;
      insertJournalRows = async (r) => { rows = r; };
      openEcritureType(${JSON.stringify(type)});
      // Comptes tels que préremplis par la modale (aucune modification de l'utilisateur).
      const vals = { 'e-lib': UI.editObj.libelle, 'e-dat': '2026-10-08', 'e-pie': 'EPA-1', 'e-cpt': UI.editObj.compte, 'e-cpt-ctr': UI.editObj.contrepartie, 'e-mnt': '500' };
      document.getElementById = (id) => (id in vals ? { value: vals[id] } : null);
      await saveEcr();
      capture(JSON.stringify(rows.map(r => [r.piece, r.compte, r.debit, r.credit])));
    `).then((v) => JSON.parse(v));

  it("compte courant → épargne : 5121 débité, 512 crédité, deux pièces distinctes, équilibré", async () => {
    expect(await save("transfert_vers_epargne")).toEqual([
      ["EPA-1-L1", "5121 - Livret d épargne", 500, 0],
      ["EPA-1-L2", "512 - Banque", 0, 500],
    ]);
  });

  it("épargne → compte courant : 512 débité, 5121 crédité, deux pièces distinctes, équilibré", async () => {
    expect(await save("transfert_depuis_epargne")).toEqual([
      ["EPA-1-L1", "512 - Banque", 500, 0],
      ["EPA-1-L2", "5121 - Livret d épargne", 0, 500],
    ]);
  });
});
