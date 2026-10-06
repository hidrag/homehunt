import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import StatusBadge from '../components/ui/StatusBadge';
import visitApi from '../services/visitApi';

const PAGE_SIZE = 10;

const formatSlot = (visit) => {
  const start = new Date(visit.startAt);
  const end = new Date(visit.endAt);
  const minutes = Math.round((end - start) / 60000);
  return `${start.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · ${minutes} minutes · ${visit.timezone}`;
};

const Visits = () => {
  const [params, setParams] = useSearchParams();
  const page = Math.max(Number.parseInt(params.get('page') || '1', 10) || 1, 1);

  const [visits, setVisits] = useState([]);
  const [pagination, setPagination] = useState({ pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [confirmCancelId, setConfirmCancelId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const result = await visitApi.getMine({ page, limit: PAGE_SIZE });

        if (cancelled) return;
        setVisits(result.data.visits);
        setPagination(result.data.pagination);
      } catch {
        if (cancelled) return;
        setError('Failed to load your visits. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [page, retry]);

  const changePage = (newPage) => {
    const newParams = new URLSearchParams(params);
    if (newPage <= 1) newParams.delete('page');
    else newParams.set('page', String(newPage));
    setParams(newParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = async (id) => {
    try {
      setCancellingId(id);
      setActionError(null);

      const result = await visitApi.updateStatus(id, 'cancelled');

      if (result.success) {
        setVisits((prev) =>
          prev.map((visit) => (visit._id === id ? result.data.visit : visit)),
        );
      }
      setConfirmCancelId(null);
    } catch {
      setActionError('Failed to cancel the visit. Please try again.');
    } finally {
      setCancellingId(null);
    }
  };

  const paginationButton =
    'min-h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <main className="mx-auto w-full max-w-5xl min-w-0 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">My visits</h1>
      <p className="mt-1 text-sm text-gray-500">
        Track viewing requests you sent to agents and cancel upcoming visits if plans change.
      </p>

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
      ) : visits.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <CalendarDays className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No visit requests yet</h3>
          <p className="mt-2 max-w-md text-sm text-gray-500">
            Open a listing and use &quot;Schedule a visit&quot; to request a viewing.
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
            {visits.map((visit) => (
              <article
                key={visit._id}
                className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {visit.property ? (
                      <Link
                        to={`/listings/${visit.property._id}`}
                        className="break-words font-semibold text-gray-900 hover:text-indigo-600 hover:underline"
                      >
                        {visit.property.title}
                      </Link>
                    ) : (
                      <h2 className="font-semibold text-gray-500">Listing no longer available</h2>
                    )}
                    <p className="mt-1 break-words text-sm text-gray-600">{formatSlot(visit)}</p>
                  </div>
                  <StatusBadge status={visit.status} />
                </div>

                {visit.note && (
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-700">{visit.note}</p>
                )}

                {['pending', 'confirmed'].includes(visit.status) && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {confirmCancelId === visit._id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleCancel(visit._id)}
                          disabled={cancellingId === visit._id}
                          className="min-h-11 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {cancellingId === visit._id ? 'Cancelling…' : 'Confirm cancel'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmCancelId(null)}
                          disabled={cancellingId === visit._id}
                          className={paginationButton}
                        >
                          Keep visit
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmCancelId(visit._id)}
                        className="min-h-11 rounded-lg border border-red-300 px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
                      >
                        Cancel visit
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>

          {pagination.pages > 1 && (
            <nav aria-label="Visits pagination" className="mt-8 flex items-center justify-center gap-2 text-sm text-gray-700">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => changePage(page - 1)}
                className={paginationButton}
              >
                Previous
              </button>
              <span className="px-2" aria-live="polite">
                Page {page} of {pagination.pages}
              </span>
              <button
                type="button"
                disabled={page >= pagination.pages}
                onClick={() => changePage(page + 1)}
                className={paginationButton}
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </main>
  );
};

export default Visits;
