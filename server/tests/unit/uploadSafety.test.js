/**
 * S13 — Upload safety unit suite (no database, no network).
 *
 * Covers the two pure gates that stand between a request body and any
 * provider call: magic-byte sniffing (lib/fileSignatures.js) and the
 * virtual-tour URL whitelist/normalizer (lib/virtualTour.js).
 */
import {
  sniffFileType,
  validateUploadContent,
  normalizeMimeType,
  ACCEPTED_MIME_TYPES,
} from '../../src/lib/fileSignatures.js';
import { normalizeTourUrl, isCanonicalTourUrl, TOUR_PATTERNS } from '../../src/lib/virtualTour.js';

/** Minimal well-formed leading bytes for each accepted format. */
const pad = (head, total = 32) =>
  Buffer.concat([Buffer.from(head), Buffer.alloc(Math.max(0, total - head.length))]);

const JPEG = pad([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x20, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP'),
  Buffer.alloc(20),
]);
const PDF = pad(Buffer.from('%PDF-1.7'), 32);

describe('S13 fileSignatures — magic-byte sniffing', () => {
  it('detects each whitelisted format from its leading bytes', () => {
    expect(sniffFileType(JPEG)).toBe('image/jpeg');
    expect(sniffFileType(PNG)).toBe('image/png');
    expect(sniffFileType(WEBP)).toBe('image/webp');
    expect(sniffFileType(PDF)).toBe('application/pdf');
  });

  it('rejects executables, ELF binaries and short buffers', () => {
    expect(sniffFileType(pad([0x4d, 0x5a, 0x90, 0x00]))).toBeNull(); // MZ (Windows exe)
    expect(sniffFileType(pad([0x7f, 0x45, 0x4c, 0x46]))).toBeNull(); // ELF
    expect(sniffFileType(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull(); // too short
    expect(sniffFileType(Buffer.alloc(0))).toBeNull();
    expect(sniffFileType('not a buffer')).toBeNull();
  });

  it('rejects SVG — even with an XML/script payload — as unsupported', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(sniffFileType(svg)).toBeNull();
    expect(validateUploadContent(svg, 'image/svg+xml')).toEqual({
      ok: false,
      reason: expect.stringContaining('does not match a supported format'),
    });
  });

  it('rejects a declared type that disagrees with the actual bytes', () => {
    expect(validateUploadContent(JPEG, 'image/png').ok).toBe(false);
    expect(validateUploadContent(PNG, 'application/pdf').ok).toBe(false);
    expect(validateUploadContent(PDF, 'image/jpeg').ok).toBe(false);
  });

  it('accepts matching declarations and normalizes the legacy image/jpg alias', () => {
    expect(validateUploadContent(JPEG, 'image/jpeg')).toEqual({ ok: true, mimeType: 'image/jpeg' });
    expect(validateUploadContent(JPEG, 'image/jpg')).toEqual({ ok: true, mimeType: 'image/jpeg' });
    expect(validateUploadContent(PNG, 'image/png')).toEqual({ ok: true, mimeType: 'image/png' });
    expect(validateUploadContent(WEBP, 'image/webp')).toEqual({ ok: true, mimeType: 'image/webp' });
    expect(validateUploadContent(PDF, 'application/pdf')).toEqual({ ok: true, mimeType: 'application/pdf' });
    expect(normalizeMimeType('IMAGE/JPG')).toBe('image/jpeg');
    expect(normalizeMimeType(' image/png ')).toBe('image/png');
    expect(normalizeMimeType(undefined)).toBeNull();
  });

  it('never advertises svg in the accepted list', () => {
    expect(ACCEPTED_MIME_TYPES).not.toContain('image/svg+xml');
    expect(ACCEPTED_MIME_TYPES).toHaveLength(4);
  });
});

describe('S13 virtualTour — whitelist + canonicalization', () => {
  it('normalizes approved share URLs to canonical embed URLs', () => {
    expect(normalizeTourUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      ok: true, url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', provider: 'youtube',
    });
    expect(normalizeTourUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=share').url).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    expect(normalizeTourUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ').provider).toBe('youtube');
    expect(normalizeTourUrl('https://vimeo.com/76979871')).toEqual({
      ok: true, url: 'https://player.vimeo.com/video/76979871', provider: 'vimeo',
    });
    expect(normalizeTourUrl('https://player.vimeo.com/video/76979871').ok).toBe(true);
    expect(
      normalizeTourUrl(`https://player.media.matterport.com/embed/${'a'.repeat(32)}`).provider,
    ).toBe('matterport');
    expect(normalizeTourUrl('https://static.kuula.co/player/Abc_123-xyz.html').provider).toBe('kuula');
  });

  it('rejects non-https, unknown hosts and protocol tricks', () => {
    expect(normalizeTourUrl('http://player.vimeo.com/video/76979871').ok).toBe(false);
    expect(normalizeTourUrl('javascript:alert(1)').ok).toBe(false);
    expect(normalizeTourUrl('data:text/html,<script>alert(1)</script>').ok).toBe(false);
    expect(normalizeTourUrl('//www.youtube.com/watch?v=dQw4w9WgXcQ').ok).toBe(false);
    expect(normalizeTourUrl('https://evil.example/embed/dQw4w9WgXcQ').ok).toBe(false);
  });

  it('rejects host-suffix spoofing (lookalike domains)', () => {
    expect(normalizeTourUrl('https://www.youtube-nocookie.com.evil.tld/embed/dQw4w9WgXcQ').ok).toBe(false);
    expect(normalizeTourUrl('https://player.vimeo.com.evil.tld/video/76979871').ok).toBe(false);
    expect(normalizeTourUrl('https://notyoutube.com/watch?v=dQw4w9WgXcQ').ok).toBe(false);
  });

  it('rejects malformed ids and empty input', () => {
    expect(normalizeTourUrl('https://www.youtube.com/watch?v=no').ok).toBe(false);
    expect(normalizeTourUrl('https://vimeo.com/not-a-number').ok).toBe(false);
    expect(normalizeTourUrl('https://player.media.matterport.com/embed/short').ok).toBe(false);
    expect(normalizeTourUrl('').ok).toBe(false);
    expect(normalizeTourUrl('   ').ok).toBe(false);
    expect(normalizeTourUrl(null).ok).toBe(false);
    expect(normalizeTourUrl(undefined).ok).toBe(false);
    expect(normalizeTourUrl(`https://vimeo.com/${'9'.repeat(600)}`).ok).toBe(false);
  });

  it('isCanonicalTourUrl accepts only stored canonical forms', () => {
    expect(isCanonicalTourUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe(true);
    expect(isCanonicalTourUrl('https://player.vimeo.com/video/76979871')).toBe(true);
    expect(isCanonicalTourUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false);
    expect(isCanonicalTourUrl('https://evil.tld/x')).toBe(false);
    expect(isCanonicalTourUrl(null)).toBe(false);
    expect(Object.keys(TOUR_PATTERNS).sort()).toEqual(['kuula', 'matterport', 'vimeo', 'youtube']);
  });
});
