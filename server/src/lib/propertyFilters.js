/**
 * Shared public-listing query builder (S2 semantics, extracted S10/ADR-029).
 *
 * Single source of truth for the GET /api/properties filter/sort/pagination
 * vocabulary. Saved-search matching reuses the EXACT same builder so what a
 * buyer sees when they save a search is identical to what the matcher runs.
 *
 * Injection invariants (do not weaken):
 *  - whitelist-only enum values,
 *  - escapeRegex before ANY RegExp construction,
 *  - $text (indexed) for keyword search — never user-built regex,
 *  - unknown keys are ignored; operators are only ever emitted by this file.
 */

export const PROPERTY_TYPES = ["apartment", "house", "villa", "condo", "land"];
export const LISTING_TYPES = ["sale", "rent"];
export const SORT_OPTIONS = {
  newest: { createdAt: -1, _id: -1 },
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: -1 },
};

/**
 * Safely escape regex metacharacters in input string
 * @param {string} str
 * @returns {string}
 */
export const escapeRegex = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * Build a Mongo filter document from raw-ish query values.
 * Accepts either Express req.query values (strings) or saved-search criteria
 * (typed values saved through the same whitelist).
 * @param {Object} input
 * @returns {Object} Mongo filter
 */
export const buildPropertyFilter = (input = {}) => {
  const {
    search,
    city,
    propertyType,
    listingType,
    minPrice,
    maxPrice,
    bedrooms,
    lat,
    lng,
    radiusKm,
    bounds,
  } = input || {};

  const filter = {};

  // 1. Keyword search (MongoDB $text)
  if (typeof search === "string" && search.trim().length > 0) {
    filter.$text = { $search: search.trim() };
  }

  // 2. City filter (case-insensitive, exact-match, regex-escaped)
  if (typeof city === "string" && city.trim().length > 0) {
    const escapedCity = escapeRegex(city.trim());
    filter["address.city"] = new RegExp(`^${escapedCity}$`, "i");
  }

  // 3. Property Type (whitelist)
  if (
    typeof propertyType === "string" &&
    PROPERTY_TYPES.includes(propertyType.trim())
  ) {
    filter.propertyType = propertyType.trim();
  }

  // 4. Listing Type (whitelist)
  if (
    typeof listingType === "string" &&
    LISTING_TYPES.includes(listingType.trim())
  ) {
    filter.listingType = listingType.trim();
  }

  // 5. Price range (minPrice, maxPrice)
  let parsedMinPrice;
  let parsedMaxPrice;

  if (minPrice !== undefined && minPrice !== null && minPrice !== "") {
    const min = Number(minPrice);
    if (!isNaN(min) && isFinite(min) && min >= 0) {
      parsedMinPrice = min;
    }
  }

  if (maxPrice !== undefined && maxPrice !== null && maxPrice !== "") {
    const max = Number(maxPrice);
    if (!isNaN(max) && isFinite(max) && max >= 0) {
      parsedMaxPrice = max;
    }
  }

  // If minPrice > maxPrice, invalidate both (Rule 17)
  if (
    parsedMinPrice !== undefined &&
    parsedMaxPrice !== undefined &&
    parsedMinPrice > parsedMaxPrice
  ) {
    parsedMinPrice = undefined;
    parsedMaxPrice = undefined;
  }

  if (parsedMinPrice !== undefined || parsedMaxPrice !== undefined) {
    filter.price = {};
    if (parsedMinPrice !== undefined) {
      filter.price.$gte = parsedMinPrice;
    }
    if (parsedMaxPrice !== undefined) {
      filter.price.$lte = parsedMaxPrice;
    }
  }

  // 6. Bedrooms filter (bedrooms >= N)
  if (bedrooms !== undefined && bedrooms !== null && bedrooms !== "") {
    const beds = Number(bedrooms);
    if (
      !isNaN(beds) &&
      isFinite(beds) &&
      Number.isInteger(beds) &&
      beds >= 0
    ) {
      filter.bedrooms = { $gte: beds };
    }
  }

  //////////////////////////////////////////////////////////////
  // 9. Geospatial criteria (S11, ADR-031)
  //
  // Strict-validate-on-present posture: a malformed lat/lng/radiusKm/bounds
  // must NEVER silently degrade into an unbounded spatial scan (the
  // deliberate asymmetry with the lenient S2 ignores, recorded in the ADR).
  // Geometry is assembled ONLY from individually validated scalars, so a
  // client (or a tampered saved-criteria document) can never inject an
  // operator-shaped payload through these keys.
  //////////////////////////////////////////////////////////////

  Object.assign(filter, buildGeoFilter({ lat, lng, radiusKm, bounds }));

  return filter;
};

/** Earth mean radius in kilometres (WGS84 equatorial, per the locked decision). */
export const EARTH_RADIUS_KM = 6378.1;

const geoFail = (message) => {
  throw { status: 400, code: "GEO_INVALID", message };
};

/** Parse a geo scalar. Returns null for "absent", never NaN/Infinity. */
const parseGeoNumber = (value, label) => {
  if (value === undefined || value === null || value === "") return null;
  const num = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof num !== "number" || !Number.isFinite(num)) {
    geoFail(`${label} must be a finite number`);
  }
  return num;
};

