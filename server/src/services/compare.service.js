import mongoose from 'mongoose';
import Property from '../models/Property.js';
import { publicizeProperty } from '../lib/propertyPresentation.js';

/** S14 (ADR-038) — the comparison surface projection (whitelisted fields). */
const COMPARE_PROJECTION = {
  title: 1,
  price: 1,
  propertyType: 1,
  listingType: 1,
  status: 1,
  bedrooms: 1,
  bathrooms: 1,
  area: 1,
  amenities: 1,
  images: 1,
  address: 1,
  verificationStatus: 1,
  virtualTourUrl: 1,
  createdAt: 1,
};

const MAX_COMPARE_IDS = 4;

/**
 * Parse `ids` (comma-separated, 1..4 valid ObjectIds, deduped preserving
 * order). Malformed/empty/over-limit is a hard 400 — comparison is a
 * discovery convenience but garbage input is still a client bug.
 * @returns {{ok:true, ids:string[]} | {ok:false, reason:string}}
 */
export const parseCompareIds = (raw) => {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, reason: 'ids query parameter is required (comma-separated ObjectIds)' };
  }
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { ok: false, reason: 'ids must contain at least one property id' };
  if (parts.length > MAX_COMPARE_IDS) {
    return { ok: false, reason: `ids cannot contain more than ${MAX_COMPARE_IDS} property ids` };
  }
  const ids = [...new Set(parts)];
  for (const id of ids) {
    if (!mongoose.isValidObjectId(id)) {
      return { ok: false, reason: `Invalid property id: ${id.slice(0, 32)}` };
    }
  }
  return { ok: true, ids };
};

/**
 * Public comparison read (auth parity with GET /:id). Returns found rows in
 * request order via the publicize projection + `missing` for unknown ids —
 * partial results deliberately instead of all-or-nothing 404 (compare UX:
 * one dead column never voids the other three).
 */
export const compareProperties = async (ids) => {
  const docs = await Property.find({ _id: { $in: ids } }).select(COMPARE_PROJECTION).lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const properties = ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((doc) => {
      const out = publicizeProperty(doc);
      out.pricePerSqft = Number(doc.area) > 0 ? Math.round(Number(doc.price) / Number(doc.area)) : null;
      return out;
    });
  const missing = ids.filter((id) => !byId.has(id));
  return { properties, missing };
};
