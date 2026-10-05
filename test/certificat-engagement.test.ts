import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCertificatEnAttenteEmailHtml,
  certificatEngagementRappelDue,
  checkCertificatsEnAttente,
  parseCertificatRappelIntervalDays,
  readCertificatEngagement,
  seasonLabelFromDate,
} from "../src/index";

const PORTAL = "https://espace-membre.americanfullfightingbons.fr";

// Dossier tel que l'écrit le worker `inscription` quand la case d'engagement est cochée.
function dossier(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    health: { qsSport: { chestPain: "yes" }, certificateCommitment: true, certificateCommitmentAt: "2026-10-04T14:00:00.000Z" },
    computedTotals: { certificateRequired: true, certificateDeferred: true },
    ...over,
  });
}
const ADHERENT_2026 = { date_fin_adhesion: "2027-06-30", date_inscription: "2026-10-04" };

describe("saison (juillet → juin), miroir du front", () => {
  it("rattache septembre→juin à la même saison, et juin à la précédente", () => {
    expect(seasonLabelFromDate("2026-09-08")).toBe("2026-2027");
    expect(seasonLabelFromDate("2027-06-30")).toBe("2026-2027");
    expect(seasonLabelFromDate("2026-06-30")).toBe("2025-2026");
    expect(seasonLabelFromDate("2026-07-01")).toBe("2026-2027");
  });
  it("renvoie une chaîne vide si la date est absente ou illisible", () => {
    expect(seasonLabelFromDate("")).toBe("");
    expect(seasonLabelFromDate(null)).toBe("");
    expect(seasonLabelFromDate("pas une date")).toBe("");
  });
});

describe("délai entre rappels (club_info)", () => {
  it("accepte un entier de 1 à 60", () => {
    expect(parseCertificatRappelIntervalDays("3")).toBe(3);
    expect(parseCertificatRappelIntervalDays(" 14 ")).toBe(14);
    expect(parseCertificatRappelIntervalDays("60")).toBe(60);
  });
  it("retombe sur 7 jours pour toute valeur absente, nulle, négative, décimale ou hors bornes", () => {
    for (const bad of [undefined, null, "", "0", "-3", "2.5", "abc", "61", "9999"]) {
      expect(parseCertificatRappelIntervalDays(bad)).toBe(7);
    }
  });
});

describe("readCertificatEngagement", () => {
  const reg = (over: Record<string, unknown> = {}) => ({
    id: "reg-1", dossier_json: dossier(), mineur: 0,
    submitted_at: "2026-10-04T13:59:00.000Z", created_at: "2026-10-04T13:58:00.000Z", exercice_date_fin: "2027-06-30", ...over,
  });

  it("reconnaît un engagement de la saison de la fiche, daté du moment où la case a été cochée", () => {
    expect(readCertificatEngagement(reg(), ADHERENT_2026)).toEqual({
      registrationId: "reg-1", engagedAt: "2026-10-04T14:00:00.000Z", mineur: false,
    });
  });
  it("signale un dossier de mineur", () => {
    expect(readCertificatEngagement(reg({ mineur: 1 }), ADHERENT_2026)?.mineur).toBe(true);
  });
  it("se rabat sur la date de dépôt si l'horodatage d'engagement manque", () => {
    const r = reg({ dossier_json: dossier({ health: { certificateCommitment: true } }) });
    expect(readCertificatEngagement(r, ADHERENT_2026)?.engagedAt).toBe("2026-10-04T13:59:00.000Z");
  });
  it("accepte un dossier déjà parsé (objet)", () => {
    const r = reg({ dossier_json: JSON.parse(dossier()) });
    expect(readCertificatEngagement(r, ADHERENT_2026)).not.toBeNull();
  });
  it("ignore une inscription sans engagement (pièce jointe fournie, ou certificat non exigé)", () => {
    const r = reg({ dossier_json: dossier({ computedTotals: { certificateRequired: true, certificateDeferred: false } }) });
    expect(readCertificatEngagement(r, ADHERENT_2026)).toBeNull();
    expect(readCertificatEngagement(reg({ dossier_json: JSON.stringify({ computedTotals: {} }) }), ADHERENT_2026)).toBeNull();
  });
  it("ignore un engagement d'une saison passée (renouvellement groupé : « Certificat » remis à zéro sans nouvelle inscription)", () => {
    const old = reg({ exercice_date_fin: "2026-06-30", submitted_at: "2025-10-02T10:00:00.000Z" });
    expect(readCertificatEngagement(old, ADHERENT_2026)).toBeNull();
  });
  it("ne plante pas sur un dossier_json illisible ou une inscription absente", () => {
    expect(readCertificatEngagement(reg({ dossier_json: "{pas du json" }), ADHERENT_2026)).toBeNull();
    expect(readCertificatEngagement(null, ADHERENT_2026)).toBeNull();
  });
});

