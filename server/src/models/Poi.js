import mongoose from 'mongoose';

/**
 * S12 — Point of Interest (ADR-033).
 *
 * Internal, deterministically seeded POI dataset. There is deliberately NO
 * runtime external POI dependency: development, tests, and production all
 * read this collection only (offline/mockable invariant). Overpass/OSM may
 * serve as an OFFLINE import tool for the seed dataset, never as a live
 * request path.
 *
 * location uses the project GeoJSON contract: [longitude, latitude].
 */
const poiSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'POI name is required'],
      trim: true,
      maxlength: [120, 'POI name cannot exceed 120 characters'],
    },
    category: {
      type: String,
      enum: ['transit', 'school', 'grocery', 'healthcare', 'park'],
      required: [true, 'POI category is required'],
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
      type: String,
      trim: true,
      maxlength: [200, 'POI address cannot exceed 200 characters'],
    },
    // Seed provenance/debug only — never a query field (ADR-033: the only
    // indexed POI query is spatial; category grouping happens in-service).
    city: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [100, 'POI city cannot exceed 100 characters'],
    },
  },
  { timestamps: true },
);

// The one POI query the implementation runs: $geoWithin $centerSphere around
// a property (ADR-033). Category grouping/top-10 happen in memory over this
// radius-capped candidate set — no second index is needed or added.
poiSchema.index({ location: '2dsphere' });

const Poi = mongoose.model('Poi', poiSchema);

export default Poi;
