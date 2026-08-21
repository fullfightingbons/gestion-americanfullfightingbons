-- Migration 0032 : présences des personnes non adhérentes (invité·e·s)
--
-- Contexte : jusqu'ici presences.adherent_id est NOT NULL — impossible de
-- pointer un essai gratuit, un invité CSE ponctuel ou un visiteur qui n'est
-- pas (ou pas encore) adhérent sur le suivi des présences.
--
-- Cette migration :
--   1) rend adherent_id nullable. SQLite ne permet pas de retirer une
--      contrainte NOT NULL ni une FK existante via ALTER TABLE : on suit la
--      procédure de reconstruction de table documentée par SQLite lui-même
--      (https://sqlite.org/lang_altertable.html §7 "Making Other Kinds Of
--      Table Schema Changes") plutôt qu'un ALTER COLUMN inexistant en
--      SQLite/D1.
--   2) ajoute nom_invite (TEXT), renseigné uniquement quand adherent_id est
--      NULL — le nom libre de la personne non adhérente.
--   3) ajoute une contrainte CHECK garantissant qu'une ligne référence soit
--      un adhérent existant, soit un nom d'invité — jamais aucun des deux,
--      jamais les deux à la fois.
--
-- Aucune autre table ne référence presences(id) (vérifié dans tout le
-- dépôt) : le DROP TABLE intermédiaire ne casse aucune FK externe.

PRAGMA foreign_keys = OFF;

CREATE TABLE presences_new (
  id           TEXT PRIMARY KEY,
  adherent_id  TEXT REFERENCES adherents(id) ON DELETE CASCADE,
  nom_invite   TEXT,                          -- nom libre d'une personne non adhérente pointée sur une séance
  date_seance  TEXT NOT NULL,                 -- YYYY-MM-DD
  creneau      TEXT,                          -- ex: "Cours adultes 20h", libre pour coller au planning encadrants
  present      INTEGER NOT NULL DEFAULT 1,    -- 1 = présent, 0 = absence justifiée enregistrée explicitement
  notes        TEXT,
  created_by   TEXT REFERENCES utilisateurs(id),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  CHECK (
    (adherent_id IS NOT NULL AND nom_invite IS NULL)
    OR (adherent_id IS NULL AND nom_invite IS NOT NULL AND trim(nom_invite) <> '')
  )
);

INSERT INTO presences_new (id, adherent_id, nom_invite, date_seance, creneau, present, notes, created_by, created_at, updated_at)
SELECT id, adherent_id, NULL, date_seance, creneau, present, notes, created_by, created_at, updated_at
FROM presences;

DROP TABLE presences;
ALTER TABLE presences_new RENAME TO presences;

CREATE INDEX IF NOT EXISTS idx_presences_adherent ON presences(adherent_id, date_seance);
CREATE INDEX IF NOT EXISTS idx_presences_date      ON presences(date_seance);
-- Un même adhérent ne peut être pointé deux fois sur la même séance/créneau.
-- NULL n'est jamais égal à NULL en SQL : cet index unique ne dédoublonne
-- donc pas les invité·e·s (adherent_id NULL) entre eux, ce qui est
-- acceptable — ce ne sont pas des identités trackées par ID.
CREATE UNIQUE INDEX IF NOT EXISTS idx_presences_unique ON presences(adherent_id, date_seance, creneau);
CREATE INDEX IF NOT EXISTS idx_presences_invite ON presences(nom_invite, date_seance) WHERE nom_invite IS NOT NULL;

PRAGMA foreign_keys = ON;