describe("cadence des rappels (par jour calendaire)", () => {
  const engaged = "2026-10-04T14:00:00.000Z";
  it("1er rappel : 7 jours après l'engagement, pas avant", () => {
    expect(certificatEngagementRappelDue(engaged, null, new Date("2026-10-10T06:00:00Z"), 7)).toBe(false);
    expect(certificatEngagementRappelDue(engaged, null, new Date("2026-10-11T06:00:00Z"), 7)).toBe(true);
  });
  it("rappels suivants : 7 jours après le dernier envoi, même si le cron part quelques secondes plus tôt que la semaine d'avant", () => {
    const last = "2026-10-11T06:00:05.000Z";
    expect(certificatEngagementRappelDue(engaged, last, new Date("2026-10-17T06:00:00Z"), 7)).toBe(false);
    expect(certificatEngagementRappelDue(engaged, last, new Date("2026-10-18T06:00:00Z"), 7)).toBe(true);
  });
  it("jamais deux envois le même jour (lancement manuel après le cron)", () => {
    expect(certificatEngagementRappelDue(engaged, "2026-10-11T06:00:05.000Z", new Date("2026-10-11T15:00:00Z"), 7)).toBe(false);
  });
  it("respecte un délai personnalisé", () => {
    expect(certificatEngagementRappelDue(engaged, null, new Date("2026-10-07T06:00:00Z"), 3)).toBe(true);
    expect(certificatEngagementRappelDue(engaged, null, new Date("2026-10-06T06:00:00Z"), 3)).toBe(false);
  });
  it("n'envoie rien si la date de référence est illisible", () => {
    expect(certificatEngagementRappelDue("n'importe quoi", null, new Date("2026-12-01T06:00:00Z"), 7)).toBe(false);
  });
});

describe("e-mail de rappel", () => {
  const adult = buildCertificatEnAttenteEmailHtml({ prenom: "Laurent", nom: "Martin", mineur: false, engagementFr: "04/10/2026", portalUrl: PORTAL });

  it("rappelle l'engagement pris, sa date, et la conséquence : accès aux entraînements refusé", () => {
    expect(adult).toContain("Bonjour Laurent,");
    expect(adult).toContain("le 04/10/2026");
    expect(adult).toContain("engagé(e) à fournir votre certificat médical au plus vite");
    expect(adult).toContain("l'accès aux entraînements vous sera refusé");
  });
  it("renvoie vers l'espace membre (+ activation pour qui n'a pas de compte) sans « // » parasite", () => {
    expect(adult).toContain(`href="${PORTAL}"`);
    expect(adult).toContain(`href="${PORTAL}/activer"`);
    const slash = buildCertificatEnAttenteEmailHtml({ prenom: "A", mineur: false, engagementFr: "x", portalUrl: `${PORTAL}/` });
    expect(slash).not.toContain(`${PORTAL}//`);
  });
  it("précise que le rappel s'arrête à la validation et qu'on peut ignorer le message si la pièce est déjà transmise", () => {
    expect(adult).toContain("s'arrête automatiquement dès que le certificat est validé");
    expect(adult).toContain("Si vous l'avez déjà transmis");
  });
  it("parle de l'enfant pour un mineur (l'e-mail de la fiche est celui du responsable)", () => {
    const minor = buildCertificatEnAttenteEmailHtml({ prenom: "Léa", nom: "Dupont", mineur: true, engagementFr: "04/10/2026", portalUrl: PORTAL });
    expect(minor).toContain("<strong>Léa Dupont</strong>");
    expect(minor).toContain("son certificat médical");
    expect(minor).toContain("l'accès aux entraînements lui sera refusé");
    expect(minor).not.toContain("Bonjour Léa");
  });
  it("retombe sur l'URL par défaut du portail", () => {
    expect(buildCertificatEnAttenteEmailHtml({ prenom: "A", mineur: false, engagementFr: "x", portalUrl: "" })).toContain(`href="${PORTAL}"`);
  });
  it("échappe prénom et nom (aucune injection HTML)", () => {
    const evil = buildCertificatEnAttenteEmailHtml({ prenom: "<img src=x onerror=alert(1)>", nom: "<b>", mineur: true, engagementFr: "x", portalUrl: PORTAL });
    expect(evil).not.toContain("<img");
    expect(evil).not.toContain("<b>");
  });
});

