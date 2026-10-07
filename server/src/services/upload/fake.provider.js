/**
 * S13 (ADR-035) — Fake upload provider (default; every test and dev).
 *
 * Mirrors the ADR-024 fake email provider seam: an in-memory registry that
 * test suites and credential-less development exercise deterministically,
 * with the SAME interface the Cloudinary provider implements. Nothing
 * touches disk or the network.
 *
 * `fetch(id)` returns the stored bytes — the content-proxy route streams
 * them for the fake provider (a real provider instead yields a signed URL
 * the route 302s to).
 */
import crypto from 'node:crypto';

const store = new Map();
let counter = 0;

export const fakeUploadProvider = {
  name: 'fake',

  /** Test seam: inspect/seed the registry (like fakeEmailProvider.sentEmails). */
  uploads: store,

  async upload({ buffer, filename, mimeType, folder }) {
    counter += 1;
    const publicId = `fake/${folder}/${counter}-${crypto.randomUUID()}`;
    store.set(publicId, {
      buffer,
      filename,
      mimeType,
      folder,
      uploadedAt: new Date(),
    });
    // Deterministic placeholder URL (real image, renders in dev UI).
    const seed = crypto.createHash('sha1').update(buffer.subarray(0, 2048)).digest('hex').slice(0, 12);
    return { providerId: publicId, provider: 'fake', url: `https://picsum.photos/seed/${seed}/800/600` };
  },

  /** Deterministic signed-URL shape (never fetchable — tests use fetch()). */
  async signedUrl(publicId, { ttlSeconds = 300 } = {}) {
    if (!store.has(publicId)) {
      throw new Error(`Unknown fake asset: ${publicId}`);
    }
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    return `https://fake-upload.local/${encodeURIComponent(publicId)}?exp=${exp}&sig=test`;
  },

  /** Bytes for the content-proxy stream path. */
  async fetch(publicId) {
    const entry = store.get(publicId);
    if (!entry) throw new Error(`Unknown fake asset: ${publicId}`);
    return entry;
  },

  async destroy(publicId) {
    store.delete(publicId);
    return { deleted: true };
  },
};

export default fakeUploadProvider;
