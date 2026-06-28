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
-- Stratégie : ajouter les colonnes manquantes avec des valeurs par défaut
-- cohérentes. Les colonnes en double (title/titre, status/statut) coexisteront ;
-- le code n'écrit et ne lit que les nouvelles.
--
-- ⚠️ INCIDENT DU 2026-06-28 : 1ère tentative de déploiement échouée avec
-- "duplicate column name: titre" → la colonne "titre" existe déjà en
-- production sur feedback_campaigns (vraisemblablement ajoutée par une
-- exécution antérieure de cette même migration, ou manuellement). Ligne
-- retirée ci-dessous. Si une AUTRE colonne provoque encore un
-- "duplicate column name" au prochain déploiement, retirer sa ligne
-- ALTER TABLE correspondante de la même façon avant de ré-appliquer.
--
-- ⚠️ INCIDENT DU 2026-06-28 (suite) : 2e tentative échouée avec
-- "duplicate column name: description" → même cause, colonne déjà présente.
-- Ligne retirée ci-dessous également.
--
-- ⚠️ INCIDENT DU 2026-06-28 (suite) : 3e tentative échouée avec
-- "duplicate column name: statut" → même cause, colonne déjà présente.
-- Ligne retirée ci-dessous également. À ce stade (3 colonnes sur 3 déjà
-- en doublon), il est très probable que date_debut/date_fin/created_by le
-- soient aussi — mais on continue à les retirer une par une seulement au vu
-- d'une erreur réelle constatée, par choix exprès (voir échanges du dépôt).

-- feedback_campaigns : colonnes manquantes
-- titre       : retirée, voir incident ci-dessus (déjà présente en prod)
-- description : retirée, voir incident ci-dessus (déjà présente en prod)
-- statut      : retirée, voir incident ci-dessus (déjà présente en prod)
ALTER TABLE feedback_campaigns ADD COLUMN date_debut  TEXT;
ALTER TABLE feedback_campaigns ADD COLUMN date_fin    TEXT;
ALTER TABLE feedback_campaigns ADD COLUMN created_by  TEXT;

-- Initialiser titre/statut depuis les colonnes existantes pour les lignes déjà présentes
UPDATE feedback_campaigns SET titre  = COALESCE(NULLIF(titre,''),  title,  '') WHERE titre  = '';
UPDATE feedback_campaigns SET statut = COALESCE(NULLIF(statut,''), status, 'brouillon') WHERE statut = 'brouillon';

-- feedback_responses : colonne submitted_at manquante
-- On l'initialise depuis created_at pour les réponses déjà enregistrées
ALTER TABLE feedback_responses ADD COLUMN submitted_at TEXT;
UPDATE feedback_responses SET submitted_at = created_at WHERE submitted_at IS NULL;
