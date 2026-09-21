/**
 * cotisation-receipt.ts — AFFBC (gestion)
 * ─────────────────────────────────────────────────────────────────────────
 * Construit le reçu d'inscription d'un adhérent : cotisation, Pass Région et
 * ARTICLES COMMANDÉS À L'INSCRIPTION (t-shirt, pantalon, passeport sportif,
 * produits en option). Sert au bouton « Reçu » du back-office
 * (GET /api/adherents/:id/recu-cotisation) et au reçu de l'espace membre
 * (GET /api/member/documents/recu-cotisation) : les deux affichent ainsi
 * exactement les mêmes lignes et le même total.
 *
 * Fonctions pures (aucun accès base/réseau) : les routes chargent la fiche et
 * les inscriptions, puis appellent buildReceiptContent() / buildCotisationReceipt().
 *
 * D'où viennent les données
 * ─────────────────────────
 *  - Cotisation et Pass Région : la fiche `adherents` (`cotisation`,
 *    `montant_pass_region`). C'est la valeur que le bureau peut corriger à la
 *    main, elle fait donc foi.
 *  - Articles : `inscriptions_publiques.dossier_json` (`clothingOrder` pour les
 *    tailles, `computedTotals` pour quantités, prix et produits en option). La
 *    fiche adhérent n'en garde AUCUNE trace : t-shirt et pantalon sont facturés
 *    à part, dans la facture « Ventes liées à l'inscription web » (VTE-…) créée
 *    au paiement. Les lignes reprennent celles de cette facture
 *    (buildInscriptionSaleLines côté `inscription`).
 *
 * Quelle inscription est retenue : la plus récente qui (1) est finalisée, (2) est
 * de la SAISON de l'adhérent, (3) porte des totaux. Une inscription d'une saison
 * passée n'apporte pas ses articles au reçu de la saison en cours (même règle que
 * le tableau Adhérents). Sans inscription en ligne (fiche saisie ou importée), le
 * reçu ne contient que la cotisation, comme avant.
 *
 * Le total est toujours égal à ce qui a été facturé à l'inscription : si des
 * articles ne sont pas détaillables (ancien format de dossier), le reste est
 * porté par une ligne « Autres articles » plutôt que perdu.
 *
 * Numéro de reçu : `REC-<saison>-<8 premiers caractères de l'id adhérent>`.
 * Il est STABLE (même adhérent + même saison = même numéro).
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

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function eur2(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

// ── Inscription en ligne → articles commandés ───────────────────────────────

/** Colonnes de `inscriptions_publiques` utiles au reçu. */
export interface RegistrationRow {
  id?: string | null;
  statut?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  dossier_json?: unknown;
  /** date_fin de l'exercice de l'inscription (jointure) : voir registrationSeason(). */
  exercice_date_fin?: string | null;
}

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Saison d'une inscription = saison de la date de fin de SON exercice, et non de sa
 * date de dépôt. C'est exactement la source de `adherents.date_fin_adhesion` (le
 * worker `inscription` la pose avec exercise.date_fin), donc la saison de la fiche
 * et celle de son inscription se comparent à coup sûr : une inscription déposée en
 * juin pour la saison suivante appartient bien à la saison suivante, alors que sa
 * date de dépôt (avant le 1er juillet) la rangerait dans l'ancienne. Sans exercice
 * exploitable, repli sur la date de dépôt (même repli que le worker `inscription`).
 */
export function registrationSeason(r: RegistrationRow): string {
  const fin = String(r.exercice_date_fin ?? '');
  return seasonLabelFromIso(VALID_DATE.test(fin) ? fin : r.submitted_at || r.created_at);
}

// Statuts d'une inscription NON aboutie. `adherent_id` n'est renseigné qu'à la
// finalisation, donc ces statuts ne coexistent normalement jamais avec un
// adherent_id ; le filtre est une seconde barrière.
const NON_FINAL_STATUSES = new Set(['brouillon', 'paiement_en_attente', 'traitement_paiement', 'echec_creation', 'abandonnee']);

