# Nouvelles fonctionnalités — Gestion AFFBC

Ajoutées sur la base du projet existant, sans rien retirer. `tsc --noEmit`,
les 31 tests existants (`vitest run`) et `wrangler deploy --dry-run` sont
propres après ajout.

## Reçu : articles commandés à l'inscription — 21/09/2026

Symptôme : le reçu ne tenait compte que de la cotisation (et du Pass Région). Le
t-shirt et le pantalon commandés à l'inscription — obligatoires pour une nouvelle
adhésion — n'y figuraient pas, si bien que le total ne correspondait pas au paiement.

**Cause** — la fiche `adherents` ne garde que `cotisation` et `montant_pass_region`.
Les articles n'existent que dans `inscriptions_publiques.dossier_json`
(`clothingOrder` pour les tailles, `computedTotals` pour quantités, prix et produits en
option) et dans la facture séparée « Ventes liées à l'inscription web » (`VTE-…`).

**Correction** (`src/lib/pdf/cotisation-receipt.ts`, partagé par les deux reçus)
- Le reçu ajoute, à la cotisation et au Pass Région, les articles de l'inscription :
  **t-shirt et pantalon (taille, quantité, prix unitaire)**, passeport sportif, produits
  en option. Mêmes lignes que la facture `VTE-…` (`buildInscriptionSaleLines`), avec des
  libellés lisibles (« T-shirt club AFFBC (taille M) »).
- Le **kit nouvel adhérent** des inscriptions d'avant le 10/09/2026 (réellement payé) est
  repris. Si le détail est incomplet (ancien format), le reste facturé part sur une ligne
  « Autres articles » : le total est toujours égal à ce qui a été facturé.
- Le pied de page indique la part réglée par l'adhérent quand il y a un Pass Région
  (« dont Pass Région : 30,00 €, soit 297,00 € réglés par l'adhérent »).
- Inscription retenue : la plus récente qui est **finalisée** (les brouillons, paiements
  en attente, échecs et abandons sont ignorés), de **la saison de la fiche** et porteuse
  de totaux. Une inscription de l'an dernier n'apporte pas ses articles (renouvellement
  par le bureau). La saison d'une inscription est celle de la `date_fin` de **son
  exercice** (même source que `date_fin_adhesion`), pas de sa date de dépôt : une
  inscription faite en juin pour la saison suivante est bien rattachée à la suivante.
  Même règle côté front (`registrationSeason`) pour l'analyse du dossier.
- Sans inscription en ligne (fiche saisie ou importée) : cotisation seule, comme avant.
- Le tableau des lignes affiche maintenant quantité et prix unitaire pour toutes les lignes.
- Le **reçu de l'espace membre** (`/api/member/documents/recu-cotisation`) utilise le même
  contenu ; sa numérotation `COT-…` est inchangée (accents et « Émis le » corrigés).

Vérifié en exécutant le vrai `calculateTotals()` du projet `inscription` sur 5 scénarios
(nouvelle adhésion, Pass Région + passeport + produits, renouvellement avec ou sans
articles, CSE Thalès) : total du reçu − Pass Région = montant facturé à l'adhérent.

Limite connue : le reçu lit l'inscription, pas la facture `VTE-…`. Un article remboursé ou
une facture annulée à la main après le paiement n'y est pas répercuté.

`tsc --noEmit` propre ; 182 tests (dont 29 nouveaux sur cette évolution).

## Dossiers adhérents et reçu PDF — 20/09/2026

Symptôme : un adhérent qui refuse le droit à l'image apparaissait « dossier
incomplet ». Le bouton « Reçu » n'émettait pas un vrai PDF mais une impression
HTML du navigateur.

**Cause du faux « incomplet »** — trois endroits d'`app.js` (compteur « Dossiers
complets », filtre « Dossiers incomplets », tableau de bord) testaient
`!certificat || !droit_image || !reglement`. Or `droit_image = 0` est un *choix* de
l'adhérent (`imageRights === "no"` à l'inscription), pas une pièce manquante. Autre
ambiguïté : `certificat = 1` voulait dire à la fois « non requis » et « validé ».