/**
 * Build the geospatial fragment of a property filter (S11, ADR-031).
 *
 * Accepted shapes:
 *  - Radius:  lat + lng + radiusKm together → $geoWithin $centerSphere
 *             (radiusKm is REQUIRED when coordinates supply a center;
 *             partial geo groups are rejected, never silently dropped).
 *  - Box:     bounds=[minLat,minLng,maxLat,maxLng] → $geoWithin $geometry
 *             (closed 5-point GeoJSON Polygon — 2dsphere index-accelerated;
 *             the legacy $box form executes COLLSCAN. Validated exactly 4
 *             finite scalars; antimeridian crossings (minLng > maxLng) are
 *             rejected, never wrapped).
 *  - Both:    combined under $and — Mongo forbids duplicate `location` keys.
 *
 * Returns {} when no geo key is present. Throws { status: 400,
 * code: 'GEO_INVALID' } for malformed/incomplete geo input.
 */
export const buildGeoFilter = (input = {}) => {
  const rawLat = parseGeoNumber(input.lat, "lat");
  const rawLng = parseGeoNumber(input.lng, "lng");
  const rawRadius = parseGeoNumber(input.radiusKm, "radiusKm");
  const rawBounds = input.bounds;

  const hasCenter = rawLat !== null || rawLng !== null;

  if (hasCenter || rawRadius !== null) {
    if (rawLat === null || rawLng === null || rawRadius === null) {
      geoFail("lat, lng and radiusKm must be provided together");
    }
    if (rawLat < -90 || rawLat > 90) geoFail("lat must be between -90 and 90");
    if (rawLng < -180 || rawLng > 180) geoFail("lng must be between -180 and 180");
    if (rawRadius <= 0 || rawRadius > 100) geoFail("radiusKm must be greater than 0 and at most 100");
  }

  const clauses = [];

  if (hasCenter) {
    clauses.push({
      location: {
        $geoWithin: {
          $centerSphere: [[rawLng, rawLat], rawRadius / EARTH_RADIUS_KM],
        },
      },
    });
  }

  if (rawBounds !== undefined && rawBounds !== null && rawBounds !== "") {
    // Exactly 4 scalars: minLat,minLng,maxLat,maxLng (URL order is
    // latitude-first; storage/box order is GeoJSON [lng, lat]).
    const parts = String(rawBounds)
      .split(",")
      .map((part) => part.trim());
    if (parts.length !== 4 || parts.some((part) => part === "")) {
      geoFail("bounds must be minLat,minLng,maxLat,maxLng");
    }
    const [minLat, minLng, maxLat, maxLng] = parts.map((part, i) =>
      parseGeoNumber(part, `bounds[${i}]`)
    );
    if (minLat < -90 || minLat > 90 || maxLat < -90 || maxLat > 90) {
      geoFail("bounds latitudes must be between -90 and 90");
    }
    if (minLng < -180 || minLng > 180 || maxLng < -180 || maxLng > 180) {
      geoFail("bounds longitudes must be between -180 and 180");
    }
    if (minLat > maxLat) geoFail("bounds minLat cannot exceed maxLat");
    if (minLng > maxLng) {
      // Antimeridian crossings are explicitly rejected (locked decision 4):
      // no wrap heuristics, no half-world boxes.
      geoFail("bounds crossing the antimeridian are not supported");
    }
    clauses.push({
      location: {
        $geoWithin: {
          $geometry: {
            type: 'Polygon',
            coordinates: [[
              [minLng, minLat],
              [maxLng, minLat],
              [maxLng, maxLat],
              [minLng, maxLat],
              [minLng, minLat],
            ]],
          },
        },
      },
    });
  }

  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
};

/**
 * Resolve a sort key through the whitelist (prototype-safe lookup).
 * @param {unknown} sort
 * @returns {Object} Mongo sort document
 */
export const resolveSort = (sort) => {
  // 7. Sorting (whitelist with own-property check to prevent prototype-chain lookup)
  if (typeof sort === "string" && Object.hasOwn(SORT_OPTIONS, sort)) {
    return SORT_OPTIONS[sort];
  }
  return SORT_OPTIONS.newest;
};

/**
 * Clamp pagination exactly as the public listings endpoint does.
 * @param {unknown} rawPage
 * @param {unknown} rawLimit
 * @returns {{ page: number, limit: number }}
 */
export const clampPagination = (rawPage, rawLimit) => {
  let page = parseInt(rawPage, 10);
  let limit = parseInt(rawLimit, 10);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 10;
  if (limit > 50) limit = 50;

  return { page, limit };
};

/**
 * Build the canonical /listings querystring for saved criteria (ADR-029).
 * Only whitelisted, present values are serialized; the frontend maps its
 * `q` param to `search` on navigation (canonical-URL contract, S2).
 * @param {Object} criteria
 * @returns {string} e.g. "?listingType=sale&minPrice=100000"
 */
export const buildCanonicalQuery = (criteria = {}) => {
  const params = new URLSearchParams();
  const put = (key, value) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  };
  put("search", criteria.search);
  put("city", criteria.city);
  put("propertyType", criteria.propertyType);
  put("listingType", criteria.listingType);
  put("minPrice", criteria.minPrice);
  put("maxPrice", criteria.maxPrice);
  put("bedrooms", criteria.bedrooms);
  // S11 geo criteria (ADR-031): canonical keys match the API query vocabulary.
  // (bounds is a transient viewport filter — never stored in saved criteria.)
  put("lat", criteria.lat);
  put("lng", criteria.lng);
  put("radiusKm", criteria.radiusKm);
  put("sort", criteria.sort && Object.hasOwn(SORT_OPTIONS, criteria.sort) ? criteria.sort : undefined);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};
