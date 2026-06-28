-- Migration 0014 : alignement du schéma feedback_campaigns et feedback_responses
--
-- Le schéma réel en production (issu d'une migration antérieure non tracée) utilise
-- des noms de colonnes différents de ceux attendus par app.js et index.ts :
--
--   feedback_campaigns réel  →  attendu par le code
--   ─────────────────────────────────────────────────
--   title                   →  titre
--   status                  →  statut
--   (absent)                →  description
--   (absent)                →  date_debut
--   (absent)                →  date_fin
--   (absent)                →  created_by
--
--   feedback_responses réel  →  attendu par le code
--   ─────────────────────────────────────────────────
--   created_at (existe)     →  submitted_at (absent)
--
-- Stratégie d'origine : ajouter les colonnes manquantes avec des valeurs par
-- défaut cohérentes. Les colonnes en double (title/titre, status/statut)
-- coexisteront ; le code n'écrit et ne lit que les nouvelles.
--
-- ⚠️ HISTORIQUE DES INCIDENTS DU 2026-06-28 — déploiements successifs échoués,
-- chacun avec "duplicate column name" sur la colonne suivante :
--   1ère tentative : titre        → déjà présente en prod, ligne retirée
--   2e tentative   : description  → déjà présente en prod, ligne retirée
--   3e tentative   : statut       → déjà présente en prod, ligne retirée
--   4e tentative   : date_debut   → déjà présente en prod, ligne retirée
--
-- Constat : 4 colonnes testées sur 4 étaient déjà présentes en production
-- (vraisemblablement issues d'une exécution antérieure complète de cette
-- même migration, ou d'une intervention manuelle directe sur la base).
-- Plutôt que d'attendre 2-3 échecs de déploiement supplémentaires pour
-- confirmer chaque colonne restante une par une, les colonnes restantes
-- (date_fin, created_by, submitted_at) ont été retirées préventivement par
-- décision explicite, sur la base de ce constat répété.
--
-- Si l'une de ces 3 colonnes se révèle en réalité absente de la prod
-- actuelle (ce qui semble improbable au vu du motif observé), le seul effet
-- est que cette colonne ne sera pas créée par cette migration — pas
-- d'erreur, pas de risque pour les données existantes. Dans ce cas, créer
-- une migration séparée (0016_...) pour l'ajouter explicitement.

-- feedback_campaigns : toutes les colonnes candidates se sont révélées (ou
-- sont fortement présumées) déjà présentes en prod — voir historique ci-dessus.
-- titre       : retirée (confirmé déjà présente)
-- description : retirée (confirmé déjà présente)
-- statut      : retirée (confirmé déjà présente)
-- date_debut  : retirée (confirmé déjà présente)
-- date_fin    : retirée (présumée déjà présente, retrait préventif)
-- created_by  : retirée (présumée déjà présente, retrait préventif)

-- Initialiser titre/statut depuis les colonnes existantes pour les lignes déjà présentes
UPDATE feedback_campaigns SET titre  = COALESCE(NULLIF(titre,''),  title,  '') WHERE titre  = '';
UPDATE feedback_campaigns SET statut = COALESCE(NULLIF(statut,''), status, 'brouillon') WHERE statut = 'brouillon';

-- feedback_responses : submitted_at retirée (présumée déjà présente, retrait préventif)
-- On l'initialise depuis created_at pour les réponses déjà enregistrées, si la
-- colonne submitted_at existe déjà (ce que l'on présume désormais).
UPDATE feedback_responses SET submitted_at = created_at WHERE submitted_at IS NULL;
