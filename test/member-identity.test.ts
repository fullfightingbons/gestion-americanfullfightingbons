// Identité d'un adhérent dans l'espace membre quand plusieurs personnes
// partagent la même adresse e-mail (père et fils, fratrie sur l'adresse d'un
// parent). Voir src/lib/member-identity.ts.

import { describe, expect, it } from "vitest";
import {
  groupByPerson,
  isSamePerson,
  latestRowPerPerson,
  loadMemberPersonRows,
  normalizeBirthDate,
  normalizeNamePart,
  personRowIds,
  pickAccountHolder,
  selectPersonRows,
  sqlPlaceholders,
  type D1Like,
} from "../src/lib/member-identity";

const row = (id: string, prenom: string, naissance: string | null, date_inscription: string, extra: Record<string, unknown> = {}) => ({
  id, prenom, naissance, date_inscription, created_at: date_inscription, nom: "MARTIN", email: "famille@example.fr", ...extra,
});

// Père (1980) et fils (2012) sur la même adresse, deux saisons chacun.
const pere2425 = row("p-24", "Marc", "1980-03-04", "2024-09-10");
const pere2526 = row("p-25", "Marc", "1980-03-04", "2025-09-12");
const fils2425 = row("f-24", "Lucas", "2012-07-21", "2024-09-10");
const fils2526 = row("f-25", "Lucas", "2012-07-21", "2025-09-15"); // inscrit en dernier : c'est lui que l'ancienne requête renvoyait pour tout le monde

describe("normalisation", () => {
  it("prénoms : sans accents, casse, tirets ni espaces", () => {
    expect(normalizeNamePart("Jean-Pierre")).toBe("jeanpierre");
    expect(normalizeNamePart(" jean pierre ")).toBe("jeanpierre");
    expect(normalizeNamePart("Zoé")).toBe(normalizeNamePart("ZOE"));
    expect(normalizeNamePart(null)).toBe("");
  });

  it("naissance : accepte AAAA-MM-JJ, un horodatage ISO et JJ/MM/AAAA", () => {
    expect(normalizeBirthDate("2012-07-21")).toBe("2012-07-21");
    expect(normalizeBirthDate("2012-07-21T00:00:00.000Z")).toBe("2012-07-21");
    expect(normalizeBirthDate("21/07/2012")).toBe("2012-07-21");
    expect(normalizeBirthDate("")).toBe("");
    expect(normalizeBirthDate(null)).toBe("");
  });
});

describe("isSamePerson()", () => {
  it("père et fils (naissances et prénoms différents) : deux personnes", () => {
    expect(isSamePerson(pere2526, fils2526)).toBe(false);
  });

  it("même personne d'une saison à l'autre : oui, même avec une autre casse/accents sur le prénom", () => {
    expect(isSamePerson(pere2425, pere2526)).toBe(true);
    expect(isSamePerson({ id: "a", prenom: "Zoé", naissance: "2010-01-01" }, { id: "b", prenom: "zoe", naissance: "2010-01-01" })).toBe(true);
  });

  it("deux frères portant le même prénom mais nés à des dates différentes : deux personnes", () => {
    expect(isSamePerson({ id: "a", prenom: "Jean", naissance: "1975-05-05" }, { id: "b", prenom: "Jean", naissance: "2009-02-02" })).toBe(false);
  });

  it("date de naissance manquante d'un côté : on se fie au prénom", () => {
    expect(isSamePerson({ id: "a", prenom: "Marc", naissance: null }, pere2526)).toBe(true);
    expect(isSamePerson({ id: "a", prenom: "Lucas", naissance: null }, pere2526)).toBe(false);
  });

  it("coquille d'une lettre sur un prénom d'au moins 5 lettres : même personne (historique conservé)", () => {
    expect(isSamePerson({ id: "a", prenom: "Mathis", naissance: "2011-04-02" }, { id: "b", prenom: "Matis", naissance: "2011-04-02" })).toBe(true);
  });

  it("jumeaux (même naissance, prénoms proches mais distincts) : deux personnes", () => {
    expect(isSamePerson({ id: "a", prenom: "Lucas", naissance: "2012-07-21" }, { id: "b", prenom: "Louis", naissance: "2012-07-21" })).toBe(false);
    expect(isSamePerson({ id: "a", prenom: "Léo", naissance: "2012-07-21" }, { id: "b", prenom: "Léa", naissance: "2012-07-21" })).toBe(false);
  });
});

describe("selectPersonRows() / groupByPerson() / latestRowPerPerson()", () => {
  const all = [fils2526, pere2526, fils2425, pere2425]; // ordre « plus récent d'abord » de la requête

  it("ne garde que les saisons de la personne du profil actif", () => {
    expect(selectPersonRows(pere2425, all).map((r) => r.id)).toEqual(["p-25", "p-24"]);
    expect(selectPersonRows(fils2425, all).map((r) => r.id)).toEqual(["f-25", "f-24"]);
  });

  it("la fiche d'ancrage reste toujours incluse, même si rien d'autre ne lui ressemble", () => {
    const orphan = { id: "x", prenom: "Autre", naissance: "1990-01-01" };
    expect(selectPersonRows(orphan, all).map((r) => r.id)).toEqual([]);
    expect(selectPersonRows(orphan, [...all, orphan]).map((r) => r.id)).toEqual(["x"]);
  });

  it("adresse portée par une seule personne : toutes ses lignes, comme avant", () => {
    const seule = [pere2526, pere2425];
    expect(selectPersonRows(pere2425, seule).map((r) => r.id)).toEqual(["p-25", "p-24"]);
  });

  it("groupByPerson sépare les personnes ; latestRowPerPerson garde la saison la plus récente de chacune", () => {
    expect(groupByPerson(all).map((g) => g.map((r) => r.id))).toEqual([["f-25", "f-24"], ["p-25", "p-24"]]);
    expect(latestRowPerPerson([pere2425, fils2425, pere2526, fils2526]).map((r) => r.id).sort()).toEqual(["f-25", "p-25"]);
  });

  it("deux enfants partageant l'adresse du parent restent deux profils distincts", () => {
    const a = row("a-25", "Emma", "2014-02-02", "2025-09-10");
    const b = row("b-25", "Noé", "2016-11-30", "2025-09-20"); // le plus récent : écrasait Emma dans l'ancien dédoublonnage par e-mail
    expect(latestRowPerPerson([a, b]).map((r) => r.id).sort()).toEqual(["a-25", "b-25"]);
  });
});

