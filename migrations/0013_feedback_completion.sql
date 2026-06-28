-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : complète le schéma feedback_* pour le rendre cohérent avec ce
--             qu'utilisent réellement public/assets/app.js (envoye, envoye_at,
--             repondu, repondu_at, token, reponses, note_globale, commentaire)
--             et le nouvel envoi automatique de fin de saison (src/index.ts :
--             triggerEndOfSeasonFeedback, handlePublicFeedbackGet/Submit).
-- Fichier   : migrations/0013_feedback_completion.sql
--
-- ⚠️ MÊME PRINCIPE QUE 0010/0011 : le schéma réel de feedback_recipients et
-- feedback_responses en production a déjà divergé deux fois de ce qui était
-- supposé (cf. incidents documentés dans 0010_feedback.sql). Chaque ligne
-- ALTER TABLE ci-dessous est indépendante : si une colonne donnée existe
-- déjà sous ce nom exact, SA ligne échouera et annulera toute la migration
-- (aucune perte de données, mais aucune des lignes suivantes ne sera
-- appliquée non plus). Dans ce cas :
--   1) Repérez le nom de colonne dans le message d'erreur.
--   2) Vérifiez le schéma réel si besoin :
--        npx wrangler d1 execute DB --remote --command \
--          "SELECT sql FROM sqlite_master WHERE type='table' AND name LIKE 'feedback_%'"
--   3) Supprimez UNIQUEMENT la ligne correspondante de ce fichier, puis
--      ré-appliquez la migration — les lignes restantes s'appliqueront.
-- ─────────────────────────────────────────────────────────────────────────────

-- feedback_campaigns : liaison à la saison (exercice) concernée par l'envoi
-- automatique, et contenu du questionnaire (JSON : id/texte/type/options,
-- déjà lu et écrit tel quel par app.js : c.questions).
ALTER TABLE feedback_campaigns ADD COLUMN exercice_id TEXT REFERENCES exercices(id);
ALTER TABLE feedback_campaigns ADD COLUMN questions   TEXT NOT NULL DEFAULT '[]';

-- feedback_recipients : suivi envoi/réponse par destinataire — colonnes
-- déjà utilisées par public/assets/app.js (r.envoye, r.envoye_at, r.repondu,
-- r.repondu_at) dans saveFeedbackInvite / vFeedbackDetail.
ALTER TABLE feedback_recipients ADD COLUMN prenom     TEXT;
ALTER TABLE feedback_recipients ADD COLUMN envoye     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feedback_recipients ADD COLUMN envoye_at  TEXT;
ALTER TABLE feedback_recipients ADD COLUMN repondu    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feedback_recipients ADD COLUMN repondu_at TEXT;
ALTER TABLE feedback_recipients ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));

-- feedback_responses : contenu structuré de la réponse — colonnes déjà
-- utilisées par public/assets/app.js (r.reponses, r.note_globale,
-- r.commentaire) dans vFeedbackDetail / exportFeedbackCSV.
ALTER TABLE feedback_responses ADD COLUMN reponses     TEXT NOT NULL DEFAULT '{}';
ALTER TABLE feedback_responses ADD COLUMN note_globale REAL;
ALTER TABLE feedback_responses ADD COLUMN commentaire  TEXT;

-- Index sûrs uniquement : campaign_id est une colonne NOT NULL présente
-- depuis la création originale des trois tables (FK vers feedback_campaigns),
-- donc sans risque — contrairement à statut/submitted_at écartés dans 0010
-- faute de certitude sur leur existence réelle.
CREATE INDEX IF NOT EXISTS idx_feedback_recipients_campaign ON feedback_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_feedback_responses_campaign  ON feedback_responses(campaign_id);
CREATE INDEX IF NOT EXISTS idx_feedback_campaigns_exercice  ON feedback_campaigns(exercice_id);
