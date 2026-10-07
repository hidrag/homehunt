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

  return filter;
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
  put("sort", criteria.sort && Object.hasOwn(SORT_OPTIONS, criteria.sort) ? criteria.sort : undefined);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};
