/**
 * Worker Gestion AFFBC
 * Back-office : adhérents, comptabilité, achats, factures, diplômes.
 */

export interface Env {
  DB: D1Database;              // affbc-production (tables locales : adherents, journal_comptable, etc.)
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;      // secret HMAC pour la signature des tokens JWT (wrangler secret put SESSION_SECRET)
  PASSWORD_PEPPER: string;     // pepper PBKDF2 (wrangler secret put PASSWORD_PEPPER)
  BREVO_API_KEY?: string;      // clé API Brevo pour l'envoi d'emails (wrangler secret put BREVO_API_KEY)
  BREVO_FROM_EMAIL?: string;   // adresse expéditeur Brevo (wrangler secret put BREVO_FROM_EMAIL)
  BREVO_FROM_NAME?: string;    // nom expéditeur Brevo (wrangler secret put BREVO_FROM_NAME)
  ASSETS: Fetcher;
  R2_STORAGE?: R2Bucket;
  R2_PDF?: R2Bucket;
  MEMBER_PORTAL_URL?: string;  // ex. https://espace-membre.americanfullfightingbons.fr (liens d'activation/réinitialisation par email)
  BOUTIQUE_SALES_SYNC_TOKEN?: string; // wrangler secret put BOUTIQUE_SALES_SYNC_TOKEN — doit avoir EXACTEMENT la même valeur que GESTION_SYNC_TOKEN côté worker boutique. Protège POST /api/internal/sales/sync/boutique.
}

import {verifyPassword, createSessionToken, parseSessionToken, hashPassword, prepareUserWriteValues, hasStoragePermission, isPublicStorageObject, secureEquals} from './lib/security';

// ─── Helpers ────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders,
    },
  });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

// ── Session admin : cookie HttpOnly signé ───────────────────────────────────
// Remplace le stockage du token JWT en localStorage (lisible par un XSS) par
// un cookie HttpOnly. Le token signé (createSessionToken/parseSessionToken)
// et sa logique de révocation ne changent pas — seul le transport change.
// Un Authorization: Bearer reste accepté en repli pour un usage scripté/API.
const ADMIN_SESSION_COOKIE = 'affbc_gestion_session';

function parseCookieHeader(request: Request): Record<string, string> {
  const raw = request.headers.get('Cookie') || '';
  return Object.fromEntries(
    raw.split(';').map(p => p.trim()).filter(Boolean).map(p => {
      const i = p.indexOf('=');
      return i < 0 ? [p, ''] : [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
    }),
  );
}

function getSessionToken(request: Request): string {
  const cookieToken = parseCookieHeader(request)[ADMIN_SESSION_COOKIE];
  if (cookieToken) return cookieToken;
  const auth = request.headers.get('Authorization') ?? '';
  return auth.replace(/^Bearer\s+/i, '').trim();
}

function buildSessionCookie(request: Request, token: string, maxAgeSeconds: number): string {
  const secure = new URL(request.url).protocol === 'https:' ? ' Secure;' : '';
  return `${ADMIN_SESSION_COOKIE}=${token}; HttpOnly;${secure} SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`;
}

function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? ' Secure;' : '';
  return `${ADMIN_SESSION_COOKIE}=; HttpOnly;${secure} SameSite=Strict; Path=/; Max-Age=0`;
}

// ── Espace membre (adherent_comptes) ───────────────────────────────────────
// Cookie et session strictement distincts de ceux du staff (ADMIN_SESSION_COOKIE
// / utilisateurs) : un jeton membre porte kind:'member' et un adherentCompteId
// (jamais userId), donc même un jeton mal aiguillé ne peut jamais être accepté
// par requireAuth/getCurrentUserFromBearer (qui exigent session.userId), ni
// l'inverse. Deux systèmes d'authentification qui ne se recoupent jamais.
const MEMBER_SESSION_COOKIE = 'affbc_membre_session';
const MEMBER_TOKEN_TTL_SEC = 60 * 60 * 24 * 30; // 30 jours

function getMemberSessionToken(request: Request): string {
  const cookieToken = parseCookieHeader(request)[MEMBER_SESSION_COOKIE];
  if (cookieToken) return cookieToken;
  const auth = request.headers.get('Authorization') ?? '';
  return auth.replace(/^Bearer\s+/i, '').trim();
}

function buildMemberSessionCookie(request: Request, token: string, maxAgeSeconds: number): string {
  const secure = new URL(request.url).protocol === 'https:' ? ' Secure;' : '';
  return `${MEMBER_SESSION_COOKIE}=${token}; HttpOnly;${secure} SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`;
}

function clearMemberSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? ' Secure;' : '';
  return `${MEMBER_SESSION_COOKIE}=; HttpOnly;${secure} SameSite=Strict; Path=/; Max-Age=0`;
}

// Construit la charge utile "profil membre" telle que renvoyée par
// /api/member/me — extrait ici pour être réutilisée telle quelle par
// /api/member/dashboard, sans dupliquer le calcul de certificat_expire_le.
async function memberProfilePayload(member: Record<string, any>, env: Env) {
  let certificatExpireLe: string | null = null;
  if (member.certificat_date) {
    const d = new Date(member.certificat_date);
    if (!isNaN(d.getTime())) {
      const dureeMois = await getCertificatDureeMois(env);
      d.setMonth(d.getMonth() + dureeMois);
      certificatExpireLe = d.toISOString().slice(0, 10);
    }
  }
  return {
    nom: member.nom, prenom: member.prenom, email: member.adherent_email,
    naissance: member.naissance || null,
    telephone: member.telephone, adresse: member.adresse, code_postal: member.code_postal, ville: member.ville,
    statut: member.statut, cotisation: member.cotisation, paiement: member.paiement,
    date_inscription: member.date_inscription, date_fin_adhesion: member.date_fin_adhesion,
    certificat: member.certificat, certificat_date: member.certificat_date, certificat_expire_le: certificatExpireLe,
    ceinture: member.couleur_ceinture || null, numero_licence: member.numero_licence || null,
    urgence_nom: member.urgence_nom, urgence_telephone: member.urgence_telephone, urgence_lien: member.urgence_lien,
    annuaire_visible: Number(member.annuaire_visible ?? 0) === 1,
    pref_email_feedback: Number(member.pref_email_feedback ?? 1) === 1,
    family_role: member.family_role ?? null,
    notation_disponible: !!member.pdf_storage_path,
    notation_nom_fichier: member.pdf_nom_fichier || null,
    bulletin_disponible: !!member.pdf_inscription_storage_path,
    bulletin_nom_fichier: member.pdf_inscription_nom_fichier || null,
    // Gestion multi-comptes / parent-enfant (migration 0021) : permet au
    // front de savoir si le profil actuellement affiché est celui du compte
    // connecté ou celui d'un enfant sous tutelle, et de proposer le
    // sélecteur de profils uniquement quand c'est pertinent.
    is_guardian_view: !!member.isGuardianView,
    active_adherent_id: member.adherent_id,
  };
}

// Champs adhérent communs aux deux requêtes ci-dessous (profil du compte
// connecté, ou profil actif sous tutelle) — factorisés pour que les deux
// jeux de colonnes restent forcément synchronisés.
// `email` est préfixé par l'alias `a.` : adherent_comptes a elle aussi une
// colonne `email` (l'email de connexion), et la première requête ci-dessous
// joint les deux tables — une référence non qualifiée à `email` y est donc
// ambiguë pour SQLite ("ambiguous column name: email"). Les deux requêtes
// qui réutilisent cette constante aliasent désormais systématiquement la
// table `adherents` en `a` pour rester compatibles.
const MEMBER_ADHERENT_FIELDS = `nom, prenom, a.email AS adherent_email, a.naissance, statut, cotisation, paiement,
            date_inscription, date_fin_adhesion, certificat, certificat_date,
            telephone, adresse, code_postal, ville,
            couleur_ceinture, numero_licence,
            urgence_nom, urgence_telephone, urgence_lien,
            annuaire_visible, pdf_storage_path, pdf_nom_fichier,
            pdf_inscription_storage_path, pdf_inscription_nom_fichier`;

// Charge le compte espace-membre (identité de connexion) et, le cas échéant,
// le profil actuellement "actif" si différent — cf. gestion multi-comptes /
// parent-enfant (migration 0021) : un tuteur connecté avec son propre
// email/mot de passe peut consulter/gérer le profil d'un adhérent placé
// sous sa tutelle (adherents.guardian_compte_id) sans ressaisir d'identifiants.
// `activeAdherentId` n'est honoré que s'il correspond bien à un adhérent
// rattaché à CE compte — toute autre valeur est silencieusement ignorée
// (repli sur le profil du compte lui-même) plutôt que de faire échouer
// l'authentification, pour ne jamais bloquer un membre à cause d'un jeton
// local désynchronisé (ex. enfant retiré de la tutelle entre-temps).
//
// Champs renvoyés à connaître pour le reste du fichier :
// - `id`            → toujours l'id du COMPTE (adherent_comptes.id), jamais
//                      celui du profil actif — utilisé pour mot de passe,
//                      préférences, contact, etc. (propres au compte connecté).
// - `adherent_id`    → id de l'adhérent du profil actuellement actif — utilisé
//                      partout ailleurs (fiche, diplômes, documents...).
// - `loginAdherentId`→ id de l'adhérent du compte connecté lui-même (jamais
//                      celui d'un enfant), pour reconstruire "mon profil".
async function loadMemberRecord(
  compteId: string,
  activeAdherentId: string | undefined,
  env: Env,
): Promise<Record<string, any> | null> {
  const compte = await env.DB.prepare(
    `SELECT ac.*, ${MEMBER_ADHERENT_FIELDS}
     FROM adherent_comptes ac
     JOIN adherents a ON a.id = ac.adherent_id
     WHERE ac.id = ?`
  ).bind(compteId).first<Record<string, any>>();
  if (!compte) return null;

  const loginAdherentId = compte.adherent_id;
  let record: Record<string, any> = {
    ...compte,
    id: compte.id,
    adherent_id: loginAdherentId,
    loginAdherentId,
    isGuardianView: false,
  };

  if (activeAdherentId && activeAdherentId !== loginAdherentId) {
    const active = await env.DB.prepare(
      `SELECT a.id, ${MEMBER_ADHERENT_FIELDS} FROM adherents a WHERE a.id = ? AND a.guardian_compte_id = ?`
    ).bind(activeAdherentId, compte.id).first<Record<string, any>>();
    if (active) {
      record = { ...record, ...active, id: compte.id, adherent_id: active.id, loginAdherentId, isGuardianView: true };
    }
  }
  return record;
}

// ─── Génération PDF minimale (attestation de cotisation) ────────────────────
// Pas de bibliothèque PDF disponible côté gestion (contrairement à
// inscription-americanfullfightingbons, qui a son propre générateur pour le
// bulletin d'inscription avec photo). Ici on n'a besoin que de texte simple
// sur une page, donc un PDF minimal assemblé à la main suffit — même esprit
// que src/routes/_lib/pdf.js côté inscription, en beaucoup plus court car
// pas de photo ni de mise en page complexe à reproduire.
function pdfEscapeText(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// Caractères Unicode dont le point de code diffère de l'octet WinAnsi
// correspondant (plage 0x80-0x9F de Windows-1252). Le reste de la plage
// Latin1 (0xA0-0xFF, dont tous les accents français) a un point de code
// Unicode identique à son octet WinAnsi, donc pas besoin de table pour ça.
const WINANSI_SPECIALS: Record<string, number> = {
  '\u2018': 0x91, '\u2019': 0x92, '\u201C': 0x93, '\u201D': 0x94,
  '\u2013': 0x96, '\u2014': 0x97, '\u2026': 0x85, '\u20AC': 0x80,
};

function toWinAnsiBytes(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const code = str.charCodeAt(i);
    if (code < 256) bytes[i] = code;
    else if (WINANSI_SPECIALS[ch] !== undefined) bytes[i] = WINANSI_SPECIALS[ch];
    else bytes[i] = 0x3f; // '?' de repli si caractère hors plage WinAnsi
  }
  return bytes;
}

function pdfTextOp(text: string, x: number, y: number, size: number): string {
  return `BT /F1 ${size} Tf ${x} ${y} Td (${pdfEscapeText(text)}) Tj ET\n`;
}

