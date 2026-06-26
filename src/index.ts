/**
 * Worker Gestion AFFBC
 * Back-office : adhérents, comptabilité, ventes.
 * Lit la base d'inscription (AFFBC_DB = affbc-prod) via un second binding D1
 * pour synchroniser automatiquement les dossiers validés.
 */

export interface Env {
  DB: D1Database;         // gestion-americanfullfightingbonsdb (tables locales)
  AFFBC_DB: D1Database;   // affbc-prod (inscriptions validées par HelloAsso)
  ADMIN_PASSWORD: string;
  BREVO_API_KEY?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function requireAuth(request: Request, env: Env): Promise<boolean> {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();

  if (!token) return false;

  // Vérifier en DB si la session est valide et non expirée
  const session = await env.DB
    .prepare(
      `SELECT token FROM admin_sessions
       WHERE token = ? AND expires_at > datetime('now')`
    )
    .bind(token)
    .first<{ token: string }>();

  return session !== null;
}

// Saison courante : si on est après le 1er septembre → saison N/N+1, sinon N-1/N
function currentSaison(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

// ─── Synchronisation inscription → gestion ──────────────────────────────────

/**
 * Récupère toutes les inscriptions validées (paiement_status = 'valide')
 * depuis affbc-prod qui ne sont pas encore synchronisées dans gestion.
 * Crée le membre, l'écriture compta et la ligne de vente correspondants.
 */
async function syncInscriptionsValidees(env: Env): Promise<{
  synced: number;
  skipped: number;
  errors: string[];
}> {
  const stats = { synced: 0, skipped: 0, errors: [] as string[] };

  // Lire les inscriptions validées dans affbc-prod
  // La table s'appelle "inscriptions" dans affbc-prod (worker inscription)
  let inscriptions: Array<Record<string, unknown>> = [];
  try {
    const result = await env.AFFBC_DB
      .prepare(
        `SELECT
           i.id,
           i.nom, i.prenom, i.email, i.telephone,
           i.date_naissance, i.is_mineur,
           i.categorie, i.niveau, i.licence_ffk,
           i.ceinture_actuelle,
           i.montant_total,
           i.helloasso_ref,
           i.saison,
           i.statut,
           i.created_at
         FROM inscriptions i
         WHERE i.statut = 'valide'
           AND i.helloasso_ref IS NOT NULL
         ORDER BY i.created_at ASC`
      )
      .all<Record<string, unknown>>();
    inscriptions = result.results ?? [];
  } catch (e) {
    stats.errors.push(`Lecture AFFBC_DB impossible: ${String(e)}`);
    return stats;
  }

  for (const insc of inscriptions) {
    const ref = String(insc.helloasso_ref ?? '');
    if (!ref) {
      stats.skipped++;
      continue;
    }

    // Idempotence : déjà synchronisé ?
    const existing = await env.DB
      .prepare(`SELECT id FROM membres WHERE inscription_ref = ?`)
      .bind(ref)
      .first<{ id: number }>();

    if (existing) {
      stats.skipped++;
      continue;
    }

    const saison = String(insc.saison ?? currentSaison());
    const montant = Number(insc.montant_total ?? 0);

    try {
      // 1. Créer le membre
      const membreResult = await env.DB
        .prepare(
          `INSERT INTO membres
             (inscription_ref, inscription_id, nom, prenom, email, telephone,
              date_naissance, is_mineur, saison, categorie, niveau,
              licence_ffk, ceinture_actuelle, date_adhesion)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,date('now'))
           RETURNING id`
        )
        .bind(
          ref,
          Number(insc.id),
          String(insc.nom ?? ''),
          String(insc.prenom ?? ''),
          String(insc.email ?? ''),
          String(insc.telephone ?? ''),
          String(insc.date_naissance ?? ''),
          Number(insc.is_mineur ?? 0),
          saison,
          String(insc.categorie ?? ''),
          String(insc.niveau ?? ''),
          String(insc.licence_ffk ?? ''),
          String(insc.ceinture_actuelle ?? ''),
        )
        .first<{ id: number }>();

      const membreId = membreResult?.id ?? null;

      // 2. Écriture comptable (recette cotisation)
      if (montant > 0) {
        await env.DB
          .prepare(
            `INSERT INTO ecritures_compta
               (date_ecriture, libelle, montant, categorie, source, source_ref, source_id, membre_id)
             VALUES (date('now'), ?, ?, 'cotisation', 'inscription', ?, ?, ?)`
          )
          .bind(
            `Cotisation ${saison} — ${String(insc.prenom)} ${String(insc.nom)}`,
            montant,
            ref,
            Number(insc.id),
            membreId,
          )
          .run();
      }

      // 3. Ligne de vente
      await env.DB
        .prepare(
          `INSERT INTO ventes_inscription
             (membre_id, inscription_ref, saison, produit, montant, statut_paiement)
           VALUES (?, ?, ?, 'Cotisation annuelle', ?, 'valide')`
        )
        .bind(membreId, ref, saison, montant)
        .run();

      // 4. Log de sync
      await env.DB
        .prepare(
          `INSERT INTO sync_log (action, inscription_id, helloasso_ref, status)
           VALUES ('inscription_validated', ?, ?, 'ok')`
        )
        .bind(Number(insc.id), ref)
        .run();

      stats.synced++;
    } catch (e) {
      const errMsg = `Inscription #${insc.id} (${ref}): ${String(e)}`;
      stats.errors.push(errMsg);
      await env.DB
        .prepare(
          `INSERT INTO sync_log (action, inscription_id, helloasso_ref, status, detail)
           VALUES ('inscription_validated', ?, ?, 'error', ?)`
        )
        .bind(Number(insc.id), ref, errMsg)
        .run();
    }
  }

  return stats;
}

// ─── Handler principal ───────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // ── Authentification ──────────────────────────────────────────────────

    // POST /api/admin/login
    if (method === 'POST' && path === '/api/admin/login') {
      const body = await request.json<{ password?: string }>();
      if (!body?.password) return err('Mot de passe requis', 400);

      // Comparaison en temps constant
      const encoder = new TextEncoder();
      const a = encoder.encode(body.password);
      const b = encoder.encode(env.ADMIN_PASSWORD);
      let same = a.length === b.length;
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) same = false;
      }
      if (!same) return err('Mot de passe incorrect', 401);

      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

