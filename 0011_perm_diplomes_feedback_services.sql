-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : permissions indépendantes pour les onglets Diplômes, Feedback
--             et Services.
-- Fichier   : migrations/0011_perm_diplomes_feedback_services.sql
-- Contexte  : ces 3 onglets dépendaient jusqu'ici d'une permission existante
--             (perm_adherents pour Diplômes ; perm_administration pour
--             Feedback et Services), ce qui empêchait de donner accès à l'un
--             sans donner accès à l'autre. Cette migration ajoute 3 colonnes
--             dédiées sur "utilisateurs", au même format que les colonnes
--             perm_* existantes (TEXT, valeurs 'read'/'write'/'none'/NULL).
--
-- ⚠️ Par expérience sur ce projet (cf. incidents 0010_feedback.sql), le
-- schéma réel de "utilisateurs" en production a pu diverger du fichier
-- 0001_create_schema.sql. Si l'une de ces colonnes existe déjà (sous ce nom
-- exact), ALTER TABLE ADD COLUMN ci-dessous échouera et bloquera tout le
-- déploiement (migration entièrement annulée par Cloudflare D1, aucune
-- perte de données). Dans ce cas :
--   1) Vérifier le schéma réel :
--        npx wrangler d1 execute DB --remote --command "SELECT sql FROM sqlite_master WHERE type='table' AND name='utilisateurs'"
--   2) Retirer de ce fichier la ou les lignes ADD COLUMN déjà existantes,
--      puis ré-appliquer.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE utilisateurs ADD COLUMN perm_diplomes TEXT;
ALTER TABLE utilisateurs ADD COLUMN perm_feedback TEXT;
ALTER TABLE utilisateurs ADD COLUMN perm_services TEXT;
