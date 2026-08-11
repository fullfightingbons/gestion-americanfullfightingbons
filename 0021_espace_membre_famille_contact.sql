-- Gestion multi-comptes / parent-enfant : un compte espace-membre
-- (adherent_comptes) peut être désigné "tuteur" d'un ou plusieurs autres
-- adhérents (typiquement ses enfants), pour basculer entre profils depuis
-- l'espace membre sans se reconnecter. Volontairement porté par la table
-- `adherents` (une ligne par adhérent et par saison) plutôt que par une
-- table de jointure séparée : un adhérent n'a qu'un seul tuteur à la fois,
-- et le lien se pose/se retire depuis la fiche adhérent existante côté
-- bureau, sans nouvel écran dédié.
--
-- Nullable : la grande majorité des adhérents n'ont pas de tuteur (ce sont
-- des adultes autonomes). Le lien est posé manuellement par le bureau
-- (POST /api/adherents/:id/guardian, perm_adherents en écriture) — jamais
-- par l'adhérent ou le tuteur lui-même, pour éviter qu'un tiers ne
-- s'attribue l'accès aux données d'un autre adhérent.
--
-- Limite connue : comme `adherents` génère une nouvelle ligne à chaque
-- réinscription (une par exercice_id), ce lien ne survit pas automatiquement
-- d'une saison à l'autre — à reposer par le bureau si besoin lors du
-- renouvellement, comme pour tout autre champ propre à `adherents`.
ALTER TABLE adherents ADD COLUMN guardian_compte_id TEXT REFERENCES adherent_comptes(id);

CREATE INDEX IF NOT EXISTS idx_adherents_guardian_compte ON adherents(guardian_compte_id);

-- Messagerie / contact rapide avec le bureau : journal des messages envoyés
-- depuis l'espace membre (POST /api/member/contact), utilisé uniquement
-- pour un anti-abus léger (nombre de messages/heure par compte) — le
-- contenu du message lui-même n'est pas dupliqué ici, il part directement
-- par email (Brevo) ; on ne conserve que ce qu'il faut pour limiter le débit
-- et, en cas de besoin, retracer qui a écrit quand.
CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  adherent_compte_id TEXT NOT NULL REFERENCES adherent_comptes(id),
  subject TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_compte_date ON contact_messages(adherent_compte_id, created_at);