**Lecture du dossier** (`app.js`, section « DOSSIER D'ADHÉSION ») — le tableau croise
maintenant la ligne `adherents`, le dossier d'inscription en ligne
(`inscriptions_publiques.dossier_json` / `documents_json`, déjà chargé mais jamais lu)
et l'âge. Règle du club, identique à `validatePayload()` côté `inscription` :
certificat obligatoire si **mineur** ou si au moins une des 9 réponses du
questionnaire de santé est « oui ».

- Certificat : *non requis* / *fourni* / *à valider* (pièce reçue, à vérifier puis
  cocher) / *manquant* / *à fournir* (exigence inconnue : fiche saisie à la main).
- **Un refus du droit à l'image n'est plus « incomplet »** ; il déclenche une alerte.
- « Incomplet » = certificat non résolu ou règlement non validé.
- Alertes : pastilles sous le nom (📷 Droit à l'image refusé, 🩺 Certificat
  obligatoire · manquant / à valider / fourni), ligne teintée quand un certificat
  obligatoire n'est pas validé, deux compteurs cliquables au-dessus du tableau, trois
  nouveaux filtres, alerte + action sur le tableau de bord.
- Pass Région : « — » quand non utilisé (au lieu d'un ✗ rouge pour tous).
- Fiche adhérent : bloc « Dossier d'inscription & justificatifs » (consentements,
  représentant légal, Pass Région, questionnaire de santé question par question,
  checklist des pièces attendues / reçues).
- Export CSV : colonnes existantes inchangées ; 5 colonnes ajoutées à la fin.
- Renouvellement : l'inscription d'une saison passée n'est **pas** retenue pour la
  saison en cours (`renewAdh` remet certificat et règlement à 0 pour revalidation).
- Confidentialité : pastilles et infobulles n'indiquent que « mineur » ou le *nombre*
  de réponses « oui » ; le détail question par question (donnée de santé) n'est que
  dans la fiche. Aucune migration, aucun changement du repo `inscription`.

**Bouton « Reçu »** — vrai PDF généré par le serveur : nouvelle route
`GET /api/adherents/:id/recu-cotisation` (droit de lecture sur les adhérents), même
moteur et même gabarit que `/api/factures/:id/pdf`. Ouvert dans un nouvel onglet ; une
erreur (ex. cotisation à 0 €) s'affiche en notification. L'ancien passage par l'éditeur
de facture n'existe plus pour ce bouton. Numéro **stable** `REC-<saison>-<id>` (l'ancien
`REC-<année>-<nb de factures + 1>` changeait à chaque clic).

**Moteur PDF (`pdf-engine.ts`)** — `safe()` supprimait tous les accents et remplaçait
`€` par une espace : « Mickaël » sortait « Mickael » et les montants sans devise, sur
**tous** les PDF (factures, dons, attestations, reçus). Les lettres accentuées du
français et le € sont maintenant écrits en WinAnsi ; les PDF portent un titre dans leurs
métadonnées. Comparaison avant/après sur factures, dons et attestations : seules
différences = accents restitués et « € » présent, aucune mise en page modifiée. Seul le
titre `cotisation` est passé à « Reçu de cotisation » ; les autres libellés fixes du
gabarit (« Recu de don », « DESIGNATION »…) sont inchangés. La copie du moteur dans le
repo `inscription` a le même défaut et n'a pas été touchée.

Non traité volontairement : l'expiration du certificat (`certificat_date`) n'entre pas
dans les alertes, pour ne pas changer ce qui compte comme « incomplet » au-delà du besoin.

`tsc --noEmit` propre ; 153 tests (93 existants + 60 nouveaux :
`test/adherent-dossier.test.ts`, `test/pdf-cotisation-receipt.test.ts`).

## Correctif comptable — 17/09/2026 : intégration exhaustive des écritures

Symptôme : les remboursements saisis avec les boutons rapides
(⚡ Remboursement adhérent, ⚡ Remboursement frais bancaires) n'apparaissaient
pas à l'écran Résultat et n'étaient pas déduits de ses totaux. Le Résultat
affichait +6953.35 € là où le Bilan affichait +6521.00 € pour le même journal.

- `vResultat()` ne retenait que `credit > 0` en classe 7 et `debit > 0` en
  classe 6 : toute écriture d'extourne (remboursement, avoir, annulation)
  était ignorée à l'affichage **et** dans les totaux. Recalcul en net par
  ligne, affichage des extournes avec un repère « ↩ extourne », et garde-fou
  qui affiche un bandeau si le total du Résultat diverge de celui du Bilan.
