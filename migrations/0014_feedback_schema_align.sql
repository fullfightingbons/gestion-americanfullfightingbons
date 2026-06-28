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

-- feedback_campaigns : colonnes manquantes
ALTER TABLE feedback_campaigns ADD COLUMN titre       TEXT NOT NULL DEFAULT '';
ALTER TABLE feedback_campaigns ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE feedback_campaigns ADD COLUMN statut      TEXT NOT NULL DEFAULT 'brouillon';
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
