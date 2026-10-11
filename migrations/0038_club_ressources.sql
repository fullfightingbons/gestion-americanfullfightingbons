-- Migration 0038 : ressources du club (PDF et vidéos) consultables par tous
-- les adhérents dans l'espace membre.
--
-- Gérées par le staff depuis l'onglet « Ressources » de gestion (permission
-- perm_adherents) et lues par l'espace membre via GET /api/member/ressources.
--
-- Deux origines possibles pour le contenu :
--   • un fichier téléversé (PDF, ou vidéo MP4/WebM/MOV) stocké dans le bucket
--     R2 « fullfighting-pdf » (binding R2_PDF) sous la clé
--     ressources/<id>/<horodatage>-<nom>, recopiée dans fichier_path ;
--   • pour une vidéo, un simple lien YouTube / Vimeo (video_url), lu en
--     lecteur intégré côté espace membre — recommandé pour les vidéos longues
--     (un téléversement est limité à ~95 Mo par la plateforme).
CREATE TABLE IF NOT EXISTS club_ressources (
  id             TEXT PRIMARY KEY,
  titre          TEXT NOT NULL,
  description    TEXT,
  categorie      TEXT,                                  -- libellé libre : « Techniques », « Règlement »…
  type           TEXT NOT NULL CHECK (type IN ('pdf', 'video')),
  video_url      TEXT,                                  -- lien YouTube/Vimeo (vidéo externe)
  fichier_path   TEXT,                                  -- clé R2 (PDF ou vidéo téléversée)
  fichier_nom    TEXT,                                  -- nom d'origine, pour le téléchargement
  fichier_taille INTEGER,                               -- octets
  fichier_mime   TEXT,
  ordre          INTEGER NOT NULL DEFAULT 0,            -- tri dans la catégorie
  actif          INTEGER NOT NULL DEFAULT 1,            -- 0 = masqué pour les adhérents
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_club_ressources_actif ON club_ressources(actif, categorie, ordre);
