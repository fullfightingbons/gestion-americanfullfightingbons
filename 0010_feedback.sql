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
-- ⚠️ INCIDENT DU 2026-06-27 (suite) : un 2e échec identique est survenu, cette
-- fois avec "no such column: submitted_at at offset 83", sur l'index
-- idx_feedback_responses_submitted. Même cause que pour "statut" ci-dessus :
-- feedback_responses existe déjà en prod avec un schéma divergent qui ne
-- correspond pas exactement à celui défini plus bas dans ce fichier.
--
-- Conclusion : on ne peut faire AUCUNE hypothèse sur les colonnes présentes
-- dans les tables déjà existantes (feedback_campaigns / feedback_recipients /
-- feedback_responses) tant que le schéma réel n'a pas été vérifié. Tous les
-- index portant sur une colonne autre que la clé primaire "id" ont donc été
-- retirés de cette migration (campaign_id, statut, submitted_at). Ils
-- devront être recréés dans une migration ultérieure (0011_...), un par un,
-- après vérification du schéma réel via la commande ci-dessus.
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
-- AUCUN index n'est créé ici (voir les deux incidents documentés en haut de ce
-- fichier) : toutes les colonnes visées (campaign_id, statut, submitted_at)
-- se sont révélées absentes du schéma réel d'au moins une table existante.
-- Recréer les index séparément (migration 0011_...) une fois le schéma
-- réel confirmé via :
--   npx wrangler d1 execute DB --remote --command "SELECT sql FROM sqlite_master WHERE type IN ('table','index') AND name LIKE 'feedback_%'"