function generateSimplePdf(opts: { title: string; lines: string[]; footer: string }): Uint8Array {
  const pageWidth = 595.28, pageHeight = 841.89; // A4 en points
  let content = '';
  content += pdfTextOp(opts.title, 50, pageHeight - 80, 16);
  let y = pageHeight - 130;
  for (const line of opts.lines) {
    content += pdfTextOp(line, 50, y, 11);
    y -= 22;
  }
  content += pdfTextOp(opts.footer, 50, 50, 8);
  const contentBytes = toWinAnsiBytes(content);

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];

  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  let offset = 0;
  const offsets: number[] = [];
  const push = (bytes: Uint8Array) => { parts.push(bytes); offset += bytes.length; };

  push(encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
  for (let i = 0; i < objects.length; i++) {
    offsets.push(offset);
    push(encoder.encode(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`));
  }
  offsets.push(offset);
  push(encoder.encode(`5 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`));
  push(contentBytes);
  push(encoder.encode('\nendstream\nendobj\n'));

  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 2}\n0000000000 65535 f \n`;
  for (const o of offsets) xref += String(o).padStart(10, '0') + ' 00000 n \n';
  push(encoder.encode(xref));
  push(encoder.encode(`trailer\n<< /Size ${objects.length + 2} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));

  const total = parts.reduce((n, p) => n + p.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { result.set(p, pos); pos += p.length; }
  return result;
}

async function getCurrentMemberFromBearer(request: Request, env: Env): Promise<Record<string, any> | null> {
  const token = getMemberSessionToken(request);
  if (!token) return null;
  const session = await parseSessionToken(token, env as any);
  if (!session || session.kind !== 'member' || !session.adherentCompteId || Number(session.expiresAt) < Date.now()) {
    return null;
  }
  const activeAdherentId = typeof session.activeAdherentId === 'string' ? session.activeAdherentId : undefined;
  const member = await loadMemberRecord(String(session.adherentCompteId), activeAdherentId, env);
  if (!member) return null;
  if (session.pwdStamp !== undefined) {
    const currentStamp = String(member.password_changed_at || '');
    if (String(session.pwdStamp) !== currentStamp) return null;
  }
  return member;
}

// Rate-limiting persistant (D1, cf. migration 0018) — même logique que le
// projet "site" : 8 tentatives / 15 min, puis blocage 15 min. Appliqué ici
// aux endpoints membre les plus sensibles (login, jetons d'activation et de
// réinitialisation), qui n'avaient jusqu'ici aucune protection de ce type
// dans ce Worker.
// Rate-limiting persistant (D1) — la table auth_rate_limits existait déjà
// depuis la toute première migration (0001) mais n'était utilisée par aucune
// route : ce Worker n'avait donc en pratique aucune protection anti-brute-force,
// ni ici ni sur /api/auth/login ou /api/admin/login. On la met enfin en
// service, avec son schéma d'origine (failures / last_failure_at), pour les
// routes membre les plus sensibles (login, jetons d'activation/réinitialisation).
// Même seuils que le rate-limiting déjà éprouvé sur le projet "site" : 8
// tentatives / 15 min, puis blocage 15 min.
const AUTH_RATE_LIMIT_MAX_ATTEMPTS = 8;
const AUTH_RATE_LIMIT_WINDOW_SEC = 15 * 60;

async function checkAuthRateLimit(ip: string, env: Env): Promise<boolean> {
  const windowStart = new Date(Date.now() - AUTH_RATE_LIMIT_WINDOW_SEC * 1000).toISOString();
  try {
    await env.DB.prepare('DELETE FROM auth_rate_limits WHERE ip = ? AND last_failure_at < ?').bind(ip, windowStart).run();
    const row = await env.DB.prepare('SELECT failures, blocked_until FROM auth_rate_limits WHERE ip = ? LIMIT 1').bind(ip).first<any>();
    if (row?.blocked_until && Date.now() < new Date(String(row.blocked_until)).getTime()) return false;
    if (row && Number(row.failures) >= AUTH_RATE_LIMIT_MAX_ATTEMPTS) {
      const blockedUntil = new Date(Date.now() + AUTH_RATE_LIMIT_WINDOW_SEC * 1000).toISOString();
      await env.DB.prepare('UPDATE auth_rate_limits SET blocked_until = ?, last_failure_at = ?, updated_at = ? WHERE ip = ?')
        .bind(blockedUntil, new Date().toISOString(), new Date().toISOString(), ip).run();
      return false;
    }
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO auth_rate_limits (ip, failures, last_failure_at, created_at, updated_at) VALUES (?, 1, ?, ?, ?)
      ON CONFLICT(ip) DO UPDATE SET failures = failures + 1, last_failure_at = excluded.last_failure_at, updated_at = excluded.updated_at
    `).bind(ip, now, now, now).run();
    return true;
  } catch {
    return true; // ne jamais bloquer par erreur si D1 a un souci ponctuel
  }
}

async function resetAuthRateLimit(ip: string, env: Env): Promise<void> {
  try { await env.DB.prepare('DELETE FROM auth_rate_limits WHERE ip = ?').bind(ip).run(); } catch { /* best effort */ }
}

// Même source que checkCertificatsExpirants (cron), pour que la date
// affichée à l'adhérent dans l'espace membre corresponde exactement à celle
// utilisée pour déclencher les rappels par email.
async function getCertificatDureeMois(env: Env): Promise<number> {
  try {
    const row = await env.DB.prepare(`SELECT valeur FROM club_info WHERE cle = 'duree_validite_certificat_mois'`).first<{ valeur: string }>();
    return Number(row?.valeur) || 12;
  } catch {
    return 12;
  }
}

// Emails ayant désactivé la réception des sondages (préférence portée par
// adherent_comptes, cf. migration 0020 — n'existe donc que pour les
// adhérents ayant activé un compte espace-membre ; les autres continuent de
// recevoir les campagnes normalement, comme avant l'introduction de ce
// réglage). Interrogé à chaque envoi (invitation initiale, envoi manuel des
// invitations en attente, relance) plutôt que filtré une seule fois en
// amont, pour qu'un changement de préférence soit respecté immédiatement
// même sur une campagne déjà créée.
async function getFeedbackOptedOutEmails(env: Env): Promise<Set<string>> {
  try {
    const { results } = await env.DB
      .prepare(`SELECT email FROM adherent_comptes WHERE pref_email_feedback = 0`)
      .all<{ email: string }>();
    return new Set((results || []).map((r) => String(r.email).trim().toLowerCase()));
  } catch {
    return new Set(); // ne jamais bloquer un envoi par erreur si D1 a un souci ponctuel
  }
}

function requestIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Échappement minimal pour les quelques champs (prénom, nom) interpolés dans
// les emails HTML envoyés par ce Worker — pas un usage général, juste de quoi
// éviter qu'un prénom/nom contenant "<" ou "&" ne casse le rendu du message.
function escapeHtmlLite(value: string): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function requireAuth(request: Request, env: Env): Promise<boolean> {
  const token = getSessionToken(request);
  if (!token) return false;
  const payload = await parseSessionToken(token, env as any);
  if (!payload || Number(payload.expiresAt) <= Date.now()) return false;
  // Vérifier que le token n'a pas été révoqué (liste noire dans admin_sessions)
  const revoked = await env.DB
    .prepare(`SELECT token FROM admin_sessions WHERE token = ? AND expires_at > datetime('now') LIMIT 1`)
    .bind(`__revoked__${token}`)
    .first();
  if (revoked) return false;
  return true;
}

// ─── /api/bootstrap & /api/db/:table — allowlist et permissions ─────────────
// Reconstruit après une régression (cf. historique git) qui avait fait
// disparaître ces routes : le frontend (app.js → CloudflareQueryBuilder)
// dépend entièrement de /api/db/:table pour toutes les données de l'appli.

type PermissionMatrix = Record<string, Record<string, string>>;

const DB_TABLES = new Set([
  'adherents', 'achats', 'audit_logs', 'club_info', 'comptes_bancaires',
  'diplomes', 'exercices', 'factures', 'feedback_campaigns', 'feedback_recipients', 'feedback_responses',
  'inscriptions_publiques', 'deletion_requests',
  'journal_comptable', 'transactions', 'utilisateurs',
]);

const DB_PRIMARY_KEYS: Record<string, string> = {
  adherents: 'id', achats: 'id', audit_logs: 'id', club_info: 'cle',
  comptes_bancaires: 'id', diplomes: 'id', exercices: 'id', factures: 'id',
  feedback_campaigns: 'id', feedback_recipients: 'id', feedback_responses: 'id',
  inscriptions_publiques: 'id', journal_comptable: 'id', transactions: 'id',
  utilisateurs: 'id', deletion_requests: 'id',
};

const DB_TABLE_PERMISSIONS: Record<string, { read: string; write: string }> = {
  adherents: { read: 'perm_adherents', write: 'perm_adherents' },
  achats: { read: 'perm_achats', write: 'perm_achats' },
  audit_logs: { read: 'perm_administration', write: 'perm_administration' },
  club_info: { read: 'perm_administration', write: 'perm_administration' },
  comptes_bancaires: { read: 'perm_banque', write: 'perm_banque' },
  diplomes: { read: 'perm_diplomes', write: 'perm_diplomes' },
  exercices: { read: 'perm_comptabilite', write: 'perm_comptabilite' },
  factures: { read: 'perm_facturation', write: 'perm_facturation' },
  feedback_campaigns: { read: 'perm_feedback', write: 'perm_feedback' },
  feedback_recipients: { read: 'perm_feedback', write: 'perm_feedback' },
  feedback_responses: { read: 'perm_feedback', write: 'perm_feedback' },
  inscriptions_publiques: { read: 'perm_administration', write: 'perm_administration' },
  deletion_requests: { read: 'perm_administration', write: 'perm_administration' },
  journal_comptable: { read: 'perm_comptabilite', write: 'perm_comptabilite' },
  transactions: { read: 'perm_banque', write: 'perm_banque' },
  utilisateurs: { read: 'perm_administration', write: 'perm_administration' },
};

const DB_DEFAULT_ROLE_PERMS: PermissionMatrix = {
  admin: { perm_adherents: 'write', perm_banque: 'write', perm_comptabilite: 'write', perm_achats: 'write', perm_facturation: 'write', perm_administration: 'write', perm_diplomes: 'write', perm_feedback: 'write', perm_services: 'write' },
  tresorier: { perm_adherents: 'write', perm_banque: 'write', perm_comptabilite: 'write', perm_achats: 'write', perm_facturation: 'write', perm_administration: 'none', perm_diplomes: 'read', perm_feedback: 'none', perm_services: 'none' },
  secretaire: { perm_adherents: 'write', perm_banque: 'none', perm_comptabilite: 'none', perm_achats: 'none', perm_facturation: 'none', perm_administration: 'none', perm_diplomes: 'write', perm_feedback: 'none', perm_services: 'none' },
  entraineur: { perm_adherents: 'read', perm_banque: 'none', perm_comptabilite: 'none', perm_achats: 'none', perm_facturation: 'none', perm_administration: 'none', perm_diplomes: 'read', perm_feedback: 'none', perm_services: 'none' },
  membre: { perm_adherents: 'none', perm_banque: 'none', perm_comptabilite: 'none', perm_achats: 'none', perm_facturation: 'none', perm_administration: 'none', perm_diplomes: 'none', perm_feedback: 'none', perm_services: 'none' },
};

const PUBLIC_CLUB_INFO_KEYS = new Set(['nom', 'logo', 'email', 'telephone', 'adresse', 'siret', 'diplome_signature_url', 'diplome_layouts']);

const DB_MAX_QUERY_LIMIT = 5000;

function dbQuoteIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Identifiant invalide: ${value}`);
  return `"${value}"`;
}

function dbNormalizeValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value;
}

async function getCurrentUserFromBearer(request: Request, env: Env): Promise<Record<string, any> | null> {
  const token = getSessionToken(request);
  if (!token) return null;
  const session = await parseSessionToken(token, env as any);
  if (!session || !session.userId || Number(session.expiresAt) < Date.now()) return null;
  const user = await env.DB.prepare(`SELECT * FROM utilisateurs WHERE id = ? AND actif = 1`).bind(session.userId).first<Record<string, any>>();
  if (!user) return null;
  if (session.pwdStamp !== undefined) {
    const currentStamp = String(user.password_changed_at || '');
    if (String(session.pwdStamp) !== currentStamp) return null;
  }
  return user;
}

async function getRolePerms(env: Env): Promise<PermissionMatrix> {
  try {
    const row = await env.DB.prepare(`SELECT valeur FROM club_info WHERE cle = 'role_permissions'`).first<{ valeur: string }>();
    if (row?.valeur) {
      const parsed = JSON.parse(String(row.valeur));
      if (parsed && typeof parsed === 'object') return { ...DB_DEFAULT_ROLE_PERMS, ...parsed };
    }
  } catch {
    // ignore — on retombe sur les permissions par défaut
  }
  return DB_DEFAULT_ROLE_PERMS;
}

function getPermLevel(user: Record<string, any>, key: string, rolePerms: PermissionMatrix): string {
  const direct = String(user[key] ?? '');
  if (direct === 'write' || direct === 'read' || direct === 'none') return direct;
  const role = String(user.role || '');
  return rolePerms[role]?.[key] || 'none';
}

function dbHasPermission(user: Record<string, any>, permKey: string, mode: 'read' | 'write', rolePerms: PermissionMatrix): boolean {
  if (String(user.role || '') === 'admin') return true;
  const level = getPermLevel(user, permKey, rolePerms);
  if (mode === 'read') return level === 'read' || level === 'write';
  return level === 'write';
}

// ─── Journal d'audit ──────────────────────────────────────────────────────
// La table audit_logs existe et a sa propre vue en lecture côté interface,
// mais rien n'écrivait jamais dedans : aucune mutation (transaction modifiée
// ou supprimée, adhérent édité, etc.) n'y laissait de trace. writeAuditLog
// journalise chaque insert/update/delete passé par handleDbApi, avec l'auteur
// réel (utilisateur nominatif, jamais le mot de passe maître partagé), la
// table et la ou les lignes touchées, et le détail des champs modifiés.
// Les champs sensibles (mots de passe) sont retirés avant écriture — le
// journal doit rester consultable sans devenir lui-même une fuite de secrets.
const AUDIT_REDACT_KEYS = new Set(['password', 'password_hash', 'mot_de_passe', 'admin_password']);

function auditRedact(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const clone: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  for (const key of Object.keys(clone)) {
    if (AUDIT_REDACT_KEYS.has(key.toLowerCase())) clone[key] = '[redacted]';
  }
  return clone;
}

async function writeAuditLog(
  env: Env,
  params: {
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: unknown;
    ip?: string | null;
  }
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(
        crypto.randomUUID(),
        params.userId || null,
        params.action,
        params.entityType,
        params.entityId ?? null,
        params.details !== undefined ? JSON.stringify(auditRedact(params.details)).slice(0, 4000) : null,
        params.ip || null
      )
      .run();
  } catch (e) {
    // Le journal ne doit jamais faire échouer l'opération métier qu'il journalise.
    console.error('[audit_logs]', e instanceof Error ? e.message : String(e));
  }
}

async function handleDbApi(request: Request, env: Env, table: string, ctx: ExecutionContext, origin: string): Promise<Response> {
  if (!DB_TABLES.has(table)) return err('Table inconnue', 404);

  const user = await getCurrentUserFromBearer(request, env);
  if (!user) return err('Unauthorized', 401);

  let body: any;
  try { body = await request.json(); } catch { return err('Invalid JSON body', 400); }

  const op: string = body?.op || 'select';
  const rolePerms = await getRolePerms(env);
  const perms = DB_TABLE_PERMISSIONS[table] || { read: 'perm_administration', write: 'perm_administration' };
  const mode: 'read' | 'write' = op === 'select' ? 'read' : 'write';
  const permKey = mode === 'read' ? perms.read : perms.write;
  if (!dbHasPermission(user, permKey, mode, rolePerms)) {
    return err('Permission refusée', 403);
  }

  const primaryKey = DB_PRIMARY_KEYS[table] || 'id';
  const filters: Array<{ op: string; column: string; value: unknown }> = Array.isArray(body?.filters) ? body.filters : [];

  function buildWhere(): { sql: string; params: unknown[] } {
    if (!filters.length) return { sql: '', params: [] };
    const parts: string[] = [];
    const params: unknown[] = [];
    for (const f of filters) {
      const col = dbQuoteIdentifier(String(f.column));
      if (f.op === 'in' && Array.isArray(f.value)) {
        if (!f.value.length) { parts.push('0'); continue; }
        parts.push(`${col} IN (${f.value.map(() => '?').join(',')})`);
        params.push(...f.value.map(dbNormalizeValue));
      } else if (f.op === 'is_null') {
        parts.push(`${col} IS NULL`);
      } else if (f.op === 'is_not_null') {
        parts.push(`${col} IS NOT NULL`);
      } else {
        parts.push(`${col} = ?`);
        params.push(dbNormalizeValue(f.value));
      }
    }
    return { sql: ` WHERE ${parts.join(' AND ')}`, params };
  }

  try {
    if (op === 'select') {
      const { sql: whereSql, params } = buildWhere();
      let columnsSql = '*';
      if (typeof body?.columns === 'string' && body.columns.trim() && body.columns.trim() !== '*') {
        columnsSql = body.columns.split(',').map((c: string) => dbQuoteIdentifier(c.trim())).join(', ');
      }
      let sql = `SELECT ${columnsSql} FROM ${dbQuoteIdentifier(table)}${whereSql}`;
      if (body?.order?.column) {
        sql += ` ORDER BY ${dbQuoteIdentifier(String(body.order.column))} ${body.order.ascending === false ? 'DESC' : 'ASC'}`;
      }
      const limit = Math.min(Number(body?.limit) || DB_MAX_QUERY_LIMIT, DB_MAX_QUERY_LIMIT);
      sql += ` LIMIT ${body?.single ? 1 : limit}`;
      const { results } = await env.DB.prepare(sql).bind(...params).all();
      const rows = results || [];
      return json({ data: body?.single ? (rows[0] ?? null) : rows, error: null });
    }

    if (op === 'insert' || op === 'upsert') {
      let rows: Record<string, unknown>[] = Array.isArray(body?.payload) ? body.payload : [body?.payload || {}];
      if (table === 'utilisateurs') {
        rows = await Promise.all(rows.map((r) => prepareUserWriteValues(r, env as any, 'pbkdf2_sha256', 100000)));
      }
      const inserted: unknown[] = [];
      for (const row of rows) {
        // Filet de sécurité : si la table utilise une PK "id" TEXT et que le
        // frontend n'en a pas fourni (ou a envoyé une chaîne vide), on génère
        // un UUID ici pour éviter les lignes avec id NULL.
        if (primaryKey === 'id' && !row['id']) {
          row['id'] = crypto.randomUUID();
        }
        const cols = Object.keys(row);
        if (!cols.length) continue;
        const colsSql = cols.map(dbQuoteIdentifier).join(', ');
        const placeholders = cols.map(() => '?').join(', ');
        const values = cols.map((c) => dbNormalizeValue(row[c]));
        let sql = `INSERT INTO ${dbQuoteIdentifier(table)} (${colsSql}) VALUES (${placeholders})`;
        if (op === 'upsert') {
          const conflictCols: string[] = Array.isArray(body?.onConflict) ? body.onConflict : [body?.onConflict || primaryKey];
          const updateCols = cols.filter((c) => !conflictCols.includes(c));
          if (updateCols.length) {
            sql += ` ON CONFLICT(${conflictCols.map(dbQuoteIdentifier).join(',')}) DO UPDATE SET ${updateCols.map((c) => `${dbQuoteIdentifier(c)} = excluded.${dbQuoteIdentifier(c)}`).join(', ')}`;
          } else {
            sql += ` ON CONFLICT(${conflictCols.map(dbQuoteIdentifier).join(',')}) DO NOTHING`;
          }
        }
        sql += ' RETURNING *';
        const result = await env.DB.prepare(sql).bind(...values).first();
        inserted.push(result);
      }
      const data = body?.single ? (inserted[0] ?? null) : inserted;
      if (table !== 'audit_logs') {
        const ids = (inserted as Record<string, any>[]).map((r) => r?.[primaryKey]).filter(Boolean).join(',');
        ctx.waitUntil(writeAuditLog(env, {
          userId: user.id, action: op, entityType: table, entityId: ids || null,
          details: rows, ip: request.headers.get('CF-Connecting-IP'),
        }));
      }
      return json({ data, error: null });
    }

    if (op === 'update') {
      let row: Record<string, unknown> = body?.payload || {};
      if (table === 'utilisateurs') {
        row = await prepareUserWriteValues(row, env as any, 'pbkdf2_sha256', 100000);
      }
      const cols = Object.keys(row);
      if (!cols.length) return json({ data: body?.single ? null : [], error: null });
      const setSql = cols.map((c) => `${dbQuoteIdentifier(c)} = ?`).join(', ');
      const setValues = cols.map((c) => dbNormalizeValue(row[c]));
      const { sql: whereSql, params: whereParams } = buildWhere();
      if (!whereSql) return err('UPDATE sans filtre refusé', 400);
      const sql = `UPDATE ${dbQuoteIdentifier(table)} SET ${setSql}${whereSql} RETURNING *`;
      const { results } = await env.DB.prepare(sql).bind(...setValues, ...whereParams).all();
      const rows = results || [];
      if (table !== 'audit_logs') {
        const ids = (rows as Record<string, any>[]).map((r) => r?.[primaryKey]).filter(Boolean).join(',');
        ctx.waitUntil(writeAuditLog(env, {
          userId: user.id, action: 'update', entityType: table, entityId: ids || null,
          details: { changed: row, resulting_count: rows.length }, ip: request.headers.get('CF-Connecting-IP'),
        }));
      }

      // ── Déclencheur automatique : fin de saison ────────────────────────
      // Quand un exercice passe à statut='cloture' (clôture comptable réelle,
      // cf. finalizeExoClose côté front), on lance en arrière-plan la
      // campagne de feedback de fin de saison pour tous les adhérents
      // rattachés à cet exercice. ctx.waitUntil évite de faire attendre la
      // réponse de clôture pendant l'envoi des emails.
      if (table === 'exercices') {
        for (const r of rows as Record<string, any>[]) {
          if (r?.statut === 'cloture' && r?.id) {
            ctx.waitUntil(
              triggerEndOfSeasonFeedback(env, String(r.id), origin).catch((e) =>
                console.error('[feedback:auto]', e instanceof Error ? e.message : String(e))
              )
            );
          }
        }
      }

      return json({ data: body?.single ? (rows[0] ?? null) : rows, error: null });
    }

    if (op === 'delete') {
      const { sql: whereSql, params } = buildWhere();
      if (!whereSql) return err('DELETE sans filtre refusé', 400);
      const sql = `DELETE FROM ${dbQuoteIdentifier(table)}${whereSql} RETURNING *`;
      const { results } = await env.DB.prepare(sql).bind(...params).all();
      const deleted = results || [];
      if (table !== 'audit_logs') {
        const ids = (deleted as Record<string, any>[]).map((r) => r?.[primaryKey]).filter(Boolean).join(',');
        ctx.waitUntil(writeAuditLog(env, {
          userId: user.id, action: 'delete', entityType: table, entityId: ids || null,
          details: deleted, ip: request.headers.get('CF-Connecting-IP'),
        }));
      }
      return json({ data: deleted, error: null });
    }

    return err(`Opération inconnue: ${op}`, 400);
  } catch (e) {
    console.error('[db:' + table + ']', e instanceof Error ? e.message : String(e));
    return err('Erreur base de données', 500);
  }
}

// ─── /api/storage/:bucket/* — proxy R2 (upload / liste / lecture d'objet) ───
// Le frontend (app.js → CloudflareQueryBuilder.storage) appelle :
//   GET  /api/storage/:bucket/list?prefix=...      (liste, auth + perm read)
//   POST /api/storage/:bucket/upload?path=...      (upload, auth + perm write)
//   GET  /api/storage/:bucket/<chemin/objet>        (lecture, publique pour
//                                                     branding/*, sinon perm read)
// Buckets exposés : "storage" (R2_STORAGE) et "fullfighting-pdf" (R2_PDF).

const STORAGE_BUCKETS: Record<string, 'R2_STORAGE' | 'R2_PDF'> = {
  storage: 'R2_STORAGE',
  'fullfighting-pdf': 'R2_PDF',
};

function getStorageBucket(env: Env, bucketName: string): R2Bucket | null {
  const binding = STORAGE_BUCKETS[bucketName];
  if (!binding) return null;
  return env[binding] ?? null;
}

function r2ContentType(key: string, fallback?: string | null): string {
  if (fallback) return fallback;
  const ext = (key.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf', json: 'application/json',
  };
  return map[ext] || 'application/octet-stream';
}

async function handleStorageApi(request: Request, env: Env, bucketName: string, rest: string): Promise<Response> {
  const bucket = getStorageBucket(env, bucketName);
  if (!bucket) return err('Bucket inconnu', 404);

  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  // ── POST /api/storage/:bucket/upload?path=... ──────────────────────────
  if (method === 'POST' && rest === 'upload') {
    const path = url.searchParams.get('path');
    if (!path) return err('Paramètre "path" requis', 400);

    const user = await getCurrentUserFromBearer(request, env);
    if (!user) return err('Unauthorized', 401);
    const rolePerms = await getRolePerms(env);
    if (!hasStoragePermission(user, bucketName, path, 'write', rolePerms)) {
      return err('Permission refusée', 403);
    }

    let form: FormData;
    try { form = await request.formData(); } catch { return err('Corps multipart invalide', 400); }
    const file = form.get('file');
    if (!(file instanceof File)) return err('Fichier manquant (champ "file")', 400);

    const key = path.replace(/^\/+/, '');
    await bucket.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: r2ContentType(key, file.type) },
    });
    return json({ data: { path: key }, error: null }, 201);
  }

  // ── GET /api/storage/:bucket/list?prefix=... ────────────────────────────
  if (method === 'GET' && rest === 'list') {
    const prefix = url.searchParams.get('prefix') || '';

    const user = await getCurrentUserFromBearer(request, env);
    if (!user) return err('Unauthorized', 401);
    const rolePerms = await getRolePerms(env);
    if (!hasStoragePermission(user, bucketName, prefix, 'read', rolePerms)) {
      return err('Permission refusée', 403);
    }

    const listed = await bucket.list({ prefix, limit: 1000 });
    const files = listed.objects.map((obj) => ({
      name: obj.key.slice(prefix.length).replace(/^\/+/, '') || obj.key,
      id: obj.key,
      metadata: { mimetype: obj.httpMetadata?.contentType || '', size: obj.size },
    }));
    return json({ data: files, error: null });
  }

  // ── GET /api/storage/:bucket/<chemin> — lecture d'un objet ──────────────
  if (method === 'GET' && rest) {
    const key = rest.replace(/^\/+/, '');

    if (!isPublicStorageObject(bucketName, key)) {
      const user = await getCurrentUserFromBearer(request, env);
      if (!user) return err('Unauthorized', 401);
      const rolePerms = await getRolePerms(env);
      if (!hasStoragePermission(user, bucketName, key, 'read', rolePerms)) {
        return err('Permission refusée', 403);
      }
    }

    const object = await bucket.get(key);
    if (!object) return err('Fichier introuvable', 404);
    return new Response(object.body, {
      headers: {
        'Content-Type': r2ContentType(key, object.httpMetadata?.contentType),
        'Cache-Control': isPublicStorageObject(bucketName, key) ? 'public, max-age=3600' : 'private, no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  return err('Method Not Allowed', 405);
}

// ─── Feedback de fin de saison ───────────────────────────────────────────────
// Tables : feedback_campaigns / feedback_recipients / feedback_responses
// (migrations/0010_feedback.sql + migrations/0013_feedback_completion.sql).
//
// ⚠️ Le schéma réel de ces tables en production a déjà posé deux incidents
// documentés dans 0010_feedback.sql (colonnes manquantes découvertes a
// posteriori). Le code ci-dessous suppose le schéma cible décrit dans
// 0013_feedback_completion.sql (et déjà utilisé par public/assets/app.js :
// envoye, envoye_at, repondu, repondu_at, token, reponses, note_globale,
// commentaire). Si une de ces colonnes manque encore réellement en
// production, les requêtes ci-dessous échoueront avec une erreur SQL
// explicite "no such column" — appliquez d'abord 0013, voir IMPLEMENTATION.
//
// Principe : quand un exercice (= une saison) passe à statut='cloture' via
// finalizeExoClose() côté front, handleDbApi() (ci-dessus) déclenche
// triggerEndOfSeasonFeedback() en arrière-plan. Cette fonction :
//   1. crée une campagne pour cet exercice si elle n'existe pas déjà,
//   2. recense tous les adhérents rattachés à cet exercice (exercice_id),
//   3. crée les destinataires manquants (token unique par adhérent),
//   4. envoie l'email d'invitation à ceux pas encore "envoye".
// Comme la requête sur `adherents` se fait au moment de l'envoi, la liste
// est automatiquement à jour : un adhérent supprimé n'y est plus, un
// nouvel inscrit de la saison y est automatiquement inclus.

async function sendBrevoEmail(
  env: Env,
  opts: { to: Array<{ email: string; name?: string }>; subject: string; html: string; replyTo?: { email: string; name?: string } }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!env.BREVO_API_KEY) {
    return { ok: false, error: 'BREVO_API_KEY manquant' };
  }
  const fromEmail = env.BREVO_FROM_EMAIL || 'noreply@americanfullfightingbons.fr';
  const fromName = env.BREVO_FROM_NAME || 'AFFBC — Gestion du club';

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: opts.to,
      subject: opts.subject,
      htmlContent: opts.html,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { ok: false, error: `Brevo ${res.status}: ${detail}` };
  }
  return { ok: true };
}

// ── Rappels d'échéance du certificat médical / questionnaire de santé ──────
// Un adhérent "Actif" dont le certificat (date connue) arrive à échéance
// dans les 30 prochains jours — ou est déjà dépassée — reçoit un email de
// rappel, une seule fois par échéance (cf. table certificat_rappels).
async function checkCertificatsExpirants(env: Env): Promise<{ checked: number; sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  const dureeRow = await env.DB.prepare(
    `SELECT valeur FROM club_info WHERE cle = 'duree_validite_certificat_mois'`
  ).first<{ valeur: string }>();
  const dureeMois = Number(dureeRow?.valeur) || 12;

  const { results } = await env.DB.prepare(
    `SELECT id, prenom, nom, email,
            date(certificat_date, '+' || ? || ' months') AS echeance
     FROM adherents
     WHERE statut = 'Actif'
       AND certificat_date IS NOT NULL AND certificat_date != ''
       AND email IS NOT NULL AND email != ''
       AND date(certificat_date, '+' || ? || ' months') <= date('now', '+30 days')`
  ).bind(dureeMois, dureeMois).all<{ id: string; prenom: string; nom: string; email: string; echeance: string }>();

  for (const row of results || []) {
    const already = await env.DB.prepare(
      `SELECT id FROM certificat_rappels WHERE adherent_id = ? AND echeance = ?`
    ).bind(row.id, row.echeance).first();
    if (already) continue;

    const echeanceDate = new Date(row.echeance);
    const expire = echeanceDate.getTime() < Date.now();
    const echeanceFr = echeanceDate.toLocaleDateString('fr-FR');
    const sujet = expire
      ? `Certificat médical à renouveler — ${row.prenom} ${row.nom}`
      : `Certificat médical : échéance le ${echeanceFr}`;
    const html = `
      <p>Bonjour ${row.prenom},</p>
      <p>${expire
        ? `Votre certificat médical / questionnaire de santé est arrivé à échéance le ${echeanceFr}.`
        : `Votre certificat médical / questionnaire de santé arrive à échéance le ${echeanceFr}.`}</p>
      <p>Merci de transmettre un nouveau justificatif au bureau du club dès que possible afin de continuer à pratiquer sereinement.</p>
      <p>Sportivement,<br>AFFBC</p>`;

    const result = await sendBrevoEmail(env, {
      to: [{ email: row.email, name: `${row.prenom} ${row.nom}` }],
      subject: sujet,
      html,
    });

    if (result.ok) {
      sent++;
      await env.DB.prepare(
        `INSERT INTO certificat_rappels (id, adherent_id, echeance) VALUES (?, ?, ?)`
      ).bind(crypto.randomUUID(), row.id, row.echeance).run();
    } else {
      errors.push(`${row.prenom} ${row.nom} (${row.email}) : ${result.error}`);
    }
  }

  return { checked: results?.length || 0, sent, errors };
}

// Questionnaire par défaut utilisé pour la campagne de fin de saison
// auto-créée. Modifiable ensuite depuis l'admin (onglet Feedback → Modifier),
// le champ `questions` étant du JSON libre interprété par le front
// (types reconnus : "note" 1-5, "oui_non", "choix" avec `options`, "texte").
function defaultEndOfSeasonQuestions(): Array<Record<string, unknown>> {
  // Questionnaire de fin de saison — objectifs :
  //   1. Évaluer la qualité des cours et de l'encadrement
  //   2. Mesurer la satisfaction globale
  //   3. Anticiper les réinscriptions
  //   4. Recueillir des idées d'amélioration concrètes
  return [
    // ── Cours & pédagogie ─────────────────────────────────────────────────
    { id: 'q_cours_qualite',     texte: "Qualité pédagogique des cours",                                                       type: 'note' },
    { id: 'q_cours_variete',     texte: "Variété des séances (technique, cardio, sparring, self-défense…)",              type: 'note' },
    { id: 'q_cours_niveau',      texte: "Le niveau des cours était adapté à ta progression ?",                                 type: 'choix', options: ['Trop facile', 'Bien adapté', 'Trop difficile'] },
    { id: 'q_horaires',          texte: "Les horaires et créneaux te convenaient ?",                                            type: 'oui_non' },
    { id: 'q_horaires_manq',     texte: "Un créneau te manquait ? Lequel ?",                                                   type: 'texte' },
    // ── Encadrement ──────────────────────────────────────────────────────
    { id: 'q_coach_qualite',     texte: "Qualité de l'encadrement (enseignement, corrections, suivi)",                        type: 'note' },
    { id: 'q_coach_dispo',       texte: "Disponibilité et écoute des coachs en dehors des cours",                              type: 'note' },
    { id: 'q_securite',          texte: "Tu t'es senti·e en sécurité pendant les entraînements ?",                             type: 'oui_non' },
    // ── Vie du club ───────────────────────────────────────────────────────
    { id: 'q_ambiance',          texte: "Ambiance générale et esprit du club",                                                  type: 'note' },
    { id: 'q_accueil',           texte: "Qualité de l'accueil (nouveaux membres, retours de blessure…)",                 type: 'note' },
    { id: 'q_equipements',       texte: "État des équipements et des locaux",                                                   type: 'note' },
    { id: 'q_communication',     texte: "Clarté des informations et communication du club",                                     type: 'note' },
    { id: 'q_evenements',        texte: "As-tu participé aux événements du club (galas, stages, compétitions, sorties) ?",    type: 'oui_non' },
    { id: 'q_evenements_sat',    texte: "Si oui, en as-tu été satisfait·e ?",                                                  type: 'choix', options: ["Très satisfait·e", "Satisfait·e", "Déçu·e", "N'a pas participé"] },
    // ── Réinscription & suggestions ───────────────────────────────────────
    { id: 'q_reinscription',     texte: "Penses-tu te réinscrire la saison prochaine ?",                                       type: 'choix', options: ['Oui', 'Probablement', 'Hésitant·e', 'Non'] },
    { id: 'q_reinscription_non', texte: "Si tu n'es pas sûr·e de te réinscrire, qu'est-ce qui t'en empêche ?",               type: 'texte' },
    { id: 'q_recommande',        texte: "Recommanderais-tu le club à un proche ?",                                             type: 'choix', options: ["Oui, sans hésitation", "Oui, avec quelques réserves", 'Non'] },
    { id: 'q_amelioration',      texte: "Qu'est-ce qu'on pourrait améliorer pour la saison prochaine ?",                     type: 'texte' },
  ];
}

function feedbackReminderEmailHtml(opts: { seasonLabel: string; link: string }): string {
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
    <h2 style="color:#b3001b;">Rappel — ton avis compte 🥊</h2>
    <p>Salut,</p>
    <p>On t'a envoyé un questionnaire sur la saison <strong>${opts.seasonLabel}</strong> il y a quelques jours. Si tu n'as pas encore eu le temps d'y répondre, c'est encore possible !</p>
    <p>Cela prend environ 5 minutes et tes retours sont précieux pour préparer la prochaine saison :</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${opts.link}" style="background:#b3001b;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:bold;">Répondre au questionnaire</a>
    </p>
    <p>Merci d'avance pour ton retour 👊</p>
    <p>L'équipe AFFBC</p>
  </div>`;
}

function feedbackInviteEmailHtml(opts: { seasonLabel: string; link: string }): string {
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
    <h2 style="color:#b3001b;">On a besoin de ton avis 🥊</h2>
    <p>Salut,</p>
    <p>La saison <strong>${opts.seasonLabel}</strong> se termine. Aide-nous à préparer la prochaine en répondant à ce questionnaire (5 minutes environ) :</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${opts.link}" style="background:#b3001b;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:bold;">Répondre au questionnaire</a>
    </p>
    <p>Merci pour ta saison à nos côtés 👊</p>
    <p>L'équipe AFFBC</p>
  </div>`;
}

async function triggerEndOfSeasonFeedback(
  env: Env,
  exerciceId: string,
  origin: string
): Promise<{ campaignId: string; invited: number; sent: number; failed: number }> {
  const exercice = await env.DB
    .prepare(`SELECT id, libelle FROM exercices WHERE id = ?`)
    .bind(exerciceId)
    .first<{ id: string; libelle: string }>();
  const seasonLabel = exercice?.libelle || exerciceId;

  // 1. Récupère ou crée la campagne liée à cet exercice.
  let campaign = await env.DB
    .prepare(`SELECT id FROM feedback_campaigns WHERE exercice_id = ?`)
    .bind(exerciceId)
    .first<{ id: string }>();

  let campaignId: string;
  if (campaign?.id) {
    campaignId = campaign.id;
  } else {
    campaignId = crypto.randomUUID();
    // NOTE : "season" et "title" sont des colonnes legacy (NOT NULL) présentes
    // en production mais absentes de toute migration versionnée du dépôt —
    // même schéma "divergent entre prod et fichiers de migration" déjà
    // documenté pour titre/statut/description/date_debut dans
    // 0014_feedback_schema_align.sql. Découvertes le 2026-07-02, une par une,
    // via les échecs successifs de déclenchement manuel depuis l'onglet
    // Exercices ("NOT NULL constraint failed: feedback_campaigns.season" puis
    // ".title"). On leur donne la même valeur que "titre"/season respectifs ;
    // le code ne relit jamais "title" ensuite, seul "titre" est utilisé
    // partout ailleurs dans l'app.
    await env.DB
      .prepare(
        `INSERT INTO feedback_campaigns (id, titre, description, questions, statut, exercice_id, date_debut, season, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, datetime('now'), ?, ?, datetime('now'), datetime('now'))`
      )
      .bind(
        campaignId,
        `Bilan de saison — ${seasonLabel}`,
        `Questionnaire envoyé automatiquement à la clôture de l'exercice ${seasonLabel}.`,
        JSON.stringify(defaultEndOfSeasonQuestions()),
        exerciceId,
        seasonLabel,
        `Bilan de saison — ${seasonLabel}`
      )
      .run();
  }

  // 2. Adhérents de cet exercice (cohorte = "qui a fait cette saison",
  //    indépendamment de leur statut actuel — y compris ceux qui ne se
  //    réinscrivent pas, dont l'avis est précieux).
  const { results: members } = await env.DB
    .prepare(`SELECT id, nom, prenom, email FROM adherents WHERE exercice_id = ? AND email IS NOT NULL AND email != ''`)
    .bind(exerciceId)
    .all<{ id: string; nom: string; prenom: string; email: string }>();

  // 3. Crée les destinataires manquants (dédoublonnage par email dans la campagne).
  const { results: existingRows } = await env.DB
    .prepare(`SELECT email FROM feedback_recipients WHERE campaign_id = ?`)
    .bind(campaignId)
    .all<{ email: string }>();
  const existingEmails = new Set((existingRows || []).map((r) => String(r.email).toLowerCase()));

  let invited = 0;
  for (const m of members || []) {
    const emailNorm = String(m.email).trim().toLowerCase();
    if (existingEmails.has(emailNorm)) continue;
    await env.DB
      .prepare(
        `INSERT INTO feedback_recipients (id, campaign_id, adherent_id, email, nom, prenom, token, envoye, repondu, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, datetime('now'), datetime('now'))`
      )
      .bind(crypto.randomUUID(), campaignId, m.id, emailNorm, m.nom || '', m.prenom || '', crypto.randomUUID().replace(/-/g, ''))
      .run();
    existingEmails.add(emailNorm);
    invited++;
  }

  // 4. Envoie l'invitation à tous les destinataires de cette campagne pas
  //    encore "envoye" (couvre à la fois les nouveaux et ceux qui auraient
  //    été ajoutés manuellement sans recevoir d'email).
  //    On ne sélectionne ni nom ni prenom : l'email d'invitation reste
  //    volontairement générique (cf. anonymat des réponses — inutile de
  //    dépendre d'une colonne dont la présence sur feedback_recipients n'est
  //    pas garantie sur tous les environnements).
  const { results: pending } = await env.DB
    .prepare(`SELECT id, email, token FROM feedback_recipients WHERE campaign_id = ? AND envoye = 0`)
    .bind(campaignId)
    .all<{ id: string; email: string; token: string }>();

  const optedOut = await getFeedbackOptedOutEmails(env);
  let sent = 0;
  let failed = 0;
  for (const recipient of pending || []) {
    if (optedOut.has(String(recipient.email).trim().toLowerCase())) continue;
    const link = `${origin}/feedback.html?token=${recipient.token}`;
    const result = await sendBrevoEmail(env, {
      to: [{ email: recipient.email }],
      subject: `Ton avis sur la saison ${seasonLabel} — American Full Fighting Bons`,
      html: feedbackInviteEmailHtml({ seasonLabel, link }),
    });
    if (result.ok) {
      await env.DB
        .prepare(`UPDATE feedback_recipients SET envoye = 1, envoye_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
        .bind(recipient.id)
        .run();
      sent++;
    } else {
      console.error('[feedback:auto] échec envoi à', recipient.email, result.error);
      failed++;
    }
  }

  return { campaignId, invited, sent, failed };
}

// ─── /api/public/feedback — accès public par token (sans session admin) ────
// GET  : récupère la campagne + les questions pour affichage du formulaire.
// POST : enregistre une réponse. Aucune des deux routes n'exige de Bearer
// token : l'accès est entièrement scopé par le `token` individuel généré
// pour chaque destinataire (feedback_recipients.token), jamais par une
// permission admin. C'est volontaire : ce sont des adhérents, pas des
// utilisateurs internes de l'application de gestion.

async function handlePublicFeedbackGet(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  if (!token) return err('Paramètre token manquant', 400);

  const recipient = await env.DB
    .prepare(`SELECT id, campaign_id, repondu FROM feedback_recipients WHERE token = ?`)
    .bind(token)
    .first<{ id: string; campaign_id: string; repondu: number }>();
  if (!recipient) return err('Lien invalide ou expiré', 404);

  const campaign = await env.DB
    .prepare(`SELECT id, titre, description, questions, statut FROM feedback_campaigns WHERE id = ?`)
    .bind(recipient.campaign_id)
    .first<{ id: string; titre: string; description: string; questions: string; statut: string }>();
  if (!campaign) return err('Campagne introuvable', 404);

  let questions: unknown[] = [];
  try { questions = JSON.parse(campaign.questions || '[]'); } catch { questions = []; }

  return json({
    data: {
      campaign: { titre: campaign.titre, description: campaign.description, statut: campaign.statut },
      recipient: { alreadyResponded: !!recipient.repondu },
      questions,
    },
    error: null,
  });
}

async function handlePublicFeedbackSubmit(request: Request, env: Env): Promise<Response> {
  let body: { token?: string; reponses?: Record<string, unknown>; note_globale?: number; commentaire?: string };
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }

  const token = body?.token || '';
  if (!token) return err('Paramètre token manquant', 400);

  const recipient = await env.DB
    .prepare(`SELECT id, campaign_id, repondu FROM feedback_recipients WHERE token = ?`)
    .bind(token)
    .first<{ id: string; campaign_id: string; repondu: number }>();
  if (!recipient) return err('Lien invalide ou expiré', 404);
  if (recipient.repondu) return err('Cette réponse a déjà été enregistrée', 409);

  const campaign = await env.DB
    .prepare(`SELECT statut, titre, exercice_id FROM feedback_campaigns WHERE id = ?`)
    .bind(recipient.campaign_id)
    .first<{ statut: string; titre: string; exercice_id: string | null }>();
  if (!campaign || campaign.statut !== 'active') return err('Cette campagne n\'accepte plus de réponses', 410);

  // feedback_responses.season est NOT NULL sans valeur par défaut en
  // production (schéma legacy hérité d'un ancien questionnaire à colonnes
  // fixes — voir migrations/0016). On dérive une valeur du libellé de
  // l'exercice lié à la campagne, avec repli sur le titre de la campagne
  // pour ne jamais envoyer NULL sur cette colonne.
  let season = campaign.titre || '';
  if (campaign.exercice_id) {
    const exercice = await env.DB
      .prepare(`SELECT libelle FROM exercices WHERE id = ?`)
      .bind(campaign.exercice_id)
      .first<{ libelle: string | null }>();
    if (exercice?.libelle) season = exercice.libelle;
  }

  // Validation : taille des champs texte libres
  const MAX_TEXT = 2000;
  if (body.commentaire && body.commentaire.length > MAX_TEXT) {
    return err(`Le commentaire ne doit pas dépasser ${MAX_TEXT} caractères`, 400);
  }
  if (body.reponses) {
    for (const [key, val] of Object.entries(body.reponses)) {
      if (typeof val === 'string' && val.length > MAX_TEXT) {
        return err(`La réponse à la question "${key}" ne doit pas dépasser ${MAX_TEXT} caractères`, 400);
      }
    }
  }

  const noteGlobale = body.note_globale != null && body.note_globale !== ('' as unknown) ? Number(body.note_globale) : null;

  // Anonymat réel : on enregistre la réponse SANS aucun lien traçable vers le
  // destinataire (recipient_id = NULL). Le statut "a répondu" / la date de
  // réponse sont mis à jour côté feedback_recipients séparément, pour
  // permettre le suivi du taux de réponse et les relances — mais il est
  // techniquement impossible, même pour un administrateur, de relier une
  // réponse précise à la personne qui l'a soumise.
  try {
    await env.DB
      .prepare(
        `INSERT INTO feedback_responses (id, campaign_id, recipient_id, season, reponses, note_globale, commentaire, submitted_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, datetime('now'))`
      )
      .bind(
        crypto.randomUUID(),
        recipient.campaign_id,
        season,
        JSON.stringify(body.reponses || {}),
        noteGlobale,
        body.commentaire || null
      )
      .run();

    await env.DB
      .prepare(`UPDATE feedback_recipients SET repondu = 1, repondu_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .bind(recipient.id)
      .run();
  } catch (e) {
    // Cf. migrations/0016_feedback_responses_submitted_at.sql : le schéma réel
    // de feedback_responses en production a historiquement divergé du schéma
    // attendu par ce code (colonnes ajoutées manuellement hors migration).
    // On journalise le détail SQL exact pour diagnostic plutôt que de laisser
    // l'exception remonter brute (ce qui casserait le fetch() JSON côté
    // formulaire public avec un message "Erreur de connexion" trompeur).
    console.error('[feedback:submit] échec enregistrement', e instanceof Error ? e.message : String(e));
    return err('Impossible d\'enregistrer ta réponse pour le moment. Réessaie dans un instant.', 500);
  }

  return json({ data: { ok: true }, error: null });
}

// POST /api/feedback/trigger-season — relance manuelle du processus complet
// pour un exercice donné (mêmes étapes que le déclenchement automatique à la
// clôture, voir triggerEndOfSeasonFeedback ci-dessus) : recense à nouveau
// tous les adhérents rattachés à cet exercice (donc y compris ceux qui
// viennent d'être recorrigés via l'outil "Vérifier le rattachement des
// adhérents"), crée les destinataires manquants et envoie l'invitation à
// tous ceux pas encore "envoye". Utile en cas d'échec silencieux à la
// clôture (ex. BREVO_API_KEY absent à l'époque, ou adhérents mal rattachés
// à leur exercice — voir migrations/0015 et le correctif de saveAdh()).
async function handleTriggerSeasonFeedback(request: Request, env: Env, ctx: ExecutionContext, origin: string): Promise<Response> {
  const user = await getCurrentUserFromBearer(request, env);
  if (!user) return err('Unauthorized', 401);
  const rolePerms = await getRolePerms(env);
  if (!dbHasPermission(user, 'perm_feedback', 'write', rolePerms)) return err('Permission refusée', 403);

  let body: { exercice_id?: string };
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }
  const exerciceId = body?.exercice_id;
  if (!exerciceId) return err('Paramètre exercice_id manquant', 400);

  const exercice = await env.DB
    .prepare(`SELECT id FROM exercices WHERE id = ?`)
    .bind(exerciceId)
    .first<{ id: string }>();
  if (!exercice) return err('Exercice introuvable', 404);

  try {
    const result = await triggerEndOfSeasonFeedback(env, exerciceId, origin);
    return json({ data: result, error: null });
  } catch (e) {
    return err('Échec du déclenchement : ' + (e instanceof Error ? e.message : String(e)), 500);
  }
}

async function handleSendPendingInvites(request: Request, env: Env, origin: string): Promise<Response> {
  const user = await getCurrentUserFromBearer(request, env);
  if (!user) return err('Unauthorized', 401);
  const rolePerms = await getRolePerms(env);
  if (!dbHasPermission(user, 'perm_feedback', 'write', rolePerms)) return err('Permission refusée', 403);

  let body: { campaign_id?: string };
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }
  const campaignId = body?.campaign_id;
  if (!campaignId) return err('Paramètre campaign_id manquant', 400);

  const campaign = await env.DB
    .prepare(`SELECT id, titre FROM feedback_campaigns WHERE id = ?`)
    .bind(campaignId)
    .first<{ id: string; titre: string }>();
  if (!campaign) return err('Campagne introuvable', 404);

  const { results: pending } = await env.DB
    .prepare(`SELECT id, email, token FROM feedback_recipients WHERE campaign_id = ? AND envoye = 0`)
    .bind(campaignId)
    .all<{ id: string; email: string; token: string }>();

  const optedOut = await getFeedbackOptedOutEmails(env);
  let sent = 0;
  let failed = 0;
  for (const recipient of pending || []) {
    if (optedOut.has(String(recipient.email).trim().toLowerCase())) continue;
    const link = `${origin}/feedback.html?token=${recipient.token}`;
    const result = await sendBrevoEmail(env, {
      to: [{ email: recipient.email }],
      subject: `${campaign.titre} — American Full Fighting Bons`,
      html: feedbackInviteEmailHtml({ seasonLabel: campaign.titre, link }),
    });
    if (result.ok) {
      await env.DB
        .prepare(`UPDATE feedback_recipients SET envoye = 1, envoye_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
        .bind(recipient.id)
        .run();
      sent++;
    } else {
      console.error('[feedback:manual] échec envoi à', recipient.email, result.error);
      failed++;
    }
  }

  return json({ data: { sent, failed, total: (pending || []).length }, error: null });
}

async function handleSendReminder(request: Request, env: Env, origin: string): Promise<Response> {
  const user = await getCurrentUserFromBearer(request, env);
  if (!user) return err('Unauthorized', 401);
  const rolePerms = await getRolePerms(env);
  if (!dbHasPermission(user, 'perm_feedback', 'write', rolePerms)) return err('Permission refusée', 403);

  let body: { campaign_id?: string };
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }
  const campaignId = body?.campaign_id;
  if (!campaignId) return err('Paramètre campaign_id manquant', 400);

  const campaign = await env.DB
    .prepare(`SELECT id, titre FROM feedback_campaigns WHERE id = ?`)
    .bind(campaignId)
    .first<{ id: string; titre: string }>();
  if (!campaign) return err('Campagne introuvable', 404);

  // Destinataires ayant reçu l'invitation mais n'ayant pas encore répondu
  const { results: toRemind } = await env.DB
    .prepare(`SELECT id, email, token FROM feedback_recipients WHERE campaign_id = ? AND envoye = 1 AND repondu = 0`)
    .bind(campaignId)
    .all<{ id: string; email: string; token: string }>();

  const optedOut = await getFeedbackOptedOutEmails(env);
  let sent = 0;
  let failed = 0;
  for (const recipient of toRemind || []) {
    if (optedOut.has(String(recipient.email).trim().toLowerCase())) continue;
    const link = `${origin}/feedback.html?token=${recipient.token}`;
    const result = await sendBrevoEmail(env, {
      to: [{ email: recipient.email }],
      subject: `Rappel — ton avis sur la saison nous manque ! (${campaign.titre})`,
      html: feedbackReminderEmailHtml({ seasonLabel: campaign.titre, link }),
    });
    if (result.ok) {
      sent++;
    } else {
      console.error('[feedback:reminder] échec relance à', recipient.email, result.error);
      failed++;
    }
  }

  return json({ data: { sent, failed, total: (toRemind || []).length }, error: null });
}

// NOTE : syncInscriptionsValidees(env) a été retirée le 2026-06-27. Elle
// synchronisait les inscriptions HelloAsso validées vers un schéma legacy
// (tables membres / ecritures_compta / ventes_inscription / sync_log) jamais
// présent en base de production (cf. migrations/0002_inscription_sync.sql,
// non appliquée — voir le dashboard D1 réel et le README, qui ne listent que
// adherents, achats, audit_logs, club_info, comptes_bancaires, diplomes,
// exercices, factures, inscriptions_publiques, journal_comptable,
// transactions, utilisateurs). Aucun trigger cron n'était d'ailleurs défini
// dans wrangler.json, donc cette fonction n'a jamais réellement tourné en
// production. Si une synchronisation automatique HelloAsso → adhérents est
// encore souhaitée, elle doit être réécrite contre le vrai schéma
// (table adherents, journal_comptable) et le binding AFFBC_DB doit d'abord
// être corrigé pour pointer vers la base réelle du worker
// inscription-americanfullfightingbons (actuellement il pointe par erreur
// vers le même database_id que DB, donc vers affbc-production).

// ─── RGPD : suppression des données membre (art. 17, droit à l'effacement) ──
//
// Le délai de conservation court à partir de la FIN de la dernière adhésion
// active connue (date_fin_adhesion la plus récente sur toutes les lignes
// adherents liées à cet email), pas depuis la date de la demande : un
// membre encore inscrit ne peut pas voir ses données supprimées sans casser
// le service en cours. Si aucune date_fin_adhesion n'est renseignée
// (adhésion jamais formellement close), on retombe sur date_inscription la
// plus récente.
async function computeDeletionEligibleDate(email: string, env: Env): Promise<string> {
  const row = await env.DB.prepare(
    `SELECT MAX(COALESCE(date_fin_adhesion, date_inscription)) AS lastDate
     FROM adherents WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))`
  ).bind(email).first<{ lastDate: string | null }>();
  const base = row?.lastDate ? new Date(row.lastDate) : new Date();
  if (isNaN(base.getTime())) base.setTime(Date.now());
  base.setFullYear(base.getFullYear() + 5);
  return base.toISOString().slice(0, 10);
}

// Anonymise plutôt que supprime les lignes `adherents` : la comptabilité
// associative a ses propres obligations de conservation (cotisation,
// paiement, exercice_id) indépendantes de la demande RGPD, donc on ne
// détruit que ce qui identifie la personne. Le compte de connexion
// (adherent_comptes), lui, est entièrement supprimé — aucune raison de
// garder des identifiants de connexion pour un compte qui ne doit plus être
// utilisable. Les PDF en R2 (certificat, bulletin) sont aussi effacés :
// les laisser après anonymisation de la ligne serait une fuite résiduelle
// de données personnelles.
async function anonymizeAdherentData(compteId: string, email: string, env: Env): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT id, pdf_storage_path, pdf_inscription_storage_path FROM adherents
     WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))`
  ).bind(email).all<{ id: string; pdf_storage_path: string | null; pdf_inscription_storage_path: string | null }>();

  for (const r of rows.results || []) {
    if (r.pdf_storage_path) await env.R2_PDF?.delete(r.pdf_storage_path).catch(() => {});
    if (r.pdf_inscription_storage_path) await env.R2_PDF?.delete(r.pdf_inscription_storage_path).catch(() => {});
  }

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE adherents SET
         nom = 'Anonymisé', prenom = '', naissance = NULL, email = NULL,
         telephone = NULL, adresse = NULL, code_postal = NULL, ville = NULL,
         urgence_nom = NULL, urgence_telephone = NULL, urgence_lien = NULL,
         notes = NULL, numero_licence = NULL,
         certificat_date = NULL,
         pdf_storage_path = NULL, pdf_public_url = NULL, pdf_nom_fichier = NULL,
         pdf_inscription_storage_path = NULL, pdf_inscription_nom_fichier = NULL
       WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))`
    ).bind(email),
    // Les diplômes ont leur propre copie de nom/prénom (dénormalisée pour la
    // génération du PDF, cf. migration 0004) — pas de FK vers adherents.email
    // à ce stade donc on cible par adherent_id.
    ...(rows.results || []).map((r) =>
      env.DB.prepare(`UPDATE diplomes SET nom = 'Anonymisé', prenom = '' WHERE adherent_id = ?`).bind(r.id)
    ),
    // Un enfant peut avoir été sous la tutelle de ce compte : le lien
    // devient orphelin une fois le compte supprimé, autant le retirer
    // proprement plutôt que laisser un guardian_compte_id pointant vers rien.
    env.DB.prepare(`UPDATE adherents SET guardian_compte_id = NULL WHERE guardian_compte_id = ?`).bind(compteId),
    env.DB.prepare(`DELETE FROM adherent_comptes WHERE id = ?`).bind(compteId),
  ]);
}

// ─── Synchronisation des ventes boutique (t-shirts, pantalons, etc.) ────────
//
// La boutique (worker séparé, base D1 distincte) n'avait jusqu'ici aucun lien
// avec la comptabilité de gestion : les commandes y restaient enfermées.
// Ce bloc reproduit fidèlement le modèle déjà utilisé pour les ventes liées
// à l'inscription web (facture + écritures 411/707/512, cf.
// insertInscriptionSales / insertVenteTenueJournal / upsertHelloAssoPaymentJournal
// dans inscription-web/.../status.js) afin que les deux circuits de vente
// alimentent la même comptabilité de la même façon.
//
// Appelé par POST /api/internal/sales/sync/boutique, protégé par le secret
// partagé BOUTIQUE_SALES_SYNC_TOKEN (jamais par le cookie/token staff : c'est
// un appel serveur-à-serveur depuis le worker boutique, cf. finalizePaidOrder
// dans boutique/src/worker.js).
//
// Idempotence : la commande boutique est identifiée par son id (source_id,
// source_type='boutique_order'). Les écritures du journal sont upsertées par
// "piece" (déterministe à partir de l'id de commande) donc un retry après
// échec réseau ne crée jamais de doublon. La facture est retrouvée via une
// marque insérée dans `notes` (pas de colonne dédiée dans factures).

async function findActiveExercise(db: D1Database): Promise<Record<string, any> | null> {
  const active = await db
    .prepare(`SELECT * FROM exercices WHERE statut = 'actif' ORDER BY date_debut DESC LIMIT 1`)
    .first<Record<string, any>>();
  if (active?.id) return active;
  return db.prepare(`SELECT * FROM exercices ORDER BY date_debut DESC LIMIT 1`).first<Record<string, any>>();
}

async function nextFactureNumero(db: D1Database, exerciceId: string | null): Promise<string> {
  const year = new Date().getFullYear();
  const result = await db.prepare(`SELECT COUNT(*) as cnt FROM factures WHERE exercice_id = ?`).bind(exerciceId).first<Record<string, any>>();
  const n = (Number(result?.cnt) || 0) + 1;
  const ts = Date.now().toString(36).slice(-4).toUpperCase();
  return `VTE-${year}-${String(n).padStart(3, '0')}-${ts}`;
}

async function upsertJournalEntryByPiece(db: D1Database, entry: Record<string, any>): Promise<string> {
  const existing = await db.prepare(`SELECT id FROM journal_comptable WHERE piece = ? LIMIT 1`).bind(entry.piece).first<Record<string, any>>();
  const columns = Object.keys(entry);
  if (existing?.id) {
    const assignments = columns.map((c) => `"${c}" = ?`).join(', ');
    await db.prepare(`UPDATE journal_comptable SET ${assignments} WHERE id = ?`).bind(...columns.map((c) => entry[c]), existing.id).run();
    return String(existing.id);
  }
  await db.prepare(
    `INSERT INTO journal_comptable (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
  ).bind(...columns.map((c) => entry[c])).run();
  return String(entry.id);
}

