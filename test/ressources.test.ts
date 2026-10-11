// Tests des ressources du club (PDF / vidéos de l'espace membre) :
//  • règles pures (src/lib/ressources.ts) : validation d'upload, noms de
//    fichier, plages d'octets, reconnaissance des liens YouTube/Vimeo ;
//  • routes du Worker avec un faux D1/R2 : lecture signée (Range, jeton
//    expiré/falsifié), téléversement staff en flux, suppression.
import { describe, it, expect } from "vitest";
import worker from "../src/index";
import { createSessionToken } from "../src/lib/security";
import {
  RESSOURCE_MAX_BYTES,
  isValidRessourceId,
  parseVideoLink,
  resolveByteRange,
  ressourceKey,
  ressourceKeyBelongsTo,
  sanitizeRessourceFileName,
  validateRessourceUpload,
} from "../src/lib/ressources";

describe("validateRessourceUpload", () => {
  it("accepte un PDF et un MP4 dans les limites, avec un MIME déduit de l'extension", () => {
    expect(validateRessourceUpload({ type: "pdf", name: "Règlement 2026.PDF", size: 1000 })).toMatchObject({ ok: true, mime: "application/pdf", ext: "pdf" });
    expect(validateRessourceUpload({ type: "video", name: "stage.mp4", size: 50 * 1024 * 1024 })).toMatchObject({ ok: true, mime: "video/mp4" });
    expect(validateRessourceUpload({ type: "video", name: "a.mov", size: 10 })).toMatchObject({ ok: true, mime: "video/quicktime" });
  });

  it("refuse les extensions hors liste (un .html ne devient jamais un PDF servi par le club)", () => {
    for (const name of ["page.html", "script.js", "image.svg", "archive.zip", "sans-extension"]) {
      expect(validateRessourceUpload({ type: "pdf", name, size: 10 })).toMatchObject({ ok: false, status: 400 });
    }
    expect(validateRessourceUpload({ type: "video", name: "doc.pdf", size: 10 })).toMatchObject({ ok: false, status: 400 });
  });

  it("refuse une taille inconnue ou excessive, avec le conseil lien YouTube pour les vidéos", () => {
    expect(validateRessourceUpload({ type: "pdf", name: "a.pdf", size: 0 })).toMatchObject({ ok: false, status: 411 });
    expect(validateRessourceUpload({ type: "pdf", name: "a.pdf", size: Number.NaN })).toMatchObject({ ok: false, status: 411 });
    expect(validateRessourceUpload({ type: "pdf", name: "a.pdf", size: RESSOURCE_MAX_BYTES.pdf + 1 })).toMatchObject({ ok: false, status: 413 });
    const big = validateRessourceUpload({ type: "video", name: "a.mp4", size: RESSOURCE_MAX_BYTES.video + 1 });
    expect(big).toMatchObject({ ok: false, status: 413 });
    expect(big.ok === false && big.error).toContain("YouTube");
  });
});

describe("noms, clés et identifiants", () => {
  it("assainit les noms de fichier (accents, chemins, caractères de contrôle, guillemets)", () => {
    expect(sanitizeRessourceFileName("Règlement été 2026.pdf")).toBe("Reglement_ete_2026.pdf");
    expect(sanitizeRessourceFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeRessourceFileName('a"b\r\nc.pdf')).toBe("a_b_c.pdf");
    expect(sanitizeRessourceFileName("...")).toBe("fichier");
    expect(sanitizeRessourceFileName("")).toBe("fichier");
    expect(sanitizeRessourceFileName("x".repeat(300) + ".pdf").length).toBeLessThanOrEqual(80);
  });

  it("construit des clés confinées au préfixe de la ressource", () => {
    const key = ressourceKey("abc12345", "doc.pdf", 1700000000000);
    expect(key).toBe("ressources/abc12345/1700000000000-doc.pdf");
    expect(ressourceKeyBelongsTo(key, "abc12345")).toBe(true);
    expect(ressourceKeyBelongsTo(key, "autre-id-1")).toBe(false);
    expect(ressourceKeyBelongsTo("ressources/abc12345/../adherents/x/certificat.pdf", "abc12345")).toBe(false);
    expect(ressourceKeyBelongsTo(null, "abc12345")).toBe(false);
  });

  it("n'accepte que des identifiants de forme UUID, jamais un chemin", () => {
    expect(isValidRessourceId("9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f")).toBe(true);
    for (const bad of ["", "a", "../x", "a/b", "x".repeat(65), "id avec espace", null, undefined, 42]) {
      expect(isValidRessourceId(bad)).toBe(false);
    }
  });
});

