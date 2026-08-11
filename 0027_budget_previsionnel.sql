-- Migration 0027 : budget prévisionnel par exercice
--
-- Le bilan de clôture (déjà existant) donne le réalisé une fois l'exercice
-- terminé. Cette table stocke le prévisionnel voté en AG en début de saison,
-- poste par poste (même référentiel de comptes que journal_comptable, ex:
-- 6xx charges / 7xx produits), pour permettre un comparatif prévu/réalisé en
-- cours d'exercice (cf. route GET /api/budget/:exercice_id/comparatif).
CREATE TABLE IF NOT EXISTS budget_previsionnel (
  id           TEXT PRIMARY KEY,
  exercice_id  TEXT NOT NULL REFERENCES exercices(id) ON DELETE CASCADE,
  compte       TEXT NOT NULL,                 -- code PCG, ex: "6060", "7560"
  libelle      TEXT NOT NULL,                 -- ex: "Cotisations adhérents", "Achat matériel"
  montant_prevu REAL NOT NULL DEFAULT 0,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_budget_exercice ON budget_previsionnel(exercice_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_unique_compte ON budget_previsionnel(exercice_id, compte);
