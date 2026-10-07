/**
 * S13 (ADR-035) — Magic-byte file sniffing.
 *
 * Whitelist-only: a file's ACTUAL leading bytes must match one of the four
 * accepted signatures. A declared MIME type that disagrees with the sniffed
 * type is rejected (the .html-with-.jpg-extension / .svg-with-script /
 * MZ-ELF-executable classes all die here, before any provider call).
 * SVG is deliberately absent from the whitelist: even as a raster-looking
 * upload it can carry live script inside the image context.
 */

export const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** Normalize the legacy/alternate JPEG spelling onto the canonical one. */
export const normalizeMimeType = (raw) => {
  if (typeof raw !== 'string') return null;
  const lower = raw.trim().toLowerCase();
  if (lower === 'image/jpg') return 'image/jpeg';
  return lower;
};

/**
 * Sniff the true content type from buffer leading bytes.
 * @param {Buffer} buffer
 * @returns {'image/jpeg'|'image/png'|'image/webp'|'application/pdf'|null}
 */
export const sniffFileType = (buffer) => {
  if (!globalThis.Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WEBP: 'RIFF' .... 'WEBP'
  if (
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  // PDF: '%PDF'
  if (buffer.slice(0, 4).toString('ascii') === '%PDF') return 'application/pdf';

  return null;
};

/**
 * Full upload-content gate: sniff the bytes, require the sniffed type to be
 * whitelisted, and require the client's declared type to agree with it.
 * @param {Buffer} buffer
 * @param {string} declaredMime multer's part.mimetype
 * @returns {{ ok: true, mimeType: string } | { ok: false, reason: string }}
 */
export const validateUploadContent = (buffer, declaredMime) => {
  const sniffed = sniffFileType(buffer);
  if (!sniffed) {
    return { ok: false, reason: 'File content does not match a supported format (JPEG, PNG, WEBP, PDF)' };
  }
  const declared = normalizeMimeType(declaredMime);
  if (!ACCEPTED_MIME_TYPES.includes(declared)) {
    return { ok: false, reason: 'Declared file type is not supported' };
  }
  if (declared !== sniffed) {
    return { ok: false, reason: 'Declared file type does not match the actual contents' };
  }
  return { ok: true, mimeType: sniffed };
};
