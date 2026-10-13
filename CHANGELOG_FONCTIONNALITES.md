# Nouvelles fonctionnalités — Gestion AFFBC

Ajoutées sur la base du projet existant, sans rien retirer. `tsc --noEmit`,
les 31 tests existants (`vitest run`) et `wrangler deploy --dry-run` sont
propres après ajout.

## Page Rapprochement allégée (elle faisait ramer, voire planter, le navigateur) — 12/10/2026

Causes, mesurées sur vos 155 opérations réelles et un journal de 3 600 à 13 800 lignes :
- **Une liste d'options complète recopiée dans CHAQUE ligne** : le menu « Pièce unique » embarquait toutes les écritures
  du journal (512 + « autres comptes ») pour chaque opération en attente. Résultat : 3,5 à 13 Mo de HTML et 41 000 à
  159 000 éléments `<option>` à construire dans le navigateur à chaque affichage, et à chaque frappe dans la recherche.
- **Recherche sans anti-rebond** : chaque touche régénérait tout le tableau (donc ces mégaoctets).
- **Détection des regroupements non bornée** : chaque pièce 512 pouvait consommer jusqu'à 200 000 combinaisons ; avec
  beaucoup d'opérations en attente, ~9 s de calcul (et jusqu'à 10 000 cartes de regroupement affichées).

Corrections : menu « Pièce unique » **rempli à l'ouverture** (`rapprFillOptions`, au focus/clic ; seule la suggestion est
dans la page ; la pré-sélection auto ajoute la seule option voulue, `rapprEnsureOption`) ; recherche **différée de 250 ms** ;
regroupements avec un **budget global** (300 000 combinaisons, 300 ms, pièces les plus récentes d'abord) et **20 cartes
affichées** au maximum ; tableau **plafonné à 300 opérations** avec un message invitant à filtrer. Mesures (journal de
13 800 lignes) : HTML 13,1 Mo → 0,2 Mo, 158 723 → 27 options ; pire cas (155 opérations en attente) 8,8 s → 0,15 s.
Comportement inchangé : la suggestion reste pré-sélectionnée, « Valider » lit la même valeur. 9 tests ajoutés.

## Onglet Planning retiré + historique bancaire 2024-2025 importé — 12/10/2026

**Onglet Planning supprimé** (jugé inutile). Le sous-onglet « Planning » de « Présences & Planning » disparaît : l'onglet
s'appelle désormais **Présences**, et la permission « 🗓️ Planning » n'est plus proposée dans l'administration des
utilisateurs. Retirés du frontend : la vue, la fenêtre d'ajout/modification, le chargement des données et les fonctions
d'enregistrement. **Rien n'est supprimé en base ni côté API** : la table `planning_encadrants`, la colonne
`perm_planning` et la route restent en place (les données sont conservées ; un `DROP TABLE` serait une migration à part,
irréversible). `app.min.js` régénéré, `app.js?v=20261012b`.

**Historique bancaire d'avant juillet 2025** — migration **`0039_import_historique_releves.sql`**. Le contrôle des relevés
PDF (37 relevés, du 06/04/2024 au 30/09/2026) montre que les 155 opérations en base (juillet 2025 → septembre 2026) sont
toutes présentes et exactes, mais que les 16 relevés antérieurs n'avaient jamais été importés (146 opérations : 145 sur le
compte courant, le dépôt de 500 € du 10/01/2025 sur le Livret Bleu), et que le solde initial du compte courant valait
−61,10 € au lieu de 41,90 € (solde du 30/06/2025), soit 103,00 € de moins que la banque. La migration :
- importe ces 146 opérations, telles que le ferait l'import PDF (mêmes libellés et dates, `source_format = 'pdf'`, **non
  rapprochées**) ; `INSERT OR IGNORE` sur l'index d'unicité, donc aucune opération déjà importée à la main n'est dupliquée ;
- remet les soldes initiaux à **0 €** (compte courant et livret, tous deux ouverts avec un solde nul) — uniquement s'ils
  valent encore la valeur attendue **et** que l'historique en base est complet (solde net avant le 01/07/2025 = 41,90 € /
  500,00 €), sinon rien n'est modifié ;
- est sans effet si on la rejoue ou sur une base vide.

Résultat attendu, égal à la banque au 30/09/2026 : compte courant **2 420,22 €**, Livret Bleu **1 508,39 €**.

