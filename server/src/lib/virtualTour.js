/**
 * S13 — Virtual tour URL whitelist + canonicalization (ADR-036).
 *
 * Server-side: normalize a user-supplied share URL (watch/link forms) to a
 * canonical embed URL on one of the four approved hosts, or reject. Only
 * the canonical form is stored. WHATWG URL parsing first, so javascript:,
 * data:, protocol-relative and userinfo tricks die on protocol/host checks
 * before any pattern ever sees them.
 *
 * Client-side re-validation uses TOUR_PATTERNS against the stored value
 * before rendering an iframe (defense in depth against out-of-band DB
 * tampering). Nothing here builds markup — the client controls embedding.
 */

/** Canonical exact-form patterns; full-string anchored. */
export const TOUR_PATTERNS = {
  youtube: /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{6,20}$/,
  vimeo: /^https:\/\/player\.vimeo\.com\/video\/\d{6,12}$/,
  matterport: /^https:\/\/player\.media\.matterport\.com\/embed\/[0-9a-f]{32}$/,
  kuula: /^https:\/\/static\.kuula\.co\/player\/[A-Za-z0-9_-]{1,80}\.html$/,
};

const YT_ID = /^[A-Za-z0-9_-]{6,20}$/;

/**
 * Normalize a tour URL to its canonical embed form.
 * @param {unknown} raw
 * @returns {{ ok: true, url: string, provider: string } | { ok: false, reason: string }}
 */
export const normalizeTourUrl = (raw) => {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, reason: 'Virtual tour URL must be a non-empty string' };
  }
  if (raw.trim().length > 500) {
    return { ok: false, reason: 'Virtual tour URL cannot exceed 500 characters' };
  }

  let url;
  try {
    url = new globalThis.URL(raw.trim());
  } catch {
    return { ok: false, reason: 'Virtual tour URL is not a valid URL' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'Virtual tour URL must use https' };
  }
  const host = url.hostname.toLowerCase();

  // YouTube: watch / share / short / nocookie-embed forms -> yt-nocookie embed
  if (host === 'youtu.be' || host === 'www.youtube.com' || host === 'youtube.com') {
    const id =
      host === 'youtu.be'
        ? url.pathname.slice(1, 100)
        : url.searchParams.get('v') || '';
    if (YT_ID.test(id)) {
      return { ok: true, url: `https://www.youtube-nocookie.com/embed/${id}`, provider: 'youtube' };
    }
    return { ok: false, reason: 'YouTube tour URL must reference a valid video id' };
  }
  if (host === 'www.youtube-nocookie.com') {
    const match = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{6,20})$/);
    if (match) return { ok: true, url: `https://www.youtube-nocookie.com/embed/${match[1]}`, provider: 'youtube' };
    return { ok: false, reason: 'YouTube embed URL must use the /embed/<id> path' };
  }

  // Vimeo: player embed or video page
  if (host === 'player.vimeo.com') {
    const match = url.pathname.match(/^\/video\/(\d{6,12})$/);
    if (match) return { ok: true, url: `https://player.vimeo.com/video/${match[1]}`, provider: 'vimeo' };
    return { ok: false, reason: 'Vimeo URL must use the /video/<id> path' };
  }
  if (host === 'vimeo.com') {
    const match = url.pathname.match(/^\/(\d{6,12})$/);
    if (match) return { ok: true, url: `https://player.vimeo.com/video/${match[1]}`, provider: 'vimeo' };
    return { ok: false, reason: 'Vimeo URL must reference a numeric video id' };
  }

  // Matterport: only the exact player host, typed already-canonical pass-through
  if (host === 'player.media.matterport.com') {
    const match = url.pathname.match(/^\/embed\/([0-9a-f]{32})$/);
    if (match) return { ok: true, url: `https://player.media.matterport.com/embed/${match[1]}`, provider: 'matterport' };
    return { ok: false, reason: 'Matterport URL must use the /embed/<model-id> path' };
  }
  // Kuula: typed-only provider (no public link-shortener canon to normalize);
  // accept only the exact static player form.
  if (host === 'static.kuula.co') {
    const match = url.pathname.match(/^\/player\/([A-Za-z0-9_-]{1,80})\.html$/);
    if (match) return { ok: true, url: `https://static.kuula.co/player/${match[1]}.html`, provider: 'kuula' };
    return { ok: false, reason: 'Kuula URL must be a static player link (https://static.kuula.co/player/<id>.html)' };
  }

  return { ok: false, reason: 'Virtual tour host is not on the approved provider whitelist' };
};

/**
 * Re-check a stored/canonical URL against the pattern whitelist (client-
 * shareable logic; import-safe in both runtimes).
 * @param {unknown} value
 * @returns {boolean}
 */
export const isCanonicalTourUrl = (value) =>
  typeof value === 'string' && Object.values(TOUR_PATTERNS).some((re) => re.test(value));
