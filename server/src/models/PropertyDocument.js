import mongoose from 'mongoose';

/**
 * S13 — Property verification document metadata + delivery reference
 * (ADR-036). File BYTES live with the upload provider (Cloudinary private
 * asset | fake in-memory registry) — never in Mongo and never at a public
 * URL. Access is exclusively via the ownership-scoped content route.
 *
 * mimeType is SERVER-DERIVED from magic-byte sniffing at upload time, never
 * trusted from the client's part header. providerId is provider-generated
 * and opaque to clients.
 */
const propertyDocumentSchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    fileName: {
      type: String,
      required: [true, 'File name is required'],
      trim: true,
      maxlength: [200, 'File name cannot exceed 200 characters'],
    },
    mimeType: {
      type: String,
      required: [true, 'MIME type is required'],
      enum: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    },
    byteSize: {
      type: Number,
      required: [true, 'Byte size is required'],
      min: [0, 'Byte size cannot be negative'],
    },
    kind: {
      type: String,
      enum: ['verification'],
      default: 'verification',
      required: true,
    },
    // Soft removal: a removed row keeps the audit trail while the provider
    // asset is destroyed best-effort (ADR-020 tolerate-storage-failure).
    status: {
      type: String,
      enum: ['active', 'removed'],
      default: 'active',
    },
    providerId: {
      type: String,
      required: [true, 'Provider id is required'],
      maxlength: [300, 'Provider id cannot exceed 300 characters'],
    },
    provider: {
      type: String,
      enum: ['cloudinary', 'fake'],
      required: [true, 'Provider is required'],
    },
  },
  { timestamps: true },
);

// Listing-scoped document view (newest first). The admin verification queue
// drives off Property.verificationStatus, so no extra index exists here.
propertyDocumentSchema.index({ property: 1, createdAt: -1 });

const PropertyDocument = mongoose.model('PropertyDocument', propertyDocumentSchema);

export default PropertyDocument;
