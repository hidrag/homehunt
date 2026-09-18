import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Heart, Search } from 'lucide-react';
import bookmarkApi from '../services/bookmarkApi';
import PropertyCard from '../components/ui/PropertyCard';

const PAGE_SIZE = 12;

const Bookmarks = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { ids, pendingIds } = useSelector((state) => state.bookmarks);

  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [pagination, setPagination] = useState({ pages: 1, total: 0, limit: PAGE_SIZE });

  const page = parseInt(searchParams.get('page') || '1', 10);

  const handlePageChange = useCallback((newPage) => {
    const newParams = new URLSearchParams(searchParams);
    if (newPage <= 1) {
      newParams.delete('page');
    } else {
      newParams.set('page', String(newPage));
    }
    setSearchParams(newParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [searchParams, setSearchParams]);

  // Primary load: server is the single source of truth for the list.
  useEffect(() => {
    let cancelled = false;

    const fetchBookmarks = async () => {
      try {
        setLoading(true);
        setError(null);

        const result = await bookmarkApi.getBookmarks({ page, limit: PAGE_SIZE });

        if (cancelled) return;
        if (result.success) {
          setBookmarks(result.data.bookmarks);
          setPagination(result.data.pagination);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to fetch bookmarks:', err);
        setError('Failed to load your saved properties. Please try again.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchBookmarks();

    return () => {
      cancelled = true;
    };
  }, [page, retryCount]);

  // Converge the list with the server after a toggle settles on this page,
  // without using Redux ids as a visibility gate (that gate caused the
  // stale-state divergence). Silent: no loading spinner, no URL change.
  const prevPending = useRef(0);
  useEffect(() => {
    const settled = prevPending.current > 0 && pendingIds.length === 0;
    prevPending.current = pendingIds.length;
    if (!settled) return;

    let cancelled = false;
    (async () => {
      try {
        const result = await bookmarkApi.getBookmarks({ page, limit: PAGE_SIZE });
        if (!cancelled && result.success) {
          setBookmarks(result.data.bookmarks);
          setPagination(result.data.pagination);
        }
      } catch {
        /* primary effect owns error state */
      }
    })();
    return () => { cancelled = true; };
  }, [pendingIds, page]);

  const visibleBookmarks = bookmarks.filter((b) => {
    const pid = b.property?._id;
    return !(pid && pendingIds.includes(pid) && !ids.includes(pid));
  });

  // Removing the final bookmark on a page leaves it empty: step back.
  useEffect(() => {
    if (page > 1 && !loading && !error && visibleBookmarks.length === 0) {
      handlePageChange(page - 1);
    }
  }, [page, loading, error, visibleBookmarks.length, handlePageChange]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Saved Properties</h1>
        <p className="mt-1 text-sm text-gray-500">
          {pagination.total > 0
            ? `${pagination.total} saved ${pagination.total === 1 ? 'property' : 'properties'}`
            : 'Your bookmarked properties'}
        </p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600"></div>
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 p-6 text-center">
          <h3 className="text-sm font-medium text-red-800">{error}</h3>
          <button
            onClick={() => setRetryCount((c) => c + 1)}
            className="mt-4 rounded bg-red-100 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-200"
          >
            Try Again
          </button>
        </div>
      ) : visibleBookmarks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <Heart className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            You haven&apos;t saved any properties yet
          </h3>
          <p className="mt-2 max-w-md text-sm text-gray-500">
            Browse our listings and tap the heart icon to save properties you&apos;re interested in.
          </p>
          <Link
            to="/listings"
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <Search className="h-4 w-4" />
            <span>Browse Listings</span>
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleBookmarks.map((bookmark) =>
              bookmark.property ? (
                <PropertyCard key={bookmark._id} property={bookmark.property} />
              ) : null
            )}
          </div>

          {pagination.pages > 1 && (
            <div className="mt-12 flex items-center justify-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-white"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {pagination.pages}
              </span>
              <button
                disabled={page >= pagination.pages}
                onClick={() => handlePageChange(page + 1)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-white"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Bookmarks;
