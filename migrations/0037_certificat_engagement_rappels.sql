-- Migration 0037 : rappels e-mail récurrents « certificat médical promis ».
--
-- Contexte : à l'inscription en ligne, un certificat médical est obligatoire
-- (mineur, ou au moins un « oui » au questionnaire de santé). Si l'adhérent ne
-- l'a pas sous la main, il peut désormais cocher une case d'engagement
-- (« je m'engage à fournir le certificat médical au plus vite, à défaut,
-- l'accès aux entraînements me sera refusé ») et poursuivre son inscription.
-- Le worker `inscription` l'enregistre dans inscriptions_publiques.dossier_json
-- (computedTotals.certificateDeferred = true, health.certificateCommitmentAt) :
-- aucune colonne n'est ajoutée à `adherents`, donc aucun risque pour les
-- inscriptions en cours si cette migration n'était pas encore appliquée.
--
-- Cette table ne sert qu'au cron checkCertificatsEnAttente (src/index.ts), qui
-- relance l'adhérent par e-mail tant que la case « Certificat médical fourni /
-- validé » de sa fiche n'est pas cochée (adherents.certificat = 1).
--
-- Contrairement à certificat_rappels (0017 : un seul rappel par échéance) et
-- adhesion_rappels (0036 : un seul email), on garde ICI UNE LIGNE PAR ENVOI :
-- le rappel est récurrent, la date du dernier envoi (MAX(envoye_at)) décide du
-- suivant. registration_id rattache les envois à l'inscription concernée : un
-- nouvel engagement la saison suivante repart d'un historique vierge.
CREATE TABLE IF NOT EXISTS certificat_engagement_rappels (
  id TEXT PRIMARY KEY,
  adherent_id TEXT NOT NULL,
  registration_id TEXT NOT NULL,
  envoye_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  FOREIGN KEY (adherent_id) REFERENCES adherents(id)
);

CREATE INDEX IF NOT EXISTS idx_certificat_engagement_rappels_adherent
  ON certificat_engagement_rappels(adherent_id, registration_id, envoye_at);

-- Délai (en jours) entre l'engagement et le 1er rappel, puis entre deux rappels.
-- Lu dynamiquement par le cron (défaut 7 si la ligne est absente ou invalide),
-- modifiable en base sans toucher au code. INSERT OR IGNORE : ne réécrit jamais
-- une valeur déjà personnalisée (même principe que 0017).
INSERT OR IGNORE INTO club_info (cle, valeur) VALUES ('certificat_rappel_intervalle_jours', '7');