// ── Cron : base D1 et Brevo simulés ──────────────────────────────────────────
describe("checkCertificatsEnAttente (cron)", () => {
  type Cand = { id: string; prenom: string; nom: string; email: string; date_fin_adhesion: string; date_inscription: string };
  const cand = (id: string, over: Partial<Cand> = {}): Cand => ({
    id, prenom: "Laurent", nom: "MARTIN", email: `${id}@example.com`, date_fin_adhesion: "2027-06-30", date_inscription: "2026-10-04", ...over,
  });
  const REG = { id: "reg-1", dossier_json: dossier(), mineur: 0, submitted_at: "2026-10-04T13:59:00.000Z", created_at: "2026-10-04T13:58:00.000Z", exercice_date_fin: "2027-06-30" };

  function makeEnv(opts: { candidates: Cand[]; regs?: Record<string, unknown>; last?: Record<string, string | null>; interval?: string | null; brevoKey?: string }) {
    const inserts: unknown[][] = [];
    const env: any = {
      BREVO_API_KEY: opts.brevoKey ?? "key",
      DB: {
        prepare(sql: string) {
          let binds: unknown[] = [];
          const stmt: any = {
            bind(...args: unknown[]) { binds = args; return stmt; },
            async first() {
              if (/certificat_rappel_intervalle_jours/.test(sql)) return opts.interval === null ? null : { valeur: opts.interval ?? "7" };
              if (/FROM inscriptions_publiques r\s+LEFT JOIN exercices/.test(sql)) return (opts.regs ?? {})[String(binds[0])] ?? REG;
              if (/MAX\(envoye_at\)/.test(sql)) return { last: (opts.last ?? {})[String(binds[0])] ?? null };
              return null;
            },
            async all() { return { results: opts.candidates }; },
            async run() { if (/INSERT INTO certificat_engagement_rappels/.test(sql)) inserts.push(binds); return { success: true }; },
          };
          return stmt;
        },
      },
    };
    return { env, inserts };
  }

  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T06:00:00Z"));
    fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("envoie le 1er rappel 7 jours après l'engagement et l'enregistre", async () => {
    const { env, inserts } = makeEnv({ candidates: [cand("a1")] });
    const r = await checkCertificatsEnAttente(env);
    expect(r).toMatchObject({ checked: 1, sent: 1, skipped: 0, errors: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(body.to[0].email).toBe("a1@example.com");
    expect(body.subject).toBe("Certificat médical à fournir — Laurent MARTIN");
    expect(body.htmlContent).toContain("le 04/10/2026");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].slice(1)).toEqual(["a1", "reg-1"]);
  });

  it("n'envoie rien avant le délai", async () => {
    vi.setSystemTime(new Date("2026-10-09T06:00:00Z"));
    const { env, inserts } = makeEnv({ candidates: [cand("a1")] });
    const r = await checkCertificatsEnAttente(env);
    expect(r).toMatchObject({ sent: 0, skipped: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it("n'envoie rien si un rappel est déjà parti aujourd'hui, et relance 7 jours après le dernier", async () => {
    const sameDay = makeEnv({ candidates: [cand("a1")], last: { a1: "2026-10-11T05:59:00Z" } });
    expect((await checkCertificatsEnAttente(sameDay.env)).sent).toBe(0);

    const weekLater = makeEnv({ candidates: [cand("a1")], last: { a1: "2026-10-04T06:00:30Z" } });
    expect((await checkCertificatsEnAttente(weekLater.env)).sent).toBe(1);
  });

  it("ignore l'engagement d'une saison passée (certificat remis à zéro par le renouvellement groupé)", async () => {
    const old = { ...REG, exercice_date_fin: "2026-06-30", submitted_at: "2025-10-02T10:00:00.000Z" };
    const { env } = makeEnv({ candidates: [cand("a1")], regs: { a1: old } });
    const r = await checkCertificatsEnAttente(env);
    expect(r).toMatchObject({ sent: 0, skipped: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("applique le délai personnalisé de club_info", async () => {
    vi.setSystemTime(new Date("2026-10-08T06:00:00Z"));
    const { env } = makeEnv({ candidates: [cand("a1")], interval: "3" });
    expect((await checkCertificatsEnAttente(env)).sent).toBe(1);
  });

  it("traite chaque adhérent indépendamment : un échec Brevo n'empêche pas les autres et n'est pas enregistré comme envoyé", async () => {
    fetchMock.mockImplementationOnce(async () => new Response("quota", { status: 429 }));
    const { env, inserts } = makeEnv({ candidates: [cand("a1"), cand("a2")] });
    const r = await checkCertificatsEnAttente(env);
    expect(r.sent).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain("a1@example.com");
    expect(inserts.map((i) => i[1])).toEqual(["a2"]);
  });

  it("sans clé Brevo : erreur remontée, rien d'enregistré (le rappel sera retenté le lendemain)", async () => {
    const { env, inserts } = makeEnv({ candidates: [cand("a1")], brevoKey: "" });
    const r = await checkCertificatsEnAttente(env);
    expect(r.sent).toBe(0);
    expect(r.errors[0]).toContain("BREVO_API_KEY");
    expect(inserts).toHaveLength(0);
  });
});
