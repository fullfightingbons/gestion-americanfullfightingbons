-- Demandes de suppression RGPD (droit à l'effacement, art. 17). Une table
-- dédiée plutôt qu'un simple flag sur adherent_comptes : une demande garde
-- sa propre trace (qui, quand, traitée par qui) même après la suppression
-- du compte lui-même.
--
-- statut :
--   'pending'   demande reçue, en attente de la fin du délai de conservation
--   'cancelled' annulée par le membre avant traitement
--   'done'      anonymisation exécutée (par le staff, cf. gestion)
--   'rejected'  refusée par le staff (motif dans staff_notes), ex. litige en
--               cours empêchant l'effacement
--
-- eligible_at : calculé à la création = (dernière date_fin_adhesion connue,
-- ou date_inscription si le membre n'a jamais eu de date de fin) + 5 ans.
-- Le compte à rebours démarre à la fin de la dernière adhésion active, pas
-- à la date de la demande : supprimer les données d'un membre encore
-- inscrit casserait le service en cours.
CREATE TABLE IF NOT EXISTS deletion_requests (
  id TEXT PRIMARY KEY,
  adherent_compte_id TEXT NOT NULL,
  email TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  eligible_at TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'pending',
  staff_notes TEXT,
  processed_at TEXT,
  processed_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_statut ON deletion_requests(statut);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_compte ON deletion_requests(adherent_compte_id);
