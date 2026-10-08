import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Scale, X } from 'lucide-react';
import propertyApi from '../services/propertyApi';
import VerificationBadge from '../components/ui/VerificationBadge';
import { removeCompare } from '../lib/useCompare';

const formatPrice = (price) =>
  typeof price === 'number'
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price)
    : '—';

const formatCell = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  return String(value);
};

// Rows: [label, propertyKey, formatter]. Differences are highlighted when
// a row's raw values are not all identical across the fetched columns.
const ROWS = [
  { label: 'Price', key: 'price', format: formatPrice },
  { label: 'Price / sqft', key: 'pricePerSqft', format: (v) => (v === null ? '—' : formatPrice(v)) },
  { label: 'Status', key: 'status', format: (v) => formatCell(v).replace('_', ' ') },
  { label: 'Listing type', key: 'listingType' },
  { label: 'Property type', key: 'propertyType' },
  { label: 'Bedrooms', key: 'bedrooms' },
  { label: 'Bathrooms', key: 'bathrooms' },
  { label: 'Area (sqft)', key: 'area' },
  { label: 'City', key: 'address', format: (v) => v?.city || '—' },
  { label: 'Amenities', key: 'amenities' },
  { label: 'Verification', key: 'verificationStatus', format: (v) => formatCell(v).replace('_', ' ') },
];

const Compare = () => {
  const [searchParams] = useSearchParams();
  const idsParam = searchParams.get('ids') || '';
  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const idsKey = ids.join(',');

  const [state, setState] = useState({ loading: true, error: null, properties: [], missing: [] });

  const load = useCallback(async () => {
    const current = idsKey ? idsKey.split(',') : [];
    if (!current.length) {
      setState({ loading: false, error: null, properties: [], missing: [] });
      return;
    }
    try {
      setState({ loading: true, error: null, properties: [], missing: [] });
      const res = await propertyApi.compare(current);
      setState({ loading: false, error: null, properties: res?.data?.properties || [], missing: res?.data?.missing || [] });
    } catch {
      setState({ loading: false, error: 'Failed to load the comparison. Please try again.', properties: [], missing: [] });
    }
  }, [idsKey]);

  useEffect(() => {
    load();
  }, [load]);

  if (!ids.length) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <Scale className="mx-auto mb-4 h-10 w-10 text-gray-300" />
        <h1 className="mb-2 text-2xl font-semibold text-gray-900">Nothing to compare yet</h1>
        <p className="mb-6 text-gray-500">Add up to four listings using the compare button on any listing.</p>
        <Link to="/listings" className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
          Browse listings
        </Link>
      </div>
    );
  }

  const { loading, error, properties, missing } = state;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link to="/listings" className="mb-6 inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800">
        <ArrowLeft className="h-4 w-4" /> Back to listings
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Compare listings</h1>

      {loading && <p className="text-gray-500">Loading comparison…</p>}
      {error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      {!loading && !error && properties.length === 0 && (
        <p className="rounded-lg bg-gray-50 p-6 text-center text-gray-500">
          None of these listings are available any more.
        </p>
      )}

      {!loading && properties.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="w-40 bg-gray-50 p-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Attribute
                </th>
                {properties.map((p) => (
                  <th key={p._id} className="min-w-[200px] p-4 text-left align-top">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => removeCompare(p._id)}
                        aria-label={`Remove ${p.title}`}
                        className="absolute -top-1 right-0 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <Link to={`/listings/${p._id}`} className="group block">
                        {p.images?.[0] ? (
                          <img src={p.images[0]} alt="" className="mb-2 h-24 w-full rounded-lg object-cover" />
                        ) : (
                          <div className="mb-2 flex h-24 w-full items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-400">
                            No image
                          </div>
                        )}
                        <span className="line-clamp-2 font-semibold text-gray-900 group-hover:text-indigo-700">
                          {p.title}
                        </span>
                      </Link>
                      {p.verificationStatus === 'verified' && (
                        <div className="mt-2">
                          <VerificationBadge status="verified" />
                        </div>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const values = properties.map((p) => p[row.key]);
                const raw = values.map((v) => JSON.stringify(v ?? null));
                const differs = new Set(raw).size > 1;
                return (
                  <tr key={row.label} className="border-b border-gray-100 last:border-0">
                    <td className="bg-gray-50 p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {row.label}
                    </td>
                    {values.map((value, i) => (
                      <td
                        key={properties[i]._id}
                        className={`p-4 align-top ${differs ? 'font-semibold text-gray-900' : 'text-gray-500'}`}
                      >
                        {row.format ? row.format(value) : formatCell(value)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {missing.length > 0 && (
        <p className="mt-4 text-sm text-gray-500">
          {missing.length} selected {missing.length === 1 ? 'listing is' : 'listings are'} no longer available.
        </p>
      )}
    </div>
  );
};

export default Compare;