**Rapprochement : tout ce qui précède le 01/07/2025 est ignoré.** Constante `RAPPR_DATE_DEBUT` (début de la section
rapprochement de `app.js`, `'2025-07-01'` ; valeur vide = rien d'ignoré). Les opérations bancaires **et** les écritures du
compte 512 antérieures à cette date disparaissent des listes « en attente » (écran Rapprochement, imputation multiple),
des suggestions et de la pré-sélection automatique, du contrôle de complétude (y compris la fermeture d'exercice : sa borne
basse ne descend jamais sous cette date), de « Tout rapprocher » et des compteurs du tableau de bord / de l'onglet
Écritures 512. Dans la liste d'un compte (onglet Banque), ces opérations portent le badge gris « Ignorée » au lieu de « En
attente ». **Rien n'est supprimé ni marqué rapproché** : elles restent en base et dans tous les soldes. L'état de
rapprochement (écart banque ↔ 512) porte toujours sur la totalité et détaille la part ignorée sur deux lignes, de sorte
que l'écart se décompose exactement comme avant. La limite est une constante du code et non un réglage en base, car
`club_info` n'est lisible qu'avec la permission d'administration : le trésorier ne l'aurait pas vue. 8 tests ajoutés.

## Ressources du club : PDF et vidéos pour l'espace membre — 12/10/2026

Nouvel onglet **📚 Ressources** (droits de la fiche adhérent : `perm_adherents`, écriture pour secrétaire / trésorier /
admin, lecture pour l'entraîneur). Il alimente la rubrique « Ressources du club » de l'espace membre, que **tous les
adhérents connectés** peuvent consulter.
- **PDF** : téléversé (25 Mo max). L'adhérent peut le consulter dans un onglet ou le télécharger.
- **Vidéo par lien** (recommandé pour les vidéos longues) : lien YouTube ou Vimeo, lu dans un lecteur intégré. Seuls ces
  deux services sont acceptés (validation à la saisie, et à nouveau côté espace membre) ; le lecteur n'est chargé qu'au
  clic de l'adhérent. YouTube est lu via `youtube-nocookie.com`. Une vidéo « non répertoriée » évite qu'elle soit publique.
- **Vidéo téléversée** : MP4, WebM ou MOV, 95 Mo max (limite de corps de requête de la plateforme : au-delà, utiliser un
  lien). Lecture avec avance rapide (requêtes `Range`) y compris sur iPhone.
- Catégories libres (« Techniques », « Règlement »…), ordre d'affichage, case **Visible par les adhérents** pour masquer
  sans supprimer. Supprimer une ressource efface aussi son fichier dans R2.

Technique :
- Migration **`0038_club_ressources.sql`** (table `club_ressources`) — **à appliquer sur la base D1 avant d'utiliser
  l'onglet** (tant qu'elle manque, l'espace membre affiche simplement la banderole habituelle, sans erreur).
- Fichiers dans le bucket R2 `fullfighting-pdf` (binding `R2_PDF`) sous `ressources/<id>/<horodatage>-<nom>`.
- `PUT /api/admin/ressources/fichier` : le fichier est le **corps brut** relayé en flux vers R2 (pas de `formData`, qui
  chargerait la vidéo entière en mémoire du Worker). Le type MIME vient de l'extension, jamais de l'en-tête du client.
  `DELETE /api/admin/ressources/:id` supprime ligne et fichiers ; `DELETE …/fichier?id=…&garder=…` nettoie les anciennes
  versions après un remplacement.
- `GET /api/member/ressources` (session membre) : ressources actives, chacune avec un **lien signé de 6 h**
  (`GET /api/ressources/fichier/:id?t=…`, avec `Range`), car `<video>` et les onglets PDF ne peuvent pas envoyer
  d'en-tête `Authorization`. Ce jeton est distinct d'une session (`kind: 'ressource'`) et ne donne accès qu'à son fichier ;
  la clé R2 n'est jamais renvoyée au navigateur.
- Nouveau module `src/lib/ressources.ts` (règles pures : validation, noms de fichier, plages d'octets, liens vidéo).
- Les sauvegardes quotidiennes exportent la table `club_ressources` avec les autres, **pas les fichiers R2**.

`app.min.js` régénéré, `app.js?v=20261012a`. 50 tests ajoutés (`test/ressources.test.ts`, `test/ressources-admin.test.ts`),
dont le round-trip « liste membre → lien signé → lecture partielle du fichier ».

## Journal : écritures rapides en 4 colonnes + 14 nouveaux boutons — 11/10/2026

La barre de 23 boutons du Journal est remplacée par une carte **⚡ Écritures rapides** en 4 colonnes thématiques
(une seule liste, `ECRITURE_GROUPES`, qui porte libellé, infobulle et regroupement ; les infobulles affichent aussi les
comptes débités / crédités). « + Nouvelle écriture », « Assistant déséquilibres » et « Équilibrer l'exercice » restent
dans la barre d'actions. Colonnes en `auto-fit` : 4 sur grand écran, empilées sur mobile.

- 📥 **Encaissements** : Cotisation, **Licences / adhésions annexes** (7562), Stage / cours, Vente équipement,
  **Buvette / manifestation** (7080), Subvention, Don, **Pass Région (participation)** (7088), **Pass Région
  (remboursement)** (7410), **Autre encaissement** (7580).
- 🛒 **Achats & équipements** : Achat fournisseur, Matériel sportif, Textile / tenues, **Petit équipement** (6063),
  **Produits publicitaires** (6230), Achat licence.
- 🏢 **Charges courantes** : Location, Assurance, Télécom, SACEM, SPRE, Honoraires, Communication, Déplacement,
  Repas / réception, **Autre dépense** (6580).
- 🏦 **Banque & trésorerie** : Frais bancaires, Remboursement frais bancaires, **Intérêts du livret** (5121 / 768),
  Compte courant → Épargne, Épargne → Compte courant, **Remise d'espèces en banque** (512 / 5300), **Retrait
  d'espèces** (5300 / 512), **Remboursement d'emprunt (capital)** (1640 / 512), **Encaissement à identifier**
  (512 / 471), **Paiement à identifier** (471 / 512), Remboursement adhérent.

Autres changements :
- Plan comptable : ajout de **768 - Autres produits financiers**.
- Aperçu Achats / Ventes (boutons marqués ↗) étendu à : Assurance, Télécom, Communication, Honoraires, Repas /
  réception, SACEM, SPRE (achats) et Buvette / manifestation (vente), Petit équipement, Produits publicitaires.
  Nouvelles catégories d'achat : Assurance, Télécom, Communication, Honoraires, Réception, Redevances (liste
  `ACHAT_CATEGORIES` partagée avec le formulaire, chacune avec son compte dans `achatCompteAuto`). La case reste
  décochable à chaque saisie.
- Les modèles « à identifier » (compte d'attente 471) permettent de rapprocher une ligne bancaire d'origine inconnue
  sans la laisser en suspens ; le compte 471 doit revenir à zéro une fois l'opération identifiée (le Contrôle de
  complétude du Rapprochement la signale tant qu'elle n'est pas rapprochée).
- Tests : chaque modèle a un bouton dans exactement un groupe, tous les comptes des modèles existent dans le plan, deux
  lignes (une au débit, une au crédit), mouvements internes limités à la classe 5, et enregistrement réel des nouveaux
  modèles.

Aucune migration. `app.min.js` régénéré, `app.js?v=20261011e`.

## Écritures rapides : aperçu dans les onglets Achats et Ventes, sans doublon — 11/10/2026

Les boutons rapides du **Journal** qui correspondent à un achat ou à une vente peuvent maintenant aussi
enregistrer l'opération dans l'onglet dédié, **sans créer une 2e série d'écritures**.
- **Achats** (statut « Payé ») : Achat fournisseur (catégorie Fournitures), Achat licence (nouvelle catégorie
  **Licence**, compte 6281), Achat matériel sportif (Équipement), Achat textile / tenues (Textile), Location (Location),
  Déplacement / voyage (Transport).
- **Ventes** (statut « Payée », n° `FAC-AAAA-NNN` = plus grand numéro existant + 1) : Vente vêtements / équipements,
  Encaissement stage / cours.
- La fenêtre affiche, pour ces modèles, une case **« Enregistrer aussi dans l'onglet Achats / Ventes »** (cochée par
  défaut), un champ Fournisseur / Client (facultatif, « À préciser » sinon) et le mode de règlement (Virement par
  défaut). Case décochée : comportement d'avant. Les autres modèles (frais bancaires, assurance, télécom, SACEM,
  transferts d'épargne…) ne changent pas.
- **Pas de doublon** : les écritures du Journal restent celles de la fenêtre (6xxx/512 ou 512/70x, comptes choisis
  dans la fenêtre) ; elles sont marquées `source_type='ecriture_rapide'` + `source_id` = id de l'achat / de la vente.
  `syncAchatJournal()` et `syncVenteJournal()` (enregistrer, valider un achat…) reconnaissent ce marquage et
  **mettent à jour** les écritures existantes (date, montant) au lieu d'en générer d'autres (ACH-…, VTE-…-CLI/-PRO).
  Un achat refusé ou ramené à 0 retire ses écritures rapides, comme pour les écritures automatiques ; supprimer
  l'achat / la vente supprime ses écritures rapides. Un achat / une vente sans marquage garde exactement le
  comportement précédent.
- Atomicité : si l'enregistrement de l'onglet échoue, rien n'est créé ; si les écritures échouent ensuite,
  l'enregistrement est retiré (pas d'orphelin).
