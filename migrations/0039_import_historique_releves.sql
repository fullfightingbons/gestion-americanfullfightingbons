-- Migration 0039 : import de l'historique bancaire d'avant juillet 2025 et remise à zéro
-- des soldes initiaux (compte courant 00020806601 et Livret Bleu 00020806603).
--
-- Origine : contrôle des relevés Crédit Mutuel du 12/10/2026 (37 relevés PDF, du 06/04/2024
-- au 30/09/2026). Les 155 opérations de juillet 2025 à septembre 2026 étaient déjà en base,
-- exactes. Les 146 opérations antérieures n'y étaient pas :
--   • compte courant : 145 opérations, du 06/04/2024 au 11/06/2025 (15 relevés) ;
--   • Livret Bleu    : 1 opération, le dépôt de 500 € du 10/01/2025 (relevé Réf 001).
-- Le compte courant a été ouvert le 06/04/2024 avec un solde nul ; le livret a été ouvert
-- le 10/01/2025 avec un solde nul. Une fois l'historique complet, les soldes initiaux
-- valent donc 0 € (au lieu de −61,10 € et 500 €), et le logiciel retombe sur les soldes de
-- la banque au 30/09/2026 : 2 420,22 € (compte courant) et 1 508,39 € (livret).
--
-- Les lignes sont celles que produit l'import PDF du logiciel (mêmes libellés, mêmes dates,
-- source_format 'pdf'), non rapprochées (rapproche = 0).
--
-- Garde-fous :
--   • INSERT OR IGNORE sur l'index d'unicité (compte, date, libellé, débit, crédit) : une
--     opération déjà importée à la main depuis un PDF n'est jamais dupliquée ;
--   • les soldes initiaux ne sont remis à 0 que s'ils valent encore la valeur attendue
--     (−61,10 € ou 41,90 € ; 500 €) ET si l'historique en base est bien complet (solde net
--     des opérations antérieures au 01/07/2025 = 41,90 € / 500,00 €). Sinon, rien n'est changé ;
--   • l'import lui-même n'a lieu que si le solde initial du compte est l'une des valeurs
--     attendues (−61,10 / 41,90 / 0 € ; 500 / 0 €) : une valeur saisie autrement est un choix
--     volontaire, et importer l'historique sans le remettre à zéro fausserait le solde ;
--   • rejouer la migration est sans effet ; sans effet aussi sur une base vide.