describe("resolveByteRange", () => {
  it("normalise offset/length et suffix", () => {
    expect(resolveByteRange({ offset: 2, length: 4 }, 10)).toEqual({ start: 2, end: 5, length: 4 });
    expect(resolveByteRange({ offset: 8 }, 10)).toEqual({ start: 8, end: 9, length: 2 });
    expect(resolveByteRange({ suffix: 3 }, 10)).toEqual({ start: 7, end: 9, length: 3 });
    expect(resolveByteRange({ suffix: 99 }, 10)).toEqual({ start: 0, end: 9, length: 10 });
    expect(resolveByteRange({ offset: 0, length: 999 }, 10)).toEqual({ start: 0, end: 9, length: 10 });
  });
  it("renvoie null sans plage exploitable", () => {
    expect(resolveByteRange(undefined, 10)).toBeNull();
    expect(resolveByteRange({ offset: 0 }, 0)).toBeNull();
    expect(resolveByteRange({ offset: 10 }, 10)).toBeNull();
  });
});

describe("parseVideoLink", () => {
  const yt = "dQw4w9WgXcQ";
  it("reconnaît les formes courantes de liens YouTube", () => {
    for (const link of [
      `https://www.youtube.com/watch?v=${yt}`,
      `https://youtube.com/watch?v=${yt}&t=42s`,
      `https://m.youtube.com/watch?v=${yt}`,
      `https://youtu.be/${yt}?si=abc`,
      `https://www.youtube.com/shorts/${yt}`,
      `https://www.youtube.com/embed/${yt}`,
      `https://www.youtube-nocookie.com/embed/${yt}`,
      `  https://youtu.be/${yt}  `,
    ]) {
      expect(parseVideoLink(link)).toEqual({ provider: "youtube", id: yt, embedUrl: `https://www.youtube-nocookie.com/embed/${yt}?rel=0` });
    }
  });

  it("reconnaît Vimeo, y compris les vidéos non répertoriées (jeton de partage)", () => {
    expect(parseVideoLink("https://vimeo.com/123456789")).toEqual({ provider: "vimeo", id: "123456789", embedUrl: "https://player.vimeo.com/video/123456789" });
    expect(parseVideoLink("https://vimeo.com/123456789/abcdef1234")?.embedUrl).toBe("https://player.vimeo.com/video/123456789?h=abcdef1234");
    expect(parseVideoLink("https://player.vimeo.com/video/123456789?h=abcdef1234")?.embedUrl).toBe("https://player.vimeo.com/video/123456789?h=abcdef1234");
  });

  it("rejette tout autre lien : jamais d'URL arbitraire dans une iframe", () => {
    for (const bad of [
      "", "n'importe quoi", "javascript:alert(1)", "ftp://youtu.be/dQw4w9WgXcQ",
      "https://evil.example/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/trop-court", "https://www.youtube.com/watch?v=dQw4w9WgXcQ\"onload=\"x",
      "https://vimeo.com/abc", "https://vimeo.com/123456789/<script>", "https://dailymotion.com/video/x7tgad0",
    ]) {
      const parsed = parseVideoLink(bad);
      if (bad.includes("<script>")) expect(parsed?.embedUrl).toBe("https://player.vimeo.com/video/123456789");
      else expect(parsed).toBeNull();
    }
  });
});

// ── Routes du Worker avec faux D1 / R2 ──────────────────────────────────
const SECRET = "s".repeat(48);
type Rule = [RegExp, unknown | ((binds: unknown[]) => unknown)];

function fakeDb(rules: Rule[]) {
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
  const exec = (sql: string, binds: unknown[]) => {
    calls.push({ sql, binds });
    const rule = rules.find(([re]) => re.test(sql));
    if (!rule) return null;
    return typeof rule[1] === "function" ? (rule[1] as (b: unknown[]) => unknown)(binds) : rule[1];
  };
  const stmt = (sql: string, binds: unknown[]) => ({
    first: async () => exec(sql, binds),
    all: async () => ({ results: (exec(sql, binds) as unknown[]) ?? [] }),
    run: async () => { exec(sql, binds); return { success: true }; },
    bind: (...b: unknown[]) => stmt(sql, b),
  });
  return { calls, prepare: (sql: string) => stmt(sql, []) };
}

