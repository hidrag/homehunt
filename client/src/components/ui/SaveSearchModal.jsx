import React, { useState } from 'react';
import { Bookmark } from 'lucide-react';
import savedSearchApi from '../../services/savedSearchApi';

/**
 * "Save this search" affordance on the browse page (S10). Captures the
 * current canonical URL filter vocabulary (q/city/type/listing/minPrice/
 * maxPrice/beds/sort → backend search/city/propertyType/listingType/
 * minPrice/maxPrice/bedrooms/sort) and stores it as typed criteria.
 * Unknown params are dropped — the backend whitelists again server-side.
 */
const SaveSearchModal = ({ searchParams, onSaved }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const criteriaFromParams = () => {
    const raw = {
      search: searchParams.get('q') || '',
      city: searchParams.get('city') || '',
      propertyType: searchParams.get('type') || '',
      listingType: searchParams.get('listing') || '',
      minPrice: searchParams.get('minPrice') || '',
      maxPrice: searchParams.get('maxPrice') || '',
      bedrooms: searchParams.get('beds') || '',
      sort: searchParams.get('sort') || '',
      // S11 (ADR-031): the geo trio is all-or-none; bounds is transient
      // viewport state and is deliberately NOT persisted.
      lat: searchParams.get('lat') || '',
      lng: searchParams.get('lng') || '',
      radiusKm: searchParams.get('radiusKm') || '',
    };
    // Server requires at least one criterion; pass everything, blanks ignored.
    return raw;
  };

  const hasCriteria = () =>
    ['q', 'city', 'type', 'listing', 'minPrice', 'maxPrice', 'beds', 'sort', 'lat', 'radiusKm'].some((key) => {
      const value = searchParams.get(key);
      return value !== null && value !== '';
    });

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      setSubmitting(true);
      setError(null);
      const result = await savedSearchApi.create({ name: name.trim(), criteria: criteriaFromParams() });
      setOpen(false);
      setName('');
      if (onSaved) onSaved(result.data.savedSearch);
    } catch (err) {
      const code = err.response?.data?.error?.code;
      setError(
        code === 'SEARCH_LIMIT'
          ? 'You have reached the limit of 20 active saved searches. Remove or pause one first.'
          : 'Could not save this search. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!hasCriteria()) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(null); setOpen(true); }}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 text-sm font-medium text-indigo-700 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <Bookmark className="h-4 w-4" />
        <span>Save search</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="save-search-title" onClick={() => !submitting && setOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg" onClick={(event) => event.stopPropagation()}>
            <h2 id="save-search-title" className="text-lg font-semibold text-gray-900">Save this search</h2>
            <p className="mt-1 text-sm text-gray-500">
              Get notified when new listings match these filters.
            </p>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="saved-search-name" className="block text-sm font-medium text-gray-700">
                  Search name
                </label>
                <input
                  id="saved-search-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  required
                  placeholder="e.g. 2BHK in Bengaluru under ₹50L"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Saving…' : 'Save search'}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={submitting}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default SaveSearchModal;