WITH h(id, date_op, date_valeur, libelle, debit, credit) AS (VALUES
  ('hist-cc-001','06/04/2024','2024-04-06','ADHESION PART SOCIALE A AMERICAN FULL FIGHTING BONS EN',15.00,0.00),
  ('hist-cc-002','06/04/2024','2024-04-08','REM CHQ REF02443A',0.00,117.50),
  ('hist-cc-003','06/04/2024','2024-04-06','VRST REF02443A01 BILLETS',0.00,115.00),
  ('hist-cc-004','02/05/2024','2024-05-02','VIR LICENCE TIMOTHEE GAHERY',30.00,0.00),
  ('hist-cc-005','03/05/2024','2024-05-03','MULTI ASSO 056007 ACM IARD SA MULTI ASSO 056007207 RMS24123231188250HI ICS : FR74ZZZ008087 RUM : HI20240406102601070348',277.10,0.00),
  ('hist-cc-006','07/05/2024','2024-05-07','VIR M TEDDY BIGUET M TEDDY BIGUET REGUL AMERICAN FULL FIGHTING REGUL AMERCIAN FULL FIGHTING',0.00,100.00),
  ('hist-cc-007','05/06/2024','2024-05-01','SOUTIEN ASSO SPORTIVE/CULTURELL',0.00,4.07),
  ('hist-cc-008','07/06/2024','2024-06-10','REM CHQ REF02443A02',0.00,40.00),
  ('hist-cc-009','10/06/2024','2024-06-01','FACT SGT24024430002747 DONT TVA 0,38EUR',4.07,0.00),
  ('hist-cc-010','12/06/2024','2024-06-12','VIR LICENCE MASSON LEO',22.00,0.00),
  ('hist-cc-011','02/07/2024','2024-07-02','VRST REF02443A02 BILLETS',0.00,95.00),
  ('hist-cc-012','03/07/2024','2024-06-01','SOUTIEN ASSO SPORTIVE/CULTURELL',0.00,4.07),
  ('hist-cc-013','10/07/2024','2024-07-01','FACT SGT24024430003256 DONT TVA 0,38EUR',4.07,0.00),
  ('hist-cc-014','24/07/2024','2024-07-24','VIR M. SERGE SUIVANT M. SERGE SUIVANT VIREMENT DE M. SERGE SUIVANT',0.00,150.00),
  ('hist-cc-015','05/08/2024','2024-07-01','SOUTIEN ASSO SPORTIVE/CULTURELL',0.00,4.07),
  ('hist-cc-016','09/08/2024','2024-08-09','VIR STAGE PRISCA CSL - AFF',80.00,0.00),
  ('hist-cc-017','12/08/2024','2024-08-01','FACT SGT24024430003757 DONT TVA 0,38EUR',4.07,0.00),
  ('hist-cc-018','16/08/2024','2024-08-16','PRLV SEPA FEDERATION FRANCAISE FEDERATION FRANCAISE DE KARATE-FEDE 39 RUE BARBES 92120 MONTROUGE PRELEVEMENT DU 20240801 ICS : FR31ZZZ587660 RUM : 0740686-0',37.00,0.00),
  ('hist-cc-019','20/08/2024','2024-08-20','VIR T-SHIRT CSL',148.30,0.00),
  ('hist-cc-020','01/09/2024','2024-09-02','REM CHQ REF02443A',0.00,200.00),
  ('hist-cc-021','04/09/2024','2024-08-01','SOUTIEN ASSO SPORTIVE/CULTURELL',0.00,4.07),
  ('hist-cc-022','06/09/2024','2024-09-06','VIR ROBERT DAVID ROBERT DAVID LICENCE ROBERT DAVID',0.00,200.00),
  ('hist-cc-023','07/09/2024','2024-09-09','REM CHQ REF02443A',0.00,480.00),
  ('hist-cc-024','07/09/2024','2024-09-09','ANNU REM CHQ REF02443A',480.00,0.00),
  ('hist-cc-025','10/09/2024','2024-09-01','FACT SGT24024430004261 DONT TVA 0,38EUR',4.07,0.00)
)
INSERT OR IGNORE INTO transactions
  (id, compte_id, date_op, date_valeur, libelle, debit, credit, rapproche, source_document, source_format, created_at, updated_at)
SELECT h.id, c.id, h.date_op, h.date_valeur, h.libelle, h.debit, h.credit, 0, 'credit_mutuel_pdf', 'pdf',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM h JOIN comptes_bancaires c ON REPLACE(c.numero,' ','') = '00020806601'
                          AND ROUND(c.solde_initial, 2) IN (-61.10, 41.90, 0.00);

