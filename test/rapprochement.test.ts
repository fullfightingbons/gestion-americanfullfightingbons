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

  it("le journal affiche les deux boutons d'épargne pour qui a le droit d'écriture, et aucun sinon", () => {
    const html = loadAppAndRun(`hasPerm = () => true; D.journal = []; capture(vJournal());`);
    expect(html).toContain("openEcritureType('transfert_vers_epargne')");
    expect(html).toContain(">Compte courant → Épargne");
    expect(html).toContain("openEcritureType('transfert_depuis_epargne')");
    expect(html).toContain(">Épargne → Compte courant");
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

// ─── Saison précédente : chargement complet, ré-import, liens perdus ───

describe("selectAllRows() — le serveur plafonne chaque requête à 5000 lignes", () => {
  const run = (total: number, failAtPage = -1) =>
    loadAppAndRunAsync(`
      const DB = Array.from({length:${total}}, (_, i) => ({ id: 'id' + String(i).padStart(6,'0'), date_op: '2025-09-01' }));
      const calls = [];
      SB = { from: () => {
        const q = { limit: 5000, offset: 0 };
        const b = {
          select: () => b, order: (col) => { q.order = col; return b; },
          limit: (n) => { q.limit = n; return b; }, offset: (n) => { q.offset = n; return b; },
          then: (res) => { calls.push({ offset: q.offset, limit: q.limit, order: q.order });
            if (calls.length - 1 === ${failAtPage}) return Promise.resolve({ data: null, error: { message: 'boom' } }).then(res);
            return Promise.resolve({ data: DB.slice(q.offset, q.offset + q.limit), error: null }).then(res); },
        };
        return b; } };
      notify = () => {};
      const r = await selectAllRows('journal_comptable');
      capture(JSON.stringify({ n: r.data.length, unique: new Set(r.data.map(x => x.id)).size, error: !!r.error, calls }));
    `).then((v) => JSON.parse(v));

  it("12 000 lignes : 3 pages de 5000, rien de perdu ni de dupliqué, triées par id", async () => {
    const r = await run(12000);
    expect(r.n).toBe(12000);
    expect(r.unique).toBe(12000);
    expect(r.calls.map((c: any) => c.offset)).toEqual([0, 5000, 10000]);
    expect(r.calls.every((c: any) => c.order === "id")).toBe(true);
  });

  it("exactement 5000 lignes : une page pleine déclenche une 2e requête (vide) pour confirmer la fin", async () => {
    const r = await run(5000);
    expect(r.n).toBe(5000);
    expect(r.calls).toHaveLength(2);
  });

  it("une table petite ne coûte qu'une requête", async () => {
    const r = await run(40);
    expect(r.n).toBe(40);
    expect(r.calls).toHaveLength(1);
  });

  it("erreur sur une page : renvoie ce qui a été chargé et signale l'erreur (pas de silence)", async () => {
    const r = await run(12000, 1);
    expect(r.error).toBe(true);
    expect(r.n).toBe(5000);
  });
});

describe("import de relevé : une opération déjà importée n'est plus remise « en attente »", () => {
  it("l'upsert n'envoie pas `rapproche` (le conflit ne peut donc pas l'écraser)", async () => {
    const r = JSON.parse(
      await loadAppAndRunAsync(`
        D.comptes = [{ id: 'c1', nom: 'CM', transactions: [] }];
        UI.bankPreview = { cid: 'c1', rows: [
          { compte_id: 'c1', date_op: '05/10/2026', libelle: 'VIR Dupont', debit: 0, credit: 45, rapproche: false, a_verifier: false, source_format: 'pdf' },
        ] };
        let sent = null;
        SB = { from: () => ({ upsert: (rows, opts) => { sent = { rows, opts }; return { select: async () => ({ data: rows.map((x, i) => ({ ...x, id: 'n' + i })), error: null }) }; } }) };
        closeModal = () => {}; render = () => {}; alert = () => {};
        await confirmBankImport();
        capture(JSON.stringify({ keys: Object.keys(sent.rows[0]).sort(), onConflict: sent.opts.onConflict }));
      `)
    );
    expect(r.keys).not.toContain("rapproche");
    expect(r.keys).not.toContain("a_verifier");
    expect(r.onConflict).toEqual(["compte_id", "date_op", "libelle", "debit", "credit"]);
  });
});

describe("rapprLostLinks() / restaurerRapprochementsPerdus()", () => {
  const setup = `
    D.journal = [];
    D.comptes = [{ id: 'c1', nom: 'CM', transactions: [
      { id: 't1', rapproche: 0, ecriture_piece: 'P1', ecriture_pieces_json: '["P1"]', date_op: '05/10/2025', libelle: 'a', credit: 45, debit: 0 },
      { id: 't2', rapproche: 1, ecriture_piece: 'P2', ecriture_pieces_json: '["P2"]', date_op: '06/10/2025', libelle: 'b', credit: 30, debit: 0 },
      { id: 't3', rapproche: 0, ecriture_piece: null, ecriture_pieces_json: null, date_op: '07/10/2025', libelle: 'c', credit: 10, debit: 0 },
      { id: 't4', rapproche: null, ecriture_piece: null, ecriture_pieces_json: null, date_op: '08/10/2025', libelle: 'd', credit: 5, debit: 0 },
      { id: 't5', rapproche: 0, ecriture_piece: 'P2', ecriture_pieces_json: '["P2"]', date_op: '09/10/2025', libelle: 'e', credit: 30, debit: 0 },
      { id: 't6', rapproche: 0, ecriture_piece: 'P6', ecriture_pieces_json: '["P6","P7"]', date_op: '10/10/2025', libelle: 'f', credit: 8, debit: 0 },
    ] }];
  `;

  it("repère uniquement les opérations « en attente » qui gardent un lien (pas les annulations volontaires)", () => {
    const ids = JSON.parse(loadAppAndRun(`${setup} capture(JSON.stringify(rapprLostLinks(rapprAllTransactions()).map(x => x.t.id).sort()));`));
    expect(ids).toEqual(["t1", "t5", "t6"]);
  });

  it("rétablit les liens, sauf si l'écriture est déjà prise par une autre opération rapprochée", async () => {
    const r = JSON.parse(
      await loadAppAndRunAsync(`${setup}
        confirmModal = async () => true; notify = () => {}; render = () => {};
        let sent = null;
        SB = { from: () => ({ update: (patch) => ({ in: async (col, ids) => { sent = { patch, ids }; return { data: [], error: null }; } }) }) };
        await restaurerRapprochementsPerdus();
        const tx = D.comptes[0].transactions;
        capture(JSON.stringify({ sent, restored: tx.filter(t => t.rapproche).map(t => t.id).sort() }));
      `)
    );
    // t5 est écartée (P2 est utilisée par t2, déjà rapprochée) ; t1 et t6 sont rétablies.
    expect(r.sent.ids.sort()).toEqual(["t1", "t6"]);
    expect(r.sent.patch).toEqual({ rapproche: true });
    expect(r.restored).toEqual(["t1", "t2", "t6"]);
  });
});

// ─── Contrôle de complétude : « rien n'a été oublié » ───

describe("rapprControlReport() — contrôle de complétude du rapprochement", () => {
  // Jeu de données : une opération saine de chaque type + une anomalie de chaque catégorie.
  const setup = `
    var __today = new Date(); td = () => '2026-10-11';
    D.journal = [
      {id:'j1', piece:'OK-1',   compte:'512 - Banque', debit:45, credit:0, date_op:'2026-10-05', libelle:'Encaissement sain'},
      {id:'j2', piece:'MIS-1',  compte:'512 - Banque', debit:50, credit:0, date_op:'2026-10-05', libelle:'Écriture 50 liée à une opération de 45'},
      {id:'j3', piece:'PEND-1', compte:'512 - Banque', debit:20, credit:0, date_op:'2026-10-09', libelle:'Écriture récente en attente'},
      {id:'j4', piece:'OLD-1',  compte:'512 - Banque', debit:15, credit:0, date_op:'2026-06-01', libelle:'Écriture ancienne en attente'},
      {id:'j5', piece:'ZERO-1', compte:'707 - Ventes', debit:0, credit:0,  date_op:'2026-10-05', libelle:'Vente mise à zéro'},
      {id:'j6', piece:'GRP-1',  compte:'512 - Banque', debit:30, credit:0, date_op:'2026-10-06', libelle:'Remise de chèques'},
    ];
    D.comptes = [{ id:'c1', nom:'CM', solde_initial:0, transactions:[
      {id:'t_ok',   date_op:'05/10/2026', libelle:'ok',      credit:45, debit:0, rapproche:1, ecriture_piece:'OK-1',  ecriture_pieces_json:'["OK-1"]'},
      {id:'t_mis',  date_op:'05/10/2026', libelle:'mismatch',credit:45, debit:0, rapproche:1, ecriture_piece:'MIS-1', ecriture_pieces_json:'["MIS-1"]'},
      {id:'t_forc', date_op:'06/10/2026', libelle:'forcée',  credit:10, debit:0, rapproche:1, ecriture_piece:null,    ecriture_pieces_json:null},
      {id:'t_orph', date_op:'06/10/2026', libelle:'orpheline',credit:5, debit:0, rapproche:1, ecriture_piece:'GONE-1',ecriture_pieces_json:'["GONE-1"]'},
      {id:'t_g1',   date_op:'06/10/2026', libelle:'chèque 1',credit:18, debit:0, rapproche:1, ecriture_piece:'GRP-1', ecriture_pieces_json:'["GRP-1"]'},
      {id:'t_g2',   date_op:'06/10/2026', libelle:'chèque 2',credit:12, debit:0, rapproche:1, ecriture_piece:'GRP-1', ecriture_pieces_json:'["GRP-1"]'},
      {id:'t_pend', date_op:'09/10/2026', libelle:'attente', credit:20, debit:0, rapproche:0, ecriture_piece:null,    ecriture_pieces_json:null},
      {id:'t_old',  date_op:'01/06/2026', libelle:'ancienne',credit:15, debit:0, rapproche:0, ecriture_piece:null,    ecriture_pieces_json:null},
      {id:'t_zero', date_op:'05/10/2026', libelle:'à zéro',  credit:0,  debit:0, rapproche:0, ecriture_piece:null,    ecriture_pieces_json:null},
      {id:'t_jan',  date_op:'03/01/2026', libelle:'janvier', credit:1,  debit:0, rapproche:0, ecriture_piece:null,    ecriture_pieces_json:null},
    ]}];
  `;
  const report = (extra = "", opts = "") =>
    JSON.parse(loadAppAndRun(`${setup} ${extra}
      const r = rapprControlReport(${opts});
      capture(JSON.stringify({
        forced: r.forced.map(t => t.id), orphans: r.orphans.map(o => [o.txs.map(t => t.id), o.missing]),
        mismatches: r.mismatches.map(m => [m.txs.map(t => t.id).sort(), m.diff]),
        pendingTx: r.pendingTx.map(t => t.id).sort(), oldPendingTx: r.oldPendingTx.map(t => t.id),
        pendingPieces: r.pendingPieces.map(p => p.piece).sort(), oldPendingPieces: r.oldPendingPieces.map(p => p.piece),
        zeroLines: r.zeroLines.map(j => j.piece), zeroTx: r.zeroTx.map(t => t.id),
        gaps: r.gaps, counts: r.counts, ok: r.ok, equation: r.equation,
      }));`));

  it("détecte chaque catégorie d'anomalie", () => {
    const r = report();
    expect(r.forced).toEqual(["t_forc"]);
    expect(r.orphans).toEqual([[["t_orph"], ["GONE-1"]]]);
    expect(r.mismatches).toEqual([[["t_mis"], -5]]); // opération 45 € ↔ écriture 50 €
    expect(r.zeroLines).toEqual(["ZERO-1"]);
    expect(r.zeroTx).toEqual(["t_zero"]);
  });

  it("un regroupement correct (deux chèques 18 + 12 ↔ une remise de 30) n'est PAS signalé", () => {
    const r = report();
    expect(r.mismatches.flatMap((m: any) => m[0])).not.toContain("t_g1");
    expect(r.orphans.flatMap((o: any) => o[0])).not.toContain("t_g1");
  });

  it("liste ce qui est en attente, et à part ce qui l'est depuis plus de 45 jours", () => {
    const r = report();
    expect(r.pendingTx).toEqual(["t_jan", "t_old", "t_pend", "t_zero"]);
    expect(r.oldPendingTx.sort()).toEqual(["t_jan", "t_old"]);
    expect(r.pendingPieces).toEqual(["OLD-1", "PEND-1"]);
    expect(r.oldPendingPieces).toEqual(["OLD-1"]);
  });

  it("repère les mois sans aucune opération entre la première et la dernière", () => {
    const r = report();
    expect(r.gaps).toEqual([{ compte: "CM", months: ["2026-02", "2026-03", "2026-04", "2026-05", "2026-07", "2026-08", "2026-09"] }]);
  });

  it("la période borne les résultats (ex. un exercice)", () => {
    const r = report("", "{from:'2026-10-01', to:'2026-10-31'}");
    expect(r.oldPendingTx).toEqual([]);
    expect(r.pendingTx).not.toContain("t_old");
    expect(r.gaps).toEqual([]);
  });

  it("l'état de rapprochement se décompose exactement : écart = soldes initiaux + non rapprochées + sans écriture − écritures 512 en attente + autres", () => {
    const e = report().equation;
    const sum = Math.round((e.soldeInitial + e.unrecTx + e.forcedNet + e.unrecPieces + e.autres) * 100) / 100;
    expect(sum).toBe(e.ecart);
  });

  it("un état entièrement rapproché et cohérent : ok, écart nul", () => {
    const r = JSON.parse(
      loadAppAndRun(`
        td = () => '2026-10-11';
        D.journal = [{id:'a', piece:'P1', compte:'512 - Banque', debit:45, credit:0, date_op:'2026-10-05', libelle:'x'},
                     {id:'b', piece:'P1-V', compte:'707 - Ventes', debit:0, credit:45, date_op:'2026-10-05', libelle:'x'}];
        D.comptes = [{id:'c1', nom:'CM', transactions:[{id:'t1', date_op:'05/10/2026', libelle:'x', credit:45, debit:0, rapproche:1, ecriture_piece:'P1', ecriture_pieces_json:'["P1"]'}]}];
        const r = rapprControlReport();
        capture(JSON.stringify({ ok: r.ok, ecart: r.equation.ecart, counts: r.counts }));`)
    );
    expect(r).toEqual({ ok: true, ecart: 0, counts: { anomalies: 0, waiting: 0, old: 0 } });
  });

  it("le panneau s'affiche dans la vue Rapprochement, avec le bouton « Défaire » sur les anomalies", () => {
    const html = loadAppAndRun(`${setup} capture(vRappr());`);
    expect(html).toContain("Contrôle de complétude");
    expect(html).toContain("annulerRapprochement('t_forc')");
    expect(html).toContain("Rapprochées sans écriture liée");
    expect(html).toContain("État de rapprochement");
  });
});

describe("clôture d'exercice : avertissement si le rapprochement est incomplet", () => {
  const close = (confirmAnswer: boolean) =>
    loadAppAndRunAsync(`
      td = () => '2026-10-11';
      hasPerm = () => true;
      loadTabData = async () => {};
      exerciceDiagnostics = () => ({ ecartJournal: 0, resultat: 0 });
      D.exercices = [{ id: 'exo1', libelle: '2025-2026', date_debut: '2025-07-01', date_fin: '2026-06-30', statut: 'actif' }];
      D.journal = [];
      D.comptes = [{ id: 'c1', nom: 'CM', transactions: [{ id: 't1', date_op: '10/10/2025', libelle: 'oubliée', credit: 10, debit: 0, rapproche: 0 }] }];
      var asked = '', updated = false;
      confirm = (m) => { asked = m; return ${confirmAnswer}; };
      alert = () => {}; closeModal = () => {}; render = () => {}; refreshCurrentExo = () => {};
      document.getElementById = () => null;
      SB = { from: () => ({ update: () => ({ eq: async () => { updated = true; return { error: null }; } }) }) };
      await finalizeExoClose('exo1');
      capture(JSON.stringify({ asked, updated }));
    `).then((v) => JSON.parse(v));

  it("demande confirmation et ne clôture pas si l'utilisateur refuse", async () => {
    const r = await close(false);
    expect(r.asked).toContain("Rapprochement bancaire incomplet");
    expect(r.asked).toContain("1 élément(s) non rapproché(s)");
    expect(r.updated).toBe(false);
  });

  it("clôture si l'utilisateur confirme malgré tout", async () => {
    const r = await close(true);
    expect(r.updated).toBe(true);
  });
});

// ─── Écritures rapides → miroir dans les onglets Achats / Ventes (sans doublon) ───

// Base de données en mémoire : assez de l'API du client (select/insert/update/delete + eq/in/single)
// pour exécuter saveEcr(), les synchronisations Achats/Ventes et les suppressions.
const FAKE_SB = `
  var DBT = { achats: [], factures: [], journal_comptable: [] };
  var FAIL = {};
  SB = { from: (t) => {
    const q = { op: 'select', filters: [], single: false, payload: null };
    const b = {
      select: () => b,
      insert: (p) => { q.op = 'insert'; q.payload = p; return b; },
      update: (p) => { q.op = 'update'; q.payload = p; return b; },
      delete: () => { q.op = 'delete'; return b; },
      eq: (c, v) => { q.filters.push((r) => r[c] === v); return b; },
      in: (c, vs) => { q.filters.push((r) => vs.includes(r[c])); return b; },
      order: () => b, limit: () => b, single: () => { q.single = true; return b; },
      then: (res, rej) => {
        const run = () => {
          if (FAIL[t + ':' + q.op]) return { data: null, error: { message: 'échec ' + t + ':' + q.op } };
          const rows = DBT[t]; const m = (r) => q.filters.every((f) => f(r));
          if (q.op === 'insert') { const arr = (Array.isArray(q.payload) ? q.payload : [q.payload]).map((x) => ({ ...x })); rows.push(...arr); return { data: q.single ? arr[0] : arr, error: null }; }
          if (q.op === 'update') { const hit = rows.filter(m); hit.forEach((r) => Object.assign(r, q.payload)); return { data: hit, error: null }; }
          if (q.op === 'delete') { DBT[t] = rows.filter((r) => !m(r)); return { data: [], error: null }; }
          const hit = rows.filter(m); return { data: q.single ? (hit[0] || null) : hit, error: null };
        };
        return Promise.resolve(run()).then(res, rej);
      },
    };
    return b; } };
`;

const QUICK_ENV = `
  requireWritePerm = () => true; requireExerciceActif = () => true; hasPerm = () => true;
  renderModal = () => {}; closeModal = () => {}; render = () => {}; notify = () => {}; setTimeout = () => 0;
  loadTabData = async () => {};
  var alerts = []; alert = (m) => { alerts.push(m); }; confirm = () => true;
  D.currentExo = { id: 'exo1' }; D.journal = []; D.achats = []; D.factures = [];
  ${FAKE_SB}
`;

describe("écritures rapides : miroir dans les onglets Achats / Ventes", () => {
  // Remplit la fenêtre comme le ferait l'utilisateur, puis enregistre.
  const quick = (type: string, vals: Record<string, string>, opts: { mirror?: boolean; setup?: string } = {}) =>
    loadAppAndRunAsync(`
      ${QUICK_ENV}
      ${opts.setup || ""}
      openEcritureType(${JSON.stringify(type)});
      const vals = Object.assign({ 'e-lib': UI.editObj.libelle, 'e-dat': '2026-10-08', 'e-pie': 'Q-1', 'e-cpt': UI.editObj.compte, 'e-cpt-ctr': UI.editObj.contrepartie }, ${JSON.stringify(vals)});
      document.getElementById = (id) => id === 'e-mir' ? { checked: ${opts.mirror !== false} } : (id in vals ? { value: vals[id] } : null);
      await saveEcr();
      capture(JSON.stringify({ achats: DBT.achats, factures: DBT.factures, journal: DBT.journal_comptable, alerts, dAchats: D.achats.length, dFactures: D.factures.length }));
    `).then((v) => JSON.parse(v));

  it("seuls les modèles qui correspondent à un achat ou à une vente ont un miroir", () => {
    const m = JSON.parse(
      loadAppAndRun(`capture(JSON.stringify(Object.fromEntries(Object.entries(ECRITURE_TYPES).filter(([k, t]) => t.miroir).map(([k, t]) => [k, t.miroir]))));`)
    );
    expect(m).toEqual({
      achat_fournisseur: { kind: "achat", categorie: "Fournitures" },
      achat_licence: { kind: "achat", categorie: "Licence" },
      achat_materiel_sportif: { kind: "achat", categorie: "Équipement" },
      achat_textile: { kind: "achat", categorie: "Textile" },
      petit_equipement: { kind: "achat", categorie: "Équipement" },
      produits_publicitaires: { kind: "achat", categorie: "Communication" },
      location: { kind: "achat", categorie: "Location" },
      deplacement: { kind: "achat", categorie: "Transport" },
      assurance: { kind: "achat", categorie: "Assurance" },
      facture_telecom: { kind: "achat", categorie: "Télécom" },
      communication: { kind: "achat", categorie: "Communication" },
      honoraires: { kind: "achat", categorie: "Honoraires" },
      repas_reception: { kind: "achat", categorie: "Réception" },
      sacem: { kind: "achat", categorie: "Redevances" },
      spre: { kind: "achat", categorie: "Redevances" },
      vente_equipement: { kind: "vente" },
      encaissement_stage: { kind: "vente" },
      buvette_manifestation: { kind: "vente" },
    });
  });

  it("la catégorie « Licence » existe pour les achats et pointe sur le compte 6281", () => {
    const out = JSON.parse(loadAppAndRun(`capture(JSON.stringify({ compte: achatCompteAuto('Licence'), autre: achatCompteAuto('Inconnue') }));`));
    expect(out.compte).toBe("6281 - Cotisations fédérales et licences");
    expect(out.autre).toBe("6580 - Charges diverses de gestion courante");
  });

  it("achat textile : crée l'achat (Payé) ET les écritures 6052/512, liées par source_id, sans écritures ACH-", async () => {
    const r = await quick("achat_textile", { "e-pie": "TXT-1", "e-mnt": "120", "e-mir-tiers": "Decathlon", "e-mir-mode": "CB" });
    expect(r.achats).toHaveLength(1);
    const a = r.achats[0];
    expect(a).toMatchObject({ fournisseur: "Decathlon", categorie: "Textile", montant: 120, mode_paiement: "CB", statut: "paye", date_op: "2026-10-08", piece: "TXT-1" });
    expect(r.journal.map((j: any) => [j.piece, j.compte, j.debit, j.credit])).toEqual([
      ["TXT-1-L1", "6052 - Achats de textile et tenues", 120, 0],
      ["TXT-1-L2", "512 - Banque", 0, 120],
    ]);
    expect(r.journal.every((j: any) => j.source_type === "ecriture_rapide" && j.source_id === a.id && j.source_logiciel === "gestion")).toBe(true);
    expect(r.journal.some((j: any) => String(j.piece).startsWith("ACH-"))).toBe(false);
    expect(r.dAchats).toBe(1);
  });

  it("vente équipement : crée la vente (Payée, 1 ligne) ET les écritures 512/707, numéro = max + 1", async () => {
    const r = await quick("vente_equipement", { "e-pie": "VTE-9", "e-mnt": "80", "e-mir-tiers": "M. Dupont" }, { setup: `D.factures = [{ id: 'old', numero: 'FAC-2026-007' }, { id: 'old2', numero: 'FAC-2025-099' }, { id: 'don', numero: 'DON-2026-001' }];` });
    expect(r.factures).toHaveLength(1);
    const f = r.factures[0];
    expect(f).toMatchObject({ numero: "FAC-2026-008", destinataire: "M. Dupont", statut: "Payée", date_op: "2026-10-08", objet: "Vente vêtements / équipements" });
    expect(f.lignes).toEqual([{ desc: "Vente vêtements / équipements", qte: 1, pu: 80 }]);
    expect(f.notes).toContain("Règlement : Virement");
    expect(r.journal.map((j: any) => [j.piece, j.compte, j.debit, j.credit])).toEqual([
      ["VTE-9-L1", "512 - Banque", 80, 0],
      ["VTE-9-L2", "707 - Ventes vêtements et équipements", 0, 80],
    ]);
    expect(r.journal.every((j: any) => j.source_id === f.id && j.source_type === "ecriture_rapide")).toBe(true);
    expect(r.journal.some((j: any) => String(j.piece).startsWith("VTE-") && /-(CLI|PRO)$/.test(j.piece))).toBe(false);
  });

  it("tiers non renseigné : « À préciser » plutôt qu'un enregistrement refusé", async () => {
    const r = await quick("achat_licence", { "e-mnt": "35" });
    expect(r.achats[0].fournisseur).toBe("À préciser");
    expect(r.achats[0].categorie).toBe("Licence");
  });

  it("case décochée : comportement d'avant (écritures seules, non marquées, aucun enregistrement)", async () => {
    const r = await quick("achat_textile", { "e-mnt": "120" }, { mirror: false });
    expect(r.achats).toEqual([]);
    expect(r.journal).toHaveLength(2);
    expect(r.journal.every((j: any) => !j.source_type && !j.source_id)).toBe(true);
  });

  it("un modèle sans miroir (frais bancaires) n'enregistre rien dans Achats/Ventes", async () => {
    const r = await quick("frais_bancaires", { "e-mnt": "4.5" });
    expect(r.achats).toEqual([]);
    expect(r.factures).toEqual([]);
    expect(r.journal).toHaveLength(2);
  });

  it("si l'enregistrement de l'onglet échoue : rien n'est créé du tout (ni écritures)", async () => {
    const r = await quick("achat_textile", { "e-mnt": "120" }, { setup: `FAIL['achats:insert'] = true;` });
    expect(r.journal).toEqual([]);
    expect(r.achats).toEqual([]);
    expect(r.alerts[0]).toContain("rien n'a été créé");
  });

  it("si les écritures échouent après coup : l'enregistrement de l'onglet est retiré (pas d'orphelin)", async () => {
    const r = await quick("achat_textile", { "e-mnt": "120" }, { setup: `FAIL['journal_comptable:insert'] = true;` });
    expect(r.journal).toEqual([]);
    expect(r.achats).toEqual([]);
    expect(r.dAchats).toBe(0);
    expect(r.alerts.length).toBe(1);
  });
});

describe("synchronisations Achats / Ventes : jamais de 2e série d'écritures", () => {
  const run = (code: string) =>
    loadAppAndRunAsync(`${QUICK_ENV} ${code}`).then((v) => JSON.parse(v));
  const tagged = (id: string) => `
    DBT.journal_comptable = [
      { id: 'q1', piece: 'Q-1-L1', compte: '6052 - Achats de textile et tenues', debit: 120, credit: 0, date_op: '2026-10-08', source_type: 'ecriture_rapide', source_id: '${id}', source_logiciel: 'gestion' },
      { id: 'q2', piece: 'Q-1-L2', compte: '512 - Banque', debit: 0, credit: 120, date_op: '2026-10-08', source_type: 'ecriture_rapide', source_id: '${id}', source_logiciel: 'gestion' },
    ];
    D.journal = DBT.journal_comptable.map((r) => ({ ...r }));`;
  const snap = `capture(JSON.stringify({ db: DBT.journal_comptable.map(r => [r.piece, r.debit, r.credit, r.date_op]), local: D.journal.map(r => [r.piece, r.debit, r.credit]) }));`;

  it("achat modifié depuis l'onglet : les écritures rapides suivent (montant, date), aucune écriture ACH- créée", async () => {
    const r = await run(`${tagged("A1")}
      await syncAchatJournal({ id: 'A1', montant: 150, date_op: '2026-10-09', statut: 'paye', categorie: 'Textile', fournisseur: 'X', mode_paiement: 'CB' });
      ${snap}`);
    expect(r.db).toEqual([["Q-1-L1", 150, 0, "2026-10-09"], ["Q-1-L2", 0, 150, "2026-10-09"]]);
    expect(r.local).toEqual([["Q-1-L1", 150, 0], ["Q-1-L2", 0, 150]]);
  });

  it("achat refusé ou ramené à 0 : les écritures rapides sont retirées (comme pour les écritures automatiques)", async () => {
    const refuse = await run(`${tagged("A1")}
      await syncAchatJournal({ id: 'A1', montant: 120, date_op: '2026-10-08', statut: 'refuse', categorie: 'Textile', fournisseur: 'X' });
      ${snap}`);
    expect(refuse.db).toEqual([]);
    const zero = await run(`${tagged("A1")}
      await syncAchatJournal({ id: 'A1', montant: 0, date_op: '2026-10-08', statut: 'paye', categorie: 'Textile', fournisseur: 'X' });
      ${snap}`);
    expect(zero.db).toEqual([]);
  });

  it("achat validé (bouton Valider) : pas de doublon non plus", async () => {
    const r = await run(`${tagged("A1")}
      await syncAchatJournal({ id: 'A1', montant: 120, date_op: '2026-10-08', statut: 'valide', categorie: 'Textile', fournisseur: 'X' });
      ${snap}`);
    expect(r.db).toHaveLength(2);
  });

  it("achat SANS écriture rapide : comportement inchangé (écritures ACH-…-CHG / -CTR)", async () => {
    const r = await run(`
      await syncAchatJournal({ id: 'abcdef123456', montant: 90, date_op: '2026-10-08', statut: 'paye', categorie: 'Textile', fournisseur: 'Y', mode_paiement: 'CB' });
      capture(JSON.stringify(DBT.journal_comptable.map(r => [r.piece, r.compte, r.debit, r.credit])));`);
    expect(r).toEqual([
      ["ACH-abcdef12-CHG", "6052 - Achats de textile et tenues", 90, 0],
      ["ACH-abcdef12-CTR", "512 - Banque", 0, 90],
    ]);
  });

  it("vente modifiée depuis l'onglet : les écritures rapides suivent le nouveau total, pas de 411/70x en plus", async () => {
    const r = await run(`${tagged("F1")}
      await syncVenteJournal({ id: 'F1', date_op: '2026-10-10', lignes: [{ desc: 'Kimono', qte: 2, pu: 45 }] });
      ${snap}`);
    expect(r.db).toEqual([["Q-1-L1", 90, 0, "2026-10-10"], ["Q-1-L2", 0, 90, "2026-10-10"]]);
  });

  it("vente SANS écriture rapide : comportement inchangé (411 / 70x)", async () => {
    const r = await run(`
      await syncVenteJournal({ id: 'fedcba987654', date_op: '2026-10-08', objet: 'Cours', lignes: [{ desc: 'Cours', qte: 1, pu: 60 }] });
      capture(JSON.stringify(DBT.journal_comptable.map(r => [r.piece, r.compte.split(' ')[0], r.debit, r.credit])));`);
    expect(r).toEqual([
      ["VTE-fedcba98-CLI", "411", 60, 0],
      ["VTE-fedcba98-PRO", "7061", 0, 60],
    ]);
  });

  it("suppression d'un achat / d'une vente : leurs écritures rapides sont supprimées avec", async () => {
    const a = await run(`${tagged("A1")}
      DBT.achats = [{ id: 'A1' }]; D.achats = [{ id: 'A1' }]; confirmModal = async () => true;
      await delAchat('A1');
      capture(JSON.stringify({ achats: DBT.achats.length, journal: DBT.journal_comptable.length, local: D.journal.length }));`);
    expect(a).toEqual({ achats: 0, journal: 0, local: 0 });
    const f = await run(`${tagged("F1")}
      DBT.factures = [{ id: 'F1' }]; D.factures = [{ id: 'F1' }]; confirmModal = async () => true;
      await delFac('F1');
      capture(JSON.stringify({ factures: DBT.factures.length, journal: DBT.journal_comptable.length }));`);
    expect(f).toEqual({ factures: 0, journal: 0 });
  });

  it("la suppression d'un autre achat ne touche pas les écritures rapides d'un autre enregistrement", async () => {
    const r = await run(`${tagged("A1")}
      DBT.achats = [{ id: 'A2' }]; D.achats = [{ id: 'A2' }]; confirmModal = async () => true;
      await delAchat('A2');
      capture(JSON.stringify(DBT.journal_comptable.length));`);
    expect(r).toBe(2);
  });
});

describe("fenêtre d'écriture rapide : champs du miroir", () => {
  const modal = (type: string) =>
    loadAppAndRunAsync(`
      requireWritePerm = () => true; setTimeout = () => 0;
      var lastDiv = null;
      document.querySelector = () => null;
      document.createElement = () => { lastDiv = { style: {}, classList: { add() {}, remove() {} }, addEventListener() {}, remove() {} }; return lastDiv; };
      document.body = { appendChild() {}, classList: { add() {}, remove() {} } };
      document.getElementById = (id) => id === 'app' ? { appendChild() {} } : null;
      openEcritureType(${JSON.stringify(type)});
      capture(lastDiv ? lastDiv.innerHTML : '');
    `);

  it("achat : case cochée par défaut, champ Fournisseur et mode de règlement", async () => {
    const html = await modal("achat_textile");
    expect(html).toContain('id="e-mir"');
    expect(html).toMatch(/id="e-mir"[^>]*checked/);
    expect(html).toContain("Enregistrer aussi dans l'onglet Achats");
    expect(html).toContain("Fournisseur (facultatif)");
    expect(html).toContain('id="e-mir-mode"');
    expect(html).toContain("pas de doublon");
  });

  it("vente : champ Client et onglet Ventes", async () => {
    const html = await modal("vente_equipement");
    expect(html).toContain("Enregistrer aussi dans l'onglet Ventes");
    expect(html).toContain("Client (facultatif)");
  });

  it("modèle sans miroir : aucun de ces champs", async () => {
    const html = await modal("frais_bancaires");
    expect(html).not.toContain('id="e-mir"');
  });
});

// ─── Boutons rapides du Journal : colonnes, nouveaux modèles, cohérence ───

describe("boutons rapides du Journal : colonnes et cohérence des modèles", () => {
  const data = JSON.parse(
    loadAppAndRun(`capture(JSON.stringify({
      types: Object.fromEntries(Object.entries(ECRITURE_TYPES).map(([k, t]) => [k, { label: t.label, lignes: t.lignes, miroir: t.miroir || null, hint: t.hint || '' }])),
      groupes: ECRITURE_GROUPES.map(g => ({ titre: g.titre, boutons: g.boutons })),
      plan: PLAN,
      cats: ACHAT_CATEGORIES,
      catComptes: Object.fromEntries(ACHAT_CATEGORIES.map(c => [c, achatCompteAuto(c)])),
    }));`)
  );
  const keys = Object.keys(data.types);

  it("chaque modèle a un bouton, dans exactement un groupe, et chaque bouton pointe un modèle existant", () => {
    const inGroups = data.groupes.flatMap((g: any) => g.boutons.map((b: any) => b[0]));
    expect(inGroups.filter((k: string) => !data.types[k])).toEqual([]);
    expect(keys.filter((k) => !inGroups.includes(k))).toEqual([]);
    expect(inGroups.length).toBe(new Set(inGroups).size);
  });

  it("4 colonnes thématiques", () => {
    expect(data.groupes.map((g: any) => g.titre)).toEqual(["Encaissements", "Achats & équipements", "Charges courantes", "Banque & trésorerie"]);
  });

  it("tous les comptes utilisés par les modèles existent dans le plan comptable (sinon la liste déroulante se prérempli de travers)", () => {
    const missing = keys.flatMap((k) => data.types[k].lignes.map((l: any) => l.compte).filter((c: string) => !data.plan.includes(c)).map((c: string) => `${k}: ${c}`));
    expect(missing).toEqual([]);
  });

  it("chaque modèle = 2 lignes, une au débit et une au crédit, sur deux comptes différents", () => {
    for (const k of keys) {
      const l = data.types[k].lignes;
      expect(l, k).toHaveLength(2);
      expect(l.map((x: any) => x.sens).sort(), k).toEqual(["credit", "debit"]);
      expect(l[0].compte, k).not.toBe(l[1].compte);
    }
  });

  it("les nouveaux modèles imputent les bons comptes", () => {
    const dc = (k: string) => {
      const l = data.types[k].lignes;
      return [l.find((x: any) => x.sens === "debit").compte.split(" ")[0], l.find((x: any) => x.sens === "credit").compte.split(" ")[0]];
    };
    expect(dc("licences_annexes")).toEqual(["512", "7562"]);
    expect(dc("buvette_manifestation")).toEqual(["512", "7080"]);
    expect(dc("pass_region")).toEqual(["512", "7088"]);
    expect(dc("remboursement_pass_region")).toEqual(["512", "7410"]);
    expect(dc("autre_encaissement")).toEqual(["512", "7580"]);
    expect(dc("petit_equipement")).toEqual(["6063", "512"]);
    expect(dc("produits_publicitaires")).toEqual(["6230", "512"]);
    expect(dc("autre_depense")).toEqual(["6580", "512"]);
    expect(dc("interets_livret")).toEqual(["5121", "768"]);
    expect(dc("remise_especes")).toEqual(["512", "5300"]);
    expect(dc("retrait_especes")).toEqual(["5300", "512"]);
    expect(dc("remboursement_emprunt")).toEqual(["1640", "512"]);
    expect(dc("encaissement_a_identifier")).toEqual(["512", "471"]);
    expect(dc("paiement_a_identifier")).toEqual(["471", "512"]);
  });

  it("les mouvements internes (transferts, espèces) ne touchent aucun compte de charge ou de produit", () => {
    for (const k of ["transfert_vers_epargne", "transfert_depuis_epargne", "remise_especes", "retrait_especes"]) {
      const classes = data.types[k].lignes.map((l: any) => l.compte[0]);
      expect(classes.every((c: string) => c === "5"), k).toBe(true);
    }
  });

  it("toute catégorie d'achat d'un miroir existe dans la liste du formulaire, et chaque catégorie (sauf « Autre ») a son compte", () => {
    for (const k of keys) {
      const m = data.types[k].miroir;
      if (m && m.kind === "achat") expect(data.cats, k).toContain(m.categorie);
    }
    for (const c of data.cats.filter((c: string) => c !== "Autre")) {
      expect(data.catComptes[c], c).not.toBe("6580 - Charges diverses de gestion courante");
    }
    // Chaque compte de catégorie existe dans le plan.
    for (const c of data.cats) expect(data.plan, c).toContain(data.catComptes[c]);
  });

  it("le Journal affiche les 4 colonnes et tous les boutons pour qui a le droit d'écriture", () => {
    const html = loadAppAndRun(`hasPerm = () => true; D.journal = []; capture(vJournal());`);
    for (const g of data.groupes) expect(html).toContain(g.titre.replace("&", "&amp;") === g.titre ? g.titre : g.titre.replace("&", "&amp;"));
    for (const k of keys) expect(html, k).toContain(`openEcritureType('${k}')`);
    expect(html).toContain("grid-template-columns:repeat(auto-fit,minmax(220px,1fr))");
    // Les boutons à miroir sont marqués ↗ et l'infobulle indique les comptes.
    expect(html).toContain("Débit 5121 · Crédit 768");
    expect(html).toMatch(/Textile \/ tenues ↗/);
    expect(html).not.toMatch(/Frais bancaires ↗/);
  });

  it("sans droit d'écriture : aucune écriture rapide (mais la page reste lisible)", () => {
    const html = loadAppAndRun(`hasPerm = () => false; D.journal = []; capture(vJournal());`);
    expect(html).not.toContain("Écritures rapides");
    expect(html).not.toContain("openEcritureType(");
    expect(html).toContain("Journal comptable");
  });

  it("les actions générales restent dans la barre (nouvelle écriture, assistant)", () => {
    const html = loadAppAndRun(`hasPerm = () => true; D.journal = []; capture(vJournal());`);
    expect(html).toContain("+ Nouvelle écriture");
    expect(html).toContain("Assistant déséquilibres");
  });
});

describe("nouveaux boutons : enregistrement réel", () => {
  const save = (type: string, amount = "100") =>
    loadAppAndRunAsync(`
      ${QUICK_ENV}
      openEcritureType(${JSON.stringify(type)});
      const vals = { 'e-lib': UI.editObj.libelle, 'e-dat': '2026-10-08', 'e-pie': 'N-1', 'e-cpt': UI.editObj.compte, 'e-cpt-ctr': UI.editObj.contrepartie, 'e-mnt': '${amount}' };
      document.getElementById = (id) => id === 'e-mir' ? { checked: false } : (id in vals ? { value: vals[id] } : null);
      await saveEcr();
      capture(JSON.stringify(DBT.journal_comptable.map(r => [r.compte.split(' ')[0], r.debit, r.credit])));
    `).then((v) => JSON.parse(v));

  it("intérêts du livret : 5121 débité, 768 crédité", async () => {
    expect(await save("interets_livret", "12.5")).toEqual([["5121", 12.5, 0], ["768", 0, 12.5]]);
  });
  it("remise d'espèces : 512 débité, 5300 crédité ; retrait : l'inverse", async () => {
    expect(await save("remise_especes", "250")).toEqual([["512", 250, 0], ["5300", 0, 250]]);
    expect(await save("retrait_especes", "250")).toEqual([["5300", 250, 0], ["512", 0, 250]]);
  });
  it("encaissement / paiement à identifier : passent par le compte d'attente 471", async () => {
    expect(await save("encaissement_a_identifier", "80")).toEqual([["512", 80, 0], ["471", 0, 80]]);
    expect(await save("paiement_a_identifier", "80")).toEqual([["471", 80, 0], ["512", 0, 80]]);
  });
  it("remboursement d'emprunt : 1640 débité (capital), 512 crédité", async () => {
    expect(await save("remboursement_emprunt", "400")).toEqual([["1640", 400, 0], ["512", 0, 400]]);
  });
  it("buvette : crée aussi la vente quand la case est cochée", async () => {
    const r = JSON.parse(
      await loadAppAndRunAsync(`
        ${QUICK_ENV}
        openEcritureType('buvette_manifestation');
        const vals = { 'e-lib': UI.editObj.libelle, 'e-dat': '2026-10-08', 'e-pie': 'B-1', 'e-cpt': UI.editObj.compte, 'e-cpt-ctr': UI.editObj.contrepartie, 'e-mnt': '320', 'e-mir-tiers': 'Tournoi du club' };
        document.getElementById = (id) => id === 'e-mir' ? { checked: true } : (id in vals ? { value: vals[id] } : null);
        await saveEcr();
        capture(JSON.stringify({ f: DBT.factures.map(f => [f.destinataire, f.statut, f.lignes[0].pu]), j: DBT.journal_comptable.map(r => [r.compte.split(' ')[0], r.debit, r.credit]) }));`)
    );
    expect(r.f).toEqual([["Tournoi du club", "Payée", 320]]);
    expect(r.j).toEqual([["512", 320, 0], ["7080", 0, 320]]);
  });
});

describe("date de début du rapprochement (RAPPR_DATE_DEBUT = 2025-07-01)", () => {
  const setup = `
    D.journal = [
      {id:'o1', piece:'OLD-1', compte:'512000', debit:50, credit:0, date_op:'2025-03-10', libelle:'Ancienne cotisation'},
      {id:'o2', piece:'OLD-1-COT', compte:'706000', debit:0, credit:50, date_op:'2025-03-10', libelle:'Ancienne cotisation'},
      {id:'n1', piece:'NEW-1', compte:'512000', debit:80, credit:0, date_op:'2025-07-01', libelle:'Cotisation récente'},
      {id:'n2', piece:'NEW-2', compte:'512000', debit:0, credit:20, date_op:'2026-01-05', libelle:'Achat'},
    ];
    D.comptes = [{nom:'CM', solde_initial:0, transactions:[
      {id:'t-old', date_op:'30/06/2025', date_valeur:'2025-06-30', libelle:'VIR ancien', debit:0, credit:50, rapproche:false},
      {id:'t-new', date_op:'01/07/2025', date_valeur:'2025-07-01', libelle:'VIR récent', debit:0, credit:80, rapproche:false},
    ]}];
  `;
  const run = (code: string) => JSON.parse(loadAppAndRun(`${setup} capture(JSON.stringify(${code}));`));

  it("la limite est le 1er juillet 2025 : la veille est ignorée, le jour même ne l'est pas (dates ISO ou JJ/MM/AAAA)", () => {
    expect(
      run(`['2025-06-30','2025-07-01','30/06/2025','01/07/2025','',null].map(rapprIgnoredDate)`)
    ).toEqual([true, false, true, false, false, false]);
  });

  it("les opérations bancaires antérieures sortent de la liste de travail", () => {
    expect(run(`rapprActiveTransactions().map(t => t.id)`)).toEqual(["t-new"]);
    expect(run(`rapprAllTransactions().length`)).toBe(2);
  });

  it("les écritures 512 antérieures ne sont plus proposées, sauf avec keepIgnored", () => {
    expect(run(`rapprPieceCandidates().map(c => c.piece)`)).toEqual(["NEW-2", "NEW-1"]);
    expect(run(`rapprPieceCandidates({includeAllAccounts:true}).map(c => c.piece).sort()`)).toEqual(["NEW-1", "NEW-2"]);
    expect(run(`rapprPieceCandidates({keepIgnored:true}).map(c => c.piece).sort()`)).toEqual(["NEW-1", "NEW-2", "OLD-1"]);
  });

  it("le contrôle de complétude ne compte plus ce qui est antérieur", () => {
    const r = run(`(function(){ const r = rapprControlReport(); return {
      pendingTx: r.pendingTx.map(t => t.id), pendingPieces: r.pendingPieces.map(p => p.piece), waiting: r.counts.waiting }; })()`);
    expect(r).toEqual({ pendingTx: ["t-new"], pendingPieces: ["NEW-2", "NEW-1"], waiting: 3 });
  });

  it("une borne d'exercice antérieure ne ramène pas les éléments ignorés", () => {
    expect(run(`rapprControlReport({from:'2024-01-01'}).pendingTx.map(t => t.id)`)).toEqual(["t-new"]);
  });

  it("l'état de rapprochement garde TOUTES les opérations : l'écart est inchangé et se décompose exactement", () => {
    const e = run(`rapprControlReport().equation`);
    expect(e.soldeBanque).toBe(130);
    expect(e.soldeCompta).toBe(110);
    expect(e.ecart).toBe(20);
    expect(e.unrecTx).toBe(130);
    expect(e.unrecTxIgnored).toBe(50);
    expect(e.unrecPieces).toBe(-110);
    expect(e.unrecPiecesIgnored).toBe(-50);
    expect(e.autres).toBe(0);
  });

  it("l'écran affiche l'information et détaille les éléments ignorés dans l'état de rapprochement", () => {
    const html: string = JSON.parse(
      loadAppAndRun(`${setup} capture(JSON.stringify(vRappr() + rapprControlHtml(rapprControlReport())));`)
    );
    expect(html).toContain("antérieures au 01/07/2025 sont ignorées du rapprochement");
    expect(html).toContain("1 opération(s) bancaire(s) et 1 écriture(s) 512 mises de côté");
    expect(html).toContain("opérations bancaires ignorées (avant le 01/07/2025)");
    expect(html).toContain("écritures 512 ignorées (avant le 01/07/2025");
    // seule l'opération récente est listée dans le tableau de travail
    expect(html).toContain("VIR récent");
    expect(html).not.toContain("VIR ancien");
  });

  it("le résumé des éléments mis de côté, et les écritures 512 en attente du tableau de bord", () => {
    expect(run(`rapprIgnoredSummary()`)).toEqual({ tx: 1, pieces: 1 });
    expect(run(`pendingBankPieces().map(j => j.id)`)).toEqual(["n1", "n2"]);
  });
});
