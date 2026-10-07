import React from 'react';
import { ShieldCheck, ShieldAlert, Clock, ShieldX } from 'lucide-react';
import { VERIFICATION_LABELS, VERIFICATION_PILL } from '../../lib/verification';

const ICONS = {
  unverified: ShieldAlert,
  pending: Clock,
  verified: ShieldCheck,
  rejected: ShieldX,
};

/**
 * S13 (ADR-036) — property verification badge.
 * Renders nothing for the default `unverified` state so existing cards and
 * detail headers are unchanged unless a listing is actually in the
 * verification flow.
 */
const VerificationBadge = ({ status, className = '' }) => {
  if (!status || status === 'unverified') return null;
  const Icon = ICONS[status] || ShieldAlert;
  const label = VERIFICATION_LABELS[status] || status;
  const pill = VERIFICATION_PILL[status] || VERIFICATION_PILL.unverified;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${pill} ${className}`}
      title={label}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{status === 'verified' ? 'Verified' : label}</span>
    </span>
  );
};

export default VerificationBadge;