WITH h(id, date_op, date_valeur, libelle, debit, credit) AS (VALUES
  ('hist-cc-026','10/09/2024','2024-09-11','REM CHQ REF02443R',0.00,400.00),
  ('hist-cc-027','10/09/2024','2024-09-11','REM CHQ REF02443A',0.00,400.00),
  ('hist-cc-028','11/09/2024','2024-09-11','PRLV SEPA SACEM-SOC AUTEUR COMP SACEM-SOC AUTEUR COMPOSITEUR EDITEU 225 AVENUE CHARLES DE GAULLE 92528 NEUILLY SUR SEINE CEDEX PRELEVEMENT SACEM 130020047405 3960 11092024 ICS : FR06ZZZ186821 RUM : 01-SEL-00129322108-0000679686842-01',115.52,0.00),
  ('hist-cc-029','11/09/2024','2024-09-11','PRLV SEPA SPRE SPRE 0027 RUE DE BERRI 75008 PARIS PRELEVEMENT SPRE 130020047406 3961 11092024 ICS : FR74ZZZ451668',117.61,0.00),
  ('hist-cc-030','12/09/2024','2024-09-12','VIR CARTON VINCENT CARTON VINCENT DE CARTON VINCENT - COTISATION CARTON VINCENT 24/25 10278-20-24256020128891',0.00,200.00),
  ('hist-cc-031','15/09/2024','2024-09-16','REM CHQ REF02443A',0.00,400.00),
  ('hist-cc-032','17/09/2024','2024-09-18','REM CHQ REF02443A',0.00,340.00),
  ('hist-cc-033','22/09/2024','2024-09-23','REM CHQ REF02443A',0.00,287.00),
  ('hist-cc-034','24/09/2024','2024-09-24','VIR GAHERY JEROME GAHERY JEROME ADHESIONS TIMOTHE ET JULIAN GAHE',0.00,300.00),
  ('hist-cc-035','24/09/2024','2024-09-24','VIR INST THIBAULT NOTARGIACOMO THIBAULT NOTARGIACOMO VIREMENT DE THIBAULT NOTARGIACOMO',0.00,200.00),
  ('hist-cc-036','24/09/2024','2024-09-24','VRST REF02443A02 BILLETS',0.00,20.00),
  ('hist-cc-037','24/09/2024','2024-09-25','REM CHQ REF02443A',0.00,200.00),
  ('hist-cc-038','28/09/2024','2024-09-30','REM CHQ REF02443A',0.00,170.00),
  ('hist-cc-039','30/09/2024','2024-09-30','LENNY WEIL MARTINEZ M DUSTIN WEIL M DUSTIN WEIL LENNY WEIL MARTINEZ SAISON 2024/2025',0.00,200.00),
  ('hist-cc-040','30/09/2024','2024-09-30','LENNY WEIL BON DE COMMANDE 3P M DUSTIN WEIL M DUSTIN WEIL LENNY WEIL BON DE COMMANDE 3P. VH42733HZKN5RX01',0.00,45.00),
  ('hist-cc-041','01/10/2024','2024-10-01','VIR REMBOURSEMENT AG',223.83,0.00),
  ('hist-cc-042','02/10/2024','2024-10-02','VIR INST MLLE YSEULT GENERO MLLE YSEULT GENERO VIREMENT 1 DE MLLE YSEULT GENERO',0.00,66.66),
  ('hist-cc-043','03/10/2024','2024-10-03','VIR KADDECHE SABRI KADDECHE SABRI FACTURE',0.00,233.00),
  ('hist-cc-044','03/10/2024','2024-10-03','VIR REMBOURSEMENT EQUIPEMENT',70.00,0.00),
  ('hist-cc-045','03/10/2024','2024-10-03','VIR REMBOURSEMENT PASS TIMOTHEE',30.00,0.00),
  ('hist-cc-046','03/10/2024','2024-09-01','SOUTIEN ASSO SPORTIVE/CULTURELL',0.00,4.07),
  ('hist-cc-047','03/10/2024','2024-10-04','REM CHQ REF02443A',0.00,750.00),
  ('hist-cc-048','08/10/2024','2024-10-08','VIR PAIERIE REGIONALE D''AUVE PAIERIE REGIONALE D''AUVERGNE RHONE 39587 - AMERICAN FULL FIGHTING BONS EN CHABLAIS 260690800HEL069A808714SCO10/2024-40',0.00,90.00),
  ('hist-cc-049','08/10/2024','2024-10-09','REM CHQ REF02443A',0.00,500.00),
  ('hist-cc-050','09/10/2024','2024-10-09','VIR DEMOMENT THOMAS DEMOMENT THOMAS DEMOMENT THOMAS 10278-20-24283620003802',0.00,200.00)
)
INSERT OR IGNORE INTO transactions
  (id, compte_id, date_op, date_valeur, libelle, debit, credit, rapproche, source_document, source_format, created_at, updated_at)
SELECT h.id, c.id, h.date_op, h.date_valeur, h.libelle, h.debit, h.credit, 0, 'credit_mutuel_pdf', 'pdf',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM h JOIN comptes_bancaires c ON REPLACE(c.numero,' ','') = '00020806601'
                          AND ROUND(c.solde_initial, 2) IN (-61.10, 41.90, 0.00);

