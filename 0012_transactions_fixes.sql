-- Migration 0012 : corrections du schéma transactions
--
-- Deux bugs corrigés :
--
-- 1. Colonne ecriture_pieces_json manquante
--    Le frontend stocke les rapprochements multi-écritures dans cette colonne.
--    Sans cette colonne les UPDATE l'ignoraient silencieusement → rapprochements
--    groupés non persistants.
--    NOTE : SQLite ne supporte pas "ADD COLUMN IF NOT EXISTS".
--    Cette migration est idempotente via le mécanisme wrangler (elle ne tourne
--    qu'une fois), donc ADD COLUMN sans IF NOT EXISTS est correct ici.
--
-- 2. Contrainte UNIQUE manquante sur (compte_id, date_op, libelle, debit, credit)
--    Nécessaire pour que l'upsert d'import bancaire déduplique correctement.

ALTER TABLE transactions ADD COLUMN ecriture_pieces_json TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_dedup
  ON transactions(compte_id, date_op, libelle, debit, credit);
