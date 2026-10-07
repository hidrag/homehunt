/**
 * S13 (ADR-035) — Upload orchestration: provider selection + the
 * validate-sniff-upload gate shared by images and documents routes.
 *
 * Provider is selected by UPLOAD_PROVIDER (default 'fake'; 'cloudinary'
 * otherwise). Same philosophy as EMAIL_PROVIDER (ADR-024): config errors
 * throw at call time, never at boot; the fake adapter keeps all tests and
 * credential-less development hermetic.
 *
 * Failure isolation (locked decision): provider upload runs FIRST; if a
 * later database write fails the caller best-effort destroys the just-uploaded
 * asset and logs [UPLOAD_ORPHAN_ERROR] — a logged orphan beats a DB row
 * pointing at nothing, and a provider failure never touches the database.
 */
import multer from 'multer';
import { fakeUploadProvider } from './fake.provider.js';
import { cloudinaryProvider } from './cloudinary.provider.js';
import { validateUploadContent } from '../../lib/fileSignatures.js';

export const IMAGE_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const DOCUMENT_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_FILES_PER_REQUEST = 5;
export const MAX_IMAGES_PER_PROPERTY = 20;
export const MAX_DOCUMENTS_PER_PROPERTY = 10;

/** Resolve the active provider from the environment on each call. */
export const getUploadProvider = () => {
  const name = (process.env.UPLOAD_PROVIDER || 'fake').trim().toLowerCase();
  if (name === 'cloudinary') return cloudinaryProvider;
  if (name === 'fake') return fakeUploadProvider;
  throw {
    status: 502,
    code: 'UPLOAD_PROVIDER_ERROR',
    message: 'Unsupported UPLOAD_PROVIDER configuration',
  };
};

/**
 * Multer middleware: memoryStorage with hard byte/file bounds. Oversize
 * arrives as MulterError LIMIT_FILE_SIZE -> 413 FILE_TOO_LARGE via the
 * route wrapper; MIME is checked per part here (fast reject) and AGAIN from
 * magic bytes after buffering (authoritative).
 */
export const buildUploadMiddleware = ({ maxFileBytes, maxFiles }) => {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxFileBytes, files: maxFiles },
    fileFilter: (_req, file, cb) => {
      const mime = (file.mimetype || '').trim().toLowerCase();
      const allowed = mime === 'image/jpg' ? 'image/jpeg' : mime;
      if (
        allowed === 'image/jpeg' ||
        allowed === 'image/png' ||
        allowed === 'image/webp' ||
        allowed === 'application/pdf'
      ) {
        cb(null, true);
      } else {
        cb({ status: 400, code: 'INVALID_FILE_TYPE', message: `Unsupported file type: ${file.mimetype}` });
      }
    },
  });
  return upload.array('files', maxFiles);
};

/**
 * Validate + upload one buffered multer file. Returns provider references;
 * throws typed errors on sniff/mime mismatch. The DB write happens in the
 * CALLER, which owns orphan cleanup on failure.
 */
export const stageAndUpload = async (file, { folder }) => {
  const sniff = validateUploadContent(file.buffer, file.mimetype);
  if (!sniff.ok) {
    throw { status: 400, code: 'INVALID_FILE_TYPE', message: sniff.reason };
  }
  const cleanName = String(file.originalname || 'upload')
    .replace(/[\\/]/g, '')
    .slice(0, 200);
  const provider = getUploadProvider();
  const accessMode = folder.startsWith('documents') ? 'authenticated' : 'public';
  const ref = await provider.upload({
    buffer: file.buffer,
    filename: cleanName,
    mimeType: sniff.mimeType,
    folder,
    accessMode,
  });
  return { ...ref, fileName: cleanName, mimeType: sniff.mimeType, byteSize: file.buffer.length };
};

/** Best-effort provider cleanup after a DB write failed post-upload. */
export const orphanCleanup = async (ref) => {
  if (!ref || !ref.providerId) return;
  try {
    const provider =
      ref.provider === 'cloudinary' ? cloudinaryProvider : fakeUploadProvider;
    await provider.destroy(ref.providerId);
  } catch (err) {
    console.error('[UPLOAD_ORPHAN_ERROR]', ref.providerId, err.message);
  }
};
