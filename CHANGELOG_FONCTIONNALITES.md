# Nouvelles fonctionnalités — Gestion AFFBC

Ajoutées sur la base du projet existant, sans rien retirer. `tsc --noEmit`,
les 31 tests existants (`vitest run`) et `wrangler deploy --dry-run` sont
propres après ajout.

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
