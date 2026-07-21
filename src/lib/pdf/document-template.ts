/**
 * document-template.ts — AFFBC (gestion)
 * ─────────────────────────────────────────────────────────────────────────
 * Port TypeScript de document-template.js — mêmes visuels, mêmes données
 * club, même sortie PDF que les copies boutique/inscription en JS pur.
 */

import { PdfBuilder, buildPdfDocument, addJpegImage, base64ToBytes, measureTextWidth, MM, type RGB } from './pdf-engine';
import { CLUB_LOGO_JPEG_B64, CLUB_LOGO_WIDTH_PX, CLUB_LOGO_HEIGHT_PX } from './club-logo';

export const NOIR: RGB = [17, 17, 17];
export const INK: RGB = [34, 34, 34];
export const DORE: RGB = [180, 141, 24];
export const DORE_CLAIR: RGB = [212, 172, 13];
export const DORE_BG: RGB = [250, 243, 220];
export const MUTED: RGB = [128, 128, 128];
export const LINE: RGB = [224, 224, 224];
export const ROW_ALT: RGB = [250, 250, 248];
export const WHITE: RGB = [255, 255, 255];

// ⚠️ TVA confirmée par Teddy le 18/07/2026 : art. 293 B du CGI (loi 1901).
export const MENTION_TVA_DEFAUT =
  "TVA non applicable — association loi 1901 non assujettie (art. 293 B du CGI)";

// Coordonnées officielles du club — cf. mentions légales (site, boutique,
// calendrier, inscription), téléphone confirmé par Teddy le 18/07/2026.
const RNA = 'W744007210';
const SIREN = '924 704 612';
const SIRET = '924 704 612 00010';
const CLUB_NOM = 'American Full Fighting Bons en Chablais';
const CLUB_ADRESSE_L1 = 'DOJO du Gymnase Intercommunal des Voirons';
const CLUB_ADRESSE_L2 = '146 Rue du Chatelard, 74890 Bons-en-Chablais';
const CLUB_EMAIL = 'fullfightingbons@gmail.com';
const CLUB_TEL = '06 99 95 81 77';
const CLUB_SITE = 'americanfullfightingbons.fr';

