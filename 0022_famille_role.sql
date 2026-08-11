-- Rôle du titulaire du compte au sein du foyer (père / mère / tuteur légal),
-- auto-déclaré depuis l'espace membre. Purement descriptif — affiché dans le
-- sélecteur de profils à la place de l'icône générique, sans effet sur les
-- droits d'accès. Les enfants (profils vus via guardian_compte_id, sans
-- compte propre) n'ont pas besoin de ce champ : ils sont affichés comme
-- "Enfant" par construction, puisqu'ils sont du côté "guardé" du lien.
ALTER TABLE adherent_comptes ADD COLUMN family_role TEXT;
