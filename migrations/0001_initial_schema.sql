-- Migration 0001 : schéma initial AFFBC Gestion
-- Reconstitué à partir des tables déclarées dans src/index.ts (TABLES, PRIMARY_KEYS,
-- TABLE_PERMISSIONS) et des champs réellement utilisés par public/app.js, mis à jour
-- pour refléter le système anti brute-force et l'audit logging déjà en place.
-- À vérifier contre le schéma réel en production avant application : ce fichier comble
-- l'absence totale de migration versionnée dans le dépôt, ce n'est pas un export exact.

CREATE TABLE IF NOT EXISTS utilisateurs (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  mot_de_passe TEXT NOT NULL,
  prenom TEXT,
  nom TEXT,
  role TEXT NOT NULL DEFAULT 'membre', -- admin | tresorier | secretaire | entraineur | membre
  actif INTEGER NOT NULL DEFAULT 1,
  perm_adherents TEXT,      -- 'read' | 'write' | 'none' | NULL (hérite du rôle)
  perm_banque TEXT,
  perm_comptabilite TEXT,
  perm_achats TEXT,
  perm_facturation TEXT,
  perm_administration TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  password_changed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS adherents (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  email TEXT,
  telephone TEXT,
  adresse TEXT,
  code_postal TEXT,
  ville TEXT,
  date_naissance TEXT,
  couleur_ceinture TEXT,
  numero_licence TEXT,
  discipline TEXT DEFAULT 'Club',
  certificat INTEGER DEFAULT 0,
  droit_image INTEGER DEFAULT 0,
  pass_region INTEGER DEFAULT 0,
  montant_pass_region REAL DEFAULT 0,
  reglement INTEGER DEFAULT 0,
  cotisation REAL DEFAULT 0,
  paiement TEXT,
  statut TEXT NOT NULL DEFAULT 'Actif', -- Actif | Inactif
  date_inscription TEXT,
  date_fin_adhesion TEXT,
  urgence_nom TEXT,
  urgence_telephone TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_adherents_statut ON adherents(statut);
CREATE INDEX IF NOT EXISTS idx_adherents_nom ON adherents(nom, prenom);

CREATE TABLE IF NOT EXISTS diplomes (
  id TEXT PRIMARY KEY,
  adherent_id TEXT REFERENCES adherents(id),
  titre TEXT,
  ceinture TEXT,
  date_emission TEXT,
  modele TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_diplomes_adherent ON diplomes(adherent_id);

CREATE TABLE IF NOT EXISTS exercices (
  id TEXT PRIMARY KEY,
  libelle TEXT NOT NULL,
  date_debut TEXT NOT NULL,
  date_fin TEXT,
  cloture INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comptes_bancaires (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  numero TEXT,
  solde_initial REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  compte_id TEXT NOT NULL REFERENCES comptes_bancaires(id),
  date_op TEXT NOT NULL,     -- format jj/mm/aaaa (parseur Crédit Mutuel)
  date_valeur TEXT,
  libelle TEXT,
  debit REAL DEFAULT 0,
  credit REAL DEFAULT 0,
  rapproche INTEGER NOT NULL DEFAULT 0,
  ecriture_piece TEXT,
  ecriture_pieces_json TEXT,  -- JSON array si plusieurs pièces liées
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_transactions_compte ON transactions(compte_id);
CREATE INDEX IF NOT EXISTS idx_transactions_rapproche ON transactions(rapproche);

CREATE TABLE IF NOT EXISTS journal_comptable (
  id TEXT PRIMARY KEY,
  exercice_id TEXT REFERENCES exercices(id),
  date_op TEXT NOT NULL,
  piece TEXT,
  compte TEXT NOT NULL,       -- "NNNN - Libellé compte" (plan comptable loi 1901)
  libelle TEXT,
  debit REAL DEFAULT 0,
  credit REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_journal_exercice ON journal_comptable(exercice_id);
CREATE INDEX IF NOT EXISTS idx_journal_compte ON journal_comptable(compte);
CREATE INDEX IF NOT EXISTS idx_journal_piece ON journal_comptable(piece);

CREATE TABLE IF NOT EXISTS achats (
  id TEXT PRIMARY KEY,
  date_op TEXT NOT NULL,
  fournisseur TEXT NOT NULL,
  designation TEXT,
  categorie TEXT,
  montant REAL NOT NULL DEFAULT 0,
  mode_paiement TEXT,
  reference_paiement TEXT,
  statut TEXT NOT NULL DEFAULT 'nouveau', -- nouveau | pending | valide | paye | refuse
  piece TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_achats_statut ON achats(statut);
CREATE INDEX IF NOT EXISTS idx_achats_categorie ON achats(categorie);

CREATE TABLE IF NOT EXISTS factures (
  id TEXT PRIMARY KEY,
  numero TEXT,
  date_op TEXT NOT NULL,
  client_nom TEXT,
  client_email TEXT,
  lignes TEXT,                 -- JSON array, parsé/sérialisé par sanitizeRow()
  montant_total REAL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'En attente', -- En attente | Payée | Retard | Annulée
  date_paiement TEXT,
  notes_paiement TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_factures_statut ON factures(statut);

CREATE TABLE IF NOT EXISTS club_info (
  cle TEXT PRIMARY KEY,
  valeur TEXT
);

CREATE TABLE IF NOT EXISTS inscriptions_publiques (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'nouvelle',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Journal d'audit applicatif : alimenté automatiquement par logAudit() sur
-- chaque insert/update/delete via /api/db/:table (hors table audit_logs elle-même).
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES utilisateurs(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);

-- Anti brute-force sur /api/auth/login : une ligne par IP, alimentée par
-- registerLoginFailure() / clearLoginFailures() / getLoginBlock() dans index.ts.
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  ip TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  last_failure_at TEXT,
  blocked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
