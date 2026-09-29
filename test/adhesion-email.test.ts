import { describe, expect, it } from "vitest";
import { buildAdhesionExpireeEmailHtml } from "../src/index";

const PORTAL = "https://espace-membre.americanfullfightingbons.fr";

describe("Email de rappel de fin d'adhésion", () => {
  const html = buildAdhesionExpireeEmailHtml({ prenom: "Laurent", echeanceFr: "01/09/2025", portalUrl: PORTAL });

  it("renvoie d'abord vers l'espace membre (formulaire pré-rempli), pas vers le formulaire nu", () => {
    expect(html).toContain(`href="${PORTAL}"`);
    expect(html.indexOf(`href="${PORTAL}"`)).toBeLessThan(html.indexOf("inscription.americanfullfightingbons.fr"));
  });

  it("propose l'activation du compte pour qui n'en a pas encore", () => {
    expect(html).toContain(`href="${PORTAL}/activer"`);
  });

  it("garde le formulaire d'inscription direct en secours", () => {
    expect(html).toContain('href="https://inscription.americanfullfightingbons.fr"');
  });

  it("mentionne la date d'échéance et le prénom", () => {
    expect(html).toContain("Bonjour Laurent,");
    expect(html).toContain("échéance le 01/09/2025");
  });

  it("ignore un éventuel slash final dans l'URL du portail (pas de « // »)", () => {
    const withSlash = buildAdhesionExpireeEmailHtml({ prenom: "A", echeanceFr: "01/09/2025", portalUrl: `${PORTAL}/` });
    expect(withSlash).toContain(`href="${PORTAL}/activer"`);
    expect(withSlash).not.toContain(`${PORTAL}//`);
  });

  it("retombe sur l'URL par défaut du portail si la variable d'environnement est vide", () => {
    const fallback = buildAdhesionExpireeEmailHtml({ prenom: "A", echeanceFr: "01/09/2025", portalUrl: "" });
    expect(fallback).toContain(`href="${PORTAL}"`);
  });

  it("échappe le prénom (aucune injection HTML dans l'email)", () => {
    const evil = buildAdhesionExpireeEmailHtml({ prenom: '<img src=x onerror=alert(1)>', echeanceFr: "01/09/2025", portalUrl: PORTAL });
    expect(evil).not.toContain("<img");
    expect(evil).toContain("&lt;img");
  });
});
