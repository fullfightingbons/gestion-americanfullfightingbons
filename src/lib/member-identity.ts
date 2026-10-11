// Identité d'un adhérent dans l'espace membre : une personne n'est pas une
// adresse e-mail.
//
// `adherents` a UNE LIGNE PAR SAISON (réinscription → nouvelle ligne). Pour
// retrouver toutes les saisons d'une même personne (cotisations, diplômes,
// présences, fiche la plus récente), l'espace membre s'appuie sur l'e-mail,
// car le compte (adherent_comptes) n'est ancré que sur UNE de ces lignes.
//
// Cette hypothèse « un e-mail = une personne » est fausse dès que deux
// adhérents partagent la même adresse (père et fils, fratrie sur l'adresse du
// parent, couple...). Sans distinction, les deux personnes se voyaient
// fusionnées : même « fiche courante » (celle inscrite en dernier, donc l'une
// des deux au hasard), diplômes, cotisations et présences mélangés, et un
// téléversement de certificat ou une modification de coordonnées pouvait
// atterrir sur la fiche de l'autre.
//
// Règle retenue : deux lignes qui partagent un e-mail sont la MÊME personne
// sauf si quelque chose prouve le contraire — dates de naissance qui se
// contredisent, ou prénoms nettement différents. Pour un e-mail porté par une
// seule personne (cas général), le résultat est donc strictement celui
// d'avant : toutes les lignes de l'e-mail.
//
// Pures et sans dépendance (hors types) : testables sans base. Le seul accès
// D1 (loadMemberPersonRows) passe par une interface minimale.

export interface PersonLike {
  id: string;
  prenom?: string | null;
  naissance?: string | null;
  date_inscription?: string | null;
  created_at?: string | null;
}

// Minuscules, sans accents ni ponctuation/espaces : « Jean-Pierre », « jean pierre »
// et « JEAN‑PIERRE » deviennent « jeanpierre ».
export function normalizeNamePart(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

// Date de naissance normalisée en AAAA-MM-JJ (accepte aussi JJ/MM/AAAA) ;
// chaîne vide si absente.
export function normalizeBirthDate(value: unknown): string {
  const v = String(value ?? '').trim();
  if (!v) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (fr) return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
  return v;
}

export function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

// Vrai si a et b diffèrent d'au plus une lettre (substitution, ajout ou retrait).
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

// Deux lignes `adherents` partageant un e-mail décrivent-elles la même personne ?
// - dates de naissance toutes deux renseignées et différentes → non (père/fils,
//   frères et sœurs) ;
// - prénoms identiques une fois normalisés → oui ;
// - un prénom manquant → oui (rien ne prouve le contraire) ;
// - prénoms différents d'une seule lettre (≥ 5 lettres : « Mathis »/« Matis »)
//   → oui, coquille de saisie d'une saison à l'autre, pour ne pas amputer
//   l'historique de quelqu'un ; en dessous de 5 lettres (« Léo »/« Léa ») ou au-delà
//   d'une lettre d'écart (« Lucas »/« Louis », jumeaux) → non.
export function isSamePerson(a: PersonLike, b: PersonLike): boolean {
  const na = normalizeBirthDate(a.naissance);
  const nb = normalizeBirthDate(b.naissance);
  if (na && nb && na !== nb) return false;
  const pa = normalizeNamePart(a.prenom);
  const pb = normalizeNamePart(b.prenom);
  if (!pa || !pb || pa === pb) return true;
  return pa.length >= 5 && pb.length >= 5 && withinOneEdit(pa, pb);
}

// Parmi des lignes partageant un e-mail, ne garde que celles de la personne
// `anchor` (sa propre ligne comprise). Ordre d'entrée conservé.
export function selectPersonRows<T extends PersonLike>(anchor: PersonLike, rows: T[]): T[] {
  return rows.filter((r) => r.id === anchor.id || isSamePerson(anchor, r));
}

// Regroupe des lignes en personnes distinctes (une liste de lignes par
// personne). Ordre d'entrée conservé, à l'intérieur des groupes comme entre
// eux (le groupe d'une personne s'ouvre à sa première ligne rencontrée).
export function groupByPerson<T extends PersonLike>(rows: T[]): T[][] {
  const groups: T[][] = [];
  for (const row of rows) {
    const group = groups.find((g) => isSamePerson(g[0], row));
    if (group) group.push(row); else groups.push([row]);
  }
  return groups;
}

// Une ligne par personne : la plus récente (date_inscription, puis created_at).
export function latestRowPerPerson<T extends PersonLike>(rows: T[]): T[] {
  const sorted = rows.slice().sort(compareRecentFirst);
  return groupByPerson(sorted).map((g) => g[0]);
}

function compareRecentFirst(a: PersonLike, b: PersonLike): number {
  const byInscription = String(b.date_inscription ?? '').localeCompare(String(a.date_inscription ?? ''));
  return byInscription || String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
}

// Quelle ligne ancrer quand on crée le compte espace membre d'un e-mail
// partagé par plusieurs personnes ? Le titulaire le plus probable est la
// personne la plus âgée (le parent, pas l'enfant) ; à défaut de date de
// naissance connue, celle qui est inscrite depuis le plus longtemps. On
// renvoie sa ligne la plus récente. Les autres personnes de l'adresse
// restent à rattacher comme profils (tutelle) par le bureau — jamais
// automatiquement : partager une adresse ne prouve pas une tutelle.
export function pickAccountHolder<T extends PersonLike>(rows: T[]): T | null {
  if (!rows.length) return null;
  const groups = groupByPerson(rows.slice().sort(compareRecentFirst));
  const birthOf = (g: T[]) => g.map((r) => normalizeBirthDate(r.naissance)).find(Boolean) || '';
  const sinceOf = (g: T[]) => g.map((r) => String(r.date_inscription ?? '')).filter(Boolean).sort()[0] || '9999';
  groups.sort((x, y) => {
    const bx = birthOf(x), by = birthOf(y);
    if (bx && by && bx !== by) return bx.localeCompare(by); // la plus âgée d'abord
    if (bx && !by) return -1; // une date connue passe avant une date inconnue
    if (!bx && by) return 1;
    return sinceOf(x).localeCompare(sinceOf(y));
  });
  return groups[0][0];
}

// ── Accès base (interface minimale de D1, remplaçable par un faux en test) ──
export interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all<T = Record<string, any>>(): Promise<{ results?: T[] }>;
    };
  };
}

