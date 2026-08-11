-- Migration 0024 : suivi des relances automatiques de factures impayées
--
-- Même logique que certificat_rappels (migration 0017) : une table de suivi
-- séparée plutôt que des colonnes ajoutées à `factures`, pour ne pas risquer
-- de collision avec des colonnes déjà présentes en production mais absentes
-- des migrations versionnées (ex: client_email, notes_paiement, montant_total
-- référencées par public/assets/app.js). checkFacturesEnRetard (cron
-- quotidien, cf. src/index.ts) relance une facture impayée à J+15 puis J+30
-- après sa date d'émission, une seule fois par palier.
CREATE TABLE IF NOT EXISTS facture_relances_auto (
  id          TEXT PRIMARY KEY,
  facture_id  TEXT NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  palier      TEXT NOT NULL CHECK (palier IN ('J15', 'J30')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_facture_relances_unique ON facture_relances_auto(facture_id, palier);
