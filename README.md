# Gestion — American Full Fighting Bons en Chablais

Back-office interne de gestion du club AFFBC : adhérents, diplômes, comptabilité (exercices, journal comptable, factures, achats), comptes bancaires, et inscriptions publiques. Worker Cloudflare + base D1, déployé en interne (réservé aux membres du bureau).

## Stack

- **Cloudflare Workers** (TypeScript) — API + service de fichiers statiques (`src/index.ts`)
- **Cloudflare D1** — base SQL (`migrations/`)
- **Frontend** — HTML/JS vanilla (`public/`), PDF.js vendorisé pour la lecture de documents (`public/vendor/pdfjs/`)

## Modèle de données

Tables gérées via une API CRUD générique (`/api/<table>`) :
`adherents`, `achats`, `audit_logs`, `club_info`, `comptes_bancaires`, `diplomes`, `exercices`, `factures`, `inscriptions_publiques`, `journal_comptable`, `transactions`, `utilisateurs`.

## Sécurité et permissions

- **RBAC par table** : chaque table est protégée par une permission dédiée (`perm_adherents`, `perm_banque`, `perm_comptabilite`, `perm_facturation`, `perm_administration`, `perm_achats`), avec un droit `read`/`write` distinct par utilisateur.
- **Authentification par session** (`/api/auth/login`, `/api/auth/session`, `/api/auth/logout`, `/api/auth/change-password`).
- **Anti-bruteforce** sur le login (limitation par IP + fenêtre de blocage).
- **Audit log** systématique des actions sensibles (table `audit_logs`).
- **En-têtes de sécurité** (CSP, X-Frame-Options, Permissions-Policy) sur toutes les réponses.
- Invalidation de session si le mot de passe change.

## Développement local

```bash
npm install
npm run seedLocalD1   # applique les migrations sur la base D1 locale
npm run dev            # wrangler dev
```

> ℹ️ **Historique — migrations feedback sur base vierge (corrigé).** La séquence
> `0010_feedback.sql` → `0013_feedback_completion.sql` → `0014_feedback_schema_align.sql`
> encode l'historique organique réel de la production (tables `feedback_*`
> créées manuellement hors-migration avant que 0010 n'existe, avec un schéma
> divergent — voir les commentaires en tête de chacun de ces fichiers).
>
> `0014_feedback_schema_align.sql` contenait à l'origine des `UPDATE` de
> backfill référençant des colonnes legacy (`title`, `status`, `created_at`)
> supposées toujours présentes en prod. Sur une base vierge (CI, premier
> `seedLocalD1`, nouvelle installation), ces colonnes n'existent pas et la
> migration échouait avec `no such column: title`. Ces `UPDATE` ont été
> retirés de la migration versionnée (non bloquants pour l'application, qui
> ne lit/écrit que `titre`/`statut`/`submitted_at`) — voir le commentaire en
> tête de `0014_feedback_schema_align.sql` pour la requête de backfill
> manuelle à exécuter ponctuellement si la prod historique en a réellement
> besoin. `seedLocalD1` et le CI s'exécutent désormais sans erreur sur une
> base vierge, sans manipulation particulière.

## Déploiement

```bash
npm run check    # typecheck + dry-run
npm run deploy    # wrangler deploy (applique aussi les migrations distantes)
```

Le déploiement est piloté par `.github/workflows/check.yml` (CI GitHub Actions : typecheck + build + tests, puis déploiement automatique sur push vers `main`).

## Tests

```bash
npm test
```

## Notes de maintenance

- PDF.js est actuellement vendorisé en dur dans `public/vendor/pdfjs/` plutôt que géré comme dépendance npm — à surveiller pour les mises à jour de sécurité de cette librairie.
- `wrangler.local.json` n'est plus présent dans l'arborescence actuelle (seul `wrangler.local.example.json` l'est) et `.gitignore` l'exclut bien désormais. Reste à vérifier qu'il n'a jamais été committé par le passé — `git log --all --full-history -- wrangler.local.json` — car un fichier retiré du HEAD reste récupérable dans l'historique tant qu'il n'a pas été purgé (`git filter-repo`/BFG) et que le dépôt n'a pas été forcé-poussé. S'il apparaît dans l'historique, vérifier son contenu à l'époque et faire tourner les secrets concernés le cas échéant avant purge.
