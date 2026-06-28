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

> ⚠️ **Piège connu — migrations feedback sur base vierge.** La séquence
> `0010_feedback.sql` → `0013_feedback_completion.sql` → `0014_feedback_schema_align.sql`
> encode l'historique organique réel de la production (tables `feedback_*`
> créées manuellement hors-migration avant que 0010 n'existe, avec un schéma
> divergent — voir les commentaires en tête de chacun de ces fichiers). Cette
> séquence s'applique sans erreur sur la production, mais **`0014` échoue sur
> une base totalement vierge** (`duplicate column name: titre`), car toutes
> les colonnes qu'elle tente d'ajouter existent déjà à ce stade quand on
> repart de zéro (créées directement par `0010`/`0013`).
>
> Ces migrations ne doivent **pas** être modifiées après coup (elles sont déjà
> appliquées en prod). Si `seedLocalD1` échoue sur ce point précis lors d'un
> premier seed local, la solution la plus simple est de retirer
> temporairement `0014_feedback_schema_align.sql` du dossier `migrations/`
> avant de lancer le seed local, puis de le restaurer ensuite (il ne sera de
> toute façon jamais nécessaire sur une base qui démarre vierge).

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
- `wrangler.local.json` est versionné dans le dépôt : à vérifier qu'aucune information d'environnement sensible ne doit en être retirée (fichier habituellement exclu via `.gitignore`).
