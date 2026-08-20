-- Script MANUEL, ponctuel — volontairement HORS du dossier migrations/.
-- Ne PAS renommer en NNNN_*.sql : il ne doit jamais être appliqué
-- automatiquement par `wrangler d1 migrations apply`, à exécuter à la main
-- via `wrangler d1 execute DB --remote --file=scripts/fix_cse_thales_discipline.sql`
-- (ou étape par étape en console) après avoir lu ce fichier en entier.
--
-- Contexte : avant le correctif du 20/08/2026 (disciplineFromFormula dans
-- inscription/src/routes/_lib/helpers.js), la création de la fiche adhérent
-- après paiement HelloAsso (inscription/.../payment/helloasso/status.js,
-- upsertAdherent) ne reconnaissait que la formule tarifaire 'bureau' pour
-- lui donner un type dédié ("Membre du Bureau") — toute autre formule, y
-- compris 'cse_thales', tombait dans le cas générique "Club". Un adhérent
-- inscrit avec le tarif CSE Thalès était donc enregistré avec
-- adherents.discipline = 'Club' au lieu de 'CSE Thalès' : invisible du
-- filtre "CSE Thalès" dans l'onglet Adhérents de gestion, et absent des
-- statistiques par type. C'est ce qui a révélé le bug (fiche de FLEURY
-- YOAN, 39,00 €, inscrit le 17/08/2026).
--
-- Ce script repère et corrige les fiches déjà créées avec ce bug, en se
-- basant sur inscriptions_publiques.formule_code (rempli au moment de
-- l'inscription, jamais modifié depuis) plutôt que sur une déduction a
-- posteriori — donc aucun faux positif sur une fiche "Club" légitime.
--
-- Effet secondaire attendu : ces adhérents basculeront du filtre "Club"
-- vers le filtre "CSE Thalès" dans l'onglet Adhérents (et dans les
-- exports CSV / statistiques par type) — c'est le but recherché.

-- ── Étape 1 : prévisualiser les fiches concernées (à faire systématiquement avant toute correction) ──
SELECT
  a.id,
  a.nom,
  a.prenom,
  a.ville,
  a.discipline AS discipline_actuelle,
  a.date_inscription,
  ip.formule_code
FROM adherents a
JOIN inscriptions_publiques ip ON ip.adherent_id = a.id
WHERE ip.formule_code = 'cse_thales'
  AND a.discipline != 'CSE Thalès'
ORDER BY a.date_inscription DESC;

-- ── Étape 2 : compter les fiches concernées ──────────────────────────────
SELECT COUNT(*) AS nb_fiches_a_corriger
FROM adherents a
JOIN inscriptions_publiques ip ON ip.adherent_id = a.id
WHERE ip.formule_code = 'cse_thales'
  AND a.discipline != 'CSE Thalès';

-- ── Étape 3 : correction effective ───────────────────────────────────────
-- Décommenter les lignes ci-dessous une fois les étapes 1 et 2 relues.
-- Le filtre `ip.formule_code = 'cse_thales'` cible exclusivement les
-- fiches issues de ce tarif : aucune fiche "Club" légitime (formule
-- base/family/pro, ou créée à la main dans gestion) ne peut être modifiée
-- par erreur ici. updated_at au format ISO8601+Z pour rester cohérent avec
-- le reste de l'appli (toISOString() côté JS, jamais datetime('now')).

-- UPDATE adherents
-- SET discipline = 'CSE Thalès',
--     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
-- WHERE id IN (
--   SELECT a.id FROM adherents a
--   JOIN inscriptions_publiques ip ON ip.adherent_id = a.id
--   WHERE ip.formule_code = 'cse_thales' AND a.discipline != 'CSE Thalès'
-- );
