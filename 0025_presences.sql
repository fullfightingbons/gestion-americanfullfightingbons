-- Migration 0025 : présence aux cours
--
-- Pointage simple par séance : qui était présent, sur quel créneau. Alimente
-- un futur calcul d'assiduité et sert de justificatif d'activité réelle du
-- club (utile en cas de contrôle fédéral ou pour la trésorerie associative).
-- Enregistré via l'API CRUD générique (DB_TABLES) comme la majorité des
-- tables de gestion — pas de route dédiée nécessaire pour le CRUD de base.
CREATE TABLE IF NOT EXISTS presences (
  id           TEXT PRIMARY KEY,
  adherent_id  TEXT NOT NULL REFERENCES adherents(id) ON DELETE CASCADE,
  date_seance  TEXT NOT NULL,                 -- YYYY-MM-DD
  creneau      TEXT,                          -- ex: "Cours adultes 20h", libre pour coller au planning encadrants
  present      INTEGER NOT NULL DEFAULT 1,    -- 1 = présent, 0 = absence justifiée enregistrée explicitement
  notes        TEXT,
  created_by   TEXT REFERENCES utilisateurs(id),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_presences_adherent ON presences(adherent_id, date_seance);
CREATE INDEX IF NOT EXISTS idx_presences_date      ON presences(date_seance);
-- Un même adhérent ne peut être pointé deux fois sur la même séance/créneau.
CREATE UNIQUE INDEX IF NOT EXISTS idx_presences_unique ON presences(adherent_id, date_seance, creneau);