interface BoutiqueSaleItem { name: string; quantity: number; unitPrice: number }

interface BoutiqueSalePayload {
  orderId: number | string;
  customerName: string;
  customerEmail: string;
  total: number;
  paidAt?: string;
  items: BoutiqueSaleItem[];
}

// Crée (ou retrouve, si déjà synchronisée) la facture correspondant à une
// commande boutique payée.
async function upsertBoutiqueSaleFacture(db: D1Database, payload: BoutiqueSalePayload, exercise: Record<string, any> | null): Promise<{ id: string; created: boolean }> {
  const marker = `[boutique_order:${payload.orderId}]`;
  const existing = await db.prepare(`SELECT id FROM factures WHERE notes LIKE ? LIMIT 1`).bind(`%${marker}%`).first<Record<string, any>>();
  if (existing?.id) return { id: String(existing.id), created: false };

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const numero = await nextFactureNumero(db, exercise?.id || null);
  const lignes = (payload.items || [])
    .filter((item) => Number(item.quantity || 0) > 0)
    .map((item) => ({ desc: item.name, qte: Number(item.quantity), pu: Number(item.unitPrice) }));

  const row = {
    id,
    numero,
    date_op: String(payload.paidAt || now).slice(0, 10),
    destinataire: payload.customerName || 'Client boutique',
    adresse: '',
    objet: 'Vente boutique en ligne',
    lignes: JSON.stringify(lignes),
    statut: 'Payée',
    notes: `Vente générée automatiquement depuis la boutique en ligne. Paiement HelloAsso validé. ${marker} Email client : ${payload.customerEmail || ''}`,
    exercice_id: exercise?.id || null,
    created_at: now,
    updated_at: now,
  };
  const columns = Object.keys(row);
  await db.prepare(
    `INSERT INTO factures (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
  ).bind(...columns.map((c) => (row as Record<string, any>)[c])).run();

  return { id, created: true };
}

// Écritures de reconnaissance du chiffre d'affaires (411 débit / 707 crédit),
// symétriques à insertVenteTenueJournal côté inscription.
async function upsertBoutiqueSaleJournal(db: D1Database, factureId: string, payload: BoutiqueSalePayload, exercise: Record<string, any> | null): Promise<string | null> {
  const total = Number(payload.total || 0);
  if (!(total > 0)) return null;
  const now = new Date().toISOString();
  const dateOp = String(payload.paidAt || now).slice(0, 10);
  const piece = `VTE-BTQ-${String(payload.orderId)}`;
  const libelleBase = `Vente boutique - ${payload.customerName || 'Client'} - commande #${payload.orderId}`;
  const common = {
    date_op: dateOp,
    piece,
    source_type: 'boutique_order',
    source_id: String(payload.orderId),
    source_logiciel: 'boutique-web',
    exercice_id: exercise?.id || null,
    updated_at: now,
  };

  await upsertJournalEntryByPiece(db, {
    id: crypto.randomUUID(),
    ...common,
    compte: '411 - Adhérents et clients',
    libelle: `${libelleBase} - Vente`,
    debit: total,
    credit: 0,
    created_at: now,
  });
  await upsertJournalEntryByPiece(db, {
    id: crypto.randomUUID(),
    ...common,
    piece: `${piece}-VTE`,
    compte: '707 - Ventes vêtements et équipements',
    libelle: `${libelleBase} - Produits boutique`,
    debit: 0,
    credit: total,
    created_at: now,
  });

  return piece;
}

// Écritures d'encaissement (512 débit / 411 crédit), symétriques à
// upsertHelloAssoPaymentJournal côté inscription : la commande boutique n'est
// synchronisée qu'une fois payée (cf. finalizePaidOrder côté boutique), donc
// le paiement est toujours intégral au moment de l'appel.
async function upsertBoutiquePaymentJournal(db: D1Database, payload: BoutiqueSalePayload, exercise: Record<string, any> | null): Promise<string | null> {
  const total = Number(payload.total || 0);
  if (!(total > 0)) return null;
  const now = new Date().toISOString();
  const dateOp = String(payload.paidAt || now).slice(0, 10);
  const pieceBase = `PAY-BTQ-${String(payload.orderId)}`;
  const libelle = `Encaissement HelloAsso boutique - ${payload.customerName || 'Client'} - commande #${payload.orderId}`;
  const common = {
    date_op: dateOp,
    source_type: 'boutique_order',
    source_id: String(payload.orderId),
    source_logiciel: 'boutique-web',
    exercice_id: exercise?.id || null,
    updated_at: now,
  };

  await upsertJournalEntryByPiece(db, {
    id: crypto.randomUUID(),
    ...common,
    piece: `${pieceBase}-BNQ`,
    compte: '512 - Banque',
    libelle,
    debit: total,
    credit: 0,
    created_at: now,
  });
  await upsertJournalEntryByPiece(db, {
    id: crypto.randomUUID(),
    ...common,
    piece: `${pieceBase}-CLI`,
    compte: '411 - Adhérents et clients',
    libelle,
    debit: 0,
    credit: total,
    created_at: now,
  });

  return pieceBase;
}

async function handleBoutiqueSalesSync(request: Request, env: Env): Promise<Response> {
  const expected = String(env.BOUTIQUE_SALES_SYNC_TOKEN || '');
  const provided = request.headers.get('X-Boutique-Sales-Token') || '';
  if (!expected || expected.length < 16 || !secureEquals(provided, expected)) {
    return json({ data: null, error: { message: 'Non autorisé' } }, 401);
  }

  let body: BoutiqueSalePayload;
  try {
    body = await request.json();
  } catch {
    return json({ data: null, error: { message: 'JSON invalide' } }, 400);
  }

  if (!body?.orderId || !(Number(body.total) > 0) || !Array.isArray(body.items)) {
    return json({ data: null, error: { message: 'orderId, total et items sont obligatoires' } }, 400);
  }

  try {
    const exercise = await findActiveExercise(env.DB);
    const facture = await upsertBoutiqueSaleFacture(env.DB, body, exercise);
    // Les écritures ne sont créées qu'à la première synchronisation de cette
    // facture : sur un retry (facture déjà trouvée), le journal a forcément
    // déjà été écrit lui aussi la première fois (les deux sont créés dans la
    // même requête, cf. ci-dessous), donc pas besoin de les rejouer — mais
    // upsertJournalEntryByPiece est de toute façon idempotent si jamais un
    // appel précédent avait échoué entre les deux étapes.
    const ventePiece = await upsertBoutiqueSaleJournal(env.DB, facture.id, body, exercise);
    const paymentPiece = await upsertBoutiquePaymentJournal(env.DB, body, exercise);

    return json({
      data: {
        synced: true,
        factureId: facture.id,
        factureCreated: facture.created,
        ventePiece,
        paymentPiece,
      },
      error: null,
    });
  } catch (e) {
    console.error('[sales/sync/boutique] échec', e instanceof Error ? e.stack || e.message : String(e));
    return json({ data: null, error: { message: 'Synchronisation impossible' } }, 500);
  }
}

// ─── Handler principal ───────────────────────────────────────────────────────

async function handleFetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
      const allowedOrigin = corsOriginFor(request);
      return new Response(null, {
        headers: {
          ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : {}),
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // ── /api/bootstrap & /api/db/:table ────────────────────────────────────

    if (path === '/api/bootstrap' && (method === 'GET' || method === 'HEAD')) {
      if (method === 'HEAD') return new Response(null, { status: 200 });
      try {
        const user = await getCurrentUserFromBearer(request, env);
        const clubInfoRows = await env.DB.prepare(`SELECT * FROM club_info`).all();
        const clubInfo: Record<string, unknown> = {};
        for (const row of (clubInfoRows.results || []) as Record<string, any>[]) {
          clubInfo[String(row.cle)] = row.valeur;
        }
        const finalClubInfo = user
          ? clubInfo
          : Object.fromEntries(Object.entries(clubInfo).filter(([k]) => PUBLIC_CLUB_INFO_KEYS.has(k)));
        const exercices = user
          ? (await env.DB.prepare(`SELECT * FROM exercices ORDER BY date_debut DESC`).all()).results
          : [];
        return json({ data: { clubInfo: finalClubInfo, exercices, currentUser: user || null }, error: null });
      } catch (e) {
        console.error('[bootstrap]', e instanceof Error ? e.message : String(e));
        return json({ data: null, error: { message: 'Database unavailable' } }, 503);
      }
    }

    const dbMatch = path.match(/^\/api\/db\/([A-Za-z0-9_]+)$/);
    if (dbMatch) {
      if (method !== 'POST') return err('Method Not Allowed', 405);
      return await handleDbApi(request, env, dbMatch[1], ctx, url.origin);
    }

    // ── /api/public/feedback — accès adhérent par token, sans session admin ─
    if (path === '/api/public/feedback') {
      if (method === 'GET') return await handlePublicFeedbackGet(request, env);
      if (method === 'POST') return await handlePublicFeedbackSubmit(request, env);
      return err('Method Not Allowed', 405);
    }

    // ── /api/storage/:bucket/* ───────────────────────────────────────────
    const storageMatch = path.match(/^\/api\/storage\/([A-Za-z0-9_-]+)\/(.*)$/);
    if (storageMatch) {
      return await handleStorageApi(request, env, storageMatch[1], decodeURIComponent(storageMatch[2]));
    }

    // ── Authentification ──────────────────────────────────────────────────

    // POST /api/admin/login
    if (method === 'POST' && path === '/api/admin/login') {
      const body = await request.json<{ password?: string }>();
      if (!body?.password) return err('Mot de passe requis', 400);

      // Comparaison en temps constant
      const encoder = new TextEncoder();
      const a = encoder.encode(body.password);
      const b = encoder.encode(env.ADMIN_PASSWORD);
      let same = a.length === b.length;
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) same = false;
      }
      if (!same) return err('Mot de passe incorrect', 401);

      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

      await env.DB
        .prepare(
          `INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)`
        )
        .bind(token, expiresAt)
        .run();

      // Purge des sessions expirées
      await env.DB
        .prepare(`DELETE FROM admin_sessions WHERE expires_at < datetime('now')`)
        .run();

      return json({ token, expires_at: expiresAt });
    }

    // POST /api/admin/reset-password
    // Réinitialise le mot de passe d'un utilisateur en le hachant avec le
    // PASSWORD_PEPPER réellement actif sur ce Worker (contrairement à un hash
    // inséré à la main en SQL, qui ne peut jamais matcher si le pepper diffère).
    // Protégée par ADMIN_PASSWORD : c'est la seule clé "maître" indépendante
    // des comptes utilisateurs, donc utilisable même si plus personne ne peut
    // se connecter via /api/auth/login.
    if (method === 'POST' && path === '/api/admin/reset-password') {
      const body = await request.json<{ adminPassword?: string; email?: string; newPassword?: string }>();
      if (!body?.adminPassword || !body?.email || !body?.newPassword) {
        return err('adminPassword, email et newPassword sont requis', 400);
      }

      // Comparaison en temps constant, identique à /api/admin/login
      const encoder = new TextEncoder();
      const a = encoder.encode(body.adminPassword);
      const b = encoder.encode(env.ADMIN_PASSWORD);
      let same = a.length === b.length;
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) same = false;
      }
      if (!same) return err('Mot de passe admin incorrect', 401);

      if (body.newPassword.length < 8) {
        return err('Le nouveau mot de passe doit faire au moins 8 caractères', 400);
      }

      const emailNormalized = body.email.trim().toLowerCase();
      const user = await env.DB
        .prepare(`SELECT id FROM utilisateurs WHERE LOWER(TRIM(email))=?`)
        .bind(emailNormalized)
        .first<any>();
      if (!user) return err('Utilisateur introuvable', 404);

      const newHash = await hashPassword(body.newPassword, env as any, 'pbkdf2_sha256', 100000);
      await env.DB
        .prepare(`UPDATE utilisateurs SET mot_de_passe=?, password_changed_at=? WHERE id=?`)
        .bind(newHash, new Date().toISOString(), user.id)
        .run();

      return json({ ok: true });
    }

    // POST /api/auth/login
    if (method === 'POST' && path === '/api/auth/login') {
      const body= await request.json<any>();
      const emailNormalized = String(body?.email || '').trim().toLowerCase();
      const user= await env.DB.prepare(`SELECT * FROM utilisateurs WHERE LOWER(TRIM(email))=? AND (actif=1 OR actif IS NULL)`).bind(emailNormalized).first<any>();
      if(!user) return err('Utilisateur introuvable',401);
      const check= await verifyPassword(body.password,user.mot_de_passe,env as any,'pbkdf2_sha256',100000,/^[a-f0-9]{64}$/i);
      if(!check.valid) return err('Email ou mot de passe incorrect',401);
      const maxAgeSeconds = 86400;
      const token= await createSessionToken({userId:user.id,expiresAt:Date.now()+maxAgeSeconds*1000,pwdStamp:user.password_changed_at||''},env as any);
      // Le token reste renvoyé dans le corps (compat scripts existants) et est en
      // plus posé en cookie HttpOnly signé : le front (app.js) migre vers ce cookie
      // et arrête de le recopier en localStorage.
      return json(
        {token,user:{id:user.id,prenom:user.prenom,nom:user.nom,email:user.email,role:user.role,must_change_password:user.must_change_password||0}},
        200,
        { 'Set-Cookie': buildSessionCookie(request, token, maxAgeSeconds) },
      )
    }

    // GET /api/auth/session — vérifie un token Bearer et retourne l'utilisateur courant.
    // Appelé au chargement de la page pour restaurer une session persistée en localStorage.
    if (method === 'GET' && path === '/api/auth/session') {
      const user = await getCurrentUserFromBearer(request, env);
      if (!user) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);
      return json({
        data: {
          user: {
            id: user.id, prenom: user.prenom, nom: user.nom,
            email: user.email, role: user.role,
            must_change_password: user.must_change_password || 0,
          },
        },
        error: null,
      });
    }

    // POST /api/auth/password — changement du mot de passe utilisateur connecté.
    // Vérifie l'ancien mot de passe avant d'appliquer le nouveau ; révoque la session
    // courante afin que les autres onglets/appareils soient déconnectés.
    if (method === 'POST' && path === '/api/auth/password') {
      const user = await getCurrentUserFromBearer(request, env);
      if (!user) return err('Unauthorized', 401);

      const body = await request.json<{ currentPassword?: string; nextPassword?: string }>();
      if (!body?.currentPassword || !body?.nextPassword) {
        return err('currentPassword et nextPassword sont requis', 400);
      }
      if (String(body.nextPassword).length < 8) {
        return err('Le nouveau mot de passe doit faire au moins 8 caractères', 400);
      }

      const check = await verifyPassword(
        body.currentPassword, user.mot_de_passe, env as any,
        'pbkdf2_sha256', 100000, /^[a-f0-9]{64}$/i,
      );
      if (!check.valid) return err('Mot de passe actuel incorrect', 401);

      const newHash = await hashPassword(body.nextPassword, env as any, 'pbkdf2_sha256', 100000);
      const now = new Date().toISOString();
      await env.DB
        .prepare(`UPDATE utilisateurs SET mot_de_passe=?, password_changed_at=?, must_change_password=0, updated_at=? WHERE id=?`)
        .bind(newHash, now, now, user.id)
        .run();

      return json({ data: { ok: true }, error: null });
    }

    // ── Espace membre ──────────────────────────────────────────────────────
    // Toutes ces routes sont dans publicApiRoutes (elles gèrent leur propre
    // vérification — session membre, jeton d'activation/réinitialisation —
    // plutôt que la vérification staff de requireAuth, qui ne les concerne
    // pas). cf. commentaire sur MEMBER_SESSION_COOKIE plus haut : un jeton
    // membre ne peut jamais être accepté comme session staff, et inversement.

    // POST /api/member/activation/request — { email }
    // Ne révèle jamais si l'email correspond à un adhérent (message générique
    // dans tous les cas), pour empêcher quiconque de vérifier par tâtonnement
    // quels emails sont ceux d'adhérents existants.
    if (method === 'POST' && path === '/api/member/activation/request') {
      if (!(await checkAuthRateLimit(requestIp(request), env))) {
        return err('Trop de tentatives. Réessayez dans quelques minutes.', 429);
      }
      const body = await request.json<{ email?: string }>().catch(() => ({} as { email?: string }));
      const email = String(body?.email || '').trim().toLowerCase();
      const generic = { data: { ok: true, message: "Si cet e-mail correspond à un adhérent, un lien d'activation vient de lui être envoyé." }, error: null };
      if (!email) return json(generic);

      const adherent = await env.DB.prepare(`SELECT id, email, nom, prenom FROM adherents WHERE LOWER(TRIM(email)) = ?`).bind(email).first<any>();
      if (!adherent) return json(generic); // pas d'énumération

      const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const existing = await env.DB.prepare(`SELECT id FROM adherent_comptes WHERE adherent_id = ?`).bind(adherent.id).first<any>();
      if (existing) {
        await env.DB.prepare(`UPDATE adherent_comptes SET activation_token=?, activation_expires_at=?, email=? WHERE id=?`)
          .bind(token, expiresAt, adherent.email, existing.id).run();
      } else {
        await env.DB.prepare(`INSERT INTO adherent_comptes (id, adherent_id, email, activation_token, activation_expires_at) VALUES (?,?,?,?,?)`)
          .bind(crypto.randomUUID(), adherent.id, adherent.email, token, expiresAt).run();
      }

      const portalUrl = env.MEMBER_PORTAL_URL || 'https://espace-membre.americanfullfightingbons.fr';
      const link = `${portalUrl}/activer?token=${token}`;
      await sendBrevoEmail(env, {
        to: [{ email: adherent.email, name: `${adherent.prenom || ''} ${adherent.nom || ''}`.trim() }],
        subject: 'Activez votre espace membre AFFBC',
        html: `<p>Bonjour ${escapeHtmlLite(adherent.prenom || '')},</p>
<p>Vous pouvez activer votre espace membre et choisir votre mot de passe en suivant ce lien (valable 24h) :</p>
<p><a href="${link}">${link}</a></p>
<p>Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message.</p>`,
      }).catch((e) => console.error('[member:activation:email]', e));

      return json(generic);
    }

    // POST /api/member/activation/confirm — { token, password }
    if (method === 'POST' && path === '/api/member/activation/confirm') {
      if (!(await checkAuthRateLimit(requestIp(request), env))) {
        return err('Trop de tentatives. Réessayez dans quelques minutes.', 429);
      }
      const body = await request.json<{ token?: string; password?: string }>().catch(() => ({} as { token?: string; password?: string }));
      const token = String(body?.token || '').trim();
      if (!token) return err('Jeton manquant', 400);
      if (!body?.password || String(body.password).length < 8) {
        return err('Le mot de passe doit faire au moins 8 caractères', 400);
      }

      const compte = await env.DB.prepare(`SELECT * FROM adherent_comptes WHERE activation_token = ?`).bind(token).first<any>();
      if (!compte || !compte.activation_expires_at || new Date(compte.activation_expires_at).getTime() < Date.now()) {
        return err('Lien invalide ou expiré, merci de refaire une demande', 400);
      }

      const hash = await hashPassword(body.password, env as any, 'pbkdf2_sha256', 100000);
      const now = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE adherent_comptes SET mot_de_passe=?, email_verifie=1, password_changed_at=?, activation_token=NULL, activation_expires_at=NULL WHERE id=?`
      ).bind(hash, now, compte.id).run();

      const maxAgeSeconds = MEMBER_TOKEN_TTL_SEC;
      const sessionToken = await createSessionToken(
        { kind: 'member', adherentCompteId: compte.id, email: compte.email, expiresAt: Date.now() + maxAgeSeconds * 1000, pwdStamp: now },
        env as any,
      );
      return json(
        { data: { ok: true, token: sessionToken, expiresAt: Date.now() + maxAgeSeconds * 1000 }, error: null },
        200,
        { 'Set-Cookie': buildMemberSessionCookie(request, sessionToken, maxAgeSeconds) },
      );
    }

    // POST /api/member/login — { email, password }
    if (method === 'POST' && path === '/api/member/login') {
      const ip = requestIp(request);
      if (!(await checkAuthRateLimit(ip, env))) {
        return err('Trop de tentatives. Réessayez dans quelques minutes.', 429);
      }
      const body = await request.json<{ email?: string; password?: string }>().catch(() => ({} as { email?: string; password?: string }));
      const email = String(body?.email || '').trim().toLowerCase();
      const compte = await env.DB.prepare(`SELECT * FROM adherent_comptes WHERE LOWER(TRIM(email)) = ?`).bind(email).first<any>();
      if (!compte || !compte.mot_de_passe) return err('Email ou mot de passe incorrect', 401);

      const check = await verifyPassword(String(body?.password || ''), compte.mot_de_passe, env as any, 'pbkdf2_sha256', 100000, /^[a-f0-9]{64}$/i);
      if (!check.valid) return err('Email ou mot de passe incorrect', 401);

      await resetAuthRateLimit(ip, env);
      const now = new Date().toISOString();
      await env.DB.prepare(`UPDATE adherent_comptes SET last_login_at=? WHERE id=?`).bind(now, compte.id).run();

      const maxAgeSeconds = MEMBER_TOKEN_TTL_SEC;
      const sessionToken = await createSessionToken(
        { kind: 'member', adherentCompteId: compte.id, email: compte.email, expiresAt: Date.now() + maxAgeSeconds * 1000, pwdStamp: compte.password_changed_at || '' },
        env as any,
      );
      return json(
        { data: { ok: true, token: sessionToken, expiresAt: Date.now() + maxAgeSeconds * 1000 }, error: null },
        200,
        { 'Set-Cookie': buildMemberSessionCookie(request, sessionToken, maxAgeSeconds) },
      );
    }

    // GET /api/member/me — profil + cotisation de l'adhérent connecté
    if (method === 'GET' && path === '/api/member/me') {
      const member = await getCurrentMemberFromBearer(request, env);
      if (!member) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);
      return json({ data: await memberProfilePayload(member, env), error: null });
    }

    // GET /api/member/dashboard — agrège en un seul aller-retour ce que
    // l'espace membre (espace-membre.*) chargeait jusqu'ici via trois appels
    // distincts (/me, /diplomes, /annuaire), chacun repassant indépendamment
    // par getCurrentMemberFromBearer (une jointure D1 adherent_comptes ×
    // adherents à chaque fois). Ici l'authentification n'a lieu qu'une fois,
    // et diplomes/annuaire réutilisent member.adherent_id déjà en main — même
    // requêtes SQL que les routes individuelles ci-dessous, juste regroupées.
    // Les routes /api/member/me, /diplomes, /annuaire sont conservées telles
    // quelles (pas de breaking change pour d'éventuels autres appelants),
    // /dashboard est un ajout, pas un remplacement.
    if (method === 'GET' && path === '/api/member/dashboard') {
      const member = await getCurrentMemberFromBearer(request, env);
      if (!member) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);

      const [me, diplomesResult, annuaireResult, cotisationsResult, feedbackResult] = await Promise.all([
        memberProfilePayload(member, env),
        env.DB.prepare(
          `SELECT id, titre, ceinture, date_emission, saison, delivre_par
           FROM diplomes WHERE adherent_id = ? ORDER BY date_emission DESC`
        ).bind(member.adherent_id).all(),
        env.DB.prepare(
          `SELECT prenom, nom FROM adherents
           WHERE annuaire_visible = 1 AND statut = 'Actif'
           ORDER BY nom COLLATE NOCASE, prenom COLLATE NOCASE`
        ).all(),
        // Historique multi-saisons : `adherents` a une ligne par saison (une
        // par exercice_id, cf. réinscription), reliées ici par email plutôt
        // que par adherent_id — adherent_comptes.adherent_id ne pointe que
        // vers UNE de ces lignes (celle en cours au moment de l'activation
        // du compte, cf. migration 0018), donc remonter depuis member.adherent_id
        // ne donnerait que la saison courante. Aucune nouvelle table requise :
        // la donnée existe déjà, seule l'agrégation manquait.
        env.DB.prepare(
          `SELECT a.cotisation, a.paiement, a.date_inscription, a.exercice_id, e.libelle AS saison
           FROM adherents a LEFT JOIN exercices e ON e.id = a.exercice_id
           WHERE LOWER(TRIM(a.email)) = LOWER(TRIM(?))
           ORDER BY a.date_inscription DESC`
        ).bind(member.adherent_email).all(),
        // Enquête de satisfaction en attente pour ce membre, s'il y en a une.
        // Réutilise le token déjà généré dans feedback_recipients (même
        // mécanisme que le lien envoyé par email) plutôt que d'inventer un
        // second système d'accès : le front peut pointer directement vers
        // /feedback.html?token=... (page publique existante), sans dupliquer
        // la logique de soumission de réponse.
        env.DB.prepare(
          `SELECT fr.token, fc.titre, fc.description
           FROM feedback_recipients fr
           JOIN feedback_campaigns fc ON fc.id = fr.campaign_id
           WHERE fr.adherent_id = ? AND fr.repondu = 0 AND fc.statut = 'active'
           ORDER BY fc.created_at DESC LIMIT 1`
        ).bind(member.adherent_id).all(),
      ]);

      return json({
        data: {
          me,
          diplomes: diplomesResult.results || [],
          annuaire: annuaireResult.results || [],
          cotisations: cotisationsResult.results || [],
          feedback: feedbackResult.results?.[0] || null,
        },
        error: null,
      });
    }

    // GET /api/member/cotisations — historique de cotisation multi-saisons,
    // même requête que dans /dashboard mais exposée seule pour un
    // rafraîchissement ciblé sans recharger tout le tableau de bord.
    if (method === 'GET' && path === '/api/member/cotisations') {
      const member = await getCurrentMemberFromBearer(request, env);
      if (!member) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);

      const { results } = await env.DB.prepare(
        `SELECT a.cotisation, a.paiement, a.date_inscription, a.exercice_id, e.libelle AS saison
         FROM adherents a LEFT JOIN exercices e ON e.id = a.exercice_id
         WHERE LOWER(TRIM(a.email)) = LOWER(TRIM(?))
         ORDER BY a.date_inscription DESC`
      ).bind(member.adherent_email).all();
      return json({ data: results || [], error: null });
    }

    // GET /api/member/preferences — préférences de notification et rôle
    // familial de l'adhérent.
    // PUT  /api/member/preferences — mise à jour (pref_email_feedback,
    // cf. migration 0020 ; family_role, cf. migration 0022). Porté par
    // adherent_comptes (identité stable) plutôt qu'adherents (une ligne par
    // saison).
    const FAMILY_ROLES = new Set(['pere', 'mere', null]);
    if (method === 'GET' && path === '/api/member/preferences') {
      const member = await getCurrentMemberFromBearer(request, env);
      if (!member) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);
      return json({
        data: {
          pref_email_feedback: Number(member.pref_email_feedback ?? 1) === 1,
          family_role: member.family_role ?? null,
        },
        error: null,
      });
    }
    if (method === 'PUT' && path === '/api/member/preferences') {
      const member = await getCurrentMemberFromBearer(request, env);
      if (!member) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);

      const body = await request.json<{ pref_email_feedback?: unknown; family_role?: unknown }>().catch(() => ({} as Record<string, unknown>));
      if (body.pref_email_feedback === undefined && body.family_role === undefined) {
        return err('Aucun réglage fourni', 400);
      }

      const updates: string[] = [];
      const values: unknown[] = [];
      const responseData: Record<string, unknown> = {};

      if (body.pref_email_feedback !== undefined) {
        const value = body.pref_email_feedback ? 1 : 0;
        updates.push('pref_email_feedback = ?');
        values.push(value);
        responseData.pref_email_feedback = value === 1;
      }
      if (body.family_role !== undefined) {
        const role = body.family_role === null || body.family_role === '' ? null : String(body.family_role);
        if (!FAMILY_ROLES.has(role)) return err('Rôle familial invalide', 400);
        updates.push('family_role = ?');
        values.push(role);
        responseData.family_role = role;
      }

      values.push(member.id);
      await env.DB.prepare(`UPDATE adherent_comptes SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

      return json({ data: responseData, error: null });
    }

    // POST /api/member/deletion-request — demande de suppression RGPD.
    // Idempotent : une demande déjà en attente est simplement renvoyée
    // plutôt que dupliquée. eligible_at est calculé une fois à la création
    // (cf. computeDeletionEligibleDate) — pas recalculé ensuite, pour que
    // la date annoncée au membre ne bouge pas sous ses pieds.
    // GET /api/member/deletion-request — statut de la demande en cours, s'il
    // y en a une.
    // DELETE /api/member/deletion-request — annulation par le membre lui-même,
    // uniquement tant qu'elle est encore 'pending' (pas déjà traitée).
    if (path === '/api/member/deletion-request') {
      const member = await getCurrentMemberFromBearer(request, env);
      if (!member) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);

      if (method === 'GET') {
        const existing = await env.DB.prepare(
          `SELECT id, requested_at, eligible_at, statut FROM deletion_requests
           WHERE adherent_compte_id = ? ORDER BY created_at DESC LIMIT 1`
        ).bind(member.id).first();
        return json({ data: existing || null, error: null });
      }

      if (method === 'POST') {
        const pending = await env.DB.prepare(
          `SELECT id, requested_at, eligible_at, statut FROM deletion_requests
           WHERE adherent_compte_id = ? AND statut = 'pending'`
        ).bind(member.id).first();
        if (pending) return json({ data: pending, error: null });

        const now = new Date().toISOString();
        const eligibleAt = await computeDeletionEligibleDate(member.adherent_email, env);
        const id = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO deletion_requests (id, adherent_compte_id, email, requested_at, eligible_at, statut, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
        ).bind(id, member.id, member.adherent_email, now, eligibleAt, now, now).run();

        return json({ data: { id, requested_at: now, eligible_at: eligibleAt, statut: 'pending' }, error: null });
      }

      if (method === 'DELETE') {
        const existing = await env.DB.prepare(
          `SELECT id, statut FROM deletion_requests WHERE adherent_compte_id = ? AND statut = 'pending'`
        ).bind(member.id).first<{ id: string; statut: string }>();
        if (!existing) return err('Aucune demande en attente à annuler', 404);
        await env.DB.prepare(
          `UPDATE deletion_requests SET statut = 'cancelled', updated_at = ? WHERE id = ?`
        ).bind(new Date().toISOString(), existing.id).run();
        return json({ data: { statut: 'cancelled' }, error: null });
      }

      return err('Méthode non supportée', 405);
    }

    // PATCH /api/member/me — l'adhérent met à jour lui-même ses coordonnées et
    // son contact d'urgence. Volontairement restreint à ces champs : nom,
    // prénom, email, statut, cotisation, certificat... restent modifiables
    // uniquement par le bureau depuis l'interface staff (perm_adherents).
    const MEMBER_EDITABLE_FIELDS = ['telephone', 'adresse', 'code_postal', 'ville', 'urgence_nom', 'urgence_telephone', 'urgence_lien'] as const;
    if (method === 'PATCH' && path === '/api/member/me') {
      const member = await getCurrentMemberFromBearer(request, env);
      if (!member) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);

      const body = await request.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
      const updates: Record<string, string | number> = {};
      for (const field of MEMBER_EDITABLE_FIELDS) {
        if (body[field] !== undefined) updates[field] = String(body[field] ?? '').trim().slice(0, 255);
      }
      // Champ booléen (consentement annuaire) : traité à part des champs
      // texte ci-dessus, sinon `true`/`false` serait tronqué en la chaîne
      // "true"/"false" plutôt que stocké comme 1/0 (colonne INTEGER).
      if (body.annuaire_visible !== undefined) updates.annuaire_visible = body.annuaire_visible ? 1 : 0;
      if (!Object.keys(updates).length) return err('Aucun champ modifiable fourni', 400);

      const setSql = Object.keys(updates).map((f) => `${f} = ?`).join(', ');
      await env.DB.prepare(`UPDATE adherents SET ${setSql} WHERE id = ?`)
        .bind(...Object.values(updates), member.adherent_id).run();

      ctx.waitUntil(writeAuditLog(env, {
        userId: null, action: 'member_update_profile', entityType: 'adherents', entityId: member.adherent_id,
        details: { fields: Object.keys(updates), memberInitiated: true }, ip: request.headers.get('CF-Connecting-IP'),
      }));

      return json({ data: { ok: true, ...updates }, error: null });
    }

    // GET /api/member/annuaire — liste (nom + prénom uniquement) des
    // adhérents ayant explicitement activé la visibilité annuaire
    // (annuaire_visible = 1, consentement distinct de droit_image — cf.
    // migration 0019). Accessible à tout membre connecté : ce n'est pas une
    // donnée administrative, donc pas de permission staff ici, juste une
    // session membre valide.
    if (method === 'GET' && path === '/api/member/annuaire') {
      const member = await getCurrentMemberFromBearer(request, env);
      if (!member) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);

      const { results } = await env.DB.prepare(
        `SELECT prenom, nom FROM adherents
         WHERE annuaire_visible = 1 AND statut = 'Actif'
         ORDER BY nom COLLATE NOCASE, prenom COLLATE NOCASE`
      ).all();
      return json({ data: results || [], error: null });
    }

    // POST /api/member/documents/certificat — l'adhérent dépose lui-même un
    // certificat médical à jour. Stocké au même endroit et sous le même
    // préfixe (adherents/{adherent_id}/...) que ce que l'équipe utilise déjà
    // depuis l'interface staff (bucket "fullfighting-pdf" = R2_PDF, permission
    // perm_adherents) : rien de nouveau à construire côté admin pour le voir.
    if (method === 'POST' && path === '/api/member/documents/certificat') {
      const member = await getCurrentMemberFromBearer(request, env);
      if (!member) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);
      if (!env.R2_PDF) return err('Stockage indisponible', 503);

      let form: FormData;
      try { form = await request.formData(); } catch { return err('Corps multipart invalide', 400); }
      const file = form.get('file');
      if (!(file instanceof File)) return err('Fichier manquant (champ "file")', 400);
      if (file.size > 10 * 1024 * 1024) return err('Fichier trop volumineux (10 Mo max)', 400);

      const dateFourni = String(form.get('date') || '').trim();
      const dateCertificat = /^\d{4}-\d{2}-\d{2}$/.test(dateFourni) ? dateFourni : new Date().toISOString().slice(0, 10);
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
      const key = `adherents/${member.adherent_id}/certificat-${Date.now()}.${ext}`;

      await env.R2_PDF.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: r2ContentType(key, file.type) } });
      await env.DB.prepare(`UPDATE adherents SET certificat = 1, certificat_date = ? WHERE id = ?`).bind(dateCertificat, member.adherent_id).run();
      ctx.waitUntil(writeAuditLog(env, {
        userId: null, action: 'member_upload_certificat', entityType: 'adherents', entityId: member.adherent_id,
        details: { key, dateCertificat, memberInitiated: true }, ip: request.headers.get('CF-Connecting-IP'),
      }));

      return json({ data: { ok: true, certificat_date: dateCertificat }, error: null }, 201);
    }

    // GET /api/member/diplomes — liste des diplômes de ceinture de l'adhérent
    // connecté (titre, ceinture, date, saison). Le chemin R2 n'est jamais
    // exposé directement : le téléchargement passe par la route suivante,
    // qui vérifie que le diplôme appartient bien à cet adhérent.
    if (method === 'GET' && path === '/api/member/diplomes') {
      const member = await getCurrentMemberFromBearer(request, env);
      if (!member) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);
      const { results } = await env.DB.prepare(
        `SELECT id, titre, ceinture, date_emission, saison, delivre_par
         FROM diplomes WHERE adherent_id = ? ORDER BY date_emission DESC`
      ).bind(member.adherent_id).all();
      return json({ data: results || [], error: null });
    }

    // GET /api/member/documents/diplome/:id — téléchargement d'un diplôme
    // précis. Réutilise le bucket R2_PDF déjà utilisé par l'admin (aucune
    // migration de fichiers nécessaire), mais avec sa propre vérification de
    // propriété (diplome.adherent_id === member.adherent_id) plutôt que la
    // permission staff perm_diplomes utilisée par /api/storage/*.
    const diplomeDocMatch = path.match(/^\/api\/member\/documents\/diplome\/([A-Za-z0-9_-]+)$/);
    if (diplomeDocMatch && method === 'GET') {
      const member = await getCurrentMemberFromBearer(request, env);
      if (!member) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);
      if (!env.R2_PDF) return err('Stockage indisponible', 503);

      const diplome = await env.DB.prepare(
        `SELECT id, adherent_id, pdf_storage_path, titre FROM diplomes WHERE id = ?`
      ).bind(diplomeDocMatch[1]).first<any>();
      if (!diplome || diplome.adherent_id !== member.adherent_id) return err('Diplôme introuvable', 404);
      if (!diplome.pdf_storage_path) return err("Ce diplôme n'a pas d'archive PDF disponible", 404);

      const object = await env.R2_PDF.get(diplome.pdf_storage_path);
      if (!object) return err('Fichier introuvable', 404);
      const safeName = String(diplome.titre || 'diplome').replace(/[^A-Za-z0-9 _-]/g, '') || 'diplome';
      return new Response(object.body, {
        headers: {
          'Content-Type': r2ContentType(diplome.pdf_storage_path, object.httpMetadata?.contentType),
          'Content-Disposition': `inline; filename="${safeName}.pdf"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    // GET /api/member/documents/notation — téléchargement de la fiche de
    // notation du membre connecté. PDF téléversé manuellement par un
    // coach/secrétaire depuis gestion (colonnes pdf_storage_path /
    // pdf_nom_fichier de `adherents` — distinctes de pdf_inscription_* et du
    // diplôme, cf. migration 0015). inline plutôt qu'attachment pour ouvrir
    // directement le PDF dans le navigateur et permettre l'impression.
    if (method === 'GET' && path === '/api/member/documents/notation') {
      const member = await getCurrentMemberFromBearer(request, env);
      if (!member) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);
      if (!env.R2_PDF) return err('Stockage indisponible', 503);
      if (!member.pdf_storage_path) return err('Aucune fiche de notation disponible pour le moment', 404);

      const object = await env.R2_PDF.get(member.pdf_storage_path);
      if (!object) return err('Fichier introuvable', 404);
      const safeName = String(member.pdf_nom_fichier || 'fiche-notation.pdf').replace(/[^A-Za-z0-9 _.-]/g, '') || 'fiche-notation.pdf';
      return new Response(object.body, {
        headers: {
          'Content-Type': r2ContentType(member.pdf_storage_path, object.httpMetadata?.contentType),
          'Content-Disposition': `inline; filename="${safeName}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    // GET /api/member/documents/bulletin — bulletin d'inscription (reçu de
    // paiement HelloAsso ou confirmation d'inscription gratuite), généré
    // automatiquement par le worker inscription-americanfullfightingbons à
    // la confirmation. Colonnes pdf_inscription_* de `adherents` — bien
    // distinctes de pdf_storage_path (fiche de notation) et de la table
    // diplomes, cf. migration 0015. Même schéma d'accès que la fiche de
    // notation : vérification de propriété implicite (member.adherent_id),
    // inline pour impression directe.
    if (method === 'GET' && path === '/api/member/documents/bulletin') {
      const member = await getCurrentMemberFromBearer(request, env);
      if (!member) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);
      if (!env.R2_PDF) return err('Stockage indisponible', 503);
      if (!member.pdf_inscription_storage_path) return err("Aucun bulletin d'inscription disponible pour le moment", 404);

      const object = await env.R2_PDF.get(member.pdf_inscription_storage_path);
      if (!object) return err('Fichier introuvable', 404);
      const safeName = String(member.pdf_inscription_nom_fichier || 'bulletin-inscription.pdf').replace(/[^A-Za-z0-9 _.-]/g, '') || 'bulletin-inscription.pdf';
      return new Response(object.body, {
        headers: {
          'Content-Type': r2ContentType(member.pdf_inscription_storage_path, object.httpMetadata?.contentType),
          'Content-Disposition': `inline; filename="${safeName}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    // GET /api/member/documents/attestation-cotisation — attestation de
    // cotisation générée à la volée (PDF texte simple, cf. generateSimplePdf
    // ci-dessus) à partir des données déjà en base, aucun fichier à stocker
    // ni à téléverser manuellement contrairement à /notation et /bulletin.
    // Ne délivre l'attestation que si la cotisation est effectivement à
    // jour, pour ne pas produire un document trompeur.
    if (method === 'GET' && path === '/api/member/documents/attestation-cotisation') {
      const member = await getCurrentMemberFromBearer(request, env);
      if (!member) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);

      const paiement = String(member.paiement || '').toLowerCase();
      const paiementOk = paiement.includes('pay') || paiement.includes('sold');
      if (!paiementOk) {
        return err("Aucune cotisation à jour ne permet de générer une attestation pour le moment", 404);
      }

      const nomComplet = `${member.prenom || ''} ${member.nom || ''}`.trim() || 'Adhérent·e';
      const montant = member.cotisation != null && member.cotisation !== ''
        ? `${Number(member.cotisation).toFixed(2)} €` : null;
      const dateInscription = member.date_inscription
        ? new Date(member.date_inscription).toLocaleDateString('fr-FR') : null;
      const dateFin = member.date_fin_adhesion
        ? new Date(member.date_fin_adhesion).toLocaleDateString('fr-FR') : null;
      const aujourdhui = new Date().toLocaleDateString('fr-FR');

      const lines = [
        'Nous soussignés attestons que :',
        '',
        nomComplet,
        'est adhérent(e) du club American Full Fighting Bons en Chablais,',
        `à jour de sa cotisation${montant ? ' d\u2019un montant de ' + montant : ''}${dateInscription ? ', inscription du ' + dateInscription : ''}${dateFin ? ' au ' + dateFin : ''}.`,
        '',
        `Attestation délivrée le ${aujourdhui} pour valoir ce que de droit.`,
      ];

      const pdfBytes = generateSimplePdf({
        title: 'Attestation de cotisation \u2014 AFFBC',
        lines,
        footer: 'AFFBC \u2014 Document généré automatiquement, ne nécessite pas de signature.',
      });

      return new Response(pdfBytes, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline; filename="attestation-cotisation.pdf"',
          'Cache-Control': 'private, no-store',
        },
      });
    }

    // POST /api/member/logout
    if (method === 'POST' && path === '/api/member/logout') {
      return json({ data: { ok: true }, error: null }, 200, { 'Set-Cookie': clearMemberSessionCookie(request) });
    }

    // POST /api/member/password/forgot — { email } — même logique anti-énumération
    // que activation/request, mais uniquement pour un compte déjà activé.
    if (method === 'POST' && path === '/api/member/password/forgot') {
      if (!(await checkAuthRateLimit(requestIp(request), env))) {
        return err('Trop de tentatives. Réessayez dans quelques minutes.', 429);
      }
      const body = await request.json<{ email?: string }>().catch(() => ({} as { email?: string }));
      const email = String(body?.email || '').trim().toLowerCase();
      const generic = { data: { ok: true, message: 'Si un compte existe pour cet e-mail, un lien de réinitialisation vient de lui être envoyé.' }, error: null };
      if (!email) return json(generic);

      const compte = await env.DB.prepare(`SELECT * FROM adherent_comptes WHERE LOWER(TRIM(email)) = ? AND mot_de_passe IS NOT NULL`).bind(email).first<any>();
      if (!compte) return json(generic);

      const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
      const expiresAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
      await env.DB.prepare(`UPDATE adherent_comptes SET reset_token=?, reset_expires_at=? WHERE id=?`).bind(token, expiresAt, compte.id).run();

      const portalUrl = env.MEMBER_PORTAL_URL || 'https://espace-membre.americanfullfightingbons.fr';
      const link = `${portalUrl}/reinitialiser?token=${token}`;
      await sendBrevoEmail(env, {
        to: [{ email: compte.email }],
        subject: 'Réinitialisation de votre mot de passe — Espace membre AFFBC',
        html: `<p>Vous pouvez choisir un nouveau mot de passe en suivant ce lien (valable 2h) :</p><p><a href="${link}">${link}</a></p><p>Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message : votre mot de passe actuel reste inchangé.</p>`,
      }).catch((e) => console.error('[member:reset:email]', e));

      return json(generic);
    }

    // POST /api/member/password/reset — { token, password }
    if (method === 'POST' && path === '/api/member/password/reset') {
      if (!(await checkAuthRateLimit(requestIp(request), env))) {
        return err('Trop de tentatives. Réessayez dans quelques minutes.', 429);
      }
      const body = await request.json<{ token?: string; password?: string }>().catch(() => ({} as { token?: string; password?: string }));
      const token = String(body?.token || '').trim();
      if (!token) return err('Jeton manquant', 400);
      if (!body?.password || String(body.password).length < 8) {
        return err('Le mot de passe doit faire au moins 8 caractères', 400);
      }
      const compte = await env.DB.prepare(`SELECT * FROM adherent_comptes WHERE reset_token = ?`).bind(token).first<any>();
      if (!compte || !compte.reset_expires_at || new Date(compte.reset_expires_at).getTime() < Date.now()) {
        return err('Lien invalide ou expiré, merci de refaire une demande', 400);
      }
      const hash = await hashPassword(body.password, env as any, 'pbkdf2_sha256', 100000);
      const now = new Date().toISOString();
      // password_changed_at change ⇒ le pwdStamp de toute session déjà émise
      // (y compris volée) ne correspond plus : déconnexion globale immédiate.
      await env.DB.prepare(
        `UPDATE adherent_comptes SET mot_de_passe=?, password_changed_at=?, reset_token=NULL, reset_expires_at=NULL WHERE id=?`
      ).bind(hash, now, compte.id).run();
      return json({ data: { ok: true }, error: null }, 200, { 'Set-Cookie': clearMemberSessionCookie(request) });
    }

    // POST /api/member/password/change — changement de mot de passe pour un
    // adhérent déjà connecté (à la différence de password/reset, qui repose
    // sur un jeton reçu par e-mail). password_changed_at est mis à jour, ce
    // qui invalide immédiatement toute autre session ouverte (même logique
    // que /api/auth/password côté staff).
    if (method === 'POST' && path === '/api/member/password/change') {
      const member = await getCurrentMemberFromBearer(request, env);
      if (!member) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);

      const body = await request.json<{ currentPassword?: string; nextPassword?: string }>().catch(() => ({} as any));
      if (!body?.currentPassword || !body?.nextPassword) {
        return err('currentPassword et nextPassword sont requis', 400);
      }
      if (String(body.nextPassword).length < 8) {
        return err('Le nouveau mot de passe doit faire au moins 8 caractères', 400);
      }

      const check = await verifyPassword(body.currentPassword, member.mot_de_passe, env as any, 'pbkdf2_sha256', 100000, /^[a-f0-9]{64}$/i);
      if (!check.valid) return err('Mot de passe actuel incorrect', 401);

      const newHash = await hashPassword(body.nextPassword, env as any, 'pbkdf2_sha256', 100000);
      const changedAt = new Date().toISOString();
      await env.DB.prepare(`UPDATE adherent_comptes SET mot_de_passe=?, password_changed_at=? WHERE id=?`)
        .bind(newHash, changedAt, member.id).run();

      const maxAgeSeconds = MEMBER_TOKEN_TTL_SEC;
      const sessionToken = await createSessionToken(
        { kind: 'member', adherentCompteId: member.id, email: member.adherent_email, expiresAt: Date.now() + maxAgeSeconds * 1000, pwdStamp: changedAt },
        env as any,
      );
      return json(
        { data: { ok: true, token: sessionToken, expiresAt: Date.now() + maxAgeSeconds * 1000 }, error: null },
        200,
        { 'Set-Cookie': buildMemberSessionCookie(request, sessionToken, maxAgeSeconds) },
      );
    }

    // ── Multi-comptes / parent-enfant ───────────────────────────────────────
    // GET /api/member/profiles — liste les profils que le compte connecté
    // peut consulter : lui-même, plus tout adhérent dont il est le tuteur
    // (adherents.guardian_compte_id, migration 0021). Un adhérent peut avoir
    // plusieurs lignes (une par saison, cf. réinscription) : on ne garde que
    // la plus récente par email pour ne pas lister le même enfant deux fois.
    if (method === 'GET' && path === '/api/member/profiles') {
      const member = await getCurrentMemberFromBearer(request, env);
      if (!member) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);

      const [ownRecord, childrenResult, dureeMois] = await Promise.all([
        loadMemberRecord(member.id, undefined, env),
        env.DB.prepare(
          `SELECT id, nom, prenom, statut, couleur_ceinture, paiement, certificat_date
           FROM adherents a
           WHERE guardian_compte_id = ?
             AND date_inscription = (
               SELECT MAX(date_inscription) FROM adherents a2
               WHERE a2.email = a.email AND a2.guardian_compte_id = ?
             )
           ORDER BY prenom COLLATE NOCASE, nom COLLATE NOCASE`
        ).bind(member.id, member.id).all<Record<string, any>>(),
        getCertificatDureeMois(env),
      ]);

      // Vue famille : même calcul de date d'expiration que memberProfilePayload
      // (dureeMois récupéré une seule fois, réutilisé pour chaque profil), pour
      // que le sélecteur de profils puisse afficher un badge par enfant sans
      // que le front n'ait à deviner la règle de calcul.
      const certificatExpireLe = (certificatDate: string | null | undefined): string | null => {
        if (!certificatDate) return null;
        const d = new Date(certificatDate);
        if (isNaN(d.getTime())) return null;
        d.setMonth(d.getMonth() + dureeMois);
        return d.toISOString().slice(0, 10);
      };

      const profiles = [
        ...(ownRecord ? [{
          id: ownRecord.loginAdherentId, nom: ownRecord.nom, prenom: ownRecord.prenom,
          statut: ownRecord.statut, couleur_ceinture: ownRecord.couleur_ceinture, isSelf: true,
          paiement: ownRecord.paiement, certificat_expire_le: certificatExpireLe(ownRecord.certificat_date),
          family_role: ownRecord.family_role ?? null,
        }] : []),
        ...((childrenResult.results || []).map((r) => ({
          ...r, isSelf: false, certificat_expire_le: certificatExpireLe(r.certificat_date),
        }))),
      ];

      return json({ data: { profiles, activeAdherentId: member.adherent_id }, error: null });
    }

    // POST /api/member/profiles/switch — { adherentId } — bascule le profil
    // actif de la session courante vers son propre profil ou celui d'un
    // enfant sous tutelle. Réémet un jeton (comme password/change) plutôt que
    // de modifier une session stockée côté serveur : ce Worker n'a pas de
    // notion de session révocable individuellement en dehors du pwdStamp, un
    // nouveau jeton signé est donc le mécanisme normal ici.
    if (method === 'POST' && path === '/api/member/profiles/switch') {
      const member = await getCurrentMemberFromBearer(request, env);
      if (!member) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);

      const body = await request.json<{ adherentId?: string }>().catch(() => ({} as { adherentId?: string }));
      const targetId = String(body?.adherentId || '').trim();
      if (!targetId) return err('adherentId manquant', 400);

      const isSelf = targetId === member.loginAdherentId;
      if (!isSelf) {
        const guarded = await env.DB.prepare(
          `SELECT id FROM adherents WHERE id = ? AND guardian_compte_id = ?`
        ).bind(targetId, member.id).first<any>();
        if (!guarded) return err('Profil introuvable ou non autorisé', 403);
      }

      const target = await loadMemberRecord(member.id, isSelf ? undefined : targetId, env);
      if (!target) return err('Profil introuvable', 404);

      const maxAgeSeconds = MEMBER_TOKEN_TTL_SEC;
      const sessionToken = await createSessionToken(
        {
          kind: 'member', adherentCompteId: member.id, email: member.email,
          expiresAt: Date.now() + maxAgeSeconds * 1000, pwdStamp: member.password_changed_at || '',
          ...(isSelf ? {} : { activeAdherentId: targetId }),
        },
        env as any,
      );

      return json(
        {
          data: {
            ok: true, token: sessionToken, expiresAt: Date.now() + maxAgeSeconds * 1000,
            me: await memberProfilePayload(target, env),
          },
          error: null,
        },
        200,
        { 'Set-Cookie': buildMemberSessionCookie(request, sessionToken, maxAgeSeconds) },
      );
    }

    // GET /api/adherents/:id/guardian-suggestions — candidats de liaison
    // familiale suggérés par correspondance de nom de famille (staff,
    // perm_adherents en lecture). Volontairement une SUGGESTION à confirmer
    // en un clic par le staff, jamais une liaison automatique : un nom de
    // famille partagé (ex. "Martin") ne prouve rien, et lier à tort donnerait
    // à un compte la visibilité sur les données d'un mineur (certificat
    // médical, coordonnées...) qui n'est pas le sien. Le nom seul ne suffit
    // pas à autoriser, seulement à faire gagner du temps de recherche.
    const guardianSuggestionsMatch = path.match(/^\/api\/adherents\/([^/]+)\/guardian-suggestions$/);
    if (method === 'GET' && guardianSuggestionsMatch) {
      const user = await getCurrentUserFromBearer(request, env);
      if (!user) return err('Unauthorized', 401);
      const rolePerms = await getRolePerms(env);
      if (!dbHasPermission(user, 'perm_adherents', 'read', rolePerms)) return err('Permission refusée', 403);

      const adherentId = guardianSuggestionsMatch[1];
      const adherent = await env.DB.prepare(`SELECT id, nom, guardian_compte_id FROM adherents WHERE id = ?`)
        .bind(adherentId).first<any>();
      if (!adherent) return err('Adhérent introuvable', 404);

      const [current, suggestions] = await Promise.all([
        adherent.guardian_compte_id
          ? env.DB.prepare(
              `SELECT ac.id AS compteId, ac.email, a.nom, a.prenom
               FROM adherent_comptes ac JOIN adherents a ON a.id = ac.adherent_id
               WHERE ac.id = ?`
            ).bind(adherent.guardian_compte_id).first<any>()
          : Promise.resolve(null),
        env.DB.prepare(
          `SELECT ac.id AS compteId, ac.email, a.nom, a.prenom
           FROM adherent_comptes ac
           JOIN adherents a ON a.id = ac.adherent_id
           WHERE LOWER(TRIM(a.nom)) = LOWER(TRIM(?))
             AND ac.adherent_id != ?
             AND (ac.id != ? OR ? IS NULL)`
        ).bind(adherent.nom, adherentId, adherent.guardian_compte_id, adherent.guardian_compte_id).all(),
      ]);

      return json({ data: { current: current || null, suggestions: suggestions.results || [] }, error: null });
    }

    // POST /api/adherents/:id/guardian — pose ou retire un lien de tutelle
    // (staff, perm_adherents en écriture). { guardianEmail: string | null } —
    // résout l'email vers un compte espace-membre existant (peu importe qu'il
    // soit déjà activé) et pose adherents.guardian_compte_id ; null/absent
    // délie. Volontairement staff-only : ni l'adhérent ni le futur tuteur ne
    // peuvent s'auto-attribuer cet accès.
    const guardianRouteMatch = path.match(/^\/api\/adherents\/([^/]+)\/guardian$/);
    if (method === 'POST' && guardianRouteMatch) {
      const user = await getCurrentUserFromBearer(request, env);
      if (!user) return err('Unauthorized', 401);
      const rolePerms = await getRolePerms(env);
      if (!dbHasPermission(user, 'perm_adherents', 'write', rolePerms)) return err('Permission refusée', 403);

      const adherentId = guardianRouteMatch[1];
      const adherent = await env.DB.prepare(`SELECT id FROM adherents WHERE id = ?`).bind(adherentId).first<any>();
      if (!adherent) return err('Adhérent introuvable', 404);

      const body = await request.json<{ guardianEmail?: string | null }>().catch(() => ({} as { guardianEmail?: string | null }));
      const guardianEmail = body?.guardianEmail ? String(body.guardianEmail).trim().toLowerCase() : '';

      let guardianCompteId: string | null = null;
      if (guardianEmail) {
        const guardianCompte = await env.DB.prepare(
          `SELECT id, adherent_id FROM adherent_comptes WHERE LOWER(TRIM(email)) = ?`
        ).bind(guardianEmail).first<any>();
        if (!guardianCompte) return err("Aucun compte espace-membre n'existe pour cet e-mail", 404);
        if (guardianCompte.adherent_id === adherentId) return err('Un adhérent ne peut pas être son propre tuteur', 400);
        guardianCompteId = guardianCompte.id;
      }

      await env.DB.prepare(`UPDATE adherents SET guardian_compte_id = ? WHERE id = ?`).bind(guardianCompteId, adherentId).run();
      ctx.waitUntil(writeAuditLog(env, {
        userId: user.id, action: guardianCompteId ? 'adherent_guardian_link' : 'adherent_guardian_unlink',
        entityType: 'adherents', entityId: adherentId,
        details: { guardianCompteId }, ip: request.headers.get('CF-Connecting-IP'),
      }));

      return json({ data: { ok: true, guardianCompteId }, error: null });
    }

    // POST /api/deletion-requests/:id/execute — exécute l'anonymisation
    // (staff, perm_administration en écriture — action irréversible, on la
    // réserve volontairement à un niveau d'habilitation plus restreint que
    // perm_adherents). Refuse si le délai de conservation n'est pas encore
    // écoulé : eligible_at n'est jamais court-circuité depuis l'admin, même
    // par un administrateur — le seul moyen de supprimer plus tôt est de
    // changer la donnée source (date_fin_adhesion) et attendre le
    // recalcul, pas de bypasser la vérification ici.
    const deletionExecuteMatch = path.match(/^\/api\/deletion-requests\/([^/]+)\/execute$/);
    if (method === 'POST' && deletionExecuteMatch) {
      const user = await getCurrentUserFromBearer(request, env);
      if (!user) return err('Unauthorized', 401);
      const rolePerms = await getRolePerms(env);
      if (!dbHasPermission(user, 'perm_administration', 'write', rolePerms)) return err('Permission refusée', 403);

      const reqId = deletionExecuteMatch[1];
      const reqRow = await env.DB.prepare(`SELECT * FROM deletion_requests WHERE id = ?`).bind(reqId).first<any>();
      if (!reqRow) return err('Demande introuvable', 404);
      if (reqRow.statut !== 'pending') return err(`Cette demande est déjà '${reqRow.statut}'`, 400);
      if (new Date(reqRow.eligible_at).getTime() > Date.now()) {
        return err(`Délai de conservation non écoulé (éligible le ${reqRow.eligible_at})`, 400);
      }

      await anonymizeAdherentData(reqRow.adherent_compte_id, reqRow.email, env);

      const now = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE deletion_requests SET statut = 'done', processed_at = ?, processed_by = ?, updated_at = ? WHERE id = ?`
      ).bind(now, user.id, now, reqId).run();

      ctx.waitUntil(writeAuditLog(env, {
        userId: user.id, action: 'deletion_request_executed',
        entityType: 'deletion_requests', entityId: reqId,
        details: { adherentCompteId: reqRow.adherent_compte_id }, ip: request.headers.get('CF-Connecting-IP'),
      }));

      return json({ data: { ok: true }, error: null });
    }

    // POST /api/deletion-requests/:id/reject — refuse une demande (staff,
    // perm_administration en écriture), ex. litige en cours. { notes }
    // conservé pour justifier le refus si le membre revient dessus.
    const deletionRejectMatch = path.match(/^\/api\/deletion-requests\/([^/]+)\/reject$/);
    if (method === 'POST' && deletionRejectMatch) {
      const user = await getCurrentUserFromBearer(request, env);
      if (!user) return err('Unauthorized', 401);
      const rolePerms = await getRolePerms(env);
      if (!dbHasPermission(user, 'perm_administration', 'write', rolePerms)) return err('Permission refusée', 403);

      const reqId = deletionRejectMatch[1];
      const body = await request.json<{ notes?: string }>().catch(() => ({} as { notes?: string }));
      const reqRow = await env.DB.prepare(`SELECT id, statut FROM deletion_requests WHERE id = ?`).bind(reqId).first<any>();
      if (!reqRow) return err('Demande introuvable', 404);
      if (reqRow.statut !== 'pending') return err(`Cette demande est déjà '${reqRow.statut}'`, 400);

      const now = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE deletion_requests SET statut = 'rejected', staff_notes = ?, processed_at = ?, processed_by = ?, updated_at = ? WHERE id = ?`
      ).bind(body.notes || null, now, user.id, now, reqId).run();

      return json({ data: { ok: true }, error: null });
    }

    // ── Messagerie / contact rapide avec le bureau ──────────────────────────
    // POST /api/member/contact — { subject, message } — envoie un email au
    // bureau (club_info.email) via Brevo, sans jamais exposer cette adresse
    // au membre côté client. Reply-To posé sur l'adhérent : le bureau peut
    // répondre directement depuis sa messagerie. Anti-abus léger (5
    // messages/heure/compte, cf. migration 0021) : un formulaire authentifié
    // reste une cible de spam possible vers l'adresse du club.
    if (method === 'POST' && path === '/api/member/contact') {
      const member = await getCurrentMemberFromBearer(request, env);
      if (!member) return json({ data: null, error: { message: 'Session invalide ou expirée' } }, 401);

      const body = await request.json<{ subject?: string; message?: string }>().catch(() => ({} as { subject?: string; message?: string }));
      const subject = String(body?.subject || '').trim().slice(0, 150);
      const message = String(body?.message || '').trim().slice(0, 4000);
      if (!subject || !message) return err('Objet et message sont requis', 400);

      const windowStart = new Date(Date.now() - 3600 * 1000).toISOString();
      const recent = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM contact_messages WHERE adherent_compte_id = ? AND created_at >= ?`
      ).bind(member.id, windowStart).first<{ n: number }>();
      if (Number(recent?.n || 0) >= 5) {
        return err('Trop de messages envoyés récemment. Réessayez plus tard.', 429);
      }

      const clubRow = await env.DB.prepare(`SELECT valeur FROM club_info WHERE cle = 'email'`).first<{ valeur: string }>();
      const clubEmail = String(clubRow?.valeur || '').trim();
      if (!clubEmail) return err("Aucune adresse de contact n'est configurée pour le club.", 503);

      const senderName = `${member.prenom || ''} ${member.nom || ''}`.trim() || 'Adhérent AFFBC';
      const html = `
        <p>Nouveau message depuis l'espace membre.</p>
        <p><b>De :</b> ${escapeHtmlLite(senderName)} (${escapeHtmlLite(member.adherent_email || '')})</p>
        <p><b>Objet :</b> ${escapeHtmlLite(subject)}</p>
        <p style="white-space:pre-wrap">${escapeHtmlLite(message)}</p>`;

      const result = await sendBrevoEmail(env, {
        to: [{ email: clubEmail }],
        subject: `[Espace membre] ${subject}`,
        html,
        replyTo: member.adherent_email ? { email: member.adherent_email, name: senderName } : undefined,
      });
      if (!result.ok) {
        console.error('[member:contact:email]', result.error);
        return err('Envoi impossible pour le moment, réessayez plus tard.', 502);
      }

      await env.DB.prepare(
        `INSERT INTO contact_messages (id, adherent_compte_id, subject, created_at) VALUES (?, ?, ?, datetime('now'))`
      ).bind(crypto.randomUUID(), member.id, subject).run();

      return json({ data: { ok: true }, error: null }, 201);
    }

    // POST /api/feedback/trigger-season — relance manuelle complète (re-scan
    // des adhérents + envoi) pour un exercice donné. Voir le commentaire de
    // handleTriggerSeasonFeedback ci-dessus.
    if (method === 'POST' && path === '/api/feedback/trigger-season') {
      return await handleTriggerSeasonFeedback(request, env, ctx, url.origin);
    }

    // POST /api/feedback/send-pending — envoi manuel (admin) des invitations
    // en attente d'une campagne (recipients ajoutés à la main, envoye=0).
    // L'envoi automatique à la clôture d'exercice passe lui par
    // triggerEndOfSeasonFeedback(), déclenché depuis handleDbApi.
    if (method === 'POST' && path === '/api/feedback/send-pending') {
      return await handleSendPendingInvites(request, env, url.origin);
    }

    // POST /api/feedback/send-reminder — relance les destinataires qui ont
    // reçu l'invitation (envoye=1) mais n'ont pas encore répondu (repondu=0).
    if (method === 'POST' && path === '/api/feedback/send-reminder') {
      return await handleSendReminder(request, env, url.origin);
    }

    // POST /api/email/send — envoi d'email transactionnel via Brevo.
    // Utilisé pour : envoi de diplôme, relance de paiement, envoi de facture.
    if (method === 'POST' && path === '/api/email/send') {
      const user = await getCurrentUserFromBearer(request, env);
      if (!user) return err('Unauthorized', 401);

      if (!env.BREVO_API_KEY) {
        return err('Service email non configuré (BREVO_API_KEY manquant)', 503);
      }

      const body = await request.json<{
        to: Array<{ email: string; name?: string }>;
        subject: string;
        html: string;
        attachments?: Array<{ name: string; content: string; type?: string }>;
      }>();

      if (!body?.to?.length || !body.subject || !body.html) {
        return err('Champs requis : to (tableau), subject, html', 400);
      }

      const fromEmail = env.BREVO_FROM_EMAIL || 'noreply@americanfullfightingbons.fr';
      const fromName  = env.BREVO_FROM_NAME  || 'AFFBC — Gestion du club';

      const brevoPayload: Record<string, unknown> = {
        sender:      { email: fromEmail, name: fromName },
        to:          body.to,
        subject:     body.subject,
        htmlContent: body.html,
      };
      if (body.attachments?.length) {
        brevoPayload.attachment = body.attachments.map((a) => ({
          name:    a.name,
          content: a.content,  // base64
          type:    a.type || 'application/octet-stream',
        }));
      }

      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key':      env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(brevoPayload),
      });

      if (!brevoRes.ok) {
        const detail = await brevoRes.text().catch(() => '');
        console.error('[email/send] Brevo error', brevoRes.status, detail);
        return err(`Échec envoi email (Brevo ${brevoRes.status})`, 502);
      }
      return json({ data: { ok: true }, error: null });
    }

    // POST /api/admin/restore — restauration complète de la base depuis un export JSON.
    // OPÉRATION DESTRUCTIVE : protégée par le mot de passe admin en plus du token Bearer.
    // Le frontend envoie { confirmText, adherents:[], achats:[], ... }.
    if (method === 'POST' && path === '/api/admin/restore') {
      const user = await getCurrentUserFromBearer(request, env);
      if (!user) return err('Unauthorized', 401);
      if (String(user.role || '') !== 'admin') return err('Réservé aux administrateurs', 403);

      const body = await request.json<Record<string, unknown>>();
      if (String(body?.confirmText || '').trim().toUpperCase() !== 'RESTAURER') {
        return err('Confirmation invalide (attendu : RESTAURER)', 400);
      }

      // Vérification mot de passe admin en plus du Bearer
      const adminPwd = String(body?.adminPassword || '');
      if (!adminPwd) return err('adminPassword requis pour la restauration', 400);
      const encoder = new TextEncoder();
      const a = encoder.encode(adminPwd);
      const b = encoder.encode(env.ADMIN_PASSWORD);
      let same = a.length === b.length;
      for (let i = 0; i < Math.min(a.length, b.length); i++) { if (a[i] !== b[i]) same = false; }
      if (!same) return err('Mot de passe admin incorrect', 401);

      // Tables restaurables (dans l'ordre pour respecter les FK)
      const RESTORE_ORDER: string[] = [
        'exercices', 'adherents', 'comptes_bancaires', 'transactions',
        'journal_comptable', 'achats', 'factures', 'diplomes',
        'feedback_campaigns', 'feedback_recipients', 'feedback_responses',
        'inscriptions_publiques', 'club_info', 'deletion_requests',
      ];

      for (const table of RESTORE_ORDER) {
        const rows = body[table];
        if (!Array.isArray(rows) || !rows.length) continue;
        if (!DB_TABLES.has(table)) continue;

        // Vide la table puis réinsère
        await env.DB.prepare(`DELETE FROM ${dbQuoteIdentifier(table)}`).run();

        for (const row of rows as Record<string, unknown>[]) {
          const cols = Object.keys(row);
          if (!cols.length) continue;
          const colsSql = cols.map(dbQuoteIdentifier).join(', ');
          const placeholders = cols.map(() => '?').join(', ');
          const values = cols.map((c) => dbNormalizeValue(row[c]));
          await env.DB
            .prepare(`INSERT OR IGNORE INTO ${dbQuoteIdentifier(table)} (${colsSql}) VALUES (${placeholders})`)
            .bind(...values)
            .run();
        }
      }

      return json({ data: { ok: true }, error: null });
    }

    // POST /api/admin/logout  (sessions admin legacy — clé UUID stockée en base)
    // POST /api/auth/logout   (sessions utilisateur — JWT HMAC ; on les place en liste noire
    //                          en réutilisant la table admin_sessions avec type='jwt')
    if (method === 'POST' && (path === '/api/admin/logout' || path === '/api/auth/logout')) {
      const token = getSessionToken(request);
      if (token) {
        // On tente de supprimer le token s'il était stocké (sessions admin UUID),
        // ET on l'inscrit en liste noire pour invalider les JWT signés avant expiration.
        await env.DB
          .prepare(`DELETE FROM admin_sessions WHERE token = ?`)
          .bind(token)
          .run();
        // Insère le token en liste noire (type jwt) avec une expiration = maintenant + 25h
        // pour couvrir la durée de vie maximale d'un token (24h + marge).
        const blacklistExpiry = new Date(Date.now() + 25 * 3600 * 1000).toISOString();
        await env.DB
          .prepare(`INSERT OR IGNORE INTO admin_sessions (token, expires_at, created_at) VALUES (?, ?, datetime('now'))`)
          .bind(`__revoked__${token}`, blacklistExpiry)
          .run();
      }
      // Purge des entrées expirées
      await env.DB
        .prepare(`DELETE FROM admin_sessions WHERE expires_at < datetime('now')`)
        .run();
      return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(request) });
    }

     // ── Santé ─────────────────────────────────────────────────────────────

   if (method === 'GET' && path === '/api/health') {
    return json({
        ok: true,
        ts: new Date().toISOString(),
        data: {
            bindings: {
                hasDb: !!env.DB
            }
        }
    });
}

   if (method === 'GET' && path === '/api/version') {
    return json({
        ok: true,
        data: {
            service: 'gestion-americanfullfightingbons',
            version: '1.0.0',
        }
    });
}
    // ── Routes protégées ──────────────────────────────────────────────────

    // Toutes les routes /api/* (sauf login/logout) nécessitent un token
    const publicApiRoutes = new Set([
  "/api/admin/login",
  "/api/admin/reset-password",
  "/api/admin/logout",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/health",
  "/api/version",
  "/api/member/activation/request",
  "/api/member/activation/confirm",
  "/api/member/login",
  "/api/member/logout",
  "/api/member/me",
  "/api/member/dashboard",
  "/api/member/documents/certificat",
  "/api/member/password/forgot",
  "/api/member/password/reset",
  "/api/member/password/change",
  "/api/member/diplomes",
  "/api/member/annuaire",
  "/api/member/cotisations",
  "/api/member/preferences",
  "/api/member/documents/notation",
  "/api/member/documents/bulletin",
  "/api/member/documents/attestation-cotisation",
  "/api/member/deletion-request",
  "/api/member/profiles",
  "/api/member/profiles/switch",
  "/api/member/contact",
  "/api/internal/sales/sync/boutique",
]);

