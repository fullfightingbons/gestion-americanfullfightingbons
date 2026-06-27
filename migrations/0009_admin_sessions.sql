-- Table manquante en production : /api/admin/login (POST), /api/admin/logout
-- et la purge automatique des sessions expirées (cf. src/index.ts) supposent
-- l'existence de admin_sessions, mais elle n'a jamais été créée par une
-- migration. Cette route est la clé "maître" indépendante des comptes
-- utilisateurs (cf. /api/admin/reset-password), donc utilisable même si
-- plus personne ne peut se connecter via /api/auth/login : elle doit
-- fonctionner.

CREATE TABLE IF NOT EXISTS admin_sessions (
  token       TEXT PRIMARY KEY,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);
