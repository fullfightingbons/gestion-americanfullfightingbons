-- Migration 0028 : planning des encadrants
--
-- Qui encadre quel cours régulier (hebdomadaire), distinct de `calendrier`
-- qui couvre les événements ponctuels (stages, compétitions). jour_semaine
-- en entier (0=dimanche...6=samedi, convention SQLite strftime('%w')) pour
-- pouvoir trier/filtrer facilement.
CREATE TABLE IF NOT EXISTS planning_encadrants (
  id            TEXT PRIMARY KEY,
  encadrant_id  TEXT NOT NULL REFERENCES adherents(id) ON DELETE CASCADE,
  jour_semaine  INTEGER NOT NULL CHECK (jour_semaine BETWEEN 0 AND 6),
  heure_debut   TEXT NOT NULL,                -- HH:MM
  heure_fin     TEXT NOT NULL,                -- HH:MM
  cours         TEXT NOT NULL,                -- ex: "Cours adultes", "Cours enfants"
  lieu          TEXT,
  actif         INTEGER NOT NULL DEFAULT 1,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_planning_encadrant ON planning_encadrants(encadrant_id);
CREATE INDEX IF NOT EXISTS idx_planning_jour       ON planning_encadrants(jour_semaine, actif);
