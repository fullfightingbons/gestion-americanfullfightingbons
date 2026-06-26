-- ══════════════════════════════════════════════════════════════════════════
-- Migration : intégration des inscriptions validées dans la gestion
-- Base : gestion-americanfullfightingbonsdb
-- Cette migration crée les tables et vues nécessaires pour que la gestion
-- voie automatiquement les dossiers d'inscription validés (paiement HelloAsso
-- confirmé) et les répercute sur les onglets adhérents, compta et ventes.
-- ══════════════════════════════════════════════════════════════════════════

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ──────────────────────────────────────────────────────────────────────────
-- TABLE : membres
-- Source de vérité locale pour l'onglet Adhérents.
-- Alimentée automatiquement depuis les inscriptions validées (AFFBC_DB).
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS membres (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Identifiants croisés
  inscription_ref    TEXT UNIQUE,          -- référence HelloAsso (helloasso_ref de l'inscription)
  inscription_id     INTEGER,              -- id de la ligne dans affbc-prod.inscriptions
  -- Identité
  nom                TEXT NOT NULL,
  prenom             TEXT NOT NULL,
  email              TEXT NOT NULL,
  telephone          TEXT,
  date_naissance     TEXT,                 -- YYYY-MM-DD
  is_mineur          INTEGER DEFAULT 0,
  -- Adhésion
  saison             TEXT NOT NULL,        -- ex: "2025-2026"
  categorie          TEXT,                 -- Benjamin, Minime, Cadet, Senior…
  niveau             TEXT,
  licence_ffk        TEXT,
  -- Statut
  statut             TEXT NOT NULL DEFAULT 'actif'
                     CHECK (statut IN ('actif','inactif','suspendu')),
  -- Diplôme / ceinture
  ceinture_actuelle  TEXT,
  -- Dates
  date_adhesion      TEXT NOT NULL DEFAULT (date('now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_membres_email    ON membres(email);
CREATE INDEX IF NOT EXISTS idx_membres_saison   ON membres(saison);
CREATE INDEX IF NOT EXISTS idx_membres_ref      ON membres(inscription_ref);

-- ──────────────────────────────────────────────────────────────────────────
-- TABLE : ecritures_compta
-- Toutes les entrées de trésorerie (cotisations, ventes boutique, etc.)
-- Alimentée automatiquement à la validation d'une inscription.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ecritures_compta (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  date_ecriture   TEXT NOT NULL DEFAULT (date('now')),
  libelle         TEXT NOT NULL,
  montant         REAL NOT NULL,           -- positif = recette, négatif = dépense
  categorie       TEXT NOT NULL DEFAULT 'cotisation'
                  CHECK (categorie IN (
                    'cotisation','vente','stage','grade','don','remboursement','charge','autre'
                  )),
  source          TEXT NOT NULL DEFAULT 'inscription'
                  CHECK (source IN ('inscription','boutique','calendrier','manuel')),
  source_ref      TEXT,                    -- helloasso_ref ou order_id boutique
  source_id       INTEGER,                 -- id dans la table source
  membre_id       INTEGER REFERENCES membres(id),
  commentaire     TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_compta_date      ON ecritures_compta(date_ecriture);
CREATE INDEX IF NOT EXISTS idx_compta_categorie ON ecritures_compta(categorie);
CREATE INDEX IF NOT EXISTS idx_compta_source    ON ecritures_compta(source, source_ref);

-- ──────────────────────────────────────────────────────────────────────────
-- TABLE : ventes_inscription
-- Détail des ventes générées par les inscriptions (pour l'onglet Ventes).
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ventes_inscription (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  membre_id       INTEGER REFERENCES membres(id) ON DELETE CASCADE,
  inscription_ref TEXT NOT NULL,           -- helloasso_ref
  saison          TEXT NOT NULL,
  produit         TEXT NOT NULL DEFAULT 'Cotisation annuelle',
  montant         REAL NOT NULL,
  statut_paiement TEXT NOT NULL DEFAULT 'valide'
                  CHECK (statut_paiement IN ('valide','rembourse','litige')),
  date_vente      TEXT NOT NULL DEFAULT (date('now')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_ventes_saison    ON ventes_inscription(saison);
CREATE INDEX IF NOT EXISTS idx_ventes_membre    ON ventes_inscription(membre_id);

-- ──────────────────────────────────────────────────────────────────────────
-- TABLE : sync_log
-- Journal de synchronisation pour idempotence et débogage.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  action         TEXT NOT NULL,            -- 'inscription_validated', 'membre_created', etc.
  inscription_id INTEGER,
  helloasso_ref  TEXT,
  status         TEXT NOT NULL DEFAULT 'ok'
                 CHECK (status IN ('ok','error','skipped')),
  detail         TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