- Aucune migration (`journal_comptable.source_*` existent déjà). `app.min.js` régénéré, `app.js?v=20261011d`.
  Tests ajoutés dans `test/rapprochement.test.ts`.

## Rapprochement : contrôle de complétude, chargement complet, ré-import sans effet de bord — 11/10/2026

**Contrôle de complétude** (Banque › Rapprochement, carte « 🔎 Contrôle de complétude » en haut de page) : vérifie
que rien n'a été oublié, avec le détail déroulant de chaque point.
- ⛔ **Rapprochées sans écriture liée** (cas du bouton « Tout rapprocher ») : l'opération est cochée mais rien ne la
  justifie. Bouton « Défaire » sur chaque ligne.
- ⛔ **Liens vers une écriture introuvable** (écriture supprimée ou régénérée depuis).
- ⛔ **Montants discordants** : somme des opérations ≠ somme des écritures liées. Les regroupements sont traités
  comme un tout (deux chèques de 18 € et 12 € ↔ une remise de 30 € : correct, non signalé). Une écriture mise à zéro
  ou rapprochée sur le mauvais compte apparaît ici.
- ⛔ **Lignes à zéro** (débit = crédit = 0) dans le journal ou dans les relevés.
- ⏳ **En attente** : opérations bancaires et écritures 512 non rapprochées, avec mise en avant de celles de plus de 45 jours.
- 📅 **Mois sans aucune opération** entre la première et la dernière d'un compte (relevé manquant ?).
- ⚖ **État de rapprochement** : écart entre le solde calculé des relevés (soldes initiaux + opérations) et le solde du
  compte 512, décomposé ligne à ligne ; nul quand tout est rapproché et cohérent.
