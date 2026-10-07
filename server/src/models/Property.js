import mongoose from 'mongoose';

/**
 * S13 (ADR-036 locked decision 3) — Dual-shape images.
 *
 * Storage is normalized to objects { imageId, url, publicId, alt }. A
 * schema-level setter accepts BOTH legacy URL strings (seeds, existing
 * PATCH payloads) and upload-produced objects, so no stored-data migration
 * is needed. Public API payloads keep returning the plain URL string array
 * (order preserved, byte-identical to the S3 contract) — flattening happens
 * in the service read paths via publicizeProperty(); the owner-scoped
 * GET /:id/images endpoint is the only place objects are exposed.
 */
const IMAGE_URL_PATTERN = /^https?:\/\/\S+$/i;

const normalizeImageEntry = (item) => {
  const url = typeof item === 'string' ? item.trim() : String(item?.url ?? '').trim();
  if (!url || !IMAGE_URL_PATTERN.test(url) || url.length > 500) {
    throw new Error('Each image must be a valid http(s) URL');
  }
  const publicId =
    typeof item === 'object' && item !== null && typeof item.publicId === 'string'
      ? item.publicId.slice(0, 300)
      : null;
  const alt =
    typeof item === 'object' && item !== null && typeof item.alt === 'string'
      ? item.alt.trim().slice(0, 200)
      : null;
  return {
    // Stable client handle for DELETE /:id/images/:imageId (generated for
    // legacy strings too, so owner UI always has a target).
    imageId:
      typeof item === 'object' && item !== null && typeof item.imageId === 'string' && /^[0-9a-f]{12,32}$/.test(item.imageId)
        ? item.imageId
        : new mongoose.Types.ObjectId().toString().slice(0, 24),
    url,
    publicId,
    alt,
  };
};

const propertySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Property title is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Property description is required'],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'Property price is required'],
      min: [0, 'Price cannot be negative'],
    },
    propertyType: {
      type: String,
      enum: ['apartment', 'house', 'villa', 'condo', 'land'],
      required: [true, 'Property type is required'],
    },
    listingType: {
      type: String,
      enum: ['sale', 'rent'],
      required: [true, 'Listing type is required'],
    },
    status: {
      type: String,
      enum: ['available', 'under_offer', 'sold', 'rented'],
      default: 'available',
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipCode: { type: String, required: true },
      country: { type: String, required: true, default: 'India' },
    },
    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    bedrooms: {
      type: Number,
      min: [0, 'Bedrooms cannot be negative'],
    },
    bathrooms: {
      type: Number,
      min: [0, 'Bathrooms cannot be negative'],
    },
    area: {
      type: Number, // square feet
      min: [0, 'Area cannot be negative'],
    },
    amenities: {
      type: [String],
      default: [],
    },
    images: {
      type: [
        {
          imageId: { type: String },
          url: { type: String, required: true },
          publicId: { type: String, default: null },
          alt: { type: String, default: null },
        },
      ],
      default: [],
      // Dual-shape entry point (ADR-036): map legacy URL strings and
      // upload-produced objects to the normalized shape at assignment time
      // (create, $set, direct assign). No stored-data migration needed.
      set: (value) => (Array.isArray(value) ? value.map(normalizeImageEntry) : value),
    },
    // S13 verification lifecycle (ADR-036). All four verification fields
    // are server-managed: the property create/update sanitizers never pick
    // them up, so client payloads cannot reach them (mass-assignment gate).
    verificationStatus: {
      type: String,
      enum: ['unverified', 'pending', 'verified', 'rejected'],
      default: 'unverified',
    },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason: { type: String, trim: true, maxlength: 500, default: null },
    // Canonicalized virtual tour embed URL (whitelisted providers only).
    virtualTourUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
      set: (value) => (value === '' ? null : value),
    },
  },
  { timestamps: true }
);

// Indexes per S1 & S2 Architecture
propertySchema.index({ location: '2dsphere' });
propertySchema.index({ 'address.city': 1 });
propertySchema.index({ propertyType: 1 });
propertySchema.index({ listingType: 1 });
propertySchema.index({ title: 'text', description: 'text', 'address.city': 'text' });

// Agent's own listings (S6 dashboard), newest first
propertySchema.index({ agent: 1, createdAt: -1 });

const Property = mongoose.model('Property', propertySchema);

export default Property;
