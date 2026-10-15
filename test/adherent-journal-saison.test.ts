// Tests des pièces d'adhésion par saison (Adhérents › enregistrement, public/assets/app.js).
//
// Contexte : un adhérent garde le même id d'une saison à l'autre. Avant ce correctif,
// syncAdherentJournal supprimait puis recréait ADH-<id>-ENC/-COT/-PAS à chaque enregistrement :
// la pièce de la saison précédente disparaissait du journal dès que la fiche était enregistrée
// pour la nouvelle saison (virement 2025-2026 rattaché à une pièce 2026-2027, etc.).
//
// Même principe que rapprochement.test.ts : app.js est chargé tel quel dans un bac à sable node:vm
// et on appelle les VRAIES fonctions de production, avec un faux client SB en mémoire.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appJsSource = readFileSync(path.join(__dirname, "../public/assets/app.js"), "utf8");

async function loadAppAndRun(driverCode: string): Promise<any> {
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
  // Le pilote est asynchrone (syncAdherentJournal l'est) : on attend sa fin avant de lire le résultat.
  await vm.runInContext(appJsSource + "\n;(async function(){\n" + driverCode + "\n})();", sandbox, {
    filename: "app.js (sandbox test)",
  });
  return captured;
}

// Faux SB en mémoire + deux exercices (2025-2026 et 2026-2027) + un adhérent déjà comptabilisé en 2025-2026.
const PRELUDE = `
  D.exercices=[
    {id:'EXO2526',date_debut:'2025-07-01',date_fin:'2026-06-30',statut:'archive'},
    {id:'EXO2627',date_debut:'2026-07-01',date_fin:'2027-06-30',statut:'actif'}
  ];
  D.currentExo=D.exercices[1];
  D.journal=[
    {id:'old1',date_op:'2025-10-11',piece:'ADH-b0cd371f-ENC',compte:'512 - Banque',debit:250,credit:0,exercice_id:'EXO2526'},
    {id:'old2',date_op:'2025-10-11',piece:'ADH-b0cd371f-COT',compte:'7561 - Cotisations membres actifs',debit:0,credit:250,exercice_id:'EXO2526'}
  ];
  SB={from:()=>({
    delete:()=>({in:async(col,ids)=>({error:null})}),
    insert:(rows)=>({select:async()=>({data:rows.map(r=>({...r}))})})
  })};
  const adh=(over)=>({id:'b0cd371f-0000-0000-0000-000000000000',nom:'ARAGON',prenom:'Benjamin',
    paiement:'Virement',cotisation:250,pass_region:false,exercice_id:'EXO2526',...over});
  const dump=()=>JSON.stringify(D.journal.map(j=>[j.piece,j.date_op,j.exercice_id,j.debit,j.credit]));
`;

describe("pièces d'adhésion : une série par saison", () => {
  it("enregistrer la fiche pour 2026-2027 ne supprime pas la pièce 2025-2026", async () => {
    const out = await loadAppAndRun(`${PRELUDE}
      await syncAdherentJournal(adh({date_inscription:'2026-08-05'}));
      capture(dump());
    `);
    const rows: any[][] = JSON.parse(out);
    // saison 2025-2026 intacte (ancienne pièce sans jeton de saison)
    expect(rows).toContainEqual(["ADH-b0cd371f-ENC", "2025-10-11", "EXO2526", 250, 0]);
    expect(rows).toContainEqual(["ADH-b0cd371f-COT", "2025-10-11", "EXO2526", 0, 250]);
    // saison 2026-2027 : nouvelles pièces datées de l'inscription, dans l'exercice de leur date
    expect(rows).toContainEqual(["ADH-b0cd371f-S2627-ENC", "2026-08-05", "EXO2627", 250, 0]);
    expect(rows).toContainEqual(["ADH-b0cd371f-S2627-COT", "2026-08-05", "EXO2627", 0, 250]);
    expect(rows).toHaveLength(4);
  });

  it("l'exercice de la ligne suit la date d'inscription, pas l'exercice d'origine de la fiche", async () => {
    const out = await loadAppAndRun(`${PRELUDE}
      await syncAdherentJournal(adh({date_inscription:'2026-08-05',exercice_id:'EXO2526'}));
      capture(JSON.stringify(D.journal.filter(j=>j.piece.includes('S2627')).map(j=>j.exercice_id)));
    `);
    expect(JSON.parse(out)).toEqual(["EXO2627", "EXO2627"]);
  });

  it("réenregistrer la même saison remplace ses pièces sans doublon", async () => {
    const out = await loadAppAndRun(`${PRELUDE}
      const fresh=[];
      SB={from:()=>({
        delete:()=>({in:async(col,ids)=>({error:null})}),
        insert:(rows)=>({select:async()=>({data:rows.map(r=>({...r}))})})
      })};
      await syncAdherentJournal(adh({date_inscription:'2026-08-05',cotisation:250}));
      await syncAdherentJournal(adh({date_inscription:'2026-08-05',cotisation:275}));
      capture(dump());
    `);
    const rows: any[][] = JSON.parse(out);
    const s2627 = rows.filter((r) => String(r[0]).includes("S2627"));
    expect(s2627).toHaveLength(2);
    expect(s2627).toContainEqual(["ADH-b0cd371f-S2627-ENC", "2026-08-05", "EXO2627", 275, 0]);
    expect(rows.filter((r) => r[2] === "EXO2526")).toHaveLength(2);
  });

  it("une ancienne pièce sans saison est recalculée si elle appartient à la même saison", async () => {
    const out = await loadAppAndRun(`${PRELUDE}
      await syncAdherentJournal(adh({date_inscription:'2025-10-11',cotisation:260}));
      capture(dump());
    `);
    const rows: any[][] = JSON.parse(out);
    expect(rows.some((r) => r[0] === "ADH-b0cd371f-ENC")).toBe(false); // ancienne pièce 2025-2026 remplacée
    expect(rows).toContainEqual(["ADH-b0cd371f-S2526-ENC", "2025-10-11", "EXO2526", 260, 0]);
  });

  it("une inscription web d'une autre saison n'empêche pas la comptabilisation de la saison en cours", async () => {
    const out = await loadAppAndRun(`${PRELUDE}
      D.journal.push({id:'w1',date_op:'2025-09-12',piece:'ADH-b0cd371f-CLI',compte:'411 - Adhérents et clients',debit:250,credit:0,
        exercice_id:'EXO2526',source_logiciel:'inscription-web',source_id:'b0cd371f-0000-0000-0000-000000000000'});
      await syncAdherentJournal(adh({date_inscription:'2026-08-05'}));
      capture(JSON.stringify(D.journal.filter(j=>j.piece.includes('S2627')).length));
    `);
    expect(JSON.parse(out)).toBe(2);
  });

  it("normalizePieceGroupKey regroupe ENC/COT/PAS d'une même saison, anciennes pièces inchangées", async () => {
    const out = await loadAppAndRun(`
      capture(JSON.stringify([
        normalizePieceGroupKey('ADH-b0cd371f-S2627-ENC'),
        normalizePieceGroupKey('ADH-b0cd371f-S2627-COT'),
        normalizePieceGroupKey('ADH-b0cd371f-ENC'),
        normalizePieceGroupKey('ACH-2afd3ab8-CHG'),
        normalizePieceGroupKey('REG-95eec00c')
      ]));
    `);
    expect(JSON.parse(out)).toEqual([
      "ADH-b0cd371f-S2627",
      "ADH-b0cd371f-S2627",
      "ADH-b0cd371f",
      "ACH-2afd3ab8",
      "REG-95eec00c",
    ]);
  });
});
