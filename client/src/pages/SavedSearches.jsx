import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import savedSearchApi from '../services/savedSearchApi';

const PAGE_SIZE = 10;

const describeCriteria = (criteria = {}) => {
  const parts = [];
  if (criteria.search) parts.push(`"${criteria.search}"`);
  if (criteria.city) parts.push(criteria.city);
  if (criteria.listingType) parts.push(criteria.listingType);
  if (criteria.propertyType) parts.push(criteria.propertyType);
  if (criteria.minPrice != null || criteria.maxPrice != null) {
    const min = criteria.minPrice != null ? `₹${Number(criteria.minPrice).toLocaleString('en-IN')}` : 'any';
    const max = criteria.maxPrice != null ? `₹${Number(criteria.maxPrice).toLocaleString('en-IN')}` : 'any';
    parts.push(`${min} – ${max}`);
  }
  if (criteria.bedrooms != null) parts.push(`${criteria.bedrooms}+ beds`);
  return parts.length ? parts.join(' · ') : 'All listings';
};

// The server emits the canonical API querystring (search=...). The browse
// page URL contract uses q= — remap the single key for the deep link.
const toBrowseHref = (query) => `/listings${(query || '').replace('search=', 'q=')}`;

const SavedSearches = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Math.max(Number.parseInt(params.get('page') || '1', 10) || 1, 1);

  const [searches, setSearches] = useState([]);
  const [pagination, setPagination] = useState({ pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await savedSearchApi.getMine({ page, limit: PAGE_SIZE });
        if (cancelled) return;
        setSearches(result.data.savedSearches);
        setPagination(result.data.pagination);
      } catch {
        if (cancelled) return;
        setError('Failed to load your saved searches. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [page, retry]);

  const changePage = (newPage) => {
    const newParams = new URLSearchParams(params);
    if (newPage <= 1) newParams.delete('page');
    else newParams.set('page', String(newPage));
    setParams(newParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRun = async (id) => {
    try {
      setBusyId(id);
      setActionError(null);
      const result = await savedSearchApi.run(id, { limit: 24 });
      navigate(toBrowseHref(result.data.query));
    } catch {
      setActionError('Could not run this search. Please try again.');
      setBusyId(null);
    }
  };

  const handleToggle = async (search) => {
    try {
      setBusyId(search._id);
      setActionError(null);
      const result = await savedSearchApi.update(search._id, { active: !search.active });
      setSearches((prev) => prev.map((s) => (s._id === search._id ? result.data.savedSearch : s)));
    } catch (err) {
      const code = err.response?.data?.error?.code;
      setActionError(
        code === 'SEARCH_LIMIT'
          ? 'You already have 20 active saved searches. Pause one before reactivating another.'
          : 'Could not update this search. Please try again.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id) => {
    try {
      setBusyId(id);
      setActionError(null);
      await savedSearchApi.remove(id);
      setSearches((prev) => prev.filter((s) => s._id !== id));
      setConfirmDeleteId(null);
    } catch {
      setActionError('Could not delete this search. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const secondaryButton =
    'min-h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <main className="mx-auto w-full max-w-5xl min-w-0 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Saved searches</h1>
          <p className="mt-1 text-sm text-gray-500">
            Get alerted the moment a new listing matches. Pause a search anytime — nothing is deleted.
          </p>
        </div>
        <Link
          to="/listings"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Bookmark className="h-4 w-4" />
          Browse &amp; save a search
        </Link>
      </div>

      {actionError && (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600"></div>
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 p-6 text-center">
          <h3 className="text-sm font-medium text-red-800">{error}</h3>
          <button
            type="button"
            onClick={() => setRetry((count) => count + 1)}
            className="mt-4 rounded bg-red-100 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-200"
          >
            Try Again
          </button>
        </div>
      ) : searches.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <Bookmark className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No saved searches yet</h3>
          <p className="mt-2 max-w-md text-sm text-gray-500">
            Apply filters on the browse page, then use &quot;Save search&quot; to get instant alerts.
          </p>
          <Link
            to="/listings"
            className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Browse listings
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-4">
            {searches.map((search) => (
              <article
                key={search._id}
                className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words font-semibold text-gray-900">{search.name}</h2>
                    <p className="mt-1 break-words text-sm text-gray-600">{describeCriteria(search.criteria)}</p>
                    {search.lastNotifiedAt && (
                      <p className="mt-1 text-xs text-gray-400">
                        Last alert {new Date(search.lastNotifiedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      search.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {search.active ? 'Alerts on' : 'Paused'}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleRun(search._id)}
                    disabled={busyId === search._id}
                    className="min-h-11 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Run now
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggle(search)}
                    disabled={busyId === search._id}
                    className={secondaryButton}
                  >
                    {search.active ? 'Pause alerts' : 'Resume alerts'}
                  </button>
                  {confirmDeleteId === search._id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDelete(search._id)}
                        disabled={busyId === search._id}
                        className="min-h-11 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busyId === search._id ? 'Deleting…' : 'Confirm delete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={busyId === search._id}
                        className={secondaryButton}
                      >
                        Keep search
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(search._id)}
                      className="min-h-11 rounded-lg border border-red-300 px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>

          {pagination.pages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2 text-sm">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => changePage(page - 1)}
                className={secondaryButton}
              >
                Previous
              </button>
              <span className="px-2 text-gray-600">
                Page {page} of {pagination.pages}
              </span>
              <button
                type="button"
                disabled={page >= pagination.pages}
                onClick={() => changePage(page + 1)}
                className={secondaryButton}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
};

export default SavedSearches;
