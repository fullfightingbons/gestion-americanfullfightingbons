-- Annuaire des adhérents : liste (nom/prénom uniquement) visible par les
-- autres membres connectés à l'espace-membre. Consentement dédié et
-- volontairement distinct de `adherents.droit_image` (migration 0001), qui
-- couvre une finalité RGPD différente — l'usage de photos sur le site et les
-- réseaux du club — pas l'apparition dans une liste consultée par les
-- autres adhérents. Un membre peut consentir à l'un sans l'autre.
-- Défaut à 0 (opt-in explicite) : un adhérent existant ne doit pas se
-- retrouver listé sans l'avoir demandé.
ALTER TABLE adherents ADD COLUMN annuaire_visible INTEGER NOT NULL DEFAULT 0;
