# Migrations `gestion`

Appliquées via `wrangler d1 migrations apply DB` (local avec `--local`, prod
via le déploiement — cf. `npm run seedLocalD1` / CI).

## Trou dans la numérotation : 0006 et 0007

La séquence saute de `0005_diplomes_archivage.sql` à
`0008_create_utilisateurs.sql`. Recherche faite dans tout le dépôt (code,
CHANGELOG, README) : aucune trace de ce qu'auraient contenu `0006` et `0007`,
ni de suppression documentée.

**Volontairement, aucun fichier `0006_*.sql` / `0007_*.sql` n'a été recréé
pour combler ce trou.** La table de suivi `d1_migrations` de D1 enregistre
les migrations déjà appliquées par nom de fichier ; introduire aujourd'hui des
fichiers portant ces numéros risquerait de les faire exécuter hors séquence
(après les migrations 0008–0028 déjà appliquées en prod) sans connaître leur
contenu d'origine — plus dangereux que le trou lui-même.

Si l'historique réel de ces deux migrations est retrouvé (dépôt Git privé,
sauvegarde, mémoire du provider), le plus sûr reste de les documenter ici a
posteriori plutôt que de les rejouer.
