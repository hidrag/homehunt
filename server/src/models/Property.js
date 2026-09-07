import mongoose from 'mongoose';

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
      type: [String],
      default: [],
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

const Property = mongoose.model('Property', propertySchema);

export default Property;