if (path.startsWith("/api/") && !publicApiRoutes.has(path)) {
    const authed = await requireAuth(request, env);
    if (!authed) {
        return err("Non autorisé", 401);
    }
}

    // POST /api/internal/sales/sync/boutique — appelé par le worker boutique
    // (jamais par un navigateur) juste après confirmation d'un paiement
    // HelloAsso, pour enregistrer la vente dans la comptabilité (facture +
    // journal). Protégé par secret partagé, pas par le cookie/token staff.
    if (method === 'POST' && path === '/api/internal/sales/sync/boutique') {
        return handleBoutiqueSalesSync(request, env);
    }

    // POST /api/admin/certificats/verifier — déclenche manuellement la même
    // vérification que le cron quotidien (utile pour tester ou forcer un envoi
    // sans attendre l'exécution planifiée).
    if (method === 'POST' && path === '/api/admin/certificats/verifier') {
        const result = await checkCertificatsExpirants(env);
        return json({ data: result, error: null });
    }

    // NOTE : les anciennes routes /api/sync/*, /api/membres*, /api/compta
    // (legacy) et /api/ventes* ont été retirées le 2026-06-27 : elles
    // interrogeaient des tables (membres, ventes_inscription, sync_log,
    // ecritures_compta) issues d'un schéma jamais appliqué en production
    // (migrations/0002_inscription_sync.sql, non reflété dans le D1 réel ni
    // dans le README). Aucune route du frontend actuel ne les appelait ; elles
    // auraient échoué en 500 ("no such table") au premier appel. Le vrai
    // modèle de données (adhérents, comptabilité via journal_comptable, etc.)
    // passe par /api/db/:table, déjà branché plus haut.

    // NOTE : /api/inscriptions-en-attente a été retirée le 2026-06-27, pour
    // la même raison (table "inscriptions" inexistante ; binding AFFBC_DB
    // pointant d'ailleurs vers le même database_id que DB, donc vers
    // affbc-production, pas vers une base distincte du worker inscription).
    // La donnée correspondante côté gestion est inscriptions_publiques,
    // déjà exposée via /api/db/inscriptions_publiques.

    // ── Fallback : servir le front-office HTML ────────────────────────────
    // (le fichier index.html est servi via env.ASSETS si configuré,
    //  sinon on renvoie une réponse minimale)
   if (env.ASSETS) {
  return env.ASSETS.fetch(request);
}

