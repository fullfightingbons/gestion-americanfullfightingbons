-- ⚠️ AVANT D'APPLIQUER CETTE MIGRATION EN PRODUCTION :
-- vérifiez qu'il n'y a aucune ligne existante dans la table "diplomes" :
--   wrangler d1 execute <votre-base> --remote --command "SELECT count(*) FROM diplomes"
-- Cette migration recrée entièrement la table car son schéma actuel (colonnes
-- nom/prenom/date_obtention/r2_modele, NOT NULL sans défaut) ne correspond pas
-- aux colonnes réellement envoyées par l'application (titre/date_emission/modele),
-- ce qui fait échouer silencieusement tout enregistrement de diplôme depuis l'interface.
-- Si la requête ci-dessus retourne 0, cette migration est sans risque de perte de données.
-- Si elle retourne un nombre > 0, contactez-moi avant d'appliquer : il faudra adapter
-- cette migration pour migrer les lignes existantes au lieu de recréer la table à vide.

DROP TABLE IF EXISTS diplomes;

CREATE TABLE diplomes (
  id                TEXT PRIMARY KEY,                 -- UUID généré côté client
  adherent_id       TEXT NOT NULL,
  nom               TEXT NOT NULL,
  prenom            TEXT NOT NULL,
  titre             TEXT NOT NULL DEFAULT 'Diplôme de ceinture',
  ceinture          TEXT NOT NULL DEFAULT '',         -- valeur libre (cf. adherents.couleur_ceinture, non contrainte)
  date_emission     TEXT NOT NULL,                    -- date affichée sur le diplôme (saisie par l'utilisateur)
  saison            TEXT NOT NULL,                     -- ex. "2025-2026" — calculée à l'émission, jamais recalculée après coup
  modele            TEXT,                              -- libellé du modèle/template utilisé
  pdf_storage_path  TEXT,                              -- chemin R2 (bucket fullfighting-pdf) de l'archive PDF, si conservée
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_diplomes_adherent ON diplomes(adherent_id);
CREATE INDEX idx_diplomes_saison   ON diplomes(saison);
