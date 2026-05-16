CREATE TABLE IF NOT EXISTS diplomes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  adherent_id      TEXT NOT NULL,
  nom              TEXT NOT NULL,
  prenom           TEXT NOT NULL,
  ceinture         TEXT NOT NULL CHECK (ceinture IN ('jaune','orange','verte','bleue','marron','noire')),
  date_obtention   TEXT NOT NULL,
  date_generation  TEXT NOT NULL DEFAULT (datetime('now')),
  r2_modele        TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_diplomes_adherent ON diplomes(adherent_id);