function fakeR2(initial: Record<string, { bytes: string; type?: string }> = {}) {
  const store = new Map(Object.entries(initial).map(([k, v]) => [k, { bytes: new TextEncoder().encode(v.bytes), type: v.type || "application/pdf" }]));
  const puts: string[] = [];
  const toObject = (key: string, opts?: { range?: Headers }) => {
    const entry = store.get(key);
    if (!entry) return null;
    let bytes = entry.bytes;
    let range: { offset: number; length: number } | undefined;
    const header = opts?.range?.get("Range");
    const m = header ? /bytes=(\d+)-(\d*)/.exec(header) : null;
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : entry.bytes.length - 1;
      bytes = entry.bytes.slice(start, end + 1);
      range = { offset: start, length: bytes.length };
    }
    return { key, size: entry.bytes.length, httpMetadata: { contentType: entry.type }, range, body: new Blob([bytes]).stream() };
  };
  return {
    store, puts,
    get: async (key: string, opts?: { range?: Headers }) => toObject(key, opts),
    head: async (key: string) => { const o = toObject(key); return o ? { ...o, body: undefined } : null; },
    put: async (key: string, body: ReadableStream | ArrayBuffer | string) => {
      const buf = body instanceof ReadableStream ? new Uint8Array(await new Response(body).arrayBuffer()) : new TextEncoder().encode(String(body));
      store.set(key, { bytes: buf, type: "application/octet-stream" });
      puts.push(key);
    },
    list: async ({ prefix }: { prefix: string }) => ({ objects: [...store.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
    delete: async (key: string) => { store.delete(key); },
  };
}

function makeEnv(db: ReturnType<typeof fakeDb>, r2: ReturnType<typeof fakeR2>) {
  return {
    DB: db, R2_PDF: r2, SESSION_SECRET: SECRET, ADMIN_PASSWORD: "x", PASSWORD_PEPPER: "x",
    ASSETS: { fetch: async () => new Response("asset") },
  } as any;
}
const ctx = { waitUntil: (p: Promise<unknown>) => { void p; }, passThroughOnException: () => {} } as any;
const ID = "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
const KEY = `ressources/${ID}/1700000000000-doc.pdf`;

async function linkFor(id: string, extra: Record<string, unknown> = {}) {
  return createSessionToken({ kind: "ressource", id, expiresAt: Date.now() + 60_000, ...extra }, { SESSION_SECRET: SECRET } as any);
}
const resourceRow = { titre: "Règlement", fichier_path: KEY, fichier_nom: "Règlement été.pdf", fichier_mime: "application/pdf" };

describe("GET /api/ressources/fichier/:id (lecture par lien signé)", () => {
  const setup = () => {
    const db = fakeDb([[/FROM club_ressources WHERE id = \? AND actif = 1/, resourceRow]]);
    const r2 = fakeR2({ [KEY]: { bytes: "0123456789" } });
    return { env: makeEnv(db, r2), r2 };
  };
  const call = (env: any, id: string, token: string, init: RequestInit = {}, query = "") =>
    worker.fetch(new Request(`https://gestion.example/api/ressources/fichier/${id}?t=${encodeURIComponent(token)}${query}`, init), env, ctx);

  it("sert le fichier en ligne avec Accept-Ranges", async () => {
    const { env } = setup();
    const res = await call(env, ID, await linkFor(ID));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Disposition")).toBe('inline; filename="Reglement_ete.pdf"');
    expect(res.headers.get("Content-Length")).toBe("10");
    expect(await res.text()).toBe("0123456789");
  });

  it("répond 206 aux requêtes Range (lecture et déplacement dans une vidéo)", async () => {
    const { env } = setup();
    const res = await call(env, ID, await linkFor(ID), { headers: { Range: "bytes=2-5" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(res.headers.get("Content-Length")).toBe("4");
    expect(await res.text()).toBe("2345");
  });

  it("force le téléchargement avec ?dl=1 et répond au HEAD sans corps", async () => {
    const { env } = setup();
    const dl = await call(env, ID, await linkFor(ID), {}, "&dl=1");
    expect(dl.headers.get("Content-Disposition")).toContain("attachment;");
    const head = await call(env, ID, await linkFor(ID), { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Length")).toBe("10");
    expect(await head.text()).toBe("");
  });

  it("refuse un jeton absent, falsifié, expiré, d'une autre ressource ou d'un autre type", async () => {
    const { env } = setup();
    expect((await call(env, ID, "")).status).toBe(403);
    expect((await call(env, ID, "abc.def")).status).toBe(403);
    const good = await linkFor(ID);
    expect((await call(env, ID, good.slice(0, -2) + "xx")).status).toBe(403);
    expect((await call(env, ID, await linkFor(ID, { expiresAt: Date.now() - 1 }))).status).toBe(403);
    expect((await call(env, ID, await linkFor("autre-ressource-id"))).status).toBe(403);
    expect((await call(env, ID, await linkFor(ID, { kind: "member" }))).status).toBe(403);
  });

  it("répond 404 si la ressource est inactive/absente ou si la clé sort de son préfixe", async () => {
    const r2 = fakeR2({ [KEY]: { bytes: "x" } });
    const absent = makeEnv(fakeDb([]), r2);
    expect((await call(absent, ID, await linkFor(ID))).status).toBe(404);
    const traversal = makeEnv(fakeDb([[/FROM club_ressources/, { ...resourceRow, fichier_path: "adherents/42/certificat.pdf" }]]), r2);
    expect((await call(traversal, ID, await linkFor(ID))).status).toBe(404);
  });
});

describe("routes staff : téléversement et suppression", () => {
  async function staffHeaders(role = "admin") {
    const token = await createSessionToken({ userId: "u1", expiresAt: Date.now() + 60_000 }, { SESSION_SECRET: SECRET } as any);
    return { token, role };
  }
  const baseRules = (role: string): Rule[] => [
    [/FROM admin_sessions/, null],
    [/FROM utilisateurs WHERE id = \?/, { id: "u1", role, actif: 1, password_changed_at: "" }],
    [/FROM club_info WHERE cle = 'role_permissions'/, null],
  ];
  const put = (env: any, token: string, query: string, body: BodyInit | null, headers: Record<string, string> = {}) =>
    worker.fetch(new Request(`https://gestion.example/api/admin/ressources/fichier?${query}`, {
      method: "PUT", body, headers: { Authorization: `Bearer ${token}`, ...headers },
    }), env, ctx);

  it("écrit le fichier en flux sous ressources/<id>/ avec un MIME déduit de l'extension", async () => {
    const { token } = await staffHeaders();
    const r2 = fakeR2();
    const env = makeEnv(fakeDb(baseRules("admin")), r2);
    // Un vrai navigateur envoie Content-Length pour un File ; une Request construite
    // à la main en test, non : on le fournit, comme le ferait le réseau.
    const body = "%PDF-1.4 contenu";
    const res = await put(env, token, `id=${ID}&type=pdf&nom=${encodeURIComponent("Règlement été.pdf")}`, body, { "Content-Type": "text/html", "Content-Length": String(body.length) });
    expect(res.status).toBe(201);
    const payload: any = await res.json();
    expect(payload.data.path).toMatch(new RegExp(`^ressources/${ID}/\\d+-Reglement_ete\\.pdf$`));
    expect(payload.data.mime).toBe("application/pdf");
    expect(payload.data.nom).toBe("Règlement été.pdf");
    expect(r2.puts).toEqual([payload.data.path]);
    expect(new TextDecoder().decode(r2.store.get(payload.data.path)!.bytes)).toBe("%PDF-1.4 contenu");
  });

  it("refuse un format non accepté, un identifiant invalide et une session absente", async () => {
    const { token } = await staffHeaders();
    const r2 = fakeR2();
    const env = makeEnv(fakeDb(baseRules("admin")), r2);
    expect((await put(env, token, `id=${ID}&type=pdf&nom=page.html`, "<html>", { "Content-Length": "6" })).status).toBe(400);
    expect((await put(env, token, `id=..%2Fx&type=pdf&nom=a.pdf`, "x", { "Content-Length": "1" })).status).toBe(400);
    // Sans Content-Length (flux chunked) : 411, rien n'est écrit dans R2.
    expect((await put(env, token, `id=${ID}&type=pdf&nom=a.pdf`, "x")).status).toBe(411);
    // Fichier au-delà de la limite annoncée : 413 avant toute écriture.
    expect((await put(env, token, `id=${ID}&type=pdf&nom=a.pdf`, "x", { "Content-Length": String(RESSOURCE_MAX_BYTES.pdf + 1) })).status).toBe(413);
    const noAuth = await worker.fetch(new Request(`https://gestion.example/api/admin/ressources/fichier?id=${ID}&type=pdf&nom=a.pdf`, { method: "PUT", body: "x" }), env, ctx);
    expect(noAuth.status).toBe(401);
    expect(r2.puts).toHaveLength(0);
  });

  it("refuse un compte sans droit d'écriture sur les adhérents", async () => {
    const { token } = await staffHeaders();
    const r2 = fakeR2();
    const env = makeEnv(fakeDb(baseRules("membre")), r2);
    expect((await put(env, token, `id=${ID}&type=pdf&nom=a.pdf`, "x", { "Content-Length": "1" })).status).toBe(403);
    expect(r2.puts).toHaveLength(0);
  });

  it("un jeton membre ou de lecture n'ouvre jamais la route d'écriture", async () => {
    const r2 = fakeR2();
    const env = makeEnv(fakeDb(baseRules("admin")), r2);
    const member = await createSessionToken({ kind: "member", adherentCompteId: "c1", expiresAt: Date.now() + 60_000 }, { SESSION_SECRET: SECRET } as any);
    expect((await put(env, member, `id=${ID}&type=pdf&nom=a.pdf`, "x")).status).toBe(401);
    expect((await put(env, await linkFor(ID), `id=${ID}&type=pdf&nom=a.pdf`, "x")).status).toBe(401);
    expect(r2.puts).toHaveLength(0);
  });

  it("nettoie les anciennes versions en gardant la clé indiquée", async () => {
    const { token } = await staffHeaders();
    const r2 = fakeR2({
      [`ressources/${ID}/1-ancien.pdf`]: { bytes: "a" },
      [`ressources/${ID}/2-nouveau.pdf`]: { bytes: "b" },
      "ressources/autre-ressource-01/1-x.pdf": { bytes: "c" },
    });
    const env = makeEnv(fakeDb(baseRules("admin")), r2);
    const res = await worker.fetch(new Request(`https://gestion.example/api/admin/ressources/fichier?id=${ID}&garder=${encodeURIComponent(`ressources/${ID}/2-nouveau.pdf`)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    }), env, ctx);
    expect(res.status).toBe(200);
    expect([...r2.store.keys()].sort()).toEqual([`ressources/${ID}/2-nouveau.pdf`, "ressources/autre-ressource-01/1-x.pdf"]);
  });

  it("supprime la ressource et tous ses fichiers, sans toucher aux autres", async () => {
    const { token } = await staffHeaders();
    const r2 = fakeR2({
      [`ressources/${ID}/1-a.pdf`]: { bytes: "a" },
      [`ressources/${ID}/2-b.pdf`]: { bytes: "b" },
      "ressources/autre-ressource-01/1-x.pdf": { bytes: "c" },
    });
    const db = fakeDb(baseRules("admin"));
    const env = makeEnv(db, r2);
    const res = await worker.fetch(new Request(`https://gestion.example/api/admin/ressources/${ID}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    }), env, ctx);
    expect(res.status).toBe(200);
    expect([...r2.store.keys()]).toEqual(["ressources/autre-ressource-01/1-x.pdf"]);
    expect(db.calls.some((c) => /DELETE FROM club_ressources WHERE id = \?/.test(c.sql) && c.binds[0] === ID)).toBe(true);
  });
});

describe("droits de lecture/écriture staff sur le stockage ressources/", () => {
  it("s'alignent sur perm_adherents", async () => {
    const { hasStoragePermission } = await import("../src/lib/security");
    const perms = {
      secretaire: { perm_adherents: "write", perm_administration: "none" },
      entraineur: { perm_adherents: "read", perm_administration: "none" },
      membre: { perm_adherents: "none", perm_administration: "none" },
    };
    expect(hasStoragePermission({ role: "secretaire" } as any, "fullfighting-pdf", "ressources/x/a.pdf", "write", perms)).toBe(true);
    expect(hasStoragePermission({ role: "entraineur" } as any, "fullfighting-pdf", "ressources/x/a.pdf", "read", perms)).toBe(true);
    expect(hasStoragePermission({ role: "entraineur" } as any, "fullfighting-pdf", "ressources/x/a.pdf", "write", perms)).toBe(false);
    expect(hasStoragePermission({ role: "membre" } as any, "fullfighting-pdf", "ressources/x/a.pdf", "read", perms)).toBe(false);
  });
});

describe("GET /api/member/ressources (liste pour l'espace membre)", () => {
  const memberRow = { id: "c1", adherent_id: "a1", password_changed_at: "" };
  const baseRules = (rows: unknown[] | (() => unknown[])): Rule[] => [
    [/FROM adherent_comptes ac/, memberRow],
    [/FROM club_ressources\s+WHERE actif = 1/, typeof rows === "function" ? rows : rows],
  ];
  const memberToken = () =>
    createSessionToken({ kind: "member", adherentCompteId: "c1", expiresAt: Date.now() + 60_000 }, { SESSION_SECRET: SECRET } as any);
  const list = async (env: any, token?: string) =>
    worker.fetch(new Request("https://gestion.example/api/member/ressources", { headers: token ? { Authorization: `Bearer ${token}` } : {} }), env, ctx);

  const pdf = { id: ID, titre: "Règlement", description: null, categorie: "Règlement", type: "pdf", video_url: null, fichier_path: KEY, fichier_nom: "Règlement.pdf", fichier_taille: 10, fichier_mime: "application/pdf", ordre: 0, updated_at: "2026-10-12" };
  const youtube = { id: "11111111-aaaa-bbbb-cccc-000000000001", titre: "Coups de pied", description: "4 min", categorie: "Techniques", type: "video", video_url: "https://youtu.be/dQw4w9WgXcQ", fichier_path: null, ordre: 1 };
  const stray = { ...pdf, id: "22222222-aaaa-bbbb-cccc-000000000002", fichier_path: "adherents/42/certificat.pdf" };

  it("renvoie les ressources actives avec un lien signé pour chaque fichier, et rien de sensible", async () => {
    const db = fakeDb(baseRules([pdf, youtube, stray]));
    const env = makeEnv(db, fakeR2({ [KEY]: { bytes: "0123456789" } }));
    const res = await list(env, await memberToken());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    const { data, error }: any = await res.json();
    expect(error).toBeNull();
    expect(data).toHaveLength(3);

    const [p, v, s] = data;
    expect(p.lien).toMatch(new RegExp(`^https://gestion\\.example/api/ressources/fichier/${ID}\\?t=`));
    expect(p).not.toHaveProperty("fichier_path"); // la clé R2 ne sort jamais du serveur
    expect(p).toMatchObject({ titre: "Règlement", type: "pdf", fichier_nom: "Règlement.pdf", description: "" });
    expect(v).toMatchObject({ type: "video", video_url: "https://youtu.be/dQw4w9WgXcQ", lien: null });
    expect(s.lien).toBeNull(); // clé hors du préfixe de la ressource : aucun lien émis
    expect(db.calls.some((c) => /WHERE actif = 1/.test(c.sql))).toBe(true);
  });

  it("le lien émis ouvre bien le fichier (de bout en bout) et expire avec le jeton", async () => {
    const env = makeEnv(fakeDb([...baseRules([pdf]), [/FROM club_ressources WHERE id = \? AND actif = 1/, resourceRow]]), fakeR2({ [KEY]: { bytes: "0123456789" } }));
    const { data }: any = await (await list(env, await memberToken())).json();
    const file = await worker.fetch(new Request(data[0].lien, { headers: { Range: "bytes=0-3" } }), env, ctx);
    expect(file.status).toBe(206);
    expect(await file.text()).toBe("0123");
    // même lien, jeton altéré : refusé
    const tampered = data[0].lien.slice(0, -3) + "zzz";
    expect((await worker.fetch(new Request(tampered), env, ctx)).status).toBe(403);
  });

  it("exige une session membre : ni anonyme, ni jeton staff, ni lien de ressource", async () => {
    const env = makeEnv(fakeDb(baseRules([pdf])), fakeR2());
    expect((await list(env)).status).toBe(401);
    const staff = await createSessionToken({ userId: "u1", expiresAt: Date.now() + 60_000 }, { SESSION_SECRET: SECRET } as any);
    expect((await list(env, staff)).status).toBe(401);
    expect((await list(env, await linkFor(ID))).status).toBe(401);
    const expired = await createSessionToken({ kind: "member", adherentCompteId: "c1", expiresAt: Date.now() - 1 }, { SESSION_SECRET: SECRET } as any);
    expect((await list(env, expired)).status).toBe(401);
  });

  it("répond une liste vide (sans erreur) si la table n'existe pas encore", async () => {
    const env = makeEnv(fakeDb(baseRules(() => { throw new Error("no such table: club_ressources"); })), fakeR2());
    const res = await list(env, await memberToken());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [], error: null });
  });
});
