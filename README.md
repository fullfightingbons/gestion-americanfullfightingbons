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

## Déploiement

```bash
npm run check    # typecheck + dry-run
npm run deploy    # wrangler deploy (applique aussi les migrations distantes)
```

Le déploiement est piloté par `.github/workflows/deploy.yml` (CI GitHub Actions).

## Tests

```bash
npm test
```

## Notes de maintenance

- PDF.js est actuellement vendorisé en dur dans `public/vendor/pdfjs/` plutôt que géré comme dépendance npm — à surveiller pour les mises à jour de sécurité de cette librairie.
- `wrangler.local.json` est versionné dans le dépôt : à vérifier qu'aucune information d'environnement sensible ne doit en être retirée (fichier habituellement exclu via `.gitignore`).