export interface MemberIdentityLike {
  adherent_id: string;
  email?: string | null;          // e-mail de connexion du compte
  adherent_email?: string | null; // e-mail de la fiche du profil actif
  isGuardianView?: boolean;
  prenom?: string | null;         // prénom / naissance du profil ACTIF
  naissance?: string | null;
}

// Fiches (une par saison) de la personne du profil actif, la plus récente en
// premier. Vue tuteur : l'e-mail de la fiche de l'enfant ; sinon l'e-mail de
// connexion du compte (stable d'une saison à l'autre). Liste vide si aucune
// fiche ne porte cet e-mail (l'appelant retombe alors sur la fiche d'ancrage).
export async function loadMemberPersonRows(
  db: D1Like,
  member: MemberIdentityLike,
): Promise<Record<string, any>[]> {
  const email = normalizeEmail(member.isGuardianView ? member.adherent_email : member.email);
  if (!email) return [];
  const { results } = await db
    .prepare(`SELECT * FROM adherents WHERE LOWER(TRIM(email)) = ? ORDER BY date_inscription DESC, created_at DESC`)
    .bind(email)
    .all<Record<string, any>>();
  const anchor: PersonLike = { id: member.adherent_id, prenom: member.prenom, naissance: member.naissance };
  return selectPersonRows(anchor, (results || []) as Array<Record<string, any> & PersonLike>);
}

// Ids des fiches de la personne (au plus 90 : D1 limite les paramètres liés
// à 100), la fiche d'ancrage toujours incluse.
export function personRowIds(member: MemberIdentityLike, rows: Array<{ id?: unknown }>): string[] {
  const ids = new Set<string>(rows.map((r) => String(r.id)));
  if (member.adherent_id) ids.add(String(member.adherent_id));
  return Array.from(ids).slice(0, 90);
}

// « (?,?,?) » pour une clause IN.
export function sqlPlaceholders(count: number): string {
  return `(${Array.from({ length: Math.max(1, count) }, () => '?').join(',')})`;
}