- **Clôture d'exercice** : `finalizeExoClose()` prévient (sans bloquer) s'il reste des opérations ou écritures 512 non
  rapprochées, ou des anomalies, sur la période de l'exercice.

**Saison précédente : opérations et écritures qui disparaissent ou repassent « en attente ».**
- Le serveur plafonne chaque requête à 5000 lignes (`DB_MAX_QUERY_LIMIT`) et le front chargeait `journal_comptable` et
  `transactions` en une seule requête triée par date décroissante : au-delà de 5000 lignes, les plus anciennes (la
  saison précédente) disparaissaient silencieusement (totaux et bilans amputés, écritures introuvables au rapprochement).
  Nouveau `selectAllRows()` : chargement page par page (`offset` côté builder, déjà géré par le serveur), tri par `id`
  pour des pages sans chevauchement, erreur signalée si une page échoue.
- Un ré-import de relevé (PDF ou CSV) sur des opérations déjà présentes remettait `rapproche` à 0 (l'upsert met à jour
  toutes les colonnes envoyées) alors que le lien vers l'écriture restait stocké. `rapproche` n'est plus envoyé à
  l'import. Pour les opérations déjà touchées : bandeau « ⚠ N rapprochement(s) annulé(s) sans action de votre part »
  avec un bouton **Rétablir** (les liens dont l'écriture est entre-temps prise par une autre opération sont écartés).

Aucune migration. `app.min.js` régénéré, `app.js?v=20261011c`. 25 tests ajoutés (`test/rapprochement.test.ts`).

## Espace membre : deux adhérents sur la même adresse e-mail (père et fils) — 11/10/2026

**Cause.** L'espace membre retrouvait « la fiche d'un adhérent » (et toutes ses saisons) par son **e-mail seul**.
Quand deux adhérents partagent une adresse, ils étaient donc traités comme une seule personne : la « fiche courante »
était celle inscrite en dernier (l'enfant, au hasard des inscriptions), et diplômes, cotisations et présences des
deux étaient mélangés — y compris dans les routes d'écriture (coordonnées, certificat médical) et de téléchargement
(diplômes, attestation de présence). Le sélecteur de profils fusionnait aussi les enfants qui partagent l'adresse du
parent (seul le plus récemment inscrit apparaissait).

**Correctif** (`src/lib/member-identity.ts`, branché sur toutes les routes `/api/member/*` concernées) :
- Deux fiches qui partagent un e-mail sont la **même personne** sauf preuve du contraire : dates de naissance qui se
  contredisent, ou prénoms nettement différents (casse, accents, tirets ignorés ; une coquille d'une lettre sur un prénom
  d'au moins 5 lettres est tolérée pour ne pas amputer un historique). **Pour une adresse portée par une seule personne,
  rien ne change.**
- `resolveCurrentAdherentRow`, le tableau de bord, `/cotisations`, `/presences`, `/diplomes`, le téléchargement d'un
  diplôme et l'attestation de présence travaillent maintenant sur les **fiches de la personne du profil actif**
  (`adherents.id IN (…)`), plus sur « toutes les lignes de cet e-mail ».
- `/api/member/profiles` : un enfant = une personne (sa saison la plus récente), plus « une ligne par e-mail ».
- `/api/member/activation/request` : quand plusieurs personnes partagent l'adresse, le compte est ancré sur la
  **plus âgée** (le parent) au lieu d'une fiche quelconque ; un compte déjà existant pour cette adresse est réutilisé
  (jamais re-ancré) au lieu de provoquer une erreur sur l'e-mail unique.
- Le lien de tutelle reste un geste manuel du bureau (partager une adresse ne prouve pas une tutelle) : tant que le fils
  n'est pas rattaché au compte du père, le père ne voit que lui-même.

**À vérifier / reprendre côté données (non automatisé volontairement).** Un compte déjà créé pour une adresse partagée
a pu être ancré sur la fiche de l'enfant. Pour les repérer, dans la console D1 :
```sql
SELECT ac.id AS compte_id, ac.email, ac.adherent_id AS fiche_ancre, a.prenom, a.nom, a.naissance
FROM adherent_comptes ac JOIN adherents a ON a.id = ac.adherent_id
WHERE (SELECT COUNT(DISTINCT UPPER(TRIM(x.prenom))) FROM adherents x
       WHERE LOWER(TRIM(x.email)) = LOWER(TRIM(ac.email))) > 1;
```
Si l'ancre est l'enfant : `UPDATE adherent_comptes SET adherent_id = '<id fiche parent>' WHERE id = '<compte_id>';`
puis rattacher l'enfant au compte depuis sa fiche (Adhérents › tuteur) ou
`UPDATE adherents SET guardian_compte_id = '<compte_id>' WHERE id = '<id fiche enfant>';`
(le lien porte sur une ligne par saison : à reposer à chaque réinscription, comme avant).

**Limites connues.** `handleBoutiqueMemberStatus` (tenue offerte aux membres du bureau) interroge toujours par e-mail
seul : si le père est membre du bureau, son fils sur la même adresse est aussi considéré comme tel. Le correctif complet
demande que `boutique` transmette aussi l'adhérent actif (présent dans le jeton : `activeAdherentId`). Le rapprochement
à l'inscription en ligne (`findMatchingAdherent`, projet `inscription`) cherche d'abord « par e-mail exact » : à vérifier
qu'une réinscription du fils ne met pas à jour la fiche du père.

Tests : `test/member-identity.test.ts` (24, fonctions pures) et `test/member-shared-email.test.ts` (9, vraies routes du
Worker sur SQLite avec toutes les migrations ; ignoré si Node < 22.5). Sur le même jeu de données, 7 de ces 9 tests échouent
avec l'ancien code. `tsc --noEmit` et les 311 tests passent. Aucune migration, aucun changement côté `espace-membre`.

## Journal : boutons rapides « Compte courant → Épargne » et « Épargne → Compte courant » — 11/10/2026

Deux nouveaux boutons dans les écritures types du **Journal comptable** (après « Remboursement adhérent »),
droit d'écriture comptabilité requis comme les autres.
- **⚡ Compte courant → Épargne** (`transfert_vers_epargne`) : **5121 - Livret d épargne** au débit /
  **512 - Banque** au crédit. Libellé par défaut « Transfert vers épargne ».
- **⚡ Épargne → Compte courant** (`transfert_depuis_epargne`) : **512 - Banque** au débit /
  **5121 - Livret d épargne** au crédit. Libellé par défaut « Transfert depuis épargne ».
- Mouvements internes de trésorerie : aucun effet sur le résultat. `5121` est ajouté au plan comptable
  **juste après 512** ; c'est une subdivision de 512, donc le total « Banque » du bilan et du tableau de bord
  ne bouge pas, la vue « 512 » l'inclut, et les deux lignes (pièces `-L1` et `-L2`) se rapprochent chacune de
  leur relevé (compte courant et livret).
- Les modèles peuvent désormais porter un champ `hint`, affiché dans la bannière de la fenêtre.

Aucune migration. `app.min.js` régénéré, `app.js?v=20261011b`. 9 tests ajoutés (`test/rapprochement.test.ts`).

## Ventes « Payée » + fiabilité des suggestions de rapprochement — 10/10/2026

**Ventes : impossible de passer une vente en « Payée ».** Le bouton envoyait en une seule requête le
statut **et** `date_paiement` (+ `notes_paiement`). `date_paiement` n'existe dans aucune migration (comme
`notes_paiement`, `client_email`… cf. note de la migration `0024`) : si la colonne manque en production,
tout l'UPDATE échouait (« Erreur base de données ») et le statut n'était jamais enregistré.
- `setFactureStatus()` essaie désormais : statut + date + notes → statut + notes → statut seul. Le statut
  passe donc toujours ; la date de paiement est conservée dans `notes_paiement` (« Payée le AAAA-MM-JJ — mode »)
  et relue par `facturePaidDate()` pour l'affichage. Un avertissement le signale si tout n'a pas pu être enregistré.
- La date acceptait n'importe quel texte : « 09/10/2026 » est maintenant converti, une date illisible est refusée.
- `notes_paiement` n'écrase plus l'historique des relances (la ligne « Payée le… » est ajoutée) et est
  renseigné même sans mode de règlement.
- `src/index.ts` : une colonne manquante est nommée dans l'erreur renvoyée (« Colonne absente de la base :
  factures.xxx (migration manquante ?) ») au lieu du message générique.

**Rapprochement : écritures proposées erronées.**
- Les suggestions parcouraient **toutes** les lignes du journal : un encaissement de 45 € pouvait être lié
  à la ligne 411 ou 707 de la vente (même montant, même date) et la vraie ligne 512 restait « en attente
  de relevé ». Seules les pièces du compte 512 sont maintenant proposées (comme dans « Imputation multi »).
- Le test de sens était inversé pour le 512 (crédit bancaire ↔ crédit du journal). Tout est comparé « vu de la
  banque » (+ entrée / − sortie) ; un sens opposé élimine le candidat.
- Deux écritures aussi plausibles (cotisations au même tarif, même jour) : la suggestion n'est plus
  rapprochée automatiquement, elle est marquée « Ambiguë » et laissée à la validation manuelle.
- Regroupements : un encaissement et un paiement ne s'additionnent plus (30 € reçus + 15 € payés ≠ 45 €) ;
  seules les pièces 512 sont candidates ; la recherche de combinaisons est bornée (pas de gel sur un gros relevé).
- Menu « Pièce unique » : pièces 512 en attente d'abord, avec date, libellé et montant signé ; avant, toutes
  les lignes du journal étaient mélangées avec un libellé tronqué à 20 caractères et sans montant.
- « Valider » demande confirmation si le montant ou le sens de l'écriture choisie ne colle pas à l'opération.
- Les mises à jour de `transactions` (valider, corriger, annuler, pré-sélection auto, groupé) vérifient
  maintenant le retour de la base : avant, une erreur était ignorée et l'écran affichait « rapprochée »
  alors que rien n'était enregistré.
- Anti-doublon : une écriture rapprochée disparaît des écritures en attente (compteurs, suggestions,
  imputation multi) — et désormais aussi du menu « Pièce unique », où elle restait proposée. `rapprocher()`
  demande confirmation si l'écriture choisie est déjà liée à une autre opération (cas : la pré-sélection a
  proposé la même pièce à deux lignes).
