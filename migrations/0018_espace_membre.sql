-- Espace membre : chaque adhérent peut activer un accès en ligne pour
-- consulter sa fiche, sa cotisation, ses documents, etc. Le compte est
-- toujours rattaché à un adhérent EXISTANT via l'email déjà enregistré sur
-- sa fiche (jamais une auto-inscription libre) : c'est ce lien qui empêche
-- un tiers de créer un accès en se faisant passer pour quelqu'un d'autre.
--
-- Séparée de `utilisateurs` (comptes du bureau/encadrants) à dessein : un
-- compte membre ne doit jamais pouvoir se confondre avec un compte staff,
-- même en cas de bug — deux tables, deux jetons de session avec un champ
-- `kind` distinct (cf. src/index.ts), deux cookies de session différents.
CREATE TABLE IF NOT EXISTS adherent_comptes (
  id TEXT PRIMARY KEY,
  adherent_id TEXT NOT NULL UNIQUE REFERENCES adherents(id),
  email TEXT NOT NULL UNIQUE,
  mot_de_passe TEXT,                 -- NULL tant que le compte n'est pas activé
  email_verifie INTEGER NOT NULL DEFAULT 0,
  activation_token TEXT,
  activation_expires_at TEXT,
  reset_token TEXT,
  reset_expires_at TEXT,
  password_changed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_adherent_comptes_email ON adherent_comptes(email);
CREATE INDEX IF NOT EXISTS idx_adherent_comptes_activation_token ON adherent_comptes(activation_token);
CREATE INDEX IF NOT EXISTS idx_adherent_comptes_reset_token ON adherent_comptes(reset_token);

-- Note : le rate-limiting des routes membre (login, activation, réinitialisation)
-- réutilise la table `auth_rate_limits` déjà créée par 0001_create_schema.sql
-- (colonnes failures / last_failure_at / blocked_until / created_at / updated_at).
-- Cette table existait déjà mais n'était jusqu'ici jamais utilisée par le code —
-- cf. src/index.ts (checkAuthRateLimit) pour sa mise en service effective.
