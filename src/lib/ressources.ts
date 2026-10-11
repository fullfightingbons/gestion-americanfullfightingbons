/**
 * Ressources du club (PDF et vidéos) — règles pures partagées par les routes
 * du Worker (téléversement staff, lecture membre) et testées isolément.
 *
 * Aucune dépendance au runtime Workers : uniquement des fonctions pures.
 */

/** Taille maximale d'un fichier téléversé, par type (octets).
 *  Les vidéos sont plafonnées sous la limite de corps de requête de la
 *  plateforme (100 Mo) ; au-delà, utiliser un lien YouTube/Vimeo. */
export const RESSOURCE_MAX_BYTES = {
  pdf: 25 * 1024 * 1024,
  video: 95 * 1024 * 1024,
} as const;

export type RessourceType = 'pdf' | 'video';

/** Durée de validité d'un lien signé de lecture (lecteur vidéo, onglet PDF). */
export const RESSOURCE_LINK_TTL_MS = 6 * 60 * 60 * 1000;

const MIME_BY_EXT: Record<RessourceType, Record<string, string>> = {
  pdf: { pdf: 'application/pdf' },
  video: { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' },
};

/** Identifiant de ressource : UUID ou équivalent, jamais un chemin. */
export function isValidRessourceId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);
}

export function ressourceExtension(name: string): string {
  const base = String(name || '').split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

/** Nom de fichier sûr (clé R2 et en-tête Content-Disposition) : ni chemin, ni
 *  caractère de contrôle, ni guillemet. */
export function sanitizeRessourceFileName(name: unknown): string {
  const base = String(name || '').split(/[\\/]/).pop() || '';
  const cleaned = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(-80);
  return cleaned || 'fichier';
}

export type RessourceUploadCheck =
  | { ok: true; mime: string; safeName: string; ext: string }
  | { ok: false; error: string; status: number };

/** Valide un téléversement avant d'écrire quoi que ce soit dans R2. Le type
 *  MIME stocké vient de l'extension, jamais de l'en-tête envoyé par le client. */
export function validateRessourceUpload(input: { type: RessourceType; name: string; size: number }): RessourceUploadCheck {
  const type: RessourceType = input.type === 'video' ? 'video' : 'pdf';
  const ext = ressourceExtension(input.name);
  const mime = MIME_BY_EXT[type][ext];
  if (!mime) {
    return {
      ok: false,
      status: 400,
      error: type === 'pdf' ? 'Format non accepté : seul le PDF est autorisé.' : 'Format non accepté : MP4, WebM ou MOV uniquement.',
    };
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, status: 411, error: 'Taille du fichier inconnue (en-tête Content-Length requis).' };
  }
  const max = RESSOURCE_MAX_BYTES[type];
  if (input.size > max) {
    const mo = Math.round(max / (1024 * 1024));
    return {
      ok: false,
      status: 413,
      error: `Fichier trop volumineux (${mo} Mo maximum).${type === 'video' ? ' Pour une vidéo plus lourde, utilisez un lien YouTube ou Vimeo.' : ''}`,
    };
  }
  return { ok: true, mime, safeName: sanitizeRessourceFileName(input.name), ext };
}

export function ressourcePrefix(id: string): string {
  return `ressources/${id}/`;
}

export function ressourceKey(id: string, safeName: string, now: number): string {
  return `${ressourcePrefix(id)}${now}-${safeName}`;
}

export function ressourceKeyBelongsTo(key: unknown, id: string): boolean {
  return typeof key === 'string' && key.startsWith(ressourcePrefix(id)) && !key.includes('..');
}

export type VideoLink = { provider: 'youtube' | 'vimeo'; id: string; embedUrl: string };

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Reconnaît un lien YouTube/Vimeo et en tire l'URL du lecteur intégré.
 *  Retourne null pour tout autre lien : jamais d'URL arbitraire dans une
 *  iframe. Le même algorithme est répliqué dans public/assets/app.js (admin,
 *  validation de saisie) et dans l'espace membre (lecteur). */
export function parseVideoLink(raw: unknown): VideoLink | null {
  let url: URL;
  try { url = new URL(String(raw || '').trim()); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be') {
    const id = parts[0] || '';
    return YOUTUBE_ID.test(id) ? youtube(id) : null;
  }
  if (YOUTUBE_HOSTS.has(host)) {
    let id = '';
    if (parts[0] === 'watch') id = url.searchParams.get('v') || '';
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0] || '')) id = parts[1] || '';
    return YOUTUBE_ID.test(id) ? youtube(id) : null;
  }
  if (host === 'vimeo.com' || host === 'www.vimeo.com' || host === 'player.vimeo.com') {
    const idx = host === 'player.vimeo.com' ? parts.indexOf('video') + 1 : 0;
    const id = parts[idx] || '';
    if (!/^\d{6,12}$/.test(id)) return null;
    // Vidéos « non répertoriées » : le jeton de partage est soit le segment
    // suivant (vimeo.com/<id>/<hash>), soit le paramètre ?h= du lecteur.
    const hash = url.searchParams.get('h') || (/^[a-f0-9]{8,20}$/i.test(parts[idx + 1] || '') ? parts[idx + 1] : '');
    const safeHash = /^[a-f0-9]{8,20}$/i.test(hash) ? hash : '';
    return { provider: 'vimeo', id, embedUrl: `https://player.vimeo.com/video/${id}${safeHash ? `?h=${safeHash}` : ''}` };
  }
  return null;
}

function youtube(id: string): VideoLink {
  return { provider: 'youtube', id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
}

/** Plage d'octets normalisée pour une réponse 206 (R2 renvoie offset/length
 *  ou suffix selon la requête). */
export function resolveByteRange(range: { offset?: number; length?: number; suffix?: number } | undefined, size: number):
  { start: number; end: number; length: number } | null {
  if (!range || !Number.isFinite(size) || size <= 0) return null;
  let start: number;
  let length: number;
  if (typeof range.suffix === 'number') {
    length = Math.min(range.suffix, size);
    start = size - length;
  } else {
    start = Math.max(0, range.offset ?? 0);
    length = range.length ?? size - start;
    length = Math.min(length, size - start);
  }
  if (length <= 0) return null;
  return { start, end: start + length - 1, length };
}