- « Tous les comptes » (imputation multi) ne compte plus deux fois une pièce équilibrée (512 débit 45 +
  7561 crédit 45 = 45 €, pas 90 €).

**Import CSV bancaire.** Les montants étaient lus par un simple `parseFloat` : « 1 234,56 » devenait 1 € et
« 1.234,56 » 1,234 €, sans écran de vérification (l'import PDF en a un, pas le CSV). Nouveau
`parseBankCsvAmount()` : espaces (y compris insécables) et points de milliers ignorés, signe retiré
(le sens vient de la colonne), valeur illisible = 0. Les formats qui fonctionnaient (`45,00`, `-45,00`,
`1234.56`) donnent le même résultat qu'avant.

Aucune migration. `app.min.js` régénéré, `app.js?v=20261010d`. 23 tests ajoutés (`test/rapprochement.test.ts`) ;
`tsc --noEmit`, les tests et `wrangler deploy --dry-run` passent.

## Rapprochement bancaire : recherche et sélection multiple — 10/10/2026

Dans **Banque › Rapprochement**, imputer un virement groupé HelloAsso ou une remise de chèques sur
plusieurs écritures se faisait ligne par ligne, dans une petite liste sans recherche. Désormais :

- **Recherche des opérations bancaires** (barre au-dessus du tableau) : par nom / libellé, montant, date
  ou compte, plusieurs mots possibles (« dupont 45 »). Insensible à la casse et aux accents ; un montant
  se cherche par son début (« 45 » trouve 45,00 et 45,50, pas 145,00 ; « 45,5 » trouve 45,50) ; une date
  par « 05/10 », « 10/2026 » ou « 2026-10 ». Filtre Toutes / En attente / Rapprochées. Le champ garde le
  focus pendant la frappe (seul le tableau est rafraîchi).
- **Sélection de plusieurs opérations** : une case par opération en attente, **Maj + clic** pour cocher une
  plage, case d'en-tête pour tout cocher ce qui est affiché. Une barre flottante indique le nombre
  d'opérations cochées et leur total, avec « 🔗 Imputer la sélection… ».
- **Fenêtre « Imputation multi-opérations »** : liste des écritures **du compte 512 pas encore rapprochées**
  (option « Tous les comptes » pour élargir), avec la même recherche (nom, pièce, montant, date), **clic sur
  une ligne pour cocher, Maj + clic pour une plage**, « Cochées seulement », et le total des opérations
  bancaires face au total des écritures cochées. Écart nul → « ✓ Équilibré » ; sinon le bouton devient
  « ⚠ Imputer malgré l'écart de … » (frais bancaires, écriture oubliée…). Une seule requête enregistre
  toutes les opérations ; chacune est liée à l'ensemble des écritures cochées (comme le regroupement
  automatique existant). Échap ou Annuler ferme sans rien enregistrer.
