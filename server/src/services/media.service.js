/**
 * S13 — Media & verification domain service (ADR-035/ADR-036).
 *
 * Ownership is pre-checked by middleware (requireOwnership with admin
 * override); this service assumes the caller is authorized for `property`.
 *
 * Upload failure isolation (locked decision): provider upload happens
 * FIRST; any later database failure best-effort destroys the orphaned
 * asset ([UPLOAD_ORPHAN_ERROR]). A provider failure means the database was
 * never touched.
 *
 * Provider resolution for stored assets uses the server-controlled folder
 * namespace baked into the publicId ('fake/...' vs 'homehunt/...') — the
 * two providers never mint ids for each other's prefixes. Property image
 * entries store only publicId; document rows store an explicit provider.
 */
import mongoose from 'mongoose';
import Property from '../models/Property.js';
import PropertyDocument from '../models/PropertyDocument.js';
import {
  stageAndUpload,
  orphanCleanup,
  MAX_IMAGES_PER_PROPERTY,
  MAX_DOCUMENTS_PER_PROPERTY,
} from './upload/upload.service.js';
import { fakeUploadProvider } from './upload/fake.provider.js';
import { cloudinaryProvider } from './upload/cloudinary.provider.js';
import { publicizeProperty } from '../lib/propertyPresentation.js';
import { notifyVerificationUpdate } from './notification.service.js';

export { MAX_IMAGES_PER_PROPERTY, MAX_DOCUMENTS_PER_PROPERTY };

const fail = (status, code, message) => {
  throw { status, code, message };
};

const providerForPublicId = (publicId) =>
  typeof publicId === 'string' && publicId.startsWith('fake/')
    ? fakeUploadProvider
    : cloudinaryProvider;

/** Owner-facing image list (normalized objects with stable imageId). */
export const listImages = async (property) => ({
  images: (property.images || []).map((img) => ({
    imageId: img.imageId,
    url: img.url,
    publicId: img.publicId || null,
    alt: img.alt || null,
  })),
});

/**
 * Append uploaded image files to a property. Cap: 20 total per property,
 * files already byte/mime-gated by the route middleware.
 */
export const addImages = async (property, files = []) => {
  if (!Array.isArray(files) || files.length === 0) {
    fail(400, 'VALIDATION_ERROR', 'At least one image file is required');
  }
  const existing = property.images || [];
  if (existing.length + files.length > MAX_IMAGES_PER_PROPERTY) {
    fail(
      400,
      'VALIDATION_ERROR',
      `Images cannot exceed ${MAX_IMAGES_PER_PROPERTY} entries (${existing.length} already present)`,
    );
  }

  const staged = [];
  try {
    for (const file of files) {
      const ref = await stageAndUpload(file, { folder: 'homehunt/images' });
      staged.push(ref);
      property.images = [
        ...(property.images || []),
        { url: ref.url, publicId: ref.providerId },
      ];
    }
  } catch (err) {
    for (const ref of staged) await orphanCleanup(ref);
    throw err;
  }

  try {
    await property.save();
  } catch (err) {
    for (const ref of staged) await orphanCleanup(ref);
    // Reload so the document in req.resource is not left dirty.
    await property.reload().catch(() => {});
    if (err && err.code === 121) {
      return fail(400, 'VALIDATION_ERROR', 'Image entries failed storage validation');
    }
    throw err;
  }
  return listImages(property);
};

/** Remove one image by imageId; provider destroy best-effort. */
export const removeImage = async (property, imageId) => {
  if (typeof imageId !== 'string' || !/^[0-9a-f]{12,32}$/.test(imageId)) {
    fail(400, 'VALIDATION_ERROR', 'Invalid image id');
  }
  const images = property.images || [];
  const target = images.find((img) => img.imageId === imageId);
  if (!target) fail(404, 'NOT_FOUND', 'Image not found');

  property.images = images.filter((img) => img.imageId !== imageId);
  await property.save();
  if (target.publicId) {
    await providerForPublicId(target.publicId)
      .destroy(target.publicId)
      .catch((err) => console.error('[UPLOAD_ORPHAN_ERROR]', target.publicId, err.message));
  }
  return { deleted: true };
};

/** List active verification documents (owner/admin view; metadata only). */
export const listDocuments = async (property) => {
  const docs = await PropertyDocument.find({ property: property._id, status: 'active' })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  return {
    documents: docs.map((d) => ({
      id: d._id.toString(),
      fileName: d.fileName,
      mimeType: d.mimeType,
      byteSize: d.byteSize,
      kind: d.kind,
      uploadedAt: d.createdAt,
    })),
  };
};

/** Attach uploaded verification documents to a property. */
export const addDocuments = async (property, uploaderId, files = []) => {
  if (!Array.isArray(files) || files.length === 0) {
    fail(400, 'VALIDATION_ERROR', 'At least one document file is required');
  }
  const active = await PropertyDocument.countDocuments({
    property: property._id,
    status: 'active',
  });
  if (active + files.length > MAX_DOCUMENTS_PER_PROPERTY) {
    fail(
      400,
      'VALIDATION_ERROR',
      `Documents cannot exceed ${MAX_DOCUMENTS_PER_PROPERTY} active files (${active} already present)`,
    );
  }

  const staged = [];
  const rows = [];
  try {
    for (const file of files) {
      const ref = await stageAndUpload(file, { folder: 'homehunt/documents' });
      staged.push(ref);
      rows.push({
        property: property._id,
        uploadedBy: uploaderId,
        fileName: ref.fileName,
        mimeType: ref.mimeType,
        byteSize: ref.byteSize,
        kind: 'verification',
        providerId: ref.providerId,
        provider: ref.provider,
      });
    }
    await PropertyDocument.insertMany(rows);
  } catch (err) {
    for (const ref of staged) await orphanCleanup(ref);
    throw err;
  }
  return listDocuments(property);
};