- Bilan : les lignes d'actif/passif étaient une liste figée de 6 + 7 regex,
  chacune tronquée par `Math.max(0, …)`. Conséquences : tout compte hors de
  cette liste (518, 44x, 3x, 46x…) était invisible sans alerte, un découvert
  bancaire s'affichait à 0.00 €, et un déficit était ajouté au passif au lieu
  d'en être déduit. Remplacé par `BILAN_POSTES` + `bilanRows()` : tous les
  comptes de classes 1 à 5 présents au journal sont classés, deux postes
  fourre-tout signalent les comptes non reconnus et les écritures sans numéro
  de compte.
- Le contrôle « actif - passif » se calculait par une formule différente de
  l'affichage (classes 46/47/48 comptées des deux côtés) : il annonçait
  0.00 € sur un bilan déséquilibré et -300 € sur un bilan équilibré. Il porte
  désormais sur les lignes réellement affichées.
- Bloc « Contrôle » du bilan enrichi : comptes non reconnus et écritures
  sans exercice rattaché (invisibles partout car `jnlExo()` filtre sur
  `exercice_id`), avec renvoi vers le Journal.
- 10 tests de non-régression ajoutés dans `test/gl-accounting.test.ts`.

## Correctifs complémentaires — 16/08/2026

- `gestion/public/assets/app.js` : correction du renouvellement groupé des
  adhérents, qui appelait `update(patch)` sans définir `patch` dans la boucle.
- `inscription/src/routes/api/public/payment/helloasso/status.js` : suppression
  effective des transactions bancaires synthétiques HelloAsso. Les paiements
  confirmés créent uniquement les écritures comptables 512/411 ; l'onglet
  Banque reste alimenté par les relevés réels importés dans `gestion`.
- `gestion/src/index.ts` + interface Administration : ajout d'un suivi des
  automatisations (dernier résultat des crons et lancements manuels :
  certificats, factures impayées, matériel, RGPD, sauvegardes), stocké sans
  migration dédiée dans `club_info`.

## 1. Relances automatiques des factures impayées

- Table de suivi `facture_relances_auto` (migration `0024`) — même principe
  que `certificat_rappels` : une relance par palier (J+15, J+30), jamais deux
  fois la même.
- Cron quotidien `checkFacturesEnRetard` (branché sur le même trigger que la
  vérification des certificats médicaux).
- `POST /api/admin/factures/relancer-impayes` : déclenchement manuel,
  identique au bouton existant pour les certificats.
- Complète (ne remplace pas) le bouton "↻ Relance" déjà existant côté ventes,
  pour les cas où personne n'y pense.
- **Point d'attention** : cette fonction lit `client_email`, `client_nom`,
  `montant_total`, `notes_paiement` sur `factures` — colonnes utilisées par
  `public/assets/app.js` mais absentes du fichier `migrations/0001_create_schema.sql`
  fourni (dérive probable entre les migrations versionnées et le schéma D1
  réel). Le cron est défensif : si ces colonnes n'existent pas sur votre
  instance, il le signale dans ses logs sans planter, mais **vérifiez ce
  point avant la mise en prod** (`wrangler d1 execute DB --command "PRAGMA table_info(factures)"`).

## 2. Présence aux cours

- Table `presences` (migration `0025`), gérée via l'API CRUD générique
  existante (`/api/db/presences`) — pas de route dédiée nécessaire.
- Nouvelle permission `perm_presences` : écriture pour admin et entraîneur
  (qui prend les présences), lecture pour secrétaire.

## 3. Inventaire du matériel club

- Table `materiel` (migration `0026`) : nom, catégorie, état, dates
  d'achat/révision, localisation.
- Nouvelle permission `perm_materiel` : écriture admin + trésorier (achats),
  lecture entraîneur.

## 4. Budget prévisionnel vs réalisé

- Table `budget_previsionnel` (migration `0027`) : montant prévu par poste
  comptable et par exercice (mêmes codes que `journal_comptable`).
- `GET /api/budget/:exercice_id/comparatif` : renvoie, pour chaque ligne
  budgétée, le prévu, le réalisé (calculé depuis `journal_comptable`) et
  l'écart. Protégé par `perm_comptabilite` comme le reste de la comptabilité.

## 5. Taux de renouvellement d'une saison à l'autre

- `GET /api/stats/renouvellement` : pour chaque exercice, le nombre
  d'adhérents et, à partir du deuxième exercice, le pourcentage d'adhérents
  de l'exercice précédent retrouvés (comparaison par email). Purement en
  lecture, aucune nouvelle table.

## 6. Planning des encadrants

- Table `planning_encadrants` (migration `0028`) : encadrant, jour de la
  semaine, créneau horaire, cours, lieu — distinct du calendrier
  d'événements ponctuels (stages/compétitions restent dans le worker
  Calendrier).
