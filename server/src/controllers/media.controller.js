import * as mediaService from '../services/media.service.js';
import { buildUploadMiddleware } from '../services/upload/upload.service.js';

/** Envelope helper mirroring the S6-S12 controller style. */
const fail = (res, e) =>
  res.status(e.status || 500).json({
    success: false,
    error: { code: e.code || 'INTERNAL_SERVER_ERROR', message: e.message || 'Unexpected error' },
  });

const paging = (q) => [
  Math.max(1, parseInt(q.page, 10) || 1),
  Math.min(50, Math.max(1, parseInt(q.limit, 10) || 10)),
];

/**
 * Multer route wrapper: maps raw MulterErrors to the project error
 * envelope (oversize -> 413 FILE_TOO_LARGE, too-many-files -> 400) so the
 * multipart boundary never leaks Express' HTML error page.
 */
const multipart = (middleware) => (req, res, next) =>
  middleware(req, res, (err) => {
    if (!err) return next();
    if (err && err.name === 'MulterError') {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return fail(res, { status: 413, code: 'FILE_TOO_LARGE', message: 'Uploaded file exceeds the size limit' });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return fail(res, { status: 400, code: 'VALIDATION_ERROR', message: 'Too many files in one request' });
      }
      return fail(res, { status: 400, code: 'INVALID_FILE_TYPE', message: err.message });
    }
    return fail(res, err);
  });

// Locked limits: images 5MB/file & 5/request; documents 10MB/file & 10/request.
const imageUpload = multipart(buildUploadMiddleware({ maxFileBytes: 5 * 1024 * 1024, maxFiles: 5 }));
const documentUpload = multipart(buildUploadMiddleware({ maxFileBytes: 10 * 1024 * 1024, maxFiles: 10 }));

export const getImages = async (req, res) => {
  try {
    return res.json({ success: true, data: await mediaService.listImages(req.resource) });
  } catch (e) {
    return fail(res, e);
  }
};

export const addImages = async (req, res) => {
  try {
    return res.status(201).json({
      success: true,
      data: await mediaService.addImages(req.resource, req.files),
    });
  } catch (e) {
    return fail(res, e);
  }
};

export const addImagesRoute = [imageUpload, addImages];

export const deleteImage = async (req, res) => {
  try {
    return res.json({ success: true, data: await mediaService.removeImage(req.resource, req.params.imageId) });
  } catch (e) {
    return fail(res, e);
  }
};

export const listDocuments = async (req, res) => {
  try {
    return res.json({ success: true, data: await mediaService.listDocuments(req.resource) });
  } catch (e) {
    return fail(res, e);
  }
};

export const addDocuments = async (req, res) => {
  try {
    return res.status(201).json({
      success: true,
      data: await mediaService.addDocuments(req.resource, req.user.id, req.files),
    });
  } catch (e) {
    return fail(res, e);
  }
};

export const addDocumentsRoute = [documentUpload, addDocuments];

/**
 * Document delivery (ADR-036): fake provider -> in-band stream; real
 * provider -> 302 to a short-lived signed URL. Sensitive bytes: always
 * no-store, never an unrestricted public URL.
 */
export const getDocumentContent = async (req, res) => {
  try {
    const delivery = await mediaService.getDocumentDelivery(req.resource, req.params.documentId);
    if (delivery.stream) {
      const safeName = String(delivery.stream.fileName || 'document')
        .replace(/[^\w.\- ]/g, '_')
        .slice(0, 120);
      res.setHeader('Content-Type', delivery.stream.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.end(delivery.stream.Buffer);
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, delivery.redirect);
  } catch (e) {
    return fail(res, e);
  }
};

export const deleteDocument = async (req, res) => {
  try {
    return res.json({ success: true, data: await mediaService.removeDocument(req.resource, req.params.documentId) });
  } catch (e) {
    return fail(res, e);
  }
};

export const requestVerification = async (req, res) => {
  try {
    return res.json({ success: true, data: { property: await mediaService.requestVerification(req.resource) } });
  } catch (e) {
    return fail(res, e);
  }
};

export const listVerifications = async (req, res) => {
  try {
    const [page, limit] = paging(req.query);
    return res.json({ success: true, data: await mediaService.listPendingVerifications(page, limit) });
  } catch (e) {
    return fail(res, e);
  }
};

export const decideVerification = async (req, res) => {
  try {
    const property = await mediaService.decideVerification(req.resource, req.user.id, {
      decision: req.body?.decision,
      reason: req.body?.reason,
    });
    return res.json({ success: true, data: { property } });
  } catch (e) {
    return fail(res, e);
  }
};