- Le bouton « 🔗 Multi » de chaque ligne ouvre la même fenêtre pour cette seule opération et remplace
  l'ancienne liste à cocher (`rapprocherMulti` / `toggleMultiSel` supprimées).

**Correctifs au passage** (même écran) :
- Les menus « Pièce unique » étaient repérés par la position de la ligne (`ecr-<index>`) : depuis le tri par
  date, `preselectRapprochements()` visait la mauvaise ligne ; avec les filtres ce décalage aurait empiré.
  Ils sont désormais repérés par l'id de la transaction (`ecr-<id>`).
- Le score de suggestion était recalculé pour chaque option de chaque menu (coût en J² par ligne) : calculé
  une fois par ligne, options construites une seule fois pour tout le tableau.

Aucune migration, aucune nouvelle colonne : on réutilise `transactions.ecriture_piece` /
`ecriture_pieces_json`. `public/index.html` : cache-busting `app.js?v=20261010a` et `styles.css?v=20261010a`.
`app.min.js` régénéré. Nouveau fichier de tests `test/rapprochement.test.ts` (recherche, écritures
proposées, équilibre) ; `tsc --noEmit` et les 247 tests passent.

## Renouvellement : certificat médical déjà validé réutilisé (3 ans) — 05/10/2026

Au **renouvellement en ligne** (repo `inscription`), l'adhérent dont le certificat médical a déjà été
validé et reste dans sa durée de validité n'a plus rien à fournir : ni pièce, ni case d'engagement.

