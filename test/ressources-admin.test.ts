// L'onglet « Ressources » de l'admin (public/assets/app.js, script classique
// non importable) : on en extrait les fonctions pures par appariement
// d'accolades et on les exécute dans un bac à sable, pour tester le vrai code
// plutôt que des correspondances de texte.
//  • parité : l'analyse des liens YouTube/Vimeo du navigateur doit accepter et
//    refuser exactement les mêmes liens que le serveur (src/lib/ressources.ts) ;
//  • rendu : tout texte saisi en admin est échappé.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parseVideoLink as serverParse } from "../src/lib/ressources";

const source = readFileSync(new URL("../public/assets/app.js", import.meta.url), "utf8");

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`Fonction "${name}" introuvable dans app.js`);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Accolade fermante de "${name}" introuvable`);
}
function extractConst(name: string): string {
  const m = new RegExp(`const ${name}=[^;]*;`).exec(source);
  if (!m) throw new Error(`Constante "${name}" introuvable`);
  return m[0];
}

let sandbox: any;
beforeAll(() => {
  const code = [
    extractFunction("esc"),
    extractConst("RESSOURCE_MAX_MO"),
    extractConst("RESSOURCE_CATEGORIES_SUGGEREES"),
    extractFunction("fmtOctets"),
    extractFunction("parseVideoLink"),
    extractFunction("ressourceOpenUrl"),
    extractFunction("vRessources"),
    extractFunction("vRessourceModal"),
  ].join("\n");
  sandbox = vm.createContext({
    D: { ressources: [], ressourcesError: "" },
    UI: { editObj: null },
    hasPerm: () => true,
    URL,
  });
  vm.runInContext(code, sandbox);
});

describe("analyse des liens vidéo : parité navigateur / serveur", () => {
  const yt = "dQw4w9WgXcQ";
  const links = [
    `https://www.youtube.com/watch?v=${yt}`, `https://youtu.be/${yt}`, `https://m.youtube.com/watch?v=${yt}`,
    `https://www.youtube.com/shorts/${yt}`, `https://www.youtube.com/embed/${yt}`, `https://www.youtube-nocookie.com/embed/${yt}`,
    "https://vimeo.com/123456789", "https://vimeo.com/123456789/abcdef1234", "https://player.vimeo.com/video/123456789?h=abcdef1234",
    "", "n'importe quoi", "javascript:alert(1)", "https://evil.example/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ", "https://youtu.be/trop-court", "https://vimeo.com/abc",
    "https://dailymotion.com/video/x7tgad0", "ftp://youtu.be/dQw4w9WgXcQ",
  ];
  for (const link of links) {
    it(`même verdict pour « ${link || "(vide)"} »`, () => {
      const browser = sandbox.parseVideoLink(link);
      const server = serverParse(link);
      expect(Boolean(browser)).toBe(Boolean(server));
      if (server) expect(browser.provider.toLowerCase()).toBe(server.provider);
    });
  }
});

describe("fmtOctets", () => {
  it("formate en o / Ko / Mo", () => {
    expect(sandbox.fmtOctets(512)).toBe("512 o");
    expect(sandbox.fmtOctets(2048)).toBe("2 Ko");
    expect(sandbox.fmtOctets(1572864)).toBe("1,5 Mo");
    expect(sandbox.fmtOctets(52428800)).toBe("50 Mo");
    expect(sandbox.fmtOctets(5242880)).toBe("5 Mo");
  });
});

describe("rendu de l'onglet Ressources", () => {
  const row = (extra = {}) => ({ id: "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f", titre: "Règlement", description: "", categorie: "Règlement", type: "pdf", fichier_path: "ressources/9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f/1-doc.pdf", fichier_nom: "doc.pdf", fichier_taille: 2048, ordre: 0, actif: 1, ...extra });

  it("groupe par catégorie, indique type, contenu et visibilité", () => {
    sandbox.D.ressources = [row(), row({ id: "aaaaaaaa-aaaa", titre: "Stage", categorie: "Techniques", type: "video", fichier_path: "", video_url: "https://youtu.be/dQw4w9WgXcQ", actif: 0 })];
    const html = sandbox.vRessources();
    expect(html).toContain("Règlement");
    expect(html).toContain("Techniques");
    expect(html).toContain("📄 PDF");
    expect(html).toContain("▶ Vidéo");
    expect(html).toContain("↗ YouTube");
    expect(html).toContain("Masquée");
    expect(html).toContain("/api/storage/fullfighting-pdf/ressources/9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f/1-doc.pdf");
  });

  it("échappe les textes saisis (liste et formulaire)", () => {
    const evil = '<img src=x onerror=alert(1)>';
    sandbox.D.ressources = [row({ titre: evil, description: evil, categorie: evil, fichier_nom: evil })];
    expect(sandbox.vRessources()).not.toContain("<img src=x");
    sandbox.UI.editObj = row({ titre: evil, description: evil, categorie: evil, fichier_nom: evil });
    expect(sandbox.vRessourceModal()).not.toContain("<img src=x");
    sandbox.UI.editObj = null;
  });

  it("affiche un message de migration si la table est absente et un état vide sinon", () => {
    sandbox.D.ressources = []; sandbox.D.ressourcesError = "no such table: club_ressources";
    expect(sandbox.vRessources()).toContain("0038_club_ressources.sql");
    sandbox.D.ressourcesError = "";
    expect(sandbox.vRessources()).toContain("Aucune ressource");
  });

  it("le formulaire propose les catégories existantes et reflète le type et la source", () => {
    sandbox.D.ressources = [row({ categorie: "Ma catégorie" })];
    sandbox.UI.editObj = row({ type: "video", fichier_path: "", video_url: "https://youtu.be/dQw4w9WgXcQ" });
    const html = sandbox.vRessourceModal();
    expect(html).toContain('<option value="Ma catégorie">');
    expect(html).toContain('<option value="video" selected>');
    expect(html).toContain('value="lien" checked');
    expect(html).toContain("95 Mo");
    sandbox.UI.editObj = null;
  });
});
