-- Script MANUEL, ponctuel — volontairement HORS du dossier migrations/.
-- Ne PAS renommer en NNNN_*.sql : il ne doit jamais être appliqué
-- automatiquement par `wrangler d1 migrations apply`, à exécuter à la main
-- via `wrangler d1 execute DB --remote --file=scripts/cleanup_helloasso_synthetic_transactions.sql`
-- (ou étape par étape en console) après avoir lu ce fichier en entier.
--
-- Contexte : avant le correctif du 11/08/2026 (retrait de
-- upsertHelloAssoBankTransaction côté inscription), chaque paiement HelloAsso
-- confirmé créait directement une ligne synthétique dans `transactions`
-- (rapproche=1, source_format='helloasso') en pariant qu'elle correspondrait
-- à une future ligne du relevé réel. Comme HelloAsso reverse les fonds par
-- virement périodique regroupant plusieurs inscriptions, l'import du relevé
-- PDF/CSV ne reconnaît jamais cette ligne comme un doublon et en insère une
-- vraie en plus : l'argent est alors compté deux fois dans le solde affiché.
--
-- Ce script supprime ces lignes synthétiques déjà présentes en base. La
-- pièce comptable (journal_comptable, compte "512 - Banque") n'est PAS
-- touchée : elle reste l'enregistrement comptable légitime de l'encaissement
-- et apparaîtra simplement comme "en attente de relevé" dans Banque >
-- Écritures 512, jusqu'à ce que le vrai virement HelloAsso soit importé et
-- rapproché (au besoin via le Rapprochement groupé, si plusieurs
-- inscriptions sont regroupées dans un même virement).
--
-- Supprimer ces lignes est sans danger dans les deux cas de figure :
--  - Le relevé réel correspondant n'a pas encore été importé (cas normal
--    pour les inscriptions récentes) → la pièce redevient "en attente",
--    prête à être rapprochée au prochain import. Rien n'est perdu.
--  - Le relevé réel a DÉJÀ été importé et un doublon existe donc déjà dans
--    `transactions` → supprimer la ligne synthétique élimine justement la
--    moitié erronée du doublon ; il ne reste que la vraie ligne importée,
--    à rapprocher manuellement ensuite (🔗 multi-rapprochement) à la pièce
--    comptable désormais libre.
--
-- Effet secondaire attendu : le solde affiché (onglet Banque) va baisser du
-- montant total supprimé ci-dessous — c'est normal et voulu, il reflète
-- désormais uniquement l'argent confirmé par un relevé réellement importé.

-- ── Étape 1 : prévisualiser (à faire systématiquement avant toute suppression) ──
SELECT
  id,
  compte_id,
  date_op,
  libelle,
  credit AS montant,
  ecriture_piece,
  source_document
FROM transactions
WHERE source_format = 'helloasso'
ORDER BY date_op DESC;

-- ── Étape 2 : vérifier le total qui sera retiré du solde affiché ──
SELECT
  COUNT(*)   AS nb_lignes,
  SUM(credit) AS montant_total
FROM transactions
WHERE source_format = 'helloasso';

-- ── Étape 3 : suppression effective ──
-- Décommenter la ligne ci-dessous une fois les étapes 1 et 2 relues.
-- Le filtre `source_format = 'helloasso'` est exclusif à ces lignes
-- synthétiques : les imports réels utilisent 'csv' ou 'pdf' (cf. app.js),
-- aucune vraie ligne importée ne peut donc être supprimée par erreur ici.

-- DELETE FROM transactions WHERE source_format = 'helloasso';
