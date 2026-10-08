import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Scale, X } from 'lucide-react';
import propertyApi from '../../services/propertyApi';
import { useCompareIds, removeCompare, clearCompare, COMPARE_MAX } from '../../lib/useCompare';

/**
 * S14 — floating comparison tray. Renders only when the selection is
 * non-empty; lazy-fetches light rows via the public compare endpoint.
 */
const CompareTray = () => {
  const ids = useCompareIds();
  const [rows, setRows] = useState([]);
  const idsKey = ids.join(',');

  useEffect(() => {
    if (!idsKey) {
      setRows([]);
      return undefined;
    }
    let active = true;
    propertyApi
      .compare(idsKey.split(','))
      .then((res) => {
        if (active) setRows(res?.data?.properties || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [idsKey]);

  if (!ids.length) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Scale className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
        <div className="flex flex-1 items-center gap-2 overflow-x-auto">
          {rows.map((row) => (
            <span
              key={row._id}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 py-1 pl-1 pr-2 text-xs text-gray-700"
            >
              {row.images?.[0] ? (
                <img src={row.images[0]} alt="" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <span className="h-6 w-6 rounded-full bg-gray-200" />
              )}
              <span className="max-w-[140px] truncate">{row.title}</span>
              <button
                type="button"
                onClick={() => removeCompare(row._id)}
                aria-label={`Remove ${row.title} from comparison`}
                className="rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={clearCompare}
          className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-800"
        >
          Clear
        </button>
        <Link
          to={`/compare?ids=${ids.join(',')}`}
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Compare ({ids.length}/{COMPARE_MAX})
        </Link>
      </div>
    </div>
  );
};

export default CompareTray;
