-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0013 : complète le schéma feedback_* (version corrigée)
--
-- HISTORIQUE DES ERREURS :
--   - 1ère tentative : échec sur "prenom" (duplicate column name)
--     → la colonne prenom existe déjà en production dans feedback_recipients
--     → supprimée de cette migration
--
-- Si une autre colonne provoque encore un "duplicate column name" :
--   1) Notez le nom de la colonne dans le message d'erreur
--   2) Supprimez la ligne ALTER TABLE correspondante dans ce fichier
--   3) Ré-appliquez : npx wrangler d1 migrations apply DB --remote
--
-- Pour inspecter le schéma réel en production :
--   npx wrangler d1 execute DB --remote --command \
--     "SELECT sql FROM sqlite_master WHERE type='table' AND name LIKE 'feedback_%'"
-- ─────────────────────────────────────────────────────────────────────────────

-- feedback_campaigns
ALTER TABLE feedback_campaigns ADD COLUMN exercice_id TEXT REFERENCES exercices(id);
ALTER TABLE feedback_campaigns ADD COLUMN questions   TEXT NOT NULL DEFAULT '[]';

-- feedback_recipients (prenom déjà présent en production → retiré)
ALTER TABLE feedback_recipients ADD COLUMN envoye     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feedback_recipients ADD COLUMN envoye_at  TEXT;
ALTER TABLE feedback_recipients ADD COLUMN repondu    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feedback_recipients ADD COLUMN repondu_at TEXT;
ALTER TABLE feedback_recipients ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));

-- feedback_responses
ALTER TABLE feedback_responses ADD COLUMN reponses     TEXT NOT NULL DEFAULT '{}';
ALTER TABLE feedback_responses ADD COLUMN note_globale REAL;
ALTER TABLE feedback_responses ADD COLUMN commentaire  TEXT;

-- Index
CREATE INDEX IF NOT EXISTS idx_feedback_recipients_campaign ON feedback_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_feedback_responses_campaign  ON feedback_responses(campaign_id);
CREATE INDEX IF NOT EXISTS idx_feedback_campaigns_exercice  ON feedback_campaigns(exercice_id);