describe("pickAccountHolder() — qui ancre le compte d'une adresse partagée", () => {
  it("le père (le plus âgé), pas le fils, quelle que soit la fiche inscrite en dernier", () => {
    expect(pickAccountHolder([fils2526, fils2425, pere2526, pere2425])?.id).toBe("p-25");
    expect(pickAccountHolder([pere2425, fils2425])?.id).toBe("p-24");
  });

  it("une date de naissance connue passe avant une date inconnue", () => {
    const sansDate = row("s-1", "Zoe", null, "2020-01-01");
    expect(pickAccountHolder([sansDate, fils2425])?.id).toBe("f-24");
  });

  it("sans aucune date de naissance : la personne inscrite depuis le plus longtemps", () => {
    const a = row("a", "Anne", null, "2023-09-01");
    const b = row("b", "Bruno", null, "2021-09-01");
    expect(pickAccountHolder([a, b])?.id).toBe("b");
  });

  it("une seule personne : sa fiche la plus récente (comportement inchangé) ; aucune : null", () => {
    expect(pickAccountHolder([pere2425, pere2526])?.id).toBe("p-25");
    expect(pickAccountHolder([])).toBeNull();
  });
});

describe("loadMemberPersonRows() — lecture des fiches d'une personne", () => {
  // Faux D1 : renvoie les lignes dont l'e-mail correspond, dans l'ordre fourni.
  const fakeDb = (rows: Array<Record<string, any>>): D1Like & { calls: Array<{ sql: string; args: unknown[] }> } => {
    const calls: Array<{ sql: string; args: unknown[] }> = [];
    return {
      calls,
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          all: async <T,>() => {
            calls.push({ sql, args });
            return { results: rows.filter((r) => String(r.email).trim().toLowerCase() === args[0]) as unknown as T[] };
          },
        }),
      }),
    };
  };
  const rows = [fils2526, pere2526, fils2425, pere2425];

  it("compte du père : seulement les saisons du père (avant : les 4 lignes, donc le fils en tête)", async () => {
    const db = fakeDb(rows);
    const out = await loadMemberPersonRows(db, { adherent_id: "p-24", email: "Famille@Example.fr ", prenom: "Marc", naissance: "1980-03-04" });
    expect(out.map((r) => r.id)).toEqual(["p-25", "p-24"]);
    expect(db.calls[0].args).toEqual(["famille@example.fr"]);
  });

  it("vue tuteur sur le fils : l'e-mail de la fiche de l'enfant sert de clé, et seules ses saisons reviennent", async () => {
    const db = fakeDb(rows);
    const out = await loadMemberPersonRows(db, {
      adherent_id: "f-24", isGuardianView: true, email: "autre@example.fr", adherent_email: "famille@example.fr", prenom: "Lucas", naissance: "2012-07-21",
    });
    expect(out.map((r) => r.id)).toEqual(["f-25", "f-24"]);
  });

  it("e-mail de la fiche modifié depuis l'activation : aucune ligne d'une autre personne ne remonte", async () => {
    const db = fakeDb(rows);
    const out = await loadMemberPersonRows(db, { adherent_id: "z-1", email: "famille@example.fr", prenom: "Zoé", naissance: "2005-01-01" });
    expect(out).toEqual([]); // l'appelant retombe sur la fiche d'ancrage
  });

  it("pas d'e-mail (enfant sans adresse) : aucune requête, aucune ligne", async () => {
    const db = fakeDb(rows);
    expect(await loadMemberPersonRows(db, { adherent_id: "f-24", isGuardianView: true, adherent_email: "" })).toEqual([]);
    expect(db.calls).toHaveLength(0);
  });
});

describe("personRowIds() / sqlPlaceholders()", () => {
  it("ajoute toujours la fiche d'ancrage, sans doublon", () => {
    expect(personRowIds({ adherent_id: "p-24" }, [{ id: "p-25" }, { id: "p-24" }])).toEqual(["p-25", "p-24"]);
    expect(personRowIds({ adherent_id: "p-24" }, [])).toEqual(["p-24"]);
    expect(personRowIds({ adherent_id: "p-24" }, [{ id: "x" }])).toEqual(["x", "p-24"]);
  });

  it("reste sous la limite de 100 paramètres liés de D1", () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ id: `r${i}` }));
    expect(personRowIds({ adherent_id: "r0" }, many).length).toBeLessThanOrEqual(90);
  });

  it("génère « (?,?,?) »", () => {
    expect(sqlPlaceholders(3)).toBe("(?,?,?)");
    expect(sqlPlaceholders(1)).toBe("(?)");
    expect(sqlPlaceholders(0)).toBe("(?)");
  });
});