WITH h(id, date_op, date_valeur, libelle, debit, credit) AS (VALUES
  ('hist-cc-051','10/10/2024','2024-10-01','FACT SGT24024430004781 DONT TVA 0,38EUR',4.07,0.00),
  ('hist-cc-052','10/10/2024','2024-10-10','VIR C202410102104 COMMANDE SONO',345.60,0.00),
  ('hist-cc-053','10/10/2024','2024-10-10','VIR C202410102087 COMMANDE T-SH',2336.80,0.00),
  ('hist-cc-054','11/10/2024','2024-10-11','VIR M. DAVID DEMIGNE',0.00,37.00),
  ('hist-cc-055','15/10/2024','2024-10-15','PRLV SEPA FEDERATION FRANCAISE FEDERATION FRANCAISE DE KARATE-FEDE 39 RUE BARBES 92120 MONTROUGE PRELEVEMENT DU 20241001 ICS : FR31ZZZ587660 RUM : 0740686-0',925.00,0.00),
  ('hist-cc-056','17/10/2024','2024-10-17','SUBV AMERICAN FULL FIGHTING 06399202',0.00,500.00),
  ('hist-cc-057','21/10/2024','2024-10-21','VIR ROBERT DAVID ROBERT DAVID 10278-20-24295080048868',0.00,153.00),
  ('hist-cc-058','21/10/2024','2024-10-22','REM CHQ REF02443A',0.00,954.10),
  ('hist-cc-059','23/10/2024','2024-10-23','VIR PAIERIE REGIONALE D''AUVE PAIERIE REGIONALE D''AUVERGNE RHONE 39587 - AMERICAN FULL FIGHTING BONS EN CHABLAIS 260690800HEL069A808724SCO10/2024-42',0.00,30.00),
  ('hist-cc-060','24/10/2024','2024-10-24','VIR COTIS FED/ 0740686 / AMERIC',250.00,0.00),
  ('hist-cc-061','24/10/2024','2024-10-24','VIR CDE EQUIP DECAT C2024102',549.95,0.00),
  ('hist-cc-062','29/10/2024','2024-10-29','VIR INST MLLE YSEULT GENERO MLLE YSEULT GENERO VIREMENT 2 ADHESION BOXE YSEULT GENERO VIREMENT 2 BOXE YSEULT GENERO',0.00,66.66),
  ('hist-cc-063','30/10/2024','2024-10-30','VIR DRFIP ILE DE FRANCE ET D DRFIP ILE DE FRANCE ET DE PARIS 144478274 PASS PSP-DR-AURA-24-3836 MINISTERE DES SPORTS PASS-SPORT AMERICAN FULL FIGHTING BONS EN CHABLAIS',0.00,50.00),
  ('hist-cc-064','04/11/2024','2024-11-04','VIR INST M. SERGE SUIVANT M. SERGE SUIVANT VIREMENT DE M. SERGE SUIVANT',0.00,37.00),
  ('hist-cc-065','05/11/2024','2024-11-05','VIR ALEX KRAVTSOV ALEX KRAVTSOV ALEX KRAVTSOV 10278-20-24310420010696',0.00,100.00),
  ('hist-cc-066','05/11/2024','2024-10-01','SOUTIEN ASSO SPORTIVE/CULTURELL',0.00,4.07),
  ('hist-cc-067','05/11/2024','2024-11-06','REM CHQ REF02443A',0.00,250.00),
  ('hist-cc-068','06/11/2024','2024-11-06','VIR M OU MME MARQUES CAR M OU MME MARQUES CARLOS VIREMENT DE M OU MME MARQUES CARLOS',0.00,37.00),
  ('hist-cc-069','07/11/2024','2024-11-07','VIR ROBERT DAVID ROBERT DAVID T SHIRT DAVID ROBERT',0.00,40.00),
  ('hist-cc-070','11/11/2024','2024-11-01','FACT SGT24024430005297 DONT TVA 0,38EUR',4.07,0.00),
  ('hist-cc-071','12/11/2024','2024-11-12','VIR FLEURY YOAN FLEURY YOAN VIREMENT YOAN THALES LICENCE YOAN',0.00,37.00),
  ('hist-cc-072','12/11/2024','2024-11-12','VIR REMBOURSEMENT PRISE + T-SHI',20.00,0.00),
  ('hist-cc-073','12/11/2024','2024-11-13','REM CHQ REF02443A',0.00,167.00),
  ('hist-cc-074','12/11/2024','2024-11-12','VRST REF02443A02 BILLETS',0.00,70.00),
  ('hist-cc-075','13/11/2024','2024-11-13','VIR C202411131422 COMMANDE PANT',850.00,0.00)
)
INSERT OR IGNORE INTO transactions
  (id, compte_id, date_op, date_valeur, libelle, debit, credit, rapproche, source_document, source_format, created_at, updated_at)
