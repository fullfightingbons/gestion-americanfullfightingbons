import { renderHtml } from "./renderHtml";

export default {
	async fetch(request, env) {
		const stmt = env.DB.prepare("SELECT * FROM comments LIMIT 3");
		const { results } = await stmt.all();

		return new Response(renderHtml(JSON.stringify(results, null, 2)), {
			headers: {
				"content-type": "text/html",
			},
		});
	},
} satisfies ExportedHandler<Env>;

/**
 * Worker principal — AFFBC Gestion du club
 * Expose l'API pour les diplômes : lecture des modèles R2 et historique D1.
 */
 
// Ceintures disponibles dans R2 sous Diplôme/<couleur>.png
const CEINTURES = ["jaune", "orange", "verte", "bleue", "marron", "noire"] as const;
type Ceinture = typeof CEINTURES[number];
 
const ALLOWED_HOSTS = [
  "gestion-americanfullfightingbons.fullfightingbons.workers.dev",
  // Ajoutez ici d'autres domaines personnalisés si nécessaire
];
 
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const host = url.hostname;
 
    // Vérification allowlist domaines
    if (!ALLOWED_HOSTS.includes(host)) {
      return new Response("Host not in allowlist", { status: 403, headers: { "content-type": "text/plain" } });
    }
 
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
 
    const path = url.pathname;
 
    // ── Routes API Diplômes ─────────────────────────────────────────────
 
    // GET /api/diplomes/modeles — Liste les 6 modèles R2
    if (path === "/api/diplomes/modeles" && request.method === "GET")
      return handleListModeles(env);
 
    // GET /api/diplomes/modele/:couleur — Image PNG du modèle
    const modeleMatch = path.match(/^\/api\/diplomes\/modele\/(jaune|orange|verte|bleue|marron|noire)$/);
    if (modeleMatch && request.method === "GET")
      return handleGetModele(env, modeleMatch[1] as Ceinture);
 
    // POST /api/diplomes/generer — Enregistre un diplôme généré
    if (path === "/api/diplomes/generer" && request.method === "POST")
      return handleGenererDiplome(request, env);
 
    // GET /api/diplomes/historique — Historique depuis D1
    if (path === "/api/diplomes/historique" && request.method === "GET")
      return handleHistoriqueDiplomes(env);
 
    return jsonResponse({ error: "Route introuvable" }, 404);
  },
} satisfies ExportedHandler<Env>;
 
 
// ══════════════════════════════════════════════════════════════
// Handlers
// ══════════════════════════════════════════════════════════════
 
/** Liste les modèles de diplômes disponibles dans R2. */
async function handleListModeles(env: Env): Promise<Response> {
  const disponibles = await Promise.all(
    CEINTURES.map(async (couleur) => {
      const key = `Diplôme/${couleur}.png`;
      const obj = await (env as any).STORAGE.head(key);
      return { ceinture: couleur, r2Key: key, disponible: obj !== null };
    })
  );
  return jsonResponse({ modeles: disponibles });
}
 
/** Retourne l'image PNG du modèle de diplôme depuis R2. */
async function handleGetModele(env: Env, couleur: Ceinture): Promise<Response> {
  const key = `Diplôme/${couleur}.png`;
  const obj = await (env as any).STORAGE.get(key);
  if (!obj) return jsonResponse({ error: `Modèle introuvable : ${key}` }, 404);
 
  const headers = new Headers(corsHeaders());
  headers.set("content-type", "image/png");
  headers.set("cache-control", "public, max-age=3600");
  return new Response(obj.body, { headers });
}
 
/**
 * Génère (enregistre) un diplôme pour un adhérent.
 * Body JSON : { adherent_id, nom, prenom, ceinture, date_obtention }
 */
async function handleGenererDiplome(request: Request, env: Env): Promise<Response> {
  let body: { adherent_id: number; nom: string; prenom: string; ceinture: Ceinture; date_obtention: string };
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "Corps JSON invalide" }, 400); }
 
  const { adherent_id, nom, prenom, ceinture, date_obtention } = body;
  if (!adherent_id || !nom || !prenom || !ceinture || !date_obtention)
    return jsonResponse({ error: "Champs requis : adherent_id, nom, prenom, ceinture, date_obtention" }, 400);
  if (!(CEINTURES as readonly string[]).includes(ceinture))
    return jsonResponse({ error: `Ceinture invalide. Valeurs : ${CEINTURES.join(", ")}` }, 400);
 
  // Vérification que le modèle R2 existe
  const r2Key = `Diplôme/${ceinture}.png`;
  if (!(await (env as any).STORAGE.head(r2Key)))
    return jsonResponse({ error: `Modèle R2 absent : ${r2Key}` }, 404);
 
  try {
    await (env as any).DB.prepare(`
      INSERT INTO diplomes (adherent_id, nom, prenom, ceinture, date_obtention, date_generation, r2_modele)
      VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
    `).bind(adherent_id, nom, prenom, ceinture, date_obtention, r2Key).run();
  } catch (err: any) {
    if (err.message?.includes("no such table"))
      return jsonResponse({ error: "Table 'diplomes' absente. Appliquez la migration SQL." }, 500);
    throw err;
  }
 
  return jsonResponse({
    success: true,
    message: `Diplôme ceinture ${ceinture} enregistré pour ${prenom} ${nom}`,
    modele_r2: r2Key,
    date_obtention,
  });
}
 
/** Historique des diplômes générés (100 derniers). */
async function handleHistoriqueDiplomes(env: Env): Promise<Response> {
  try {
    const { results } = await (env as any).DB.prepare(`
      SELECT id, adherent_id, nom, prenom, ceinture, date_obtention, date_generation
      FROM diplomes ORDER BY date_generation DESC LIMIT 100
    `).all();
    return jsonResponse({ diplomes: results });
  } catch (err: any) {
    if (err.message?.includes("no such table"))
      return jsonResponse({ diplomes: [], info: "Table 'diplomes' pas encore créée." });
    throw err;
  }
}
 
// ══════════════════════════════════════════════════════════════
// Utilitaires
// ══════════════════════════════════════════════════════════════
 
function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
  };
}
 
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders() },
  });
}
 
