import React from 'react';

/**
 * Shared colored status pill used across buyer and agent surfaces.
 * Covers the property status vocabulary (S1) and the inquiry status
 * vocabulary (S5) defined in docs/04-database-schema.md.
 */
const STATUS_STYLES = {
  // Property statuses
  available: 'bg-green-100 text-green-800',
  under_offer: 'bg-yellow-100 text-yellow-800',
  sold: 'bg-red-100 text-red-800',
  rented: 'bg-blue-100 text-blue-800',
  // Inquiry statuses
  pending: 'bg-yellow-100 text-yellow-800',
  responded: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-800',
};

const FALLBACK_STYLE = 'bg-gray-100 text-gray-800';

const StatusBadge = ({ status }) => (
  <span
    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
      STATUS_STYLES[status] || FALLBACK_STYLE
    }`}
  >
    {status}
  </span>
);

export default StatusBadge;
