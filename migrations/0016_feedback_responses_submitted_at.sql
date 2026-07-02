-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : ajoute la colonne submitted_at manquante sur feedback_responses
-- Fichier   : migrations/0016_feedback_responses_submitted_at.sql
-- Contexte  : cf. l'historique documenté dans 0010_feedback.sql (incident du
-- 2026-06-27 : "no such column: submitted_at") et 0014_feedback_schema_align.sql
-- ("feedback_responses réel → created_at (existe) → submitted_at (absent)").
--
-- La colonne submitted_at n'a en réalité jamais été créée en production : elle
-- ne figurait que dans le CREATE TABLE IF NOT EXISTS de 0010, qui ne s'est
-- jamais exécuté puisque la table existait déjà. 0014 avait retiré son ajout
-- par mesure préventive, en supposant à tort qu'elle était déjà présente.
--
-- Conséquence concrète : l'INSERT de handlePublicFeedbackSubmit (src/index.ts)
-- référence submitted_at et échoue en production avec "no such column:
-- submitted_at", ce qui casse l'envoi du formulaire public /feedback.html
-- ("Erreur de connexion, réessaie dans un instant" côté utilisateur).
--
-- Si cette colonne s'avère en fait déjà présente (auquel cas cette migration
-- échouera avec "duplicate column name: submitted_at"), retirer la ligne
-- ci-dessous et investiguer une autre cause (voir wrangler tail en prod).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE feedback_responses ADD COLUMN submitted_at TEXT NOT NULL DEFAULT (datetime('now'));

-- Backfill pour les réponses déjà enregistrées via la colonne legacy created_at,
-- si celle-ci existe et contient des données pour des lignes où submitted_at
-- viendrait d'être créé avec la valeur par défaut (approximative) ci-dessus.
-- Sans risque : ne touche que des lignes déjà existantes, n'affecte pas les
-- nouvelles soumissions.
UPDATE feedback_responses SET submitted_at = created_at WHERE created_at IS NOT NULL;