function eur(n: number | null | undefined): string {
  const v = Number(n || 0);
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export interface DocumentParty { nom: string; lignes: string[] }
export interface DocumentLigne { designation: string; qte?: number; pu?: number; total: number }
export type DocumentType = 'facture' | 'don' | 'cotisation' | 'attestation';

export interface DocumentInput {
  type: DocumentType;
  numero: string;
  dateLabel: string;
  dateCourte?: string;
  emetteur?: DocumentParty;
  destinataire: DocumentParty;
  objet?: string;
  lignes?: DocumentLigne[];
  sousTotal?: number;
  total?: number;
  montantDon?: number;
  paragraphs?: string[];
  signataire?: string;
  tvaLabel?: string;
  mentionTva?: string;
  footerNote?: string;
}

const HEADER_H = 41;

function titleFontSize(title: string): number {
  if (title.length > 20) return 12.5;
  if (title.length > 12) return 14.5;
  return 17;
}

// L'objet/numero de document (ex: "STAGE CHRISTIAN BATTESTI - GONDRAN
// PIERRE") peut etre long et variable. Le bloc droit de l'en-tete dispose
// d'environ 150mm (de x=45mm a x=195mm) avant de recouper le bloc club a
// gauche : on reduit la taille de police tant que ca ne suffit pas plutot
// que de laisser le texte deborder.
function fitNumeroFontSize(text: string, baseFs: number, maxWMm: number): number {
  const maxPt = maxWMm * MM;
  let fs = baseFs;
  while (fs > 6.5 && measureTextWidth(text, 'F1', fs) > maxPt) fs -= 0.5;
  return fs;
}

function drawHeader(p: PdfBuilder, opts: { title: string; numero: string; dateLabel: string }): void {
  p.setFillRgb(NOIR);
  p.rect(0, 0, 210, HEADER_H, 'f');

  p.setFillRgb(WHITE);
  p.roundedRect(11, 5, 28, 28, 2.5, 'f');
  const logoImg = addJpegImage(p, base64ToBytes(CLUB_LOGO_JPEG_B64));
  if (logoImg) {
    p.drawImageContain(logoImg.id, 13, 7, 24, 24, CLUB_LOGO_WIDTH_PX, CLUB_LOGO_HEIGHT_PX);
  }

  const leftX = 43;
  p.setFont('F2', 11);
  p.text(CLUB_NOM.toUpperCase(), leftX, 12, { color: WHITE });
  p.setFont('F1', 7.3);
  p.text(CLUB_ADRESSE_L1, leftX, 17, { color: [185, 185, 185] });
  p.text(CLUB_ADRESSE_L2, leftX, 20.8, { color: [185, 185, 185] });
  p.text(`RNA ${RNA} - SIREN ${SIREN}`, leftX, 24.6, { color: [185, 185, 185] });
  p.text(`${CLUB_EMAIL} - ${CLUB_TEL}`, leftX, 28.4, { color: [185, 185, 185] });

  const fs = titleFontSize(opts.title);
  p.setFont('F2', fs);
  p.text(opts.title.toUpperCase(), 195, 15, { align: 'right', color: DORE_CLAIR });
  const numeroText = `N° ${opts.numero}`;
  const numeroFs = fitNumeroFontSize(numeroText, 10, 150);
  p.setFont('F1', numeroFs);
  p.text(numeroText, 195, 23, { align: 'right', color: WHITE });
  p.setFont('F1', 8.5);
  p.text(opts.dateLabel, 195, 28.5, { align: 'right', color: [190, 190, 190] });
}

const FOOTER_Y = 277;

function drawFooter(p: PdfBuilder, opts: { mentionTva?: string; note?: string }): void {
  p.setFillRgb(NOIR);
  p.rect(0, FOOTER_Y, 210, 297 - FOOTER_Y, 'f');
  p.setFont('F1', 7.3);
  p.text(
    `${CLUB_NOM} - Association loi 1901 - RNA ${RNA} - SIREN ${SIREN} - SIRET ${SIRET}`,
    105, FOOTER_Y + 6.5, { align: 'center', color: [190, 190, 190] },
  );
  p.text(`${CLUB_ADRESSE_L2} - ${CLUB_EMAIL} - ${CLUB_TEL} - ${CLUB_SITE}`, 105, FOOTER_Y + 10.3, { align: 'center', color: [160, 160, 160] });
  p.text(opts.mentionTva || MENTION_TVA_DEFAUT, 105, FOOTER_Y + 14.1, { align: 'center', color: [150, 150, 150] });
  if (opts.note) p.text(opts.note, 105, FOOTER_Y + 17.5, { align: 'center', color: [120, 120, 120] });
}

function drawPartiesBlock(p: PdfBuilder, opts: { emetteur: DocumentParty; destinataire: DocumentParty; yStart?: number }): number {
  const yStart = opts.yStart ?? 51;
  const colL = 15, colR = 110;

  p.setFont('F2', 7.5);
  p.text('EMETTEUR', colL, yStart, { color: DORE });
  p.text('DESTINATAIRE', colR, yStart, { color: DORE });

  p.setFont('F2', 10.5);
  p.text(opts.emetteur.nom || CLUB_NOM, colL, yStart + 6, { color: INK });
  p.text(opts.destinataire.nom || '', colR, yStart + 6, { color: INK });

  p.setFont('F1', 8.7);
  const eLignes = opts.emetteur.lignes || [];
  const dLignes = opts.destinataire.lignes || [];
  eLignes.forEach((l, i) => p.text(l, colL, yStart + 11 + i * 4.3, { color: MUTED }));
  dLignes.forEach((l, i) => p.text(l, colR, yStart + 11 + i * 4.3, { color: MUTED }));

  return yStart + 11 + Math.max(eLignes.length, dLignes.length) * 4.3 + 4;
}

function drawObjet(p: PdfBuilder, objet: string | undefined, y: number): number {
  if (!objet) return y;
  const h = 9;
  p.setFillRgb([248, 246, 240]);
  p.rect(15, y, 180, h, 'f');
  p.setFillRgb(DORE_CLAIR);
  p.rect(15, y, 1, h, 'f');
  p.setFont('F3', 9);
  p.text(`Objet : ${objet}`, 20, y + h / 2 + 1.5, { color: INK });
  return y + h + 6;
}

function drawLignesTable(p: PdfBuilder, lignes: DocumentLigne[], yStart: number): number {
  let y = yStart;
  const rowH = 7.2;

  p.setFillRgb(NOIR);
  p.rect(15, y, 180, 8, 'f');
  p.setFont('F2', 8);
  p.text('DESIGNATION', 18, y + 5.3, { color: WHITE });
  p.text('QTE', 138, y + 5.3, { color: WHITE, align: 'right' });
  p.text('P.U.', 165, y + 5.3, { color: WHITE, align: 'right' });
  p.text('TOTAL', 193, y + 5.3, { color: WHITE, align: 'right' });
  y += 8;

  lignes.forEach((l, i) => {
    if (i % 2 === 1) { p.setFillRgb(ROW_ALT); p.rect(15, y, 180, rowH, 'f'); }
    p.setFont('F1', 9);
    p.text(l.designation, 18, y + rowH / 2 + 1.6, { color: INK });
    if (l.qte != null) p.text(String(l.qte), 138, y + rowH / 2 + 1.6, { color: MUTED, align: 'right' });
    if (l.pu != null) p.text(eur(l.pu), 165, y + rowH / 2 + 1.6, { color: MUTED, align: 'right' });
    p.setFont('F2', 9);
    p.text(eur(l.total), 193, y + rowH / 2 + 1.6, { color: INK, align: 'right' });
    y += rowH;
  });

  p.setStrokeRgb(LINE);
  p.setLineWidth(0.3);
  p.line(15, y, 195, y);
  return y + 6;
}

function drawTotaux(p: PdfBuilder, opts: { sousTotal?: number; total?: number; tvaLabel?: string }, y: number): number {
  const boxX = 120, boxW = 75;
  if (opts.sousTotal != null) {
    p.setFont('F1', 9);
    p.text('Sous-total', boxX, y, { color: MUTED });
    p.text(eur(opts.sousTotal), 195, y, { color: INK, align: 'right' });
    y += 5.5;
  }
  p.setFont('F1', 8);
  p.text(opts.tvaLabel || 'TVA non applicable', boxX, y, { color: MUTED });
  y += 6;

  p.setFillRgb(NOIR);
  p.roundedRect(boxX, y, boxW, 11, 1.5, 'f');
  p.setFont('F2', 10.5);
  p.text('TOTAL', boxX + 5, y + 7.2, { color: WHITE });
  p.setFont('F2', 13);
  p.text(eur(opts.total), boxX + boxW - 5, y + 7.4, { color: DORE_CLAIR, align: 'right' });
  return y + 11 + 8;
}

function drawDonBlock(p: PdfBuilder, montant: number, y: number): number {
  const boxX = 15, boxW = 180;
  p.setFillRgb([248, 246, 240]);
  p.rect(boxX, y, boxW, 22, 'f');
  p.setFont('F1', 9);
  p.text('Montant du don', boxX + 6, y + 8, { color: MUTED });
  p.setFont('F2', 13);
  p.text(eur(montant), boxX + boxW - 6, y + 8.5, { color: INK, align: 'right' });

  p.setFillRgb(DORE_BG);
  p.rect(boxX + 4, y + 12, boxW - 8, 8, 'f');
  p.setFont('F1', 8.5);
  p.text("Montant deductible de l'impot sur le revenu (66%, art. 200 CGI)", boxX + 8, y + 17.2, { color: INK });
  p.setFont('F2', 10);
  p.text(eur(montant * 0.66), boxX + boxW - 8, y + 17.4, { color: DORE, align: 'right' });

  return y + 22 + 8;
}

function drawParagraphs(p: PdfBuilder, paragraphs: string[], y: number): number {
  p.setFont('F1', 10);
  for (const para of paragraphs) {
    const lines = p.textWrapped(para, 15, y, 180, { fontName: 'F1', fontSize: 10, color: INK });
    y += lines * 5.4 + 4;
  }
  return y;
}

export function buildDocumentPdfBytes(doc: DocumentInput): Uint8Array {
  const p = new PdfBuilder();
  const titres: Record<DocumentType, string> = {
    facture: 'Facture',
    don: 'Recu de don',
    cotisation: 'Recu de cotisation',
    attestation: 'Attestation de cotisation',
  };

  drawHeader(p, { title: titres[doc.type] || 'Document', numero: doc.numero, dateLabel: doc.dateLabel });

  const emetteur: DocumentParty = doc.emetteur || {
    nom: CLUB_NOM,
    lignes: [CLUB_ADRESSE_L1, CLUB_ADRESSE_L2, `RNA ${RNA} - SIREN ${SIREN}`, CLUB_EMAIL],
  };
  let y = drawPartiesBlock(p, { emetteur, destinataire: doc.destinataire });
  y = drawObjet(p, doc.objet, y);

  if (doc.type === 'attestation') {
    y = drawParagraphs(p, doc.paragraphs || [], y + 4);
    y += 10;
    p.setFont('F3', 10);
    p.text(`Fait a Bons-en-Chablais, le ${doc.dateCourte || ''}`, 130, y, { color: INK });
    p.setFont('F1', 9);
    p.text('Le secretaire,', 130, y + 12, { color: MUTED });
    p.setFont('F2', 10);
    p.text(doc.signataire || 'Teddy', 130, y + 18, { color: INK });
  } else if (doc.type === 'don') {
    y = drawDonBlock(p, doc.montantDon || 0, y);
  } else {
    y = drawLignesTable(p, doc.lignes || [], y);
    y = drawTotaux(p, { sousTotal: doc.sousTotal, total: doc.total, tvaLabel: doc.tvaLabel }, y);
  }

  drawFooter(p, { mentionTva: doc.mentionTva, note: doc.footerNote });

  return buildPdfDocument(p.getStreams(), p.images);
}
