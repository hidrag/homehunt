import React from 'react';
import { Scale } from 'lucide-react';
import { useCompareIds, toggleCompare, COMPARE_MAX } from '../../lib/useCompare';

/**
 * S14 — compare toggle. Public (no auth needed); selection is ephemeral
 * per-device (localStorage). Full when at cap and this listing isn't in
 * the tray.
 */
const CompareButton = ({ propertyId, className = '' }) => {
  const ids = useCompareIds();
  const active = ids.includes(propertyId);
  const full = !active && ids.length >= COMPARE_MAX;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!full) toggleCompare(propertyId);
      }}
      disabled={full}
      aria-pressed={active}
      title={full ? `Compare list is full (max ${COMPARE_MAX})` : 'Add to comparison'}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-40 ${
        active ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-white/90 text-gray-500 hover:bg-white hover:text-indigo-600'
      } ${className}`}
    >
      <Scale className={`h-5 w-5 ${active ? 'fill-current' : ''}`} />
    </button>
  );
};

export default CompareButton;
