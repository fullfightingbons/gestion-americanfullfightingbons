-- Suivi de la date du certificat médical / questionnaire de santé, pour
-- calculer une échéance de renouvellement et permettre des rappels
-- automatiques (cf. index.ts : checkCertificatsExpirants + cron).
--
-- `certificat` (existant) reste le booléen "un justificatif a été fourni à
-- l'inscription". `certificat_date` ajoute *quand*, ce qui manquait pour
-- savoir si ce justificatif est encore valide en cours de saison.
ALTER TABLE adherents ADD COLUMN certificat_date TEXT;

-- Durée de validité par défaut (en mois) avant renouvellement, modifiable
-- depuis l'admin (onglet Club) sans toucher au code. 12 mois par défaut :
-- à ajuster si la fédération impose une autre durée pour ce sport de contact.
INSERT OR IGNORE INTO club_info (cle, valeur) VALUES ('duree_validite_certificat_mois', '12');

-- Historique des rappels déjà envoyés, pour ne pas relancer un même
-- adhérent plusieurs fois pour la même échéance à chaque exécution du cron.
CREATE TABLE IF NOT EXISTS certificat_rappels (
  id TEXT PRIMARY KEY,
  adherent_id TEXT NOT NULL,
  echeance TEXT NOT NULL,
  envoye_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (adherent_id) REFERENCES adherents(id)
);

CREATE INDEX IF NOT EXISTS idx_certificat_rappels_adherent ON certificat_rappels(adherent_id, echeance);
