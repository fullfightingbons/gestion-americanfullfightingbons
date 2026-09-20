/**
 * cotisation-receipt.ts — AFFBC (gestion)
 * ─────────────────────────────────────────────────────────────────────────
 * Construit le reçu de cotisation d'un adhérent pour le back-office (bouton
 * « Reçu » de l'onglet Adhérents), à partir de sa ligne `adherents` et,
 * optionnellement, des ventes liées à l'inscription (tenue, passeport
 * sportif, articles boutique commandés en même temps — cf. paramètre
 * `ventesInscription`).
 *
 * Fonction pure (aucun accès base/réseau) : la route
 * GET /api/adherents/:id/recu-cotisation charge la fiche adhérent ET les
 * factures de vente correspondantes, appelle buildCotisationReceipt(), puis
 * passe le résultat à buildDocumentPdfBytes(). Isolée dans ce fichier pour
 * pouvoir être testée sans monter tout le Worker.
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

/** Forme brute d'une ligne de vente telle que stockée dans `factures.lignes` (JSON). */
export type VenteLigneBrute = { desc?: string; qte?: number; pu?: number };

// Même convention que factureRowToDocumentInput (src/index.ts) : desc → designation,
// total = qte × pu. Une ligne à qté ou prix unitaire nul/négatif est ignorée
// (ne doit normalement pas arriver, mais on ne veut pas polluer le reçu avec
// une ligne à 0 € si jamais une vente mal formée existe en base).
function ventesLignesToDocumentLignes(ventes: VenteLigneBrute[]): DocumentLigne[] {
  return ventes
    .map((l) => {
      const qte = Number(l?.qte || 0);
      const pu = Number(l?.pu || 0);
      return { designation: String(l?.desc || '—'), qte: qte || undefined, pu: pu || undefined, total: euros(qte * pu) };
    })
    .filter((l) => l.total > 0);
}

export function buildCotisationReceipt(
  adherent: Record<string, any>,
  now: Date = new Date(),
  ventesInscription: VenteLigneBrute[] = []
): CotisationReceiptResult {
  const cotisation = Number(adherent.cotisation) || 0;
  const passRegion = Number(adherent.montant_pass_region) || 0;
  const ventesLignes = ventesLignesToDocumentLignes(ventesInscription);
  const ventesTotal = ventesLignes.reduce((s, l) => s + l.total, 0);
  // Un adhérent exonéré de cotisation (ex. membre du Bureau, cotisation à 0)
  // qui a malgré tout commandé une tenue lors de son inscription a bien une
  // vente à justifier : le total qui déclenche (ou non) l'émission du reçu
  // inclut donc désormais ventesTotal, pas seulement cotisation + pass région.
  const total = euros(cotisation + passRegion + ventesTotal);
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
  lignes.push(...ventesLignes);

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