return new Response('Not Found', { status: 404 });
}

/**
 * En-têtes de sécurité HTTP appliqués à TOUTE réponse (API, assets statiques,
 * erreurs). Jusqu'ici ce Worker n'en envoyait aucun, contrairement aux
 * autres Workers du projet (boutique/calendrier/inscription en ont déjà
 * une partie) — défense en profondeur, notamment utile en complément de
 * l'échappement HTML appliqué côté front (public/assets/app.js).
 */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // 'unsafe-inline' nécessaire : le front (public/assets/app.js) utilise des
  // attributs onclick/oninput inline de façon massive (pas de build/CSP nonce).
  // Le CSP protège malgré tout contre le chargement de scripts/styles externes
  // et restreint connect-src, ce qui limite l'exfiltration de données même en
  // cas d'injection HTML qui aurait échappé à l'échappement applicatif.
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; " +
    "base-uri 'self'; form-action 'self'",
};

// Origines de confiance de l'écosystème AFFBC pouvant appeler cette API en
// cross-origin. Nécessaire depuis l'espace membre (sous-domaine séparé) : les
// routes /api/member/* sont appelées par espace-membre.* avec un jeton dans
// l'en-tête Authorization, jamais par cookie, donc pas de risque CSRF à
// autoriser ces origines précises — mais on garde une liste explicite plutôt
// qu'un miroir aveugle de l'en-tête Origin, pour ne jamais élargir l'accès
// à un domaine non prévu.
const TRUSTED_ORIGINS = new Set([
  'https://americanfullfightingbons.fr',
  'https://www.americanfullfightingbons.fr',
  'https://boutique.americanfullfightingbons.fr',
  'https://calendrier.americanfullfightingbons.fr',
  'https://inscription.americanfullfightingbons.fr',
  'https://espace-membre.americanfullfightingbons.fr',
  'https://gestion.americanfullfightingbons.fr',
]);

