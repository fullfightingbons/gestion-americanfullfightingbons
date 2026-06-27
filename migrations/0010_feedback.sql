-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : tables feedback_campaigns / feedback_recipients / feedback_responses
-- Fichier   : migrations/0010_feedback.sql
-- Contexte  : Ces trois tables existent déjà en production (elles sont visibles
--             dans le dashboard D1) mais aucun fichier SQL du dépôt ne les crée.
--             Cette migration les ajoute en IF NOT EXISTS : inoffensive si elles
--             existent déjà avec EXACTEMENT ce schéma.
--
-- ⚠️ INCIDENT DU 2026-06-27 : cette migration a échoué en production avec
-- "no such column: statut at offset 84: SQLITE_ERROR [code: 7500]".
-- Cause : feedback_recipients existe déjà en prod (créée manuellement hors
-- migration) mais SANS colonne "statut". CREATE TABLE IF NOT EXISTS ne modifie
-- pas une table déjà existante : il ne fait rien. L'index
-- idx_feedback_recipients_statut, lui, est exécuté ensuite et plante car la
-- colonne qu'il référence n'existe pas réellement en base.
--
-- Les index sur "statut" ont donc été retirés de cette migration (voir plus
-- bas) pour ne plus bloquer le déploiement. Avant de les recréer :
--   1) Vérifier le schéma réel :
--        npx wrangler d1 execute DB --remote --command "SELECT sql FROM sqlite_master WHERE type IN ('table','index') AND name LIKE 'feedback_%'"
--   2) Si la colonne "statut" manque sur feedback_recipients ou
--      feedback_campaigns, l'ajouter manuellement :
--        npx wrangler d1 execute DB --remote --command "ALTER TABLE feedback_recipients ADD COLUMN statut TEXT NOT NULL DEFAULT 'en_attente'"
--      (idem pour feedback_campaigns avec son propre defaut 'brouillon')
--   3) Recréer ensuite les index dans une nouvelle migration (0011_...), pas
--      ici, pour ne pas re-casser ce fichier déjà appliqué une fois corrigé.
-- ─────────────────────────────────────────────────────────────────────────────

PRAGMA foreign_keys = ON;

-- ── Campagnes de feedback ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback_campaigns (
  id           TEXT PRIMARY KEY,
  titre        TEXT NOT NULL,
  description  TEXT,
  statut       TEXT NOT NULL DEFAULT 'brouillon'
               CHECK (statut IN ('brouillon', 'active', 'cloturee')),
  date_debut   TEXT,
  date_fin     TEXT,
  created_by   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Destinataires d'une campagne ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback_recipients (
  id            TEXT PRIMARY KEY,
  campaign_id   TEXT NOT NULL,
  adherent_id   TEXT,
  email         TEXT NOT NULL,
  nom           TEXT,
  token         TEXT UNIQUE,   -- token d'accès au formulaire public (lien individualisé)
  statut        TEXT NOT NULL DEFAULT 'en_attente'
                CHECK (statut IN ('en_attente', 'repondu', 'invalide')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (campaign_id) REFERENCES feedback_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (adherent_id) REFERENCES adherents(id) ON DELETE SET NULL
);

-- ── Réponses collectées ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback_responses (
  id            TEXT PRIMARY KEY,
  campaign_id   TEXT NOT NULL,
  recipient_id  TEXT,
  reponses_json TEXT NOT NULL DEFAULT '{}',   -- JSON libre {question: reponse}
  submitted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (campaign_id)  REFERENCES feedback_campaigns(id)  ON DELETE CASCADE,
  FOREIGN KEY (recipient_id) REFERENCES feedback_recipients(id) ON DELETE SET NULL
);

-- ── Index ─────────────────────────────────────────────────────────────────────
-- Les index sur la colonne "statut" (idx_feedback_recipients_statut) ont été
-- retirés : voir le commentaire d'incident en haut de ce fichier. Ils ne
-- doivent être recréés que dans une migration ultérieure, une fois le schéma
-- réel de feedback_recipients confirmé.
CREATE INDEX IF NOT EXISTS idx_feedback_recipients_campaign  ON feedback_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_feedback_responses_campaign   ON feedback_responses(campaign_id);
CREATE INDEX IF NOT EXISTS idx_feedback_responses_submitted  ON feedback_responses(submitted_at DESC);
