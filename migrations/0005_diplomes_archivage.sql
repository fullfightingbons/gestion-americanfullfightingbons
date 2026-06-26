-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : enrichissement de la table diplomes pour l'archivage complet
-- Fichier   : migrations/0005_diplomes_archivage.sql  (ou prochain numéro libre)
-- Déployer  : wrangler d1 migrations apply --remote  (via GitHub Actions)
-- ─────────────────────────────────────────────────────────────────────────────

-- Nom de l'enseignant / jury ayant délivré le diplôme
ALTER TABLE diplomes ADD COLUMN delivre_par TEXT;

-- Commentaire libre (contexte du passage de grade, jury complet, stage…)
ALTER TABLE diplomes ADD COLUMN commentaire TEXT;

-- Index sur adherent_id pour la requête « diplômes d'un adhérent » (fiche modal)
CREATE INDEX IF NOT EXISTS idx_diplomes_adherent_id ON diplomes(adherent_id);

-- Index sur la saison pour le filtre par saison dans vDiplomesArchive
CREATE INDEX IF NOT EXISTS idx_diplomes_saison ON diplomes(saison);