function corsOriginFor(request: Request): string | null {
  const origin = request.headers.get('Origin');
  if (origin && TRUSTED_ORIGINS.has(origin)) return origin;
  return null;
}

function withSecurityHeaders(response: Response, request?: Request): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  // CORS : ce Worker n'a aucun consommateur cross-origin légitime (le front est
  // servi par ce même Worker via ASSETS) — on remplace ici, en un point unique,
  // tout 'Access-Control-Allow-Origin: *' posé plus bas (ex. json(), OPTIONS)
  // par l'origine réelle de la requête entrante. Combiné aux cookies de session
  // (voir requireAuth), un wildcard laisserait n'importe quel site tiers lire
  // les réponses d'un utilisateur connecté.
  // CORS : la grande majorité des routes n'ont aucun consommateur cross-origin
  // légitime (le front staff est servi par ce même Worker via ASSETS), mais
  // /api/member/* est désormais appelée depuis espace-membre.* — un vrai
  // sous-domaine distinct. On échote donc l'en-tête Origin réel de la requête
  // (et non request.url, qui n'est que l'adresse de CE Worker et ne reflète
  // jamais l'origine de l'appelant : c'était un bug, silencieux jusqu'ici
  // faute de vrai appelant cross-origin), uniquement s'il figure dans
  // TRUSTED_ORIGINS. Sinon, aucun en-tête CORS n'est posé : le navigateur
  // bloque par défaut, ce qui est le comportement sûr pour une origine inconnue.
  if (request) {
    const allowedOrigin = corsOriginFor(request);
    if (allowedOrigin) {
      headers.set('Access-Control-Allow-Origin', allowedOrigin);
      headers.set('Access-Control-Allow-Credentials', 'true');
      headers.set('Vary', 'Origin');
    } else {
      headers.delete('Access-Control-Allow-Origin');
      headers.delete('Access-Control-Allow-Credentials');
    }
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const response = await handleFetch(request, env, ctx);
      return withSecurityHeaders(response, request);
    } catch (e) {
      // Filet de sécurité global : sans ce catch, toute exception non gérée
      // plus bas (ex. erreur SQL type "no such column") remonte brute et
      // Cloudflare renvoie une réponse non-JSON. Côté client, tout fetch()
      // qui attend du JSON (ex. public/feedback.html) échoue alors sur
      // r.json() et affiche un message trompeur ("Erreur de connexion")
      // qui masque la vraie cause. On renvoie ici une vraie réponse JSON
      // avec le détail de l'erreur, visible dans les logs (wrangler tail).
      console.error('[fetch:unhandled]', e instanceof Error ? e.stack || e.message : String(e));
      return withSecurityHeaders(
        json({ data: null, error: { message: 'Erreur interne du serveur' } }, 500),
        request
      );
    }
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Vérification quotidienne des certificats médicaux arrivant à échéance
    // (cf. checkCertificatsExpirants) — trigger cron à ajouter dans wrangler.json.
    ctx.waitUntil(
      checkCertificatsExpirants(env).then(
        (r) => console.log('[cron:certificats]', JSON.stringify(r)),
        (e) => console.error('[cron:certificats] échec', e instanceof Error ? e.stack || e.message : String(e)),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
