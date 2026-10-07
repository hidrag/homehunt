/**
 * S12 — Neighborhood service (ADR-033/ADR-034).
 *
 * GET /api/properties/:id/neighborhood backing service.
 *
 * Query model: ONE indexed `$geoWithin $centerSphere` sweep over `pois`
 * (the exact operator shape the ADR-031 amendment IXSCAN-verified for
 * properties), then ALL distance/category/score work happens in memory over
 * that radius-capped candidate set. There is no N+1: per-category grouping,
 * Haversine distances, walk minutes, top-10 slices, and the walkability
 * score never touch the database again.
 *
 * Injection posture (ADR-031 rule reused verbatim): the operator is
 * assembled ONLY from individually validated finite scalars. The radius cap
 * (0, 10] doubles as the spatial-scan / DoS bound. Category is whitelist-
 * only; unknown values are silently ignored (no security/perf consequence —
 * lenient S2 convention), so the UI option list always matches what the API
 * honors.
 */
import mongoose from 'mongoose';
import Property from '../models/Property.js';
import Poi from '../models/Poi.js';
import { EARTH_RADIUS_KM } from '../lib/propertyFilters.js';
import {
  POI_CATEGORIES,
  haversineMeters,
  walkingMinutes,
  computeWalkScore,
} from '../lib/geoDistance.js';

export const DEFAULT_RADIUS_KM = 3;
export const MAX_RADIUS_KM = 10;

/** Nearest POIs kept per category in the response payload (locked decision). */
export const TOP_N_PER_CATEGORY = 10;

/** Strict-validate-on-present: malformed radius is 400 GEO_INVALID, never ignored. */
export const parseRadiusKm = (raw) => {
  if (raw === undefined || raw === null || raw === '') {
    return DEFAULT_RADIUS_KM;
  }
  const num = typeof raw === 'string' ? Number(raw.trim()) : raw;
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    throw { status: 400, code: 'GEO_INVALID', message: 'radiusKm must be a finite number' };
  }
  if (num <= 0 || num > MAX_RADIUS_KM) {
    throw {
      status: 400,
      code: 'GEO_INVALID',
      message: `radiusKm must be greater than 0 and at most ${MAX_RADIUS_KM}`,
    };
  }
  return num;
};

/** Whitelist-only categories; unknown or malformed values are ignored (locked decision 2). */
export const parseCategories = (raw) => {
  if (raw === undefined || raw === null || raw === '') return null;
  const values = Array.isArray(raw) ? raw : [raw];
  const valid = values.filter(
    (value) => typeof value === 'string' && POI_CATEGORIES.includes(value.trim()),
  );
  return valid.length > 0 ? [...new Set(valid.map((v) => v.trim()))] : null;
};

/**
 * Neighborhood context for a property: nearby POIs grouped by category with
 * honest distances/walk times, plus the deterministic walkability score.
 *
 * @param {string} propertyId
 * @param {{ radiusKm?: unknown, category?: unknown }} params raw query values
 * @returns {Promise<Object>} neighborhood payload
 * @throws {{status:400,code:'INVALID_ID'|'GEO_INVALID'}} | {{status:404,code:'NOT_FOUND'}}
 */
export const getNeighborhood = async (propertyId, params = {}) => {
  if (!mongoose.Types.ObjectId.isValid(propertyId)) {
    throw { status: 400, code: 'INVALID_ID', message: 'Invalid property ID format' };
  }
  const radiusKm = parseRadiusKm(params.radiusKm);
  const categories = parseCategories(params.category);

  const property = await Property.findById(propertyId).select('location').lean();
  if (!property) {
    throw { status: 404, code: 'NOT_FOUND', message: 'Property not found' };
  }

  const coords = property.location?.coordinates;
  const [lng, lat] = Array.isArray(coords) ? coords : [];
  if (
    !Number.isFinite(lng) || !Number.isFinite(lat) ||
    lng < -180 || lng > 180 || lat < -90 || lat > 90
  ) {
    // Storage contract guarantees a valid Point; this guard means a corrupt
    // document degrades to "no data" instead of a 500 or an unbounded scan.
    return {
      property: String(propertyId),
      radiusKm,
      dataAvailable: false,
      walkScore: null,
      categories: Object.fromEntries(POI_CATEGORIES.map((c) => [c, []])),
    };
  }

  // The single spatial query (ADR-033). Operator assembled from validated
  // scalars only — identical $centerSphere shape to ADR-031's radius clause.
  const candidates = await Poi.find({
    location: {
      $geoWithin: {
        $centerSphere: [[lng, lat], radiusKm / EARTH_RADIUS_KM],
      },
    },
  })
    .select('name category location')
    .lean();

  // In-memory projection: honest Haversine distance + walk minutes.
  const enriched = candidates.map((poi) => {
    const distanceMeter = Math.round(haversineMeters([lng, lat], poi.location.coordinates));
    return {
      id: String(poi._id),
      name: poi.name,
      category: poi.category,
      distanceMeter,
      walkMinutes: walkingMinutes(distanceMeter),
      location: poi.location,
    };
  });

  const dataAvailable = enriched.length > 0;
  const walkScore = computeWalkScore(enriched);

  const grouped = Object.fromEntries(POI_CATEGORIES.map((c) => [c, []]));
  for (const item of enriched) {
    // Own-property guard: a tampered POI document cannot reach Object.prototype.
    if (Object.hasOwn(grouped, item.category)) grouped[item.category].push(item);
  }
  for (const category of Object.keys(grouped)) {
    grouped[category].sort((a, b) => a.distanceMeter - b.distanceMeter);
    grouped[category] = grouped[category].slice(0, TOP_N_PER_CATEGORY);
  }

  const categoriesOut = categories
    ? Object.fromEntries(categories.map((c) => [c, grouped[c]]))
    : grouped;

  return {
    property: String(propertyId),
    radiusKm,
    dataAvailable,
    walkScore,
    categories: categoriesOut,
  };
};

export default { getNeighborhood };