      await env.DB
        .prepare(
          `INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)`
        )
        .bind(token, expiresAt)
        .run();

      // Purge des sessions expirées
      await env.DB
        .prepare(`DELETE FROM admin_sessions WHERE expires_at < datetime('now')`)
        .run();

      return json({ token, expires_at: expiresAt });
    }

    // POST /api/admin/logout
    if (method === 'POST' && path === '/api/admin/logout') {
      const auth = request.headers.get('Authorization') ?? '';
      const token = auth.replace(/^Bearer\s+/i, '').trim();
      if (token) {
        await env.DB
          .prepare(`DELETE FROM admin_sessions WHERE token = ?`)
          .bind(token)
          .run();
      }
      return json({ ok: true });
    }

    // ── Routes protégées ──────────────────────────────────────────────────

    // Toutes les routes /api/* (sauf login/logout) nécessitent un token
    if (path.startsWith('/api/')) {
      const authed = await requireAuth(request, env);
      if (!authed) return err('Non autorisé', 401);
    }

    // ── Synchronisation ───────────────────────────────────────────────────

    // POST /api/sync/inscriptions  — déclenche la sync manuellement (ou via cron)
    if (method === 'POST' && path === '/api/sync/inscriptions') {
      const stats = await syncInscriptionsValidees(env);
      return json(stats);
    }

    // GET /api/sync/log
    if (method === 'GET' && path === '/api/sync/log') {
      const rows = await env.DB
        .prepare(
          `SELECT * FROM sync_log ORDER BY created_at DESC LIMIT 100`
        )
        .all();
      return json(rows.results);
    }

    // ── Adhérents ─────────────────────────────────────────────────────────

    // GET /api/membres
    if (method === 'GET' && path === '/api/membres') {
      const saison = url.searchParams.get('saison') ?? currentSaison();
      const statut = url.searchParams.get('statut');
      const q = url.searchParams.get('q');

      let query = `SELECT * FROM membres WHERE saison = ?`;
      const params: unknown[] = [saison];

      if (statut) {
        query += ` AND statut = ?`;
        params.push(statut);
      }
      if (q) {
        query += ` AND (nom LIKE ? OR prenom LIKE ? OR email LIKE ?)`;
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }
      query += ` ORDER BY nom, prenom`;

      const stmt = env.DB.prepare(query);
      const rows = await stmt.bind(...params).all();
      return json(rows.results);
    }

    // GET /api/membres/:id
    if (method === 'GET' && /^\/api\/membres\/\d+$/.test(path)) {
      const id = path.split('/').pop();
      const row = await env.DB
        .prepare(`SELECT * FROM membres WHERE id = ?`)
        .bind(id)
        .first();
      if (!row) return err('Membre introuvable', 404);
      return json(row);
    }

    // PATCH /api/membres/:id  — mise à jour partielle (ceinture, statut, etc.)
    if (method === 'PATCH' && /^\/api\/membres\/\d+$/.test(path)) {
      const id = path.split('/').pop();
      const body = await request.json<Record<string, unknown>>();
      const allowed = ['statut', 'ceinture_actuelle', 'licence_ffk', 'telephone', 'email', 'niveau'];
      const updates: string[] = [];
      const vals: unknown[] = [];
      for (const key of allowed) {
        if (key in body) {
          updates.push(`${key} = ?`);
          vals.push(body[key]);
        }
      }
      if (updates.length === 0) return err('Aucun champ modifiable fourni', 400);
      updates.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`);
      vals.push(id);
      await env.DB
        .prepare(`UPDATE membres SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...vals)
        .run();
      return json({ ok: true });
    }

    // GET /api/membres/stats
    if (method === 'GET' && path === '/api/membres/stats') {
      const saison = url.searchParams.get('saison') ?? currentSaison();
      const stats = await env.DB
        .prepare(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN statut = 'actif' THEN 1 ELSE 0 END) AS actifs,
             SUM(CASE WHEN is_mineur = 1 THEN 1 ELSE 0 END) AS mineurs,
             SUM(CASE WHEN is_mineur = 0 THEN 1 ELSE 0 END) AS adultes
           FROM membres WHERE saison = ?`
        )
        .bind(saison)
        .first();
      return json(stats);
    }

    // ── Comptabilité ──────────────────────────────────────────────────────

    // GET /api/compta
    if (method === 'GET' && path === '/api/compta') {
      const annee = url.searchParams.get('annee') ?? String(new Date().getFullYear());
      const categorie = url.searchParams.get('categorie');

      let query = `SELECT * FROM ecritures_compta WHERE strftime('%Y', date_ecriture) = ?`;
      const params: unknown[] = [annee];
      if (categorie) {
        query += ` AND categorie = ?`;
        params.push(categorie);
      }
      query += ` ORDER BY date_ecriture DESC`;

      const rows = await env.DB.prepare(query).bind(...params).all();
      return json(rows.results);
    }

    // GET /api/compta/resume
    if (method === 'GET' && path === '/api/compta/resume') {
      const annee = url.searchParams.get('annee') ?? String(new Date().getFullYear());
      const resume = await env.DB
        .prepare(
          `SELECT
             categorie,
             source,
             COUNT(*) AS nb,
             SUM(montant) AS total
           FROM ecritures_compta
           WHERE strftime('%Y', date_ecriture) = ?
           GROUP BY categorie, source
           ORDER BY total DESC`
        )
        .bind(annee)
        .all();

      const solde = await env.DB
        .prepare(
          `SELECT SUM(montant) AS solde
           FROM ecritures_compta
           WHERE strftime('%Y', date_ecriture) = ?`
        )
        .bind(annee)
        .first<{ solde: number | null }>();

      return json({ annee, solde: solde?.solde ?? 0, details: resume.results });
    }

    // POST /api/compta  — écriture manuelle
    if (method === 'POST' && path === '/api/compta') {
      const body = await request.json<{
        libelle?: string;
        montant?: number;
        categorie?: string;
        date_ecriture?: string;
        commentaire?: string;
      }>();
      if (!body?.libelle || body?.montant === undefined) {
        return err('libelle et montant requis', 400);
      }
      await env.DB
        .prepare(
          `INSERT INTO ecritures_compta
             (date_ecriture, libelle, montant, categorie, source, commentaire)
           VALUES (?, ?, ?, ?, 'manuel', ?)`
        )
        .bind(
          body.date_ecriture ?? new Date().toISOString().slice(0, 10),
          body.libelle,
          body.montant,
          body.categorie ?? 'autre',
          body.commentaire ?? null,
        )
        .run();
      return json({ ok: true }, 201);
    }

    // ── Ventes ────────────────────────────────────────────────────────────

    // GET /api/ventes
    if (method === 'GET' && path === '/api/ventes') {
      const saison = url.searchParams.get('saison') ?? currentSaison();
      const rows = await env.DB
        .prepare(
          `SELECT
             v.*,
             m.nom, m.prenom, m.email, m.categorie
           FROM ventes_inscription v
           LEFT JOIN membres m ON m.id = v.membre_id
           WHERE v.saison = ?
           ORDER BY v.date_vente DESC`
        )
        .bind(saison)
        .all();
      return json(rows.results);
    }

    // GET /api/ventes/stats
    if (method === 'GET' && path === '/api/ventes/stats') {
      const saison = url.searchParams.get('saison') ?? currentSaison();
      const stats = await env.DB
        .prepare(
          `SELECT
             COUNT(*) AS nb_ventes,
             SUM(montant) AS chiffre_affaires,
             SUM(CASE WHEN statut_paiement = 'valide' THEN montant ELSE 0 END) AS encaisse
           FROM ventes_inscription WHERE saison = ?`
        )
        .bind(saison)
        .first();
      return json(stats);
    }

    // ── Inscriptions brutes (lecture depuis AFFBC_DB) ─────────────────────

    // GET /api/inscriptions-en-attente
    // Inscriptions dans affbc-prod dont le statut n'est pas encore 'valide'
    if (method === 'GET' && path === '/api/inscriptions-en-attente') {
      try {
        const rows = await env.AFFBC_DB
          .prepare(
            `SELECT id, nom, prenom, email, montant_total, statut, created_at
             FROM inscriptions
             WHERE statut != 'valide'
             ORDER BY created_at DESC
             LIMIT 100`
          )
          .all();
        return json(rows.results);
      } catch (e) {
        return err(`Impossible de lire AFFBC_DB: ${String(e)}`, 500);
      }
    }

    // ── Santé ─────────────────────────────────────────────────────────────

    if (method === 'GET' && path === '/api/health') {
      return json({ ok: true, ts: new Date().toISOString() });
    }

    // ── Fallback : servir le front-office HTML ────────────────────────────
    // (le fichier index.html est servi via env.ASSETS si configuré,
    //  sinon on renvoie une réponse minimale)
    return new Response('Not Found', { status: 404 });
  },

  // ── Cron trigger : sync automatique toutes les heures ───────────────────
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(syncInscriptionsValidees(env));
  },
} satisfies ExportedHandler<Env>;
