/**
 * S13 (ADR-036) — client-side virtual tour re-validation.
 *
 * Defense in depth: the server stores only canonical embed URLs, but the
 * client re-checks the stored value against the same whitelist before it is
 * placed in an iframe src. A tampered/legacy DB value therefore cannot
 * become an arbitrary iframe (no javascript:, no data:, no unlisted host).
 */
export const TOUR_PATTERNS = [
  /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{6,20}$/,
  /^https:\/\/player\.vimeo\.com\/video\/\d{6,12}$/,
  /^https:\/\/player\.media\.matterport\.com\/embed\/[0-9a-f]{32}$/,
  /^https:\/\/static\.kuula\.co\/player\/[A-Za-z0-9_-]{1,80}\.html$/,
];

export const TOUR_PROVIDER_LABELS = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  matterport: 'Matterport 3D',
  kuula: 'Kuula 360°',
};

/** True only for an exact canonical embed URL on an approved host. */
export const isCanonicalTourUrl = (value) =>
  typeof value === 'string' && TOUR_PATTERNS.some((re) => re.test(value));

/** Human label for the tour provider, or null when not a canonical tour. */
export const tourProvider = (value) => {
  if (!isCanonicalTourUrl(value)) return null;
  if (value.includes('youtube-nocookie')) return 'youtube';
  if (value.includes('vimeo')) return 'vimeo';
  if (value.includes('matterport')) return 'matterport';
  if (value.includes('kuula')) return 'kuula';
  return null;
};