- **Conditions** (toutes requises) : renouvellement dont l'identité est vérifiée (nom, prénom, date de
  naissance, e-mail) ; fiche cochée « Certificat » ; certificat **daté** ; date + durée de validité encore
  dans le futur. Durée = `club_info.duree_validite_certificat_mois` (onglet Club), **plafonnée à 36 mois** ;
  la migration `0036` la porte déjà à 36 si elle valait encore 12. gestion et inscription lisent la même
  valeur : on ne réutilise jamais un certificat que gestion juge expiré.
- **Date du certificat** (la plus récente des sources) : `adherents.certificat_date` (dépôt depuis l'espace
  membre) ; sinon date de dépôt d'une inscription où un certificat a été **joint** ; sinon date d'origine
  reportée par une inscription qui l'avait déjà réutilisé (la réutilisation **ne prolonge jamais** la
  validité : un certificat de 2024 cesse d'être réutilisable en 2027, quel que soit le nombre de renouvellements).
  Sans date (adulte dispensé : « Certificat » vaut 1 sans aucun certificat), rien n'est réutilisé.
- **Jamais réutilisé** si une réponse « oui » au questionnaire de santé (l'état de santé a pu évoluer : un
  nouveau certificat est nécessaire, comme l'indique le formulaire) ni si l'adhérent joint un nouveau
  certificat (plus récent, il passe par la vérification habituelle).
- **Effet sur la fiche** : « Certificat » reste coché (au lieu d'être remis à zéro puis à re-valider),
  `certificat_date` n'est pas modifiée. Infobulle : « certificat déjà validé réutilisé… valable jusqu'au… ».
  Aucun rappel « certificat promis » n'est envoyé dans ce cas.
- Aucune migration. `public/index.html` : cache-busting `app.js?v=20261005a`.

Non modifié : le bouton ↻ Renouveler (et le renouvellement groupé) de l'onglet Adhérents continue de
décocher « Certificat » pour re-validation manuelle, comme avant.

## Certificat médical promis à l'inscription + rappels automatiques — 04/10/2026

Quand le certificat est obligatoire (mineur, ou au moins un « oui » au questionnaire de santé),
l'adhérent qui ne l'a pas sous la main peut désormais cocher **« Je m'engage à fournir le
certificat médical au plus vite, à défaut, l'accès aux entraînements me sera refusé »** et
poursuivre son inscription sans pièce jointe (repo `inscription`, étape Santé). Côté `gestion` :

- **Rappel e-mail automatique** (`checkCertificatsEnAttente`, ajouté au cron quotidien) : envoyé
  à l'adresse de la fiche **7 jours après l'engagement, puis tous les 7 jours**, tant que la case
  « Certificat médical fourni / validé » de la fiche n'est pas cochée. Pour un mineur, le message
  parle de l'enfant (l'adresse est celle du responsable). Il renvoie vers l'espace membre pour
  déposer le certificat. Le délai se règle dans `club_info.certificat_rappel_intervalle_jours`
  (défaut 7, entier de 1 à 60 ; toute autre valeur retombe sur 7).
- **Garde-fous** : fiche « Actif » avec e-mail uniquement ; seule l'inscription la plus récente de
  la fiche compte, et seulement si elle est de la saison de la fiche (le renouvellement groupé
  remet « Certificat » à zéro sans nouvelle inscription : l'engagement d'une saison passée ne
  relance personne) ; cadence par jour calendaire ; jamais deux envois le même jour.
- **Migration `0037_certificat_engagement_rappels.sql`** : une table `certificat_engagement_rappels`
  (un enregistrement par envoi, rattaché à l'inscription) et la clé `club_info` ci-dessus. Aucune
  colonne ajoutée à `adherents` : l'engagement est lu dans `inscriptions_publiques.dossier_json`
  (`computedTotals.certificateDeferred`, `health.certificateCommitmentAt`). Sans cette migration,
  seul le cron échoue (visible dans Automatisations) ; les inscriptions ne sont jamais impactées.
- **Fiche adhérent** : l'état reste « ✗ Manquant » (compteurs et alertes inchangés) ; l'infobulle
  précise que l'adhérent s'est engagé, à quelle date, et qu'un rappel automatique est en cours.
- **Automatisations** : nouvelle ligne « Rappels certificats promis », avec bouton **Lancer**
  (`POST /api/admin/certificats/relancer-engagements`, même cadence que le cron).
- `public/index.html` : cache-busting `app.js?v=20261004a`. `app.min.js` non régénéré
  (non chargé par `index.html`).

À savoir : le dépôt d'un certificat par l'adhérent depuis l'espace membre coche lui-même
« Certificat » (comportement existant, inchangé) : les rappels s'arrêtent donc dès ce dépôt, sans
attendre la vérification du bureau. Rien n'empêche techniquement l'accès aux entraînements :
le refus reste à appliquer par le bureau.

## Accès CSE Thalès quand les inscriptions sont fermées — 30/09/2026

Les membres du CSE Thalès doivent pouvoir s'inscrire toute l'année, même quand les
inscriptions sont fermées au public. Côté `gestion` (écran **Tarifs en ligne**) :

- Nouvelle carte **« Accès CSE Thalès hors période d'ouverture »** : un code d'accès à
  définir (ou à générer, format `XXXX-XXXX-XXXX` sans caractères ambigus) puis à
  communiquer au CSE. Stocké dans `club_info.public_inscription_cse_code`, sans
  migration.
- Code vide = fonctionnalité désactivée : le bouton « Je suis membre du CSE Thalès »
  n'apparaît pas sur le site d'inscription et l'accès reste totalement fermé. Minimum
  8 caractères (hors tirets) — imposé ici et côté serveur. Changer le code invalide
  l'ancien immédiatement.
- Le code n'ouvre que le **tarif CSE Thalès** (attestation employeur exigée) ; la
  restriction est appliquée côté serveur dans le repo `inscription`
  (`src/routes/_lib/cse-access.js`, `POST /api/public/cse-access`).
- `public/index.html` : cache-busting `app.js?v=20260930a`. `app.min.js` n'est pas
  chargé par `index.html` : non régénéré.

`tsc --noEmit` propre ; 202 tests passent (aucun test modifié).

## Reçu joint à l'e-mail de confirmation d'inscription — 21/09/2026

Le reçu de cotisation est maintenant joint automatiquement, dans un fichier séparé du
dossier récapitulatif, à l'e-mail envoyé quand le paiement est confirmé (repo `inscription`,
`sendPaymentConfirmedAlert`). Côté `gestion` :

- **Paiement en 2 ou 3 fois** — la fiche est créée dès la 1re échéance ; le reçu ne doit pas
  laisser croire que tout est encaissé. Le pied de page indique maintenant ce qui est réglé à
  ce jour et ce qui reste à prélever (« Mode de paiement : HelloAsso en 3 fois - 99,00 €
  réglés à ce jour, 198,00 € à prélever »), d'après `dossier_json.payment` (persisté par le
  worker `inscription` à chaque échéance). Le total du tableau reste la valeur de l'adhésion.
  Paiement unique : mention inchangée. Garde de largeur : le pied de page ne déborde jamais.
- `src/lib/pdf/cotisation-receipt.ts` a désormais une **copie JS** dans le repo `inscription`
  (`src/routes/_lib/cotisation-receipt.js`) : les deux doivent être modifiés ensemble. Parité
  vérifiée sur 6 000 reçus aléatoires (statuts, saisons, exercices, formats de dossier,
  échéanciers) : 0 écart.

`tsc --noEmit` propre ; 191 tests (dont 9 nouveaux sur les paiements échelonnés).

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

## 6. Planning des encadrants (interface retirée en octobre 2026)

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
- ~~**Onglet Planning**~~ : retiré de l'interface (octobre 2026), jugé inutile. La table `planning_encadrants` et la permission `perm_planning` sont conservées en base et côté API (aucune donnée supprimée) ; seul l'écran (sous-onglet, modale, chargement) a disparu du frontend.
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
