-- Migration 0026 : inventaire du matériel club
--
-- Distinct de la boutique (qui gère la vente aux adhérents) : ici, le
-- matériel appartenant au club lui-même (gants, protections, tapis...),
-- avec son état et son suivi d'entretien/révision.
CREATE TABLE IF NOT EXISTS materiel (
  id                TEXT PRIMARY KEY,
  nom               TEXT NOT NULL,
  categorie         TEXT,                     -- ex: "Protections", "Tapis", "Sacs de frappe"
  quantite          INTEGER NOT NULL DEFAULT 1,
  etat              TEXT NOT NULL DEFAULT 'Bon' CHECK (etat IN ('Neuf', 'Bon', 'Usagé', 'À réviser', 'Hors service')),
  date_achat        TEXT,
  prix_achat        REAL,
  derniere_revision TEXT,
  prochaine_revision TEXT,
  localisation      TEXT,                     -- ex: "Dojo — armoire 2"
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_materiel_categorie ON materiel(categorie);
CREATE INDEX IF NOT EXISTS idx_materiel_etat      ON materiel(etat);
CREATE INDEX IF NOT EXISTS idx_materiel_revision  ON materiel(prochaine_revision);
