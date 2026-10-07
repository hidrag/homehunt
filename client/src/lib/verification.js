/**
 * S13 (ADR-036) — verification presentation constants shared by the badge,
 * agent dashboard and admin moderation queue.
 */
export const VERIFICATION_LABELS = {
  unverified: 'Unverified',
  pending: 'Verification pending',
  verified: 'Verified',
  rejected: 'Verification rejected',
};

/** Tailwind pill classes per verification state (accessible contrast). */
export const VERIFICATION_PILL = {
  unverified: 'bg-gray-100 text-gray-700 border-gray-200',
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  verified: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-50 text-red-800 border-red-200',
};

export const isVerified = (property) => property?.verificationStatus === 'verified';
