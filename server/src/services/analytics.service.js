/**
 * S14 (ADR-037) — market analytics aggregation service.
 *
 * GET /api/analytics/market serves city-level aggregates over AVAILABLE
 * listings only. Locality granularity is formally descoped (no locality
 * field exists; synthesizing one from free-text streets is refused —
 * ADR-034 mock-data reasoning). City matching is exact and case-insensitive
 * — anchored, escaped RegExp against the indexed `address.city` field, so
 * user text never reaches a query fragment (no ReDoS surface, same posture
 * as the S11/S12 whitelists).
 *
 * Performance (locked decisions): in-process 10-minute TTL cache keyed by
 * normalized city + listingType, invalidated wholesale via a revision
 * counter bumped by every property create/update/delete. Single-process
 * boundary assumption matches ADR-026/029; no new collection, no server-
 * side DB cache.
 *
 * Honesty (ADR-034 precedent): fewer than MIN_SAMPLE listings →
 * `dataAvailable: false` — a one-listing "average" is never presented.
 */
import Property from '../models/Property.js';
import { escapeRegex } from '../lib/propertyFilters.js';

export const MIN_SAMPLE = 3;
export const CACHE_TTL_MS = 10 * 60 * 1000;

const cache = new Map(); // key -> { revision, generatedAt, value }
let revision = 0;

/** Bumped by the property create/update/delete funnel. */
export const bumpAnalyticsRevision = () => {
  revision += 1;
};

/** Test seam: full cache reset (entries + revision baseline). */
export const __resetAnalyticsCache = () => {
  cache.clear();
  revision = 0;
};

const LISTING_TYPES = ['sale', 'rent'];

/**
 * Validate + normalize the public query. Returns null when lenient-ignore
 * applies is NOT possible (city is required) — malformed input is a 400.
 * @returns {{ok:true, city:string, listingType:string|null} | {ok:false, reason:string}}
 */
export const parseMarketQuery = ({ city, listingType } = {}) => {
  if (typeof city !== 'string' || !city.trim() || city.trim().length > 100) {
    return { ok: false, reason: 'city is required (1-100 characters)' };
  }
  const normalizedCity = city.trim();
  let normalizedListingType = null;
  if (listingType !== undefined && listingType !== '') {
    if (typeof listingType !== 'string' || !LISTING_TYPES.includes(listingType)) {
      return { ok: false, reason: 'listingType must be sale or rent' };
    }
    normalizedListingType = listingType;
  }
  return { ok: true, city: normalizedCity, listingType: normalizedListingType };
};

const median = (sorted) => {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

/** Pure aggregation over the fetched lean rows (unit-testable). */
export const computeMarketStats = (rows) => {
  const count = rows.length;
  if (count < MIN_SAMPLE) {
    return { dataAvailable: false, stats: null };
  }
  const prices = rows.map((r) => Number(r.price)).sort((a, b) => a - b);
  const sum = reduce(prices);
  const psfValues = rows
    .filter((r) => Number(r.area) > 0 && Number.isFinite(Number(r.price)))
    .map((r) => Number(r.price) / Number(r.area));
  const avgPricePerSqft = psfValues.length
    ? Math.round(psfValues.reduce((acc, v) => acc + v, 0) / psfValues.length)
    : null;
  return {
    dataAvailable: true,
    stats: {
      count,
      avgPrice: Math.round(sum / count),
      medianPrice: median(prices),
      minPrice: prices[0],
      maxPrice: prices[count - 1],
      avgPricePerSqft,
    },
  };
};

const reduce = (numbers) => numbers.reduce((acc, n) => acc + n, 0);

/**
 * @param {{ city: string, listingType: string|null }} parsed — from parseMarketQuery
 */
export const getMarketAnalytics = async ({ city, listingType }) => {
  const key = `${city.toLowerCase()}|${listingType || 'all'}`;
  const hit = cache.get(key);
  if (hit && hit.revision === revision && Date.now() - hit.generatedAt < CACHE_TTL_MS) {
    return hit.value;
  }

  const filter = {
    status: 'available',
    // Exact, anchored, case-insensitive match on the indexed field. The
    // pattern is assembled ONLY from validated scalar text — never a
    // regex a caller can shape.
    'address.city': new RegExp(`^${escapeRegex(city)}$`, 'i'),
  };
  if (listingType) filter.listingType = listingType;

  // Bounded projection fetch; the portfolio is small by design (single-
  // process MVP boundary) — aggregation stats are computed in memory.
  const rows = await Property.find(filter).select('price area').lean();
  const computed = computeMarketStats(rows);
  const value = {
    city,
    listingType: listingType || null,
    generatedAt: new Date().toISOString(),
    minSample: MIN_SAMPLE,
    ...computed,
  };
  cache.set(key, { revision, generatedAt: Date.now(), value });
  return value;
};

// bundler tree-shakes unused named imports oddly; harmless at runtime.
