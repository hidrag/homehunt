/**
 * S15 (ADR-039) — read a URL straight out of the service worker's runtime
 * cache. Used by detail views as the offline fallback: if the live fetch
 * fails, a previously-cached copy of a public read may render with an
 * explicit "cached copy" flag. Returns the parsed API envelope or null.
 *
 * Cache name/allow-list lives in vite.config.js (Workbox rules); this module
 * only READS — the SW is the only writer, so the fail-closed allow-list in
 * the SW config remains the single authority on what can ever be here.
 */
const API_ORIGIN_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const readFromSwCache = async (pathAndQuery) => {
  try {
    if (typeof caches === 'undefined') return null;
    const cache = await caches.open('api-public-reads');
    const url = `${API_ORIGIN_BASE}${pathAndQuery}`;
    const hit = await cache.match(url);
    if (!hit || !hit.ok) return null;
    const body = await hit.json();
    return body && body.success ? body : null;
  } catch {
    return null;
  }
};

export default readFromSwCache;
