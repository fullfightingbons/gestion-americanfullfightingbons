-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : tables feedback_campaigns / feedback_recipients / feedback_responses
-- Fichier   : migrations/0010_feedback.sql
-- Contexte  : Ces trois tables existent déjà en production (elles sont visibles
--             dans le dashboard D1) mais aucun fichier SQL du dépôt ne les crée.
--             Cette migration les ajoute en IF NOT EXISTS : inoffensive si elles
--             existent déjà, indispensable pour une recréation depuis zéro.
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
CREATE INDEX IF NOT EXISTS idx_feedback_recipients_campaign  ON feedback_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_feedback_recipients_statut    ON feedback_recipients(statut, campaign_id);
CREATE INDEX IF NOT EXISTS idx_feedback_responses_campaign   ON feedback_responses(campaign_id);
CREATE INDEX IF NOT EXISTS idx_feedback_responses_submitted  ON feedback_responses(submitted_at DESC);
