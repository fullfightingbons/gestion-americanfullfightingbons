-- Migration 0029 : gestion de stock avancée pour le matériel club
--
-- Complète la migration 0026 (inventaire simple) avec trois choses :
--   1. Un seuil d'alerte "stock bas" par article (quantite_min)
--   2. Le suivi des sorties/retours (qui a emprunté quoi, et quand ça revient)
--   3. Un historique des mouvements de stock (achats, pertes, casse, ajustements)
--
-- Note SQLite : ADD COLUMN sur une table existante n'est pas idempotent (déjà
-- vu sur ce projet avec la migration 0003 de calendrier) — pas grave ici
-- puisque cette colonne n'a jamais existé avant. Si schema.sql existait pour
-- ce repo, il faudrait aussi l'y ajouter directement (ce repo n'en a pas :
-- l'init se fait uniquement via `wrangler d1 migrations apply`).

ALTER TABLE materiel ADD COLUMN quantite_min INTEGER NOT NULL DEFAULT 0;

-- ── Sorties / retours ────────────────────────────────────────────
-- emprunteur_nom est en texte libre (le matériel club peut être prêté à
-- quelqu'un qui n'est pas forcément déjà fiché comme adhérent) ; adherent_id
-- est un lien optionnel quand l'emprunteur est un adhérent connu.
CREATE TABLE IF NOT EXISTS materiel_emprunts (
  id                    TEXT PRIMARY KEY,
  materiel_id           TEXT NOT NULL REFERENCES materiel(id),
  emprunteur_nom        TEXT NOT NULL,
  adherent_id           TEXT REFERENCES adherents(id),
  quantite              INTEGER NOT NULL DEFAULT 1,
  date_sortie           TEXT NOT NULL,
  date_retour_prevue    TEXT,
  date_retour_effective TEXT,                    -- NULL tant que non rendu
  notes                 TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_materiel_emprunts_materiel ON materiel_emprunts(materiel_id);
CREATE INDEX IF NOT EXISTS idx_materiel_emprunts_encours  ON materiel_emprunts(date_retour_effective);

-- ── Historique des mouvements de stock ──────────────────────────
-- quantite_delta est signé : positif pour un achat/apport, négatif pour une
-- perte/casse ; les sorties/retours d'emprunt ne touchent volontairement PAS
-- cette table (la quantité totale du club ne change pas quand un objet est
-- juste prêté) — seule la disponibilité change, dérivée de materiel_emprunts.
CREATE TABLE IF NOT EXISTS materiel_mouvements (
  id              TEXT PRIMARY KEY,
  materiel_id     TEXT NOT NULL REFERENCES materiel(id),
  type            TEXT NOT NULL CHECK (type IN ('achat','perte','casse','ajustement')),
  quantite_delta  INTEGER NOT NULL,
  motif           TEXT,
  date            TEXT NOT NULL,
  user_id         TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_materiel_mouvements_materiel ON materiel_mouvements(materiel_id);
CREATE INDEX IF NOT EXISTS idx_materiel_mouvements_date     ON materiel_mouvements(date);