SELECT h.id, c.id, h.date_op, h.date_valeur, h.libelle, h.debit, h.credit, 0, 'credit_mutuel_pdf', 'pdf',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM h JOIN comptes_bancaires c ON REPLACE(c.numero,' ','') = '00020806601'
                          AND ROUND(c.solde_initial, 2) IN (-61.10, 41.90, 0.00);

WITH h(id, date_op, date_valeur, libelle, debit, credit) AS (VALUES
  ('hist-cc-076','14/11/2024','2024-11-14','VIR CDE 068088 COIN DU RING',468.96,0.00),
  ('hist-cc-077','15/11/2024','2024-11-15','PRLV SEPA FEDERATION FRANCAISE FEDERATION FRANCAISE DE KARATE-FEDE 39 RUE BARBES 92120 MONTROUGE PRELEVEMENT DU 20241101 ICS : FR31ZZZ587660 RUM : 0740686-0',518.00,0.00),
  ('hist-cc-078','19/11/2024','2024-11-19','VIR REMBSET TEDDY DECATHLON EQP',6.00,0.00),
  ('hist-cc-079','27/11/2024','2024-11-27','VIR INST MLLE YSEULT GENERO MLLE YSEULT GENERO VIREMENT DE MLLE YSEULT GENERO VIREMENT 3 ADHESION BOXE YSEULT',0.00,66.67),
  ('hist-cc-080','29/11/2024','2024-11-29','VRST REF02443A04',0.00,80.00),
  ('hist-cc-081','29/11/2024','2024-12-02','REM CHQ REF02443A',0.00,157.00),
  ('hist-cc-082','03/12/2024','2024-12-03','VRST REF02443A04',0.00,45.00),
  ('hist-cc-083','04/12/2024','2024-12-04','VIR REMBOURSEMENT METRO TEDDY',128.81,0.00),
  ('hist-cc-084','04/12/2024','2024-11-01','SOUTIEN ASSO SPORTIVE/CULTURELL',0.00,4.07),
  ('hist-cc-085','09/12/2024','2024-12-09','VIR MR OU MME LYAZID SAKE MR OU MME LYAZID SAKER VIREMENT DE MR OU MME LYAZID SAKER',0.00,37.00),
  ('hist-cc-086','09/12/2024','2024-12-09','VIR INST MONSIEUR ZOUHEIR MOHAM MONSIEUR ZOUHEIR MOHAMED PANTALON BOXE MOHAMED',0.00,13.00),
  ('hist-cc-087','10/12/2024','2024-12-01','FACT SGT24024430005814 DONT TVA 0,38EUR',4.07,0.00),
  ('hist-cc-088','17/12/2024','2024-12-17','VIR REMST FACT METRO TED 15 DEC',105.06,0.00),
  ('hist-cc-089','17/12/2024','2024-12-17','VIR REMST FACT METRO TED 17 DE',205.07,0.00),
  ('hist-cc-090','17/12/2024','2024-12-17','VIR REMST FACT TEREVA TED 13 DE',70.80,0.00),
  ('hist-cc-091','18/12/2024','2024-12-18','VIR REMST SERGE MARCHE NOEL',13.95,0.00),
  ('hist-cc-092','18/12/2024','2024-12-18','VIR RMBST SERGE MARCHE DE NOEL',72.88,0.00),
  ('hist-cc-093','19/12/2024','2024-12-19','PRLV SEPA FEDERATION FRANCAISE FEDERATION FRANCAISE DE KARATE-FEDE MONTROUGE 92120 39 RUE BARBES PRELEVEMENT DU 20241201 ICS : FR31ZZZ587660 RUM : 0740686-0',296.00,0.00),
  ('hist-cc-094','19/12/2024','2024-12-19','RET 191224 COMMANDE DE FONDS REF02443B00',132.00,0.00),
  ('hist-cc-095','21/12/2024','2024-12-21','VRST REF02443A',0.00,225.00),
  ('hist-cc-096','21/12/2024','2024-12-21','VIR REMST TEDDY METRO 18 DECEM',208.24,0.00),
  ('hist-cc-097','21/12/2024','2024-12-21','VRST REF02443A04 P0142398600',0.00,62.40),
  ('hist-cc-098','21/12/2024','2024-12-21','VRST REF02443A04 P0142398599',0.00,53.00),
  ('hist-cc-099','06/01/2025','2025-01-06','VIR REMST EXPO RESTO SERGE',54.00,0.00),
  ('hist-cc-100','06/01/2025','2024-12-01','SOUTIEN ASSO SPORTIVE/CULTURELL',0.00,4.07)
)
INSERT OR IGNORE INTO transactions
  (id, compte_id, date_op, date_valeur, libelle, debit, credit, rapproche, source_document, source_format, created_at, updated_at)
