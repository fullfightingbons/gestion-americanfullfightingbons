-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : ajoute la colonne submitted_at manquante sur feedback_responses
-- Fichier   : migrations/0016_feedback_responses_submitted_at.sql
-- Contexte  : cf. l'historique documenté dans 0010_feedback.sql (incident du
-- 2026-06-27 : "no such column: submitted_at") et 0014_feedback_schema_align.sql
-- ("feedback_responses réel → created_at (existe) → submitted_at (absent)").
--
-- ⚠️ INCIDENT DU 2026-07-02 : le premier déploiement de cette migration a bien
-- exécuté l'ALTER TABLE ci-dessous en production (colonne créée avec succès,
-- confirmé via `SELECT name FROM pragma_table_info('feedback_responses')`),
-- mais la migration n'a pas été enregistrée comme appliquée côté D1 (fichier
-- à deux instructions, la seconde — le backfill — a dû échouer ou la
-- validation n'a pas persisté). Conséquence : chaque redéploiement suivant
-- retentait l'ALTER TABLE et échouait avec "duplicate column name:
-- submitted_at", bloquant TOUT déploiement ultérieur (y compris des
-- changements sans rapport avec le feedback).
--
-- L'ALTER TABLE a donc été retiré de cette migration (colonne déjà présente,
-- confirmé) : ne reste que le backfill, idempotent et sans risque.
-- ─────────────────────────────────────────────────────────────────────────────

-- Backfill pour les réponses déjà enregistrées via la colonne legacy created_at,
-- si celle-ci existe et contient des données pour des lignes où submitted_at
-- n'a pas encore été renseigné. Sans risque : ne touche que des lignes déjà
-- existantes, n'affecte pas les nouvelles soumissions.
UPDATE feedback_responses SET submitted_at = created_at
WHERE created_at IS NOT NULL AND (submitted_at IS NULL OR submitted_at = '')
  AND EXISTS (SELECT 1 FROM pragma_table_info('feedback_responses') WHERE name = 'created_at');