// dossier_json est une colonne TEXT : chaîne JSON brute (objet déjà parsé toléré).
function parseDossier(raw: unknown): Record<string, any> | null {
  if (raw && typeof raw === 'object') return raw as Record<string, any>;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const o = JSON.parse(raw);
      return o && typeof o === 'object' ? (o as Record<string, any>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Dossier de la plus récente inscription finalisée de la saison donnée, ou null. */
export function pickSeasonRegistration(rows: RegistrationRow[] | null | undefined, season: string): Record<string, any> | null {
  let best: { at: string; dossier: Record<string, any> } | null = null;
  for (const r of rows || []) {
    if (!r || NON_FINAL_STATUSES.has(String(r.statut ?? ''))) continue;
    if (!season || registrationSeason(r) !== season) continue;
    const dossier = parseDossier(r.dossier_json);
    if (!dossier || !dossier.computedTotals || typeof dossier.computedTotals !== 'object') continue;
    const at = String(r.updated_at || r.created_at || '');
    if (!best || at.localeCompare(best.at) > 0) best = { at, dossier };
  }
  return best ? best.dossier : null;
}

/**
 * Lignes « articles » d'une inscription : passeport, t-shirt, pantalon, produits
 * en option. Miroir de buildInscriptionSaleLines() (repo `inscription`, facture
 * « Ventes liées à l'inscription web »), avec des libellés lisibles pour
 * l'adhérent (« T-shirt club AFFBC (taille M) » plutôt que « Vente t-shirt… »).
 *
 * Le « kit nouvel adhérent » (40 €) n'est plus facturé depuis le correctif du
 * 10/09/2026, mais les inscriptions antérieures l'ont réellement payé : il est
 * repris s'il figure dans leurs totaux.
 */
export function registrationGoodsLines(dossier: Record<string, any> | null): DocumentLigne[] {
  const totals = dossier?.computedTotals;
  if (!totals || typeof totals !== 'object') return [];
  const clothing = (dossier?.clothingOrder && typeof dossier.clothingOrder === 'object' ? dossier.clothingOrder : {}) as Record<string, any>;
  const lignes: DocumentLigne[] = [];

  const add = (designation: string, qte: number, pu: number) => {
    const total = euros(qte * pu);
    if (qte > 0 && total > 0) lignes.push({ designation, qte, pu: euros(pu), total });
  };
  const taille = (s: unknown) => {
    const t = String(s ?? '').trim();
    return t ? ` (taille ${t})` : '';
  };

  add('Kit nouvel adhérent', 1, num(totals.newMemberKit));
  add('Passeport sportif', 1, num(totals.passport));
  add(`T-shirt club AFFBC${taille(clothing.tshirtSize)}`, num(totals.tshirtQty), num(totals.pricingTshirt));
  add(`Pantalon club AFFBC${taille(clothing.pantalonSize)}`, num(totals.pantalonQty), num(totals.pricingPantalon));
  for (const item of Array.isArray(totals.orderItems) ? totals.orderItems : []) {
    add(`${String(item?.name || 'Article')}${taille(item?.size)}`, num(item?.quantity), num(item?.unitPrice));
  }

  // Garde-fou : tout ce qui a été facturé en plus de la cotisation doit figurer
  // sur le reçu. Si le détail est incomplet (ancien format de dossier, prix
  // absent), le reste part sur une ligne « Autres articles ».
  if (num(totals.total) > 0) {
    const facturéHorsCotisation = euros(num(totals.total) - num(totals.cotisation));
    const detaille = euros(lignes.reduce((s, l) => s + l.total, 0));
    const reste = euros(facturéHorsCotisation - detaille);
    if (reste >= 0.01) add('Autres articles', 1, reste);
  }
  return lignes;
}

// ── Mention de paiement (pied de page) ──────────────────────────────────────

/**
 * État du paiement en ligne, tel que le worker `inscription` le persiste dans
 * `dossier_json.payment` (updateRegistrationPayment). Montants en CENTIMES.
 */
export interface PaymentInfo {
  installmentCount?: number;
  paidAmountCents?: number;
  remainingAmountCents?: number;
}

/**
 * Ligne du pied de page. Le total du tableau est la VALEUR de l'adhésion et des
 * articles ; le pied précise ce qui a été réglé :
 *  - paiement unique : « Mode de paiement : HelloAsso » (+ part Pass Région le cas échéant) ;
 *  - paiement en 2 ou 3 fois : ce qui est réglé à ce jour et ce qui reste à prélever, pour qu'un
 *    reçu émis dès la 1re échéance ne laisse pas croire que tout est déjà encaissé.
 * Doit rester identique à la copie du repo `inscription` (src/routes/_lib/cotisation-receipt.js) :
 * le reçu joint à l'e-mail de confirmation et celui du bouton « Reçu » sont le même document.
 */
export function paymentNote(paiement: string, passRegion: number, total: number, payment?: PaymentInfo): string | undefined {
  const count = Math.max(1, Math.min(3, Math.round(num(payment?.installmentCount)) || 1));
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

  if (count > 1) {
    const paid = payment?.paidAmountCents;
    const remaining = payment?.remainingAmountCents;
    const known = paid != null && remaining != null && Number.isFinite(Number(paid)) && Number.isFinite(Number(remaining));
    const etat = !known
      ? ''
      : Number(remaining) <= 0
        ? 'intégralement réglé'
        : `${eur2(Number(paid) / 100)} € réglés à ce jour, ${eur2(Number(remaining) / 100)} € à prélever`;
    const region = passRegion > 0 ? `dont Pass Région : ${eur2(passRegion)} €` : '';
    return [`Mode de paiement : ${paiement || 'Paiement'} en ${count} fois`, etat, region].filter(Boolean).join(' - ');
  }

  const partRegion = passRegion > 0 ? `dont Pass Région : ${eur2(passRegion)} €, soit ${eur2(euros(total - passRegion))} € réglés par l'adhérent` : '';
  if (paiement) return `Mode de paiement : ${paiement}${partRegion ? ` (${partRegion})` : ''}`;
  return partRegion ? cap(partRegion) : undefined;
}

// ── Contenu du reçu (partagé staff / espace membre) ─────────────────────────

export type ReceiptContent =
  | {
      ok: true;
      season: string;
      lignes: DocumentLigne[];
      total: number;
      /** Nombre de lignes « articles » (t-shirt, pantalon…) issues de l'inscription. */
      goodsCount: number;
      objet: string;
      footerNote?: string;
    }
  | { ok: false; status: number; message: string };

export function buildReceiptContent(
  adherent: Record<string, any>,
  registrations: RegistrationRow[] = [],
  now: Date = new Date(),
  options: { payment?: PaymentInfo } = {}
): ReceiptContent {
  const cotisation = euros(num(adherent.cotisation));
  const passRegion = euros(num(adherent.montant_pass_region));

  const season =
    seasonLabelFromIso(adherent.date_fin_adhesion) ||
    seasonLabelFromIso(adherent.date_inscription) ||
    seasonLabelFromIso(now.toISOString());

  const dossier = pickSeasonRegistration(registrations, season);
  const goods = registrationGoodsLines(dossier);
  // État du paiement : celui fourni par l'appelant (envoi juste après le paiement, avant la
  // mise à jour du dossier), sinon celui persisté dans l'inscription retenue.
  const payment = options.payment ?? (dossier?.payment as PaymentInfo | undefined);

  const lignes: DocumentLigne[] = [];
  if (cotisation > 0) {
    lignes.push({ designation: `Cotisation ${String(adherent.discipline || 'Club')} — saison ${season}`, qte: 1, pu: cotisation, total: cotisation });
  }
  if (passRegion > 0) lignes.push({ designation: 'Pass Région', qte: 1, pu: passRegion, total: passRegion });
  lignes.push(...goods);

  const total = euros(lignes.reduce((s, l) => s + l.total, 0));
  if (!(total > 0)) {
    return {
      ok: false,
      status: 404,
      message: "Aucune cotisation enregistrée pour cet adhérent : il n'y a pas de reçu à émettre.",
    };
  }

  const inscription = frDate(adherent.date_inscription);
  const suffixe = inscription ? ` (inscription du ${inscription})` : '';
  const objet = goods.length
    ? `Inscription saison ${season} : cotisation et articles commandés${suffixe}`
    : `Cotisation à l'association - saison ${season}${suffixe}`;

  const footerNote = paymentNote(String(adherent.paiement ?? '').trim(), passRegion, total, payment);

  return { ok: true, season, lignes, total, goodsCount: goods.length, objet, footerNote };
}

export function buildCotisationReceipt(
  adherent: Record<string, any>,
  now: Date = new Date(),
  registrations: RegistrationRow[] = [],
  options: { payment?: PaymentInfo } = {}
): CotisationReceiptResult {
  const content = buildReceiptContent(adherent, registrations, now, options);
  if (!content.ok) return content;

  const idShort = String(adherent.id ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'XXXXXXXX';
  const nom = String(adherent.nom ?? '').trim().toLocaleUpperCase('fr-FR');
  const prenom = String(adherent.prenom ?? '').trim();
  const nomComplet = `${prenom} ${nom}`.trim() || 'Adhérent';

  const numero = `REC-${content.season}-${idShort}`;
  const emisLe = now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });

  const adresse = String(adherent.adresse ?? '').trim();
  const cpVille = [adherent.code_postal, adherent.ville].map((s) => String(s ?? '').trim()).filter(Boolean).join(' ');
  const lignesDestinataire = [
    ...(adresse ? wrapWords(adresse, 44, 3) : []),
    ...(cpVille ? [cpVille] : []),
    `Adhérent n°${idShort}`,
    `Saison ${content.season}`,
  ];

  const doc: DocumentInput = {
    type: 'cotisation',
    numero,
    dateLabel: `Émis le ${emisLe}`,
    destinataire: { nom: nomComplet, lignes: lignesDestinataire },
    objet: content.objet,
    lignes: content.lignes,
    total: content.total,
    tvaLabel: 'Association loi 1901 — non assujettie à la TVA',
    footerNote: content.footerNote,
    pdfTitle: `Reçu de cotisation ${numero} — ${nomComplet}`,
  };

  const filename = `Recu-cotisation-${slug(nomComplet) || 'adherent'}-${content.season}.pdf`;
  return { ok: true, doc, filename };
}
