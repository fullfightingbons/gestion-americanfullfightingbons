-- Blacklistage d'un adhérent (radiation prononcée par le bureau, ou refus
-- d'adhésion) : bloque toute nouvelle tentative d'inscription en ligne pour
-- la même identité (cf. inscription/src/routes/api/public/inscription.js,
-- checkBlacklist, qui lit cette même base D1 partagée — voir wrangler.json
-- des deux projets, binding DB identique).
--
-- Volontairement RELEVABLE : `blackliste` est un simple statut courant, pas
-- une suppression ni un champ "définitif" — le bureau peut revenir sur sa
-- décision à tout moment (POST puis DELETE sur /api/adherents/:id/blacklist,
-- cf. src/index.ts). `blackliste_motif` / `blackliste_depuis` ne portent que
-- l'état ACTUEL ; l'historique complet (chaque blocage ET chaque levée, avec
-- motif et auteur) vit dans adherents_blacklist_historique et survit même
-- après plusieurs allers-retours.
ALTER TABLE adherents ADD COLUMN blackliste INTEGER NOT NULL DEFAULT 0;
ALTER TABLE adherents ADD COLUMN blackliste_motif TEXT;
ALTER TABLE adherents ADD COLUMN blackliste_depuis TEXT;

-- action : 'blackliste' | 'leve'
CREATE TABLE IF NOT EXISTS adherents_blacklist_historique (
  id TEXT PRIMARY KEY,
  adherent_id TEXT NOT NULL,
  action TEXT NOT NULL,
  motif TEXT,
  decide_par TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (adherent_id) REFERENCES adherents(id)
);

-- Index utilisé par le worker "inscription" à chaque soumission publique
-- (SELECT ... FROM adherents WHERE blackliste = 1) : la table de blacklist
-- reste petite en pratique, mais on évite un scan complet d'adherents sur un
-- chemin exécuté à chaque tentative d'inscription, y compris malveillante.
CREATE INDEX IF NOT EXISTS idx_adherents_blackliste ON adherents(blackliste);
CREATE INDEX IF NOT EXISTS idx_adherents_blacklist_historique_adherent ON adherents_blacklist_historique(adherent_id, created_at);