SELECT h.id, c.id, h.date_op, h.date_valeur, h.libelle, h.debit, h.credit, 0, 'credit_mutuel_pdf', 'pdf',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM h JOIN comptes_bancaires c ON REPLACE(c.numero,' ','') = '00020806601'
                          AND ROUND(c.solde_initial, 2) IN (-61.10, 41.90, 0.00);

WITH h(id, date_op, date_valeur, libelle, debit, credit) AS (VALUES
  ('hist-cc-101','06/01/2025','2025-01-06','PREL EURO-INFORMATION S A S EURO INFORMATION SAS FACT 241200012020 PREL EURO-INFORMATION S A S FACT 241200012020 TPE 1000100000420392 NUM 2010246921204 NUM 2010246921204 ICS : FR13ZZZ136352 RUM : GS20241210174610296430',93.60,0.00),
  ('hist-cc-102','10/01/2025','2025-01-01','FACT SGT25024430000383 DONT TVA 0,38EUR',4.07,0.00),
  ('hist-cc-103','10/01/2025','2025-01-10','VIR SA D''ENTREPRISES E.DA SA D''ENTREPRISES E.DAZZA DON DAZZA',0.00,500.00),
  ('hist-cc-104','10/01/2025','2025-01-16','VIR AMERICAN FULL FIGHTING BONS',500.00,0.00),
  ('hist-cc-105','14/01/2025','2024-12-23','REMCB00001 NB0005 TPE331744301',0.00,58.00),
  ('hist-cc-106','14/01/2025','2024-12-23','COMCB00001 NB0005 TPE331744301',0.67,0.00),
  ('hist-cc-107','14/01/2025','2025-01-15','REM CHQ REF02443A',0.00,200.00),
  ('hist-cc-108','17/01/2025','2025-01-17','VIR JULIEN FERRARO JULIEN FERRARO PAIEMENT CLUB FERRARO JULIEN 10278-20-25017710005680',0.00,233.00),
  ('hist-cc-109','19/01/2025','2025-01-19','VIR INST AUGUSTIN CARRIER AUGUSTIN CARRIER',0.00,100.00),
  ('hist-cc-110','20/01/2025','2025-01-20','VIR INST AUGUSTIN CARRIER AUGUSTIN CARRIER VIREMENT DE AUGUSTIN CARRIER',0.00,40.00),
  ('hist-cc-111','22/01/2025','2025-01-22','VIR JULIEN FERRARO JULIEN FERRARO TEE SHIRT FERRARO JULIEN 10278-20-25022710002433',0.00,13.00),
  ('hist-cc-112','23/01/2025','2025-01-24','REM CHQ REF02443A04',0.00,33.00),
  ('hist-cc-113','30/01/2025','2025-01-30','VIR INST M ALAN DE MAGALHAE M ALAN DE MAGALHAES VIREMENT DE M ALAN DE MAGALHAES',0.00,37.00),
  ('hist-cc-114','04/02/2025','2025-02-04','VIR JULIEN FERRARO JULIEN FERRARO TEE SHIRT FERRARO JULIEN 10278-20-25035710007721',0.00,7.00),
  ('hist-cc-115','05/02/2025','2025-01-01','SOUTIEN ASSO SPORTIVE/CULTURELL',0.00,4.07),
  ('hist-cc-116','07/02/2025','2025-02-07','VIR PARTICIPATION STAGE AMERICA',280.00,0.00),
  ('hist-cc-117','10/02/2025','2025-02-01','FACT SGT25024430000909 DONT TVA 0,38EUR',4.07,0.00),
  ('hist-cc-118','12/02/2025','2025-02-12','VIR INST ALEXIS COHYDON ALEXIS COHYDON VIREMENT DE ALEXIS COHYDON',0.00,37.00),
  ('hist-cc-119','16/02/2025','2025-02-16','VIR DE M ROUSSEL RYAN M ROUSSEL RYAN VIR DE M ROUSSEL RYAN VH50472PH3FTP001',0.00,150.00),
  ('hist-cc-120','17/02/2025','2025-02-17','PRLV SEPA FEDERATION FRANCAISE FEDERATION FRANCAISE DE KARATE-FEDE MONTROUGE 92120 39 RUE BARBES PRELEVEMENT DU 20250201 ICS : FR31ZZZ587660 RUM : 0740686-0',111.00,0.00),
  ('hist-cc-121','19/02/2025','2025-02-19','VIR M. BRUNET-MUDRY LUCAS M. BRUNET-MUDRY LUCAS BRUNET-MUDRY LUCAS LICENCE',0.00,37.00),
  ('hist-cc-122','20/02/2025','2025-02-20','VIR INST STAGE AMERICAN FULL FI',35.00,0.00),
  ('hist-cc-123','24/02/2025','2025-02-24','VIR REMBOURSEMENT FRAIS KILOMET',86.50,0.00),
  ('hist-cc-124','24/02/2025','2025-02-24','VIR REMBOURSEMENT FRAIS KILOMET',78.00,0.00),
  ('hist-cc-125','05/03/2025','2025-02-01','SOUTIEN ASSO SPORTIVE/CULTURELL',0.00,4.07)
)
INSERT OR IGNORE INTO transactions
  (id, compte_id, date_op, date_valeur, libelle, debit, credit, rapproche, source_document, source_format, created_at, updated_at)
