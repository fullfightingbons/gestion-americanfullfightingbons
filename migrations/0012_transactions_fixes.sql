-- Migration 0012 : corrections du schéma transactions
--
-- Deux bugs corrigés :
--
-- 1. Colonne ecriture_pieces_json manquante
--    Le frontend stocke les rapprochements multi-écritures dans cette colonne
--    (ex: rapprochement groupé → ["ACH-abc-L1","ACH-abc-L2"]).
--    Sans cette colonne les UPDATE silencieusement ignoraient ce champ,
--    rendant le rapprochement groupé non persistant.
--
-- 2. Contrainte UNIQUE manquante sur (compte_id, date_op, libelle, debit, credit)
--    Le frontend utilise upsert({onConflict:[...]}) pour dédupliquer les imports
--    bancaires (CSV et PDF). Sans UNIQUE index SQLite traite l'upsert comme un
--    INSERT simple → doublons à chaque import du même fichier.

-- 1. Ajouter la colonne manquante (IF NOT EXISTS ≡ idempotent)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ecriture_pieces_json TEXT;

-- 2. Créer la contrainte d'unicité nécessaire à l'upsert d'import bancaire
--    On utilise CREATE UNIQUE INDEX (SQLite ne supporte pas ALTER TABLE ADD CONSTRAINT)
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_dedup
  ON transactions(compte_id, date_op, libelle, debit, credit);
