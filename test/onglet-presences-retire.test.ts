// L'onglet « Présences » du back-office a été retiré (jugé inutile). On vérifie que le frontend ne l'expose plus,
// sans toucher à la base ni à l'API : la table `presences` et la colonne `perm_presences` sont conservées
// (l'espace membre lit encore les présences : liste de l'adhérent, attestation de présence PDF).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appJsSource = readFileSync(path.join(__dirname, "../public/assets/app.js"), "utf8");

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
  vm.runInContext(appJsSource + "\n;(function(){\n" + driverCode + "\n})();", sandbox, {
    filename: "app.js (sandbox test)",
  });
  return captured;
}

describe("onglet Présences retiré du back-office", () => {
  it("n'apparaît plus dans la navigation ni dans les permissions proposées", () => {
    const out = JSON.parse(
      loadAppAndRun(`
        capture(JSON.stringify({
          tabs: ALL_TABS.map(t => t.id),
          permsAffichees: PERM_META.map(p => p[0]),
          mobile: [...TAB_PRIMARY_MOBILE],
          presFilters: typeof UI.presFilters,
          donneesPresences: typeof D.presences
        }));
      `),
    );
    expect(out.tabs).not.toContain("suivi");
    expect(out.tabs).toContain("adherents");
    expect(out.permsAffichees).not.toContain("perm_presences");
    expect(out.mobile).not.toContain("suivi");
    expect(out.presFilters).toBe("undefined");
    expect(out.donneesPresences).toBe("undefined");
  });

  it("les fonctions de la vue Présences n'existent plus", () => {
    const out = JSON.parse(
      loadAppAndRun(`
        capture(JSON.stringify({
          vSuivi: typeof vSuivi, vPresences: typeof vPresences, savePresence: typeof savePresence,
          delPresence: typeof delPresence, exportPresencesCSV: typeof exportPresencesCSV,
          onglet: typeof needsLoadedTab,
          chargeSuivi: needsLoadedTab('suivi')
        }));
      `),
    );
    expect(out.vSuivi).toBe("undefined");
    expect(out.vPresences).toBe("undefined");
    expect(out.savePresence).toBe("undefined");
    expect(out.delPresence).toBe("undefined");
    expect(out.exportPresencesCSV).toBe("undefined");
    expect(out.chargeSuivi).toBe(false);
  });

  it("les onglets voisins sont intacts", () => {
    const out = JSON.parse(
      loadAppAndRun(`capture(JSON.stringify(ALL_TABS.map(t => t.id)));`),
    );
    for (const id of ["dashboard", "adherents", "diplomes", "banque", "comptabilite", "materiel", "ressources"]) {
      expect(out).toContain(id);
    }
  });
});