SELECT h.id, c.id, h.date_op, h.date_valeur, h.libelle, h.debit, h.credit, 0, 'credit_mutuel_pdf', 'pdf',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM h JOIN comptes_bancaires c ON REPLACE(c.numero,' ','') = '00020806601'
                          AND ROUND(c.solde_initial, 2) IN (-61.10, 41.90, 0.00);

WITH h(id, date_op, date_valeur, libelle, debit, credit) AS (VALUES
  ('hist-cc-126','10/03/2025','2025-03-01','FACT SGT25024430001434 DONT TVA 0,38EUR',4.07,0.00),
  ('hist-cc-127','17/03/2025','2025-03-17','PRLV SEPA FEDERATION FRANCAISE FEDERATION FRANCAISE DE KARATE-FEDE MONTROUGE 92120 39 RUE BARBES PRELEVEMENT DU 20250301 ICS : FR31ZZZ587660 RUM : 0740686-0',148.00,0.00),
  ('hist-cc-128','03/04/2025','2025-03-01','SOUTIEN ASSO SPORTIVE/CULTURELL',0.00,4.07),
  ('hist-cc-129','07/04/2025','2025-04-07','VIR INST REMBOURSEMENT PASS REG VH50972GHF6A5M01',60.00,0.00),
  ('hist-cc-130','08/04/2025','2025-04-08','VRST REF02443A04',0.00,50.00),
  ('hist-cc-131','08/04/2025','2025-04-08','VRST REF02443A04 PIECES',0.00,3.00),
  ('hist-cc-132','10/04/2025','2025-04-01','FACT SGT25024430001968 DONT TVA 0,38EUR',4.07,0.00),
  ('hist-cc-133','13/04/2025','2025-04-13','VIR REMBOURSEMENT CENTRAKOR TED',55.96,0.00),
  ('hist-cc-134','24/04/2025','2025-04-24','VIR PAIERIE REGIONALE D''AUVE PAIERIE REGIONALE D''AUVERGNE RHONE 39587 - AMERICAN FULL FIGHTING BONS EN CHABLAIS 260690800HEL069A808854SCO04/2025-16',0.00,60.00),
  ('hist-cc-135','05/05/2025','2025-05-05','PRLV SEPA BOUYGUES TELECOM BOUYGUES TELECOM 06XXXXX177 PAGP0110AYN0KM ICS : FR35ZZZ418323 RUM : BT1150Y87S424',20.32,0.00),
  ('hist-cc-136','05/05/2025','2025-05-05','VIR PIX-GEE-523762 COMMANDE',263.70,0.00),
  ('hist-cc-137','06/05/2025','2025-05-06','MULTI ASSO 056007 ACM IARD SA MULTI ASSO 056007207 RMS25122011540598HI ICS : FR74ZZZ008087 RUM : HI20240406102601070348',288.89,0.00),
  ('hist-cc-138','06/05/2025','2025-04-01','SOUTIEN ASSO SPORTIVE/CULTURELL',0.00,4.07),
  ('hist-cc-139','12/05/2025','2025-05-01','FACT SGT25024430002497 DONT TVA 0,38EUR',4.07,0.00),
  ('hist-cc-140','12/05/2025','2025-05-12','VIR REMBOURSEMENT PANTALON MOHA',13.00,0.00),
  ('hist-cc-141','15/05/2025','2025-05-15','PAIEMENT CB 1405 VILLE LA GRAN TEREVA CARTE 5042',11.18,0.00),
  ('hist-cc-142','04/06/2025','2025-05-01','SOUTIEN ASSO SPORTIVE/CULTURELL',0.00,7.65),
  ('hist-cc-143','05/06/2025','2025-06-05','PRLV SEPA BOUYGUES TELECOM BOUYGUES TELECOM 06XXXXX177 PAGP0110BAHB41 ICS : FR35ZZZ418323 RUM : BTAW0P4KK0E78',10.00,0.00),
  ('hist-cc-144','10/06/2025','2025-06-01','FACT SGT25024430003022 DONT TVA 0,38EUR',7.65,0.00),
  ('hist-cc-145','11/06/2025','2025-06-11','VIR COMMANDE CW202506112065',23.79,0.00)
)
INSERT OR IGNORE INTO transactions
  (id, compte_id, date_op, date_valeur, libelle, debit, credit, rapproche, source_document, source_format, created_at, updated_at)
