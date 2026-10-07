import mongoose from 'mongoose';

// Typed sub-fields only — never Mongo query fragments (ADR-029).
// The service re-validates every value at save time; the filter is
// rebuilt from these fields at every execution via lib/propertyFilters.js.
const criteriaSchema = new mongoose.Schema(
  {
    search: { type: String, default: null, trim: true, maxlength: 100 },
    city: { type: String, default: null, trim: true, maxlength: 100 },
    propertyType: { type: String, default: null, trim: true },
    listingType: { type: String, default: null, trim: true },
    minPrice: { type: Number, default: null },
    maxPrice: { type: Number, default: null },
    bedrooms: { type: Number, default: null },
    sort: { type: String, default: null, trim: true },
  },
  { _id: false },
);

const savedSearchSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    criteria: { type: criteriaSchema, default: () => ({}) },
    // 'daily' is rejected at validation (locked decision 2) — enum keeps it unrepresentable.
    frequency: { type: String, enum: ['instant'], default: 'instant' },
    active: { type: Boolean, default: true },
    lastNotifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Buyer management list, newest activity first
savedSearchSchema.index({ user: 1, updatedAt: -1 });
// Matching sweep over active searches
savedSearchSchema.index({ active: 1 });

export default mongoose.model('SavedSearch', savedSearchSchema);