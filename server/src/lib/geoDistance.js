/**
 * S12 — Neighborhood distance & walkability math (ADR-034).
 *
 * Pure, deterministic functions shared by the neighborhood service and the
 * unit suite. No database, no I/O, no external services: every constant is
 * published here so the score is fully explainable (never a black box).
 *
 * Coordinate convention matches the storage contract: [longitude, latitude].
 */

/** Whitelisted POI categories (mirrors the Poi model enum). */
export const POI_CATEGORIES = ['transit', 'school', 'grocery', 'healthcare', 'park'];

/** Fixed score weights per category — MUST sum to 1.0 (ADR-034). */
export const WALK_WEIGHTS = {
  transit: 0.3,
  school: 0.2,
  grocery: 0.2,
  healthcare: 0.15,
  park: 0.15,
};

/** POI at or under this distance counts as full utility (1.0). */
export const WALK_NEAR_M = 400;

/** Linear decay from full utility to zero between NEAR and MAX_USEFUL. */
export const WALK_MAX_USEFUL_M = 1600;

/** A category saturates its sub-score after this many useful POIs. */
export const WALK_SATURATION = 5;

/** Deterministic walking model: 4.8 km/h = 80 m per minute. */
export const WALK_METERS_PER_MINUTE = 80;

/** Earth mean radius for Haversine distance (kilometres). */
const EARTH_MEAN_RADIUS_M = 6371000;

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two [lng, lat] points in metres (Haversine).
 * @param {[number, number]} from [lng, lat]
 * @param {[number, number]} to   [lng, lat]
 * @returns {number} distance in metres
 */
export const haversineMeters = (from, to) => {
  const [lng1, lat1] = from;
  const [lng2, lat2] = to;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MEAN_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
};

/**
 * Deterministic walking time in whole minutes, rounded UP at 80 m/min.
 * @param {number} meters
 * @returns {number} minutes (0 when the distance is 0)
 */
export const walkingMinutes = (meters) => Math.ceil(meters / WALK_METERS_PER_MINUTE);

/** Per-POI utility: 1 at <=400 m, linear decay to 0 at >=1600 m. */
export const poiUtility = (meters) => {
  if (meters <= WALK_NEAR_M) return 1;
  if (meters >= WALK_MAX_USEFUL_M) return 0;
  return (WALK_MAX_USEFUL_M - meters) / (WALK_MAX_USEFUL_M - WALK_NEAR_M);
};

/**
 * Deterministic 0–100 walkability score from in-range candidates.
 *
 * Algorithm (ADR-034, published constants above):
 *  1. Per-POI utility decays linearly from 1 at 400 m to 0 at 1600 m.
 *  2. Category sub-score = min(1, top-5 utility sum / 5) — density, not spam.
 *  3. total = round(100 × Σ weight × sub-score).
 *  4. Zero candidates → null (no data must never read as score 0).
 *
 * @param {Array<{category: string, distanceMeter: number}>} candidates
 * @returns {null | { total: number, weights: Object, categories: Object,
 *   constants: Object }} null when the candidate list is empty
 */
export const computeWalkScore = (candidates = []) => {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const utilitiesByCategory = new Map(POI_CATEGORIES.map((c) => [c, []]));
  for (const item of candidates) {
    const bucket = utilitiesByCategory.get(item.category);
    if (bucket) {
      bucket.push(poiUtility(item.distanceMeter));
    }
  }

  const categories = {};
  let weighted = 0;
  for (const category of POI_CATEGORIES) {
    const top = utilitiesByCategory.get(category).sort((a, b) => b - a).slice(0, WALK_SATURATION);
    const sum = top.reduce((acc, u) => acc + u, 0);
    const sub = Math.min(1, sum / WALK_SATURATION);
    categories[category] = Math.round(sub * 1000) / 1000;
    weighted += WALK_WEIGHTS[category] * sub;
  }

  return {
    total: Math.round(weighted * 100),
    weights: { ...WALK_WEIGHTS },
    categories,
    constants: {
      nearM: WALK_NEAR_M,
      maxUsefulM: WALK_MAX_USEFUL_M,
      saturation: WALK_SATURATION,
      walkMetersPerMinute: WALK_METERS_PER_MINUTE,
    },
  };
};
