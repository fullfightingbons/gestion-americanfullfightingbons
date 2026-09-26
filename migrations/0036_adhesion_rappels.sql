-- Rappel de renouvellement d'adhésion.
--
-- Contrairement au rappel certificat (proactif, jusqu'à 30 jours AVANT
-- échéance), celui-ci est volontairement réactif : un seul email, envoyé
-- une fois `date_fin_adhesion` dépassée — jamais avant, jamais relancé une
-- deuxième fois pour la même échéance (cf. checkAdhesionsExpirees + cron
-- dans index.ts). Même principe de dédoublonnage que certificat_rappels
-- (migration 0017) : une ligne par (adherent_id, echeance) déjà notifiée.
CREATE TABLE IF NOT EXISTS adhesion_rappels (
  id TEXT PRIMARY KEY,
  adherent_id TEXT NOT NULL,
  echeance TEXT NOT NULL,
  envoye_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (adherent_id) REFERENCES adherents(id)
);

CREATE INDEX IF NOT EXISTS idx_adhesion_rappels_adherent ON adhesion_rappels(adherent_id, echeance);

-- Correction de la durée de validité par défaut du certificat médical.
--
-- La migration 0017 avait seedé 12 mois par prudence ("à ajuster si la
-- fédération impose une autre durée pour ce sport de contact"). Le club
-- confirme le principe réglementaire général : un certificat médical de
-- non contre-indication est valable 3 ans (36 mois) — les années
-- intermédiaires étant couvertes par l'auto-questionnaire de santé
-- QS-SPORT, déjà géré séparément par adherentCertificatInfo() côté
-- inscription (si une réponse "oui" apparaît, un nouveau certificat est
-- redemandé indépendamment de cette durée).
--
-- Cette valeur alimente 3 endroits qui la lisent dynamiquement depuis
-- club_info (aucun n'a de durée en dur) : le cron checkCertificatsExpirants
-- (rappel email), et les badges certifStatus/certifBadge côté client — les
-- corriger ici les corrige tous les trois du même coup.
--
-- On ne met à jour que si la valeur est encore celle seedée par défaut
-- (12) : à ce jour aucun champ d'admin ne permet de la modifier (seed only,
-- cf. 0017), donc en pratique elle n'a jamais pu être personnalisée — mais
-- la clause WHERE protège quand même contre un futur changement manuel en
-- base qu'on ne voudrait pas écraser silencieusement.
UPDATE club_info SET valeur = '36' WHERE cle = 'duree_validite_certificat_mois' AND valeur = '12';