- Nouvelle permission `perm_planning` : écriture admin + secrétaire
  (organise les emplois du temps), lecture trésorier + entraîneur.

## Frontend

Le frontend est maintenant câblé pour les 4 nouvelles tables :

- **Onglet Présences** : pointage par adhérent/date/créneau, présent ou absence justifiée.
- **Onglet Matériel** : inventaire avec alerte visuelle si une révision est prévue dans les 30 jours.
- **Onglet Planning** : créneaux groupés par jour de la semaine, avec encadrant assigné.
- **Sous-onglet "Budget"** dans Comptabilité : saisie du prévisionnel par compte + comparatif avec le réalisé (`GET /api/budget/:exercice_id/comparatif`).
- **Carte "Renouvellement"** sur le tableau de bord (`GET /api/stats/renouvellement`), à côté des cartes Dossiers et Flux net déjà existantes.

Chaque onglet respecte les permissions par rôle définies côté backend
(`perm_presences`, `perm_materiel`, `perm_planning`) — un rôle en lecture
seule voit les données mais pas les boutons d'ajout/modification/suppression.

## À faire pour une mise en production complète

Le backend et le frontend sont complets et testés. Reste, à la discrétion du
club :

## Déploiement

```
wrangler d1 migrations apply DB --remote   # applique 0024 à 0028
wrangler deploy
```

Le cron existant (`0 6 * * *`) couvre automatiquement la nouvelle relance de
factures — aucun changement à `wrangler.json`.

⚠️ Avant d'appliquer les migrations, vérifiez le point d'attention du §1
(colonnes `factures`) sur votre instance D1 réelle.

---

## Correctif — doublons de trésorerie à l'import du relevé bancaire (11/08/2026)

**Problème.** À la validation d'un paiement HelloAsso, `inscription`
(`upsertHelloAssoBankTransaction`) écrivait directement une ligne
synthétique dans `transactions` (l'onglet Banque de `gestion`), déjà
marquée `rapproche: 1`. Or HelloAsso reverse les fonds par virement
périodique regroupant plusieurs inscriptions (libellé, montant et date
différents de cette ligne synthétique) : l'import du relevé réel (PDF/CSV),
dont la déduplication compare `compte_id + date_op + libellé + débit +
crédit`, ne reconnaissait donc jamais cette ligne comme un doublon et en
insérait une vraie en plus — l'argent était compté deux fois dans le solde
affiché.

**Correctif.**
- `inscription/src/routes/api/public/payment/helloasso/status.js` :
  suppression de `upsertHelloAssoBankTransaction` et
  `findHelloAssoBankAccountId`. Seules les écritures du
  `journal_comptable` (compte "512 - Banque") sont désormais créées à la
  confirmation du paiement — `transactions` n'est plus alimentée que par un
  import réel (CSV/PDF) côté `gestion`.
- `gestion/public/assets/app.js` :
  - nouvelle fonction `pendingBankPieces()` : écritures 512-Banque pas
    encore liées à une transaction réelle rapprochée (même logique que
    `consumedPieces()`, déjà utilisée par le Rapprochement groupé).
  - `Banque > Écritures 512` affiche désormais un badge par ligne
    (rapproché / en attente de relevé) et une carte "en attente" en tête
    d'écran.
  - Carte "Trésorerie" du dashboard et nouvelle alerte dédiée (visible avec
    `perm_banque` + `perm_comptabilite`) : nombre d'encaissements confirmés
    pas encore rapprochés à un relevé importé.
  - `public/index.html` : `?v=` de `app.js` incrémenté (cache-busting).

**Nettoyage ponctuel (optionnel, manuel).** Les lignes `transactions` déjà
créées par l'ancien mécanisme (`source_format = 'helloasso'`) peuvent être
supprimées sans risque une fois ce correctif en place — la pièce comptable
correspondante redevient alors "en attente de relevé" au lieu de rester
associée à une ligne fictive. Voir
`scripts/cleanup_helloasso_synthetic_transactions.sql` : prévisualisation
puis suppression, à exécuter à la main via `wrangler d1 execute DB --remote
--file=...`. Volontairement **hors** du dossier `migrations/` — jamais
appliqué automatiquement.

`tsc --noEmit` et les tests existants sont propres après ce correctif dans
les deux repos (`inscription` : 16/16 tests ; `gestion` : 31/31 tests).
