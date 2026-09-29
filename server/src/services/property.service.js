import Bookmark from '../models/Bookmark.js';
import Property from '../models/Property.js';

const PROPERTY_TYPES = ['apartment', 'house', 'villa', 'condo', 'land'];
const LISTING_TYPES = ['sale', 'rent'];

const MAX_LENGTHS = {
  title: 200,
  description: 5000,
  street: 200,
  city: 100,
  state: 100,
  zipCode: 20,
  country: 100,
  amenity: 100,
  imageUrl: 500,
};
const MAX_AMENITIES = 30;
const MAX_IMAGES = 20;
const IMAGE_URL_PATTERN = /^https?:\/\/\S+$/i;

/**
 * Throws the standard typed validation error consumed by controllers
 * @param {string} message
 */
const throwValidationError = (message) => {
  throw { status: 400, code: 'VALIDATION_ERROR', message };
};

/**
 * Ensures a write payload is a plain object
 * @param {unknown} input
 */
const assertPayload = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throwValidationError('A property payload is required');
  }
};

/**
 * Validates and trims a required string field
 */
const sanitizeString = (value, label, maxLength) => {
  if (typeof value !== 'string' || !value.trim()) {
    throwValidationError(`${label} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throwValidationError(`${label} cannot exceed ${maxLength} characters`);
  }
  return trimmed;
};

/**
 * Validates a whitelisted string enum field
 */
const sanitizeEnum = (value, allowed, label) => {
  if (typeof value !== 'string' || !allowed.includes(value.trim())) {
    throwValidationError(`${label} must be one of: ${allowed.join(', ')}`);
  }
  return value.trim();
};

/**
 * Validates a non-negative finite number (accepts numeric strings)
 */
const sanitizeNonNegativeNumber = (value, label) => {
  const num = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num) || num < 0) {
    throwValidationError(`${label} must be a non-negative number`);
  }
  return num;
};

/**
 * Validates a GeoJSON Point within valid coordinate ranges
 */
const sanitizeLocation = (location) => {
  if (!location || typeof location !== 'object' || Array.isArray(location)) {
    throwValidationError('Location is required');
  }

  const { type = 'Point', coordinates } = location;
  if (type !== 'Point') {
    throwValidationError("Location type must be 'Point'");
  }

  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    throwValidationError('Location coordinates must be [longitude, latitude]');
  }

  const [lng, lat] = coordinates;
  if (typeof lng !== 'number' || !Number.isFinite(lng) || typeof lat !== 'number' || !Number.isFinite(lat)) {
    throwValidationError('Location coordinates must be finite numbers');
  }

  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    throwValidationError('Location coordinates are out of range');
  }

  return { type: 'Point', coordinates: [lng, lat] };
};

/**
 * Validates a full address object (street/city/state/zipCode required, country defaults to India)
 */
const sanitizeAddress = (address) => {
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    throwValidationError('Address is required');
  }

  const sanitized = {
    street: sanitizeString(address.street, 'Street', MAX_LENGTHS.street),
    city: sanitizeString(address.city, 'City', MAX_LENGTHS.city),
    state: sanitizeString(address.state, 'State', MAX_LENGTHS.state),
    zipCode: sanitizeString(address.zipCode, 'Zip code', MAX_LENGTHS.zipCode),
  };

  if (address.country !== undefined && address.country !== null && address.country !== '') {
    sanitized.country = sanitizeString(address.country, 'Country', MAX_LENGTHS.country);
  } else {
    sanitized.country = 'India';
  }

  return sanitized;
};

/**
 * Validates an amenities array of strings
 */
const sanitizeAmenities = (amenities) => {
  if (!Array.isArray(amenities)) {
    throwValidationError('Amenities must be an array of strings');
  }
  if (amenities.length > MAX_AMENITIES) {
    throwValidationError(`Amenities cannot exceed ${MAX_AMENITIES} entries`);
  }

  const sanitized = [];
  for (const item of amenities) {
    if (typeof item !== 'string') {
      throwValidationError('Amenities must be an array of strings');
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_LENGTHS.amenity) {
      throwValidationError(`Amenity names cannot exceed ${MAX_LENGTHS.amenity} characters`);
    }
    sanitized.push(trimmed);
  }
  return sanitized;
};

/**
 * Validates an images array of remote http(s) URLs
 */
const sanitizeImages = (images) => {
  if (!Array.isArray(images)) {
    throwValidationError('Images must be an array of remote URL strings');
  }
  if (images.length > MAX_IMAGES) {
    throwValidationError(`Images cannot exceed ${MAX_IMAGES} entries`);
  }

  const sanitized = [];
  for (const item of images) {
    if (typeof item !== 'string') {
      throwValidationError('Images must be an array of remote URL strings');
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_LENGTHS.imageUrl || !IMAGE_URL_PATTERN.test(trimmed)) {
      throwValidationError('Each image must be a valid http(s) URL');
    }
    sanitized.push(trimmed);
  }
  return sanitized;
};

/**
 * Validates property creation input into a sanitized payload
 * @param {Object} input
 * @returns {Object}
 */
const validateCreateInput = (input) => {
  assertPayload(input);

  const sanitized = {
    title: sanitizeString(input.title, 'Title', MAX_LENGTHS.title),
    description: sanitizeString(input.description, 'Description', MAX_LENGTHS.description),
    price: sanitizeNonNegativeNumber(input.price, 'Price'),
    propertyType: sanitizeEnum(input.propertyType, PROPERTY_TYPES, 'Property type'),
    listingType: sanitizeEnum(input.listingType, LISTING_TYPES, 'Listing type'),
    location: sanitizeLocation(input.location),
    address: sanitizeAddress(input.address),
  };

  if (input.bedrooms !== undefined && input.bedrooms !== null && input.bedrooms !== '') {
    sanitized.bedrooms = sanitizeNonNegativeNumber(input.bedrooms, 'Bedrooms');
  }
  if (input.bathrooms !== undefined && input.bathrooms !== null && input.bathrooms !== '') {
    sanitized.bathrooms = sanitizeNonNegativeNumber(input.bathrooms, 'Bathrooms');
  }
  if (input.area !== undefined && input.area !== null && input.area !== '') {
    sanitized.area = sanitizeNonNegativeNumber(input.area, 'Area');
  }
  if (input.amenities !== undefined && input.amenities !== null) {
    sanitized.amenities = sanitizeAmenities(input.amenities);
  }
  if (input.images !== undefined && input.images !== null) {
    sanitized.images = sanitizeImages(input.images);
  }

  return sanitized;
};

/**
 * Validates a partial property update into a sanitized patch
 * @param {Object} input
 * @returns {Object}
 * @note Status is server-derived only; clients cannot update it directly
 *       Changes must go through proper sale/rental workflow
 */
const validateUpdateInput = (input) => {
  assertPayload(input);

  const sanitized = {};
  const has = (key) =>
    Object.prototype.hasOwnProperty.call(input, key) &&
    input[key] !== undefined &&
    input[key] !== null;

  if (has('title')) sanitized.title = sanitizeString(input.title, 'Title', MAX_LENGTHS.title);
  if (has('description')) sanitized.description = sanitizeString(input.description, 'Description', MAX_LENGTHS.description);
  if (has('price')) sanitized.price = sanitizeNonNegativeNumber(input.price, 'Price');
  if (has('propertyType')) sanitized.propertyType = sanitizeEnum(input.propertyType, PROPERTY_TYPES, 'Property type');
  if (has('listingType')) sanitized.listingType = sanitizeEnum(input.listingType, LISTING_TYPES, 'Listing type');
  // status is server-derived only; clients cannot change it directly
  if (has('location')) sanitized.location = sanitizeLocation(input.location);
  if (has('address')) sanitized.address = sanitizeAddress(input.address);
  if (has('bedrooms')) sanitized.bedrooms = sanitizeNonNegativeNumber(input.bedrooms, 'Bedrooms');
  if (has('bathrooms')) sanitized.bathrooms = sanitizeNonNegativeNumber(input.bathrooms, 'Bathrooms');
  if (has('area')) sanitized.area = sanitizeNonNegativeNumber(input.area, 'Area');
  if (has('amenities')) sanitized.amenities = sanitizeAmenities(input.amenities);
  if (has('images')) sanitized.images = sanitizeImages(input.images);

  if (Object.keys(sanitized).length === 0) {
    throwValidationError('No valid fields to update');
  }

  return sanitized;
};

class PropertyService {
  /**
   * Get a paginated list of properties with optional filter and sort
   * @param {Object|number} filter
   * @param {Object|number} sort
   * @param {number} page
   * @param {number} limit
   * @returns {Promise<Object>}
   */
  async getProperties(
    filter = {},
    sort = { createdAt: -1, _id: -1 },
    page = 1,
    limit = 10,
  ) {
    if (typeof filter === "number") {
      const p = filter;
      const l = typeof sort === "number" ? sort : 10;
      return this.getProperties({}, { createdAt: -1, _id: -1 }, p, l);
    }

    const skip = (page - 1) * limit;

    const [properties, total] = await Promise.all([
      Property.find(filter)
        .select("-__v")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Property.countDocuments(filter),
    ]);

    return {
      properties,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    };
  }

  /**
   * Get a single property by ID
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getPropertyById(id) {
    return Property.findById(id).select("-__v").lean();
  }

  /**
   * Create a property owned by the given agent.
   * `agent` is always server-derived; client-supplied ownership is ignored.
   * @param {string} agentId
   * @param {Object} input
   * @returns {Promise<Object>}
   */
  async createProperty(agentId, input) {
    const sanitized = validateCreateInput(input);
    const property = await Property.create({ ...sanitized, agent: agentId });
    return property.toObject({ versionKey: false });
  }

  /**
   * List the properties owned by the given agent (agent dashboard, S6)
   * @param {string} agentId
   * @param {number} page
   * @param {number} limit
   * @returns {Promise<Object>}
   */
  async getPropertiesForAgent(agentId, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const filter = { agent: agentId };

    const [properties, total] = await Promise.all([
      Property.find(filter)
        .select('-__v')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Property.countDocuments(filter),
    ]);

    return {
      properties,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    };
  }

  /**
   * Update a property document (ownership already verified by middleware)
   * @param {Object} property - Mongoose document (req.resource)
   * @param {Object} input
   * @returns {Promise<Object>}
   */
  async updateProperty(property, input) {
    const sanitized = validateUpdateInput(input);
    property.set(sanitized);
    await property.save();
    return property.toObject({ versionKey: false });
  }

  /**
   * Delete a property and remove bookmarks referencing it.
   * Inquiries are retained as business records; their property ref resolves to null.
   * @param {Object} property - Mongoose document (req.resource)
   * @returns {Promise<Object>}
   */
  async deleteProperty(property) {
    await property.deleteOne();
    await Bookmark.deleteMany({ property: property._id });
    return { deleted: true };
  }
}

export default new PropertyService();
