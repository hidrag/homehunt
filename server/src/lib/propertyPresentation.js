/**
 * S13 (ADR-036) — Property presentation helper.
 *
 * Storage normalizes `images` to objects { imageId, url, publicId, alt },
 * but the PUBLIC API contract (S3, docs/05) preserves a plain URL string
 * array in exact order. Every public/summary read path runs property
 * documents through publicizeProperty() so consumers (and the 470-test
 * baseline) keep seeing strings. The owner-scoped image endpoints are the
 * only surfaces that expose the object form (they need imageId/publicId).
 */

/** Flatten one property lean-doc (or populated summary) in place-safe way. */
export const publicizeProperty = (doc) => {
  if (!doc || typeof doc !== 'object') return doc;
  const out = { ...doc };
  if (Array.isArray(out.images)) {
    out.images = out.images
      .map((img) => (typeof img === 'string' ? img : img && typeof img.url === 'string' ? img.url : null))
      .filter((v) => v !== null);
  }
  // S14 (ADR-037): public price trail exposes ONLY { price, changedAt },
  // newest last — internal row metadata never reaches public payloads.
  if (Array.isArray(out.priceHistory)) {
    out.priceHistory = out.priceHistory
      .filter((entry) => entry && typeof entry === 'object' && typeof entry.price === 'number')
      .map((entry) => ({ price: entry.price, changedAt: entry.changedAt }));
  }
  return out;
};

/** Map a list of property lean-docs. */
export const publicizeProperties = (docs) =>
  Array.isArray(docs) ? docs.map(publicizeProperty) : docs;
