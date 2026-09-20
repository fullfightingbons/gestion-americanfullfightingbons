/**
 * cotisation-receipt.ts — AFFBC (gestion)
 * ─────────────────────────────────────────────────────────────────────────
 * Construit le reçu de cotisation d'un adhérent pour le back-office (bouton
 * « Reçu » de l'onglet Adhérents), à partir de sa ligne `adherents`.
 *
 * Fonction pure (aucun accès base/réseau) : la route
 * GET /api/adherents/:id/recu-cotisation charge la fiche, appelle
 * buildCotisationReceipt(), puis passe le résultat à buildDocumentPdfBytes().
 * Isolée dans ce fichier pour pouvoir être testée sans monter tout le Worker.
 *
 * Numéro de reçu : `REC-<saison>-<8 premiers caractères de l'id adhérent>`.
 * Il est STABLE (même adhérent + même saison = même numéro) : ré-émettre un
 * reçu ne crée pas un nouveau numéro. L'ancien parcours utilisait
 * `REC-<année>-<nb de factures + 1>`, qui changeait à chaque clic.
 */

import type { DocumentInput, DocumentLigne } from './document-template';

export type CotisationReceiptResult =
  | { ok: true; doc: DocumentInput; filename: string }
  | { ok: false; status: number; message: string };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Saison sportive (juillet → juin) d'une date ISO. Même règle que
 * seasonFromDate()/currentSeasonLabel() côté front : le libellé affiché dans
 * la colonne « Saison » du tableau et celui du reçu sont donc identiques.
 */
export function seasonLabelFromIso(iso: unknown): string {
  const m = ISO_DATE.exec(String(iso ?? ''));
  if (!m) return '';
  const year = Number(m[1]);
  const month = Number(m[2]);
  const start = month >= 7 ? year : year - 1;
  return `${start}-${start + 1}`;
}

function frDate(iso: unknown): string {
  const m = ISO_DATE.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// Retour à la ligne par mots, sur un nombre de caractères. 44 caractères en
// Helvetica 8,7 pt tiennent dans la colonne « Destinataire » (≈ 85 mm) avec
// une marge : une adresse longue passe sur 2-3 lignes au lieu de déborder.
function wrapWords(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length <= maxChars || !cur) { cur = candidate; continue; }
    lines.push(cur);
    cur = w;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

function slug(text: string): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function euros(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildCotisationReceipt(adherent: Record<string, any>, now: Date = new Date()): CotisationReceiptResult {
  const cotisation = Number(adherent.cotisation) || 0;
  const passRegion = Number(adherent.montant_pass_region) || 0;
  const total = euros(cotisation + passRegion);
  if (!(total > 0)) {
    return {
      ok: false,
      status: 404,
      message: "Aucune cotisation enregistrée pour cet adhérent : il n'y a pas de reçu à émettre.",
    };
  }

  const idShort = String(adherent.id ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'XXXXXXXX';
  const nom = String(adherent.nom ?? '').trim().toLocaleUpperCase('fr-FR');
  const prenom = String(adherent.prenom ?? '').trim();
  const nomComplet = `${prenom} ${nom}`.trim() || 'Adhérent';

  const nowIso = now.toISOString();
  const season =
    seasonLabelFromIso(adherent.date_fin_adhesion) ||
    seasonLabelFromIso(adherent.date_inscription) ||
    seasonLabelFromIso(nowIso);

  const numero = `REC-${season}-${idShort}`;
  const emisLe = now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  const inscription = frDate(adherent.date_inscription);

  const adresse = String(adherent.adresse ?? '').trim();
  const cpVille = [adherent.code_postal, adherent.ville].map((s) => String(s ?? '').trim()).filter(Boolean).join(' ');
  const lignesDestinataire = [
    ...(adresse ? wrapWords(adresse, 44, 3) : []),
    ...(cpVille ? [cpVille] : []),
    `Adhérent n°${idShort}`,
    `Saison ${season}`,
  ];

  const lignes: DocumentLigne[] = [
    { designation: `Cotisation ${String(adherent.discipline || 'Club')} — saison ${season}`, total: euros(cotisation) },
  ];
  if (passRegion > 0) lignes.push({ designation: 'Pass Région', total: euros(passRegion) });

  const paiement = String(adherent.paiement ?? '').trim();

  const doc: DocumentInput = {
    type: 'cotisation',
    numero,
    dateLabel: `Émis le ${emisLe}`,
    destinataire: { nom: nomComplet, lignes: lignesDestinataire },
    objet: `Cotisation à l'association - saison ${season}${inscription ? ` (inscription du ${inscription})` : ''}`,
    lignes,
    total,
    tvaLabel: 'Association loi 1901 — non assujettie à la TVA',
    footerNote: paiement ? `Mode de paiement : ${paiement}` : undefined,
    pdfTitle: `Reçu de cotisation ${numero} — ${nomComplet}`,
  };

  const filename = `Recu-cotisation-${slug(nomComplet) || 'adherent'}-${season}.pdf`;
  return { ok: true, doc, filename };
}
