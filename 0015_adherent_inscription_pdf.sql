-- Sépare le PDF généré automatiquement à l'inscription (bulletin d'inscription,
-- rempli par le worker inscription-americanfullfightingbons à la confirmation
-- du paiement HelloAsso ou d'une inscription gratuite) de la fiche de notation
-- (PDF téléversé manuellement par un coach/secrétaire depuis gestion).
--
-- Avant cette migration, les deux documents partageaient les mêmes colonnes
-- (pdf_storage_path / pdf_public_url / pdf_nom_fichier / pdf_uploaded_at) sur
-- "adherents" : le worker inscription écrasait systématiquement ces colonnes
-- à chaque inscription ou renouvellement (y compris en les remettant à NULL
-- avant de les repositionner), effaçant silencieusement toute fiche de
-- notation déjà enregistrée — et inversement, un nouveau téléversement de
-- fiche de notation faisait perdre le lien vers le bulletin d'inscription.
--
-- pdf_storage_path / pdf_public_url / pdf_nom_fichier / pdf_uploaded_at
-- restent désormais réservés à la fiche de notation (gestion uniquement).
-- pdf_inscription_* sont réservés au bulletin d'inscription (inscription-web
-- uniquement).
ALTER TABLE adherents ADD COLUMN pdf_inscription_storage_path TEXT;
ALTER TABLE adherents ADD COLUMN pdf_inscription_public_url TEXT;
ALTER TABLE adherents ADD COLUMN pdf_inscription_nom_fichier TEXT;
ALTER TABLE adherents ADD COLUMN pdf_inscription_uploaded_at TEXT;
