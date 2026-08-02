-- Suivi des relances email envoyées pour les prêts de matériel en retard,
-- même principe que certificat_rappels (migration 0017) : une seule relance
-- par emprunt, pour ne pas spammer un emprunteur qui n'a toujours pas rendu.
CREATE TABLE IF NOT EXISTS materiel_rappels (
  id TEXT PRIMARY KEY,
  emprunt_id TEXT NOT NULL,
  envoye_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (emprunt_id) REFERENCES materiel_emprunts(id)
);

CREATE INDEX IF NOT EXISTS idx_materiel_rappels_emprunt ON materiel_rappels(emprunt_id);