SELECT h.id, c.id, h.date_op, h.date_valeur, h.libelle, h.debit, h.credit, 0, 'credit_mutuel_pdf', 'pdf',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM h JOIN comptes_bancaires c ON REPLACE(c.numero,' ','') = '00020806601'
                          AND ROUND(c.solde_initial, 2) IN (-61.10, 41.90, 0.00);

WITH h(id, date_op, date_valeur, libelle, debit, credit) AS (VALUES
  ('hist-lv-001','10/01/2025','2025-01-16','VIR DE AMERICAN FULL FIGHTING B',0.00,500.00)
)
INSERT OR IGNORE INTO transactions
  (id, compte_id, date_op, date_valeur, libelle, debit, credit, rapproche, source_document, source_format, created_at, updated_at)
SELECT h.id, c.id, h.date_op, h.date_valeur, h.libelle, h.debit, h.credit, 0, 'credit_mutuel_pdf', 'pdf',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM h JOIN comptes_bancaires c ON REPLACE(c.numero,' ','') = '00020806603'
                          AND ROUND(c.solde_initial, 2) IN (500.00, 0.00);

-- Soldes initiaux : 0 € une fois l'historique complet.
UPDATE comptes_bancaires
   SET solde_initial = 0,
       updated_at    = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE REPLACE(numero,' ','') = '00020806601'
   AND ROUND(solde_initial, 2) IN (-61.10, 41.90)
   AND ROUND((SELECT COALESCE(SUM(COALESCE(t.credit,0) - COALESCE(t.debit,0)), 0)
                FROM transactions t
               WHERE t.compte_id = comptes_bancaires.id
                 AND substr(t.date_op,7,4)||substr(t.date_op,4,2)||substr(t.date_op,1,2) < '20250701'), 2) = 41.90;

UPDATE comptes_bancaires
   SET solde_initial = 0,
       updated_at    = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE REPLACE(numero,' ','') = '00020806603'
   AND ROUND(solde_initial, 2) IN (500.00)
   AND ROUND((SELECT COALESCE(SUM(COALESCE(t.credit,0) - COALESCE(t.debit,0)), 0)
                FROM transactions t
               WHERE t.compte_id = comptes_bancaires.id
                 AND substr(t.date_op,7,4)||substr(t.date_op,4,2)||substr(t.date_op,1,2) < '20250701'), 2) = 500.00;
