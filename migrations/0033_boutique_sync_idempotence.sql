-- Migration 0033 : idempotence réelle de la synchro ventes boutique → comptabilité
--
-- Contexte (audit du 16 août, jamais corrigé) : POST /api/internal/sales/sync/boutique
-- (cf. handleBoutiqueSalesSync, src/index.ts) identifiait une facture déjà synchronisée
-- via `SELECT ... FROM factures WHERE notes LIKE '%[boutique_order:ID]%'`, puis
-- `journal_comptable` via `SELECT ... WHERE piece = ?` — dans les deux cas un SELECT
-- suivi d'un INSERT séparé, sans contrainte UNIQUE. Un double déclenchement quasi
-- simultané de /api/checkout/callback côté boutique (webhook HelloAsso + retour
-- navigateur, cf. finalizePaidOrder dans boutique/src/worker.js) pouvait donc créer
-- une facture et des écritures en double, et compter le CA plusieurs fois. Prouvé
-- empiriquement le 16 août avec une latence artificielle simulant D1 en production.
--
-- Cette migration ferme la fenêtre de course en ajoutant de vraies contraintes
-- UNIQUE, sur le même principe déjà utilisé dans ce repo pour un problème analogue
-- (cf. migration 0012, idx_transactions_dedup).
--
-- Portée volontairement restreinte aux lignes AUTO-SYNCHRONISÉES (source_type +
-- source_id renseignés) via des index UNIQUE partiels (clause WHERE) :
--   - Les factures/écritures créées manuellement depuis l'interface (aucune des
--     deux colonnes renseignée) ne sont jamais concernées.
--   - En particulier, la saisie manuelle d'écriture libre (vJournal côté
--     app.js) permet délibérément de réutiliser la même référence de « pièce »
--     pour deux écritures différentes (avec avertissement, pas de blocage) —
--     un index UNIQUE global sur journal_comptable.piece aurait cassé ce cas
--     d'usage existant. L'index partiel ci-dessous ne s'applique donc qu'aux
--     lignes où source_type/source_id sont non NULL, ce qui exclut cette saisie
--     manuelle (jamais renseignée par app.js) et ne couvre que les flux
--     automatiques (boutique_order ici ; inscription_publique/adherent/facture
--     déjà écrits par le worker inscription dans cette même base partagée,
--     protégés au passage par le même index sans changement de leur côté).

ALTER TABLE factures ADD COLUMN source_type TEXT;
ALTER TABLE factures ADD COLUMN source_id TEXT;

-- Rétro-remplissage des factures boutique déjà synchronisées (ancien mécanisme
-- par marqueur dans `notes`) afin que le nouveau lookup par colonnes les
-- retrouve dès le premier appel suivant le déploiement, plutôt que de créer un
-- doublon supplémentaire pour chaque commande déjà synchronisée par le passé.
UPDATE factures
SET source_type = 'boutique_order',
    source_id = substr(
      substr(notes, instr(notes, '[boutique_order:') + 16),
      1,
      instr(substr(notes, instr(notes, '[boutique_order:') + 16), ']') - 1
    )
WHERE source_type IS NULL
  AND notes LIKE '%[boutique_order:%]%';

CREATE UNIQUE INDEX IF NOT EXISTS idx_factures_source_dedup
  ON factures(source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_source_piece_dedup
  ON journal_comptable(source_type, source_id, piece)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;