/** Load an active document row scoped to the property (404 otherwise). */
const findActiveDocument = async (property, documentId) => {
  if (!mongoose.isValidObjectId(documentId)) fail(400, 'INVALID_ID', 'Invalid document id');
  const doc = await PropertyDocument.findOne({
    _id: documentId,
    property: property._id,
    status: 'active',
  });
  if (!doc) fail(404, 'NOT_FOUND', 'Document not found');
  return doc;
};

/**
 * Delivery grant for the content route: fake → { stream: {buffer,...} },
 * cloudinary → { redirect: signedUrl }. Nothing else can obtain bytes.
 */
export const getDocumentDelivery = async (property, documentId) => {
  const doc = await findActiveDocument(property, documentId);
  const provider = doc.provider === 'fake' ? fakeUploadProvider : cloudinaryProvider;
  if (provider === fakeUploadProvider) {
    const entry = await provider.fetch(doc.providerId);
    return {
      stream: {
        Buffer: entry.buffer,
        mimeType: doc.mimeType,
        fileName: doc.fileName,
      },
    };
  }
  const url = await provider.signedUrl(doc.providerId, { ttlSeconds: 300 });
  return { redirect: url };
};

/** Soft-remove a document; provider destroy best-effort. */
export const removeDocument = async (property, documentId) => {
  const doc = await findActiveDocument(property, documentId);
  doc.status = 'removed';
  await doc.save();
  const provider = doc.provider === 'fake' ? fakeUploadProvider : cloudinaryProvider;
  await provider
    .destroy(doc.providerId)
    .catch((err) => console.error('[UPLOAD_ORPHAN_ERROR]', doc.providerId, err.message));
  return { deleted: true };
};

/**
 * Agent submits the listing for verification. Locked decision: allowed from
 * unverified / rejected / verified (re-submit resets a verified listing to
 * pending) and requires >= 1 active document. Already-pending -> 409.
 */
export const requestVerification = async (property) => {
  if (!['unverified', 'rejected', 'verified'].includes(property.verificationStatus)) {
    fail(
      409,
      'INVALID_VERIFICATION_STATE',
      `Property cannot be submitted for verification from state '${property.verificationStatus}'`,
    );
  }
  const active = await PropertyDocument.countDocuments({
    property: property._id,
    status: 'active',
  });
  if (active === 0) {
    fail(400, 'VALIDATION_ERROR', 'At least one active verification document is required');
  }
  property.verificationStatus = 'pending';
  property.rejectionReason = null;
  // A re-submission fully resets verification state (consistent with the
  // reject path): the previous grant is no longer current, so its audit
  // fields are cleared rather than left claiming a stale verification.
  property.verifiedAt = null;
  property.verifiedBy = null;
  await property.save();
  return publicizeProperty(property.toObject({ versionKey: false }));
};

/** Admin queue: pending verification requests, oldest request first. */
export const listPendingVerifications = async (page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  const filter = { verificationStatus: 'pending' };
  const [properties, total] = await Promise.all([
    Property.find(filter)
      .select('title price address.city listingType updatedAt images agent verificationStatus')
      .sort({ updatedAt: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'agent', select: { name: 1, email: 1 } })
      .lean(),
    Property.countDocuments(filter),
  ]);

  const propertyIds = properties.map((p) => p._id);
  const counts = await PropertyDocument.aggregate([
    { $match: { property: { $in: propertyIds }, status: 'active' } },
    { $group: { _id: '$property', count: { $sum: 1 } } },
  ]);
  const countByProperty = new Map(counts.map((c) => [String(c._id), c.count]));

  return {
    verifications: properties.map((p) => ({
      ...publicizeProperty(p),
      agent: p.agent ? { id: p.agent._id.toString(), name: p.agent.name, email: p.agent.email } : null,
      documentCount: countByProperty.get(String(p._id)) || 0,
    })),
    pagination: { total, page, pages: Math.ceil(total / limit), limit },
  };
};

/**
 * Admin decision (locked decision 2): approve | reject, valid ONLY from
 * 'pending'. Reject requires a reason (<=500). Server-derived verifiedAt/
 * verifiedBy; the agent gets an in-app notification (matrix extension).
 */
export const decideVerification = async (property, adminId, { decision, reason }) => {
  if (decision !== 'approve' && decision !== 'reject') {
    fail(400, 'VALIDATION_ERROR', "decision must be 'approve' or 'reject'");
  }
  if (property.verificationStatus !== 'pending') {
    fail(
      409,
      'INVALID_VERIFICATION_STATE',
      `Verification decision is only allowed from 'pending' (current: '${property.verificationStatus}')`,
    );
  }
  let cleanReason = null;
  if (decision === 'reject') {
    if (typeof reason !== 'string' || !reason.trim()) {
      fail(400, 'VALIDATION_ERROR', 'A rejection reason is required when rejecting');
    }
    cleanReason = reason.trim().slice(0, 500);
  }

  property.verificationStatus = decision === 'approve' ? 'verified' : 'rejected';
  property.verifiedAt = decision === 'approve' ? new Date() : null;
  property.verifiedBy = decision === 'approve' ? adminId : null;
  property.rejectionReason = decision === 'reject' ? cleanReason : null;
  await property.save();

  // Fire-and-forget in-app notification (guarded inside the notify helper).
  void notifyVerificationUpdate(property, decision, cleanReason);

  return publicizeProperty(property.toObject({ versionKey: false }));
};
