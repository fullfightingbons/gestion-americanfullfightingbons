-- Script MANUEL, ponctuel, LECTURE SEULE — volontairement HORS du dossier
-- migrations/. Ne PAS renommer en NNNN_*.sql. À exécuter via
-- `wrangler d1 execute DB --remote --file=scripts/diagnostic_kit_nouvel_adherent_doublon.sql`
-- (ou étape par étape en console).
--
-- Contexte : avant le correctif du 10/09/2026 (retrait de newMemberKit dans
-- inscription/src/routes/_lib/helpers.js, calculateTotals), chaque nouvelle
-- adhésion via le formulaire web facturait deux fois la tenue du club :
--   - une fois via le supplément forfaitaire "tenue nouvel adhérent" (40 €
--     par défaut, réglage "Kit nouvelle inscription" côté gestion),
--   - une fois via les lignes t-shirt + pantalon individuelles (rendues
--     obligatoires pour toute nouvelle adhésion).
-- Ce montant en trop n'était PAS un simple doublon d'affichage : il a été
-- réellement inclus dans le montant du checkout HelloAsso (donc réellement
-- encaissé) ET dans les écritures comptables (compte 707), qui restent
-- internement cohérentes (débit 512-Banque = crédit 707+7561+7562). Le bug
-- est donc un vrai trop-perçu, pas seulement un problème de libellé.
--
-- CE SCRIPT NE MODIFIE RIEN. Il sert uniquement à chiffrer l'impact réel
-- avant de décider comment corriger (cf. les deux options détaillées à la
-- fin de ce fichier), une décision qui touche de l'argent réellement reçu
-- de vrais adhérents et qui ne peut pas être prise automatiquement.

-- ── Étape 1 : lister les ventes concernées, avec le montant en trop ────────
-- (une ligne par facture ayant une entrée "Vente kit nouvel adhérent")
SELECT
  f.id                                  AS facture_id,
  f.numero,
  f.date_op,
  f.destinataire,
  json_extract(k.value, '$.pu')         AS montant_kit_en_trop,
  f.exercice_id
FROM factures f, json_each(f.lignes) k
WHERE json_extract(k.value, '$.desc') = 'Vente kit nouvel adhérent'
ORDER BY f.date_op DESC;

-- ── Étape 2 : total et nombre de dossiers concernés ─────────────────────────
SELECT
  COUNT(*)                          AS nb_dossiers_concernes,
  SUM(json_extract(k.value, '$.pu')) AS montant_total_en_trop
FROM factures f, json_each(f.lignes) k
WHERE json_extract(k.value, '$.desc') = 'Vente kit nouvel adhérent';

-- ── Étape 3 : même chiffrage, ventilé par exercice comptable ────────────────
-- Utile si le trop-perçu s'étale sur plusieurs exercices déjà clôturés
-- (le correctif ne peut pas rouvrir un exercice clos sans validation du
-- bureau/AG selon vos statuts).
SELECT
  e.libelle                          AS exercice,
  COUNT(*)                           AS nb_dossiers_concernes,
  SUM(json_extract(k.value, '$.pu')) AS montant_total_en_trop
FROM factures f
JOIN json_each(f.lignes) k ON json_extract(k.value, '$.desc') = 'Vente kit nouvel adhérent'
LEFT JOIN exercices e ON e.id = f.exercice_id
GROUP BY e.libelle
ORDER BY e.libelle DESC;

-- ═════════════════════════════════════════════════════════════════════════
-- SUITE À DONNER (à décider, PAS automatisé ici) :
--
-- Ce trop-perçu correspond à de l'argent réellement encaissé via HelloAsso.
-- Deux options, qui ne s'excluent pas mutuellement selon les dossiers :
--
--  A) REMBOURSER les adhérents concernés (recommandé si le nombre de
--     dossiers est faible et/ou si des adhésions sont encore en cours) :
--     rembourser via HelloAsso (Association > Paiements > rembourser),
--     puis enregistrer l'écriture de sortie correspondante (débit 707 ou
--     compte de charge dédié, crédit 512-Banque) pour chaque dossier
--     remboursé. Aucune correction des lignes déjà enregistrées dans
--     `factures`/`journal_comptable` n'est alors nécessaire : elles
--     redeviennent exactes une fois le remboursement comptabilisé.
--
--  B) NE PAS rembourser, mais corriger uniquement la présentation
--     comptable (si le club préfère considérer le trop-perçu comme un don
--     ou souhaite d'abord consulter le bureau) : dans ce cas la ligne
--     "Vente kit nouvel adhérent" ne doit PAS être simplement supprimée de
--     `factures.lignes`, car l'encaissement HelloAsso (512-Banque) associé
--     reste, lui, inchangé — la supprimer casserait l'équilibre débit/crédit
--     de l'exercice. Il faudrait alors soit requalifier la ligne (ex. renommer
--     son libellé pour refléter sa nature réelle plutôt que la masquer),
--     soit constater une écriture de régularisation (ex. crédit "756 - Dons"
--     ou compte prévu par votre expert-comptable, débit 707) plutôt qu'une
--     simple suppression.
--
-- Dans les deux cas, dites-moi laquelle des deux options (ou une variante)
-- vous souhaitez et je prépare le script de correction / la liste des
-- remboursements HelloAsso à passer, dossier par dossier, à partir des
-- résultats de l'Étape 1 ci-dessus.
