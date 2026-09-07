import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import propertyApi from '../services/propertyApi';
import PropertyCard from '../components/ui/PropertyCard';
import PropertyFilters from '../components/ui/PropertyFilters';
import { RotateCcw } from 'lucide-react';

const Listings = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ pages: 1, total: 0, limit: 12 });

  // 1. Read canonical frontend parameters from URL query string
  const q = searchParams.get('q') || '';
  const city = searchParams.get('city') || '';
  const type = searchParams.get('type') || '';
  const listing = searchParams.get('listing') || '';
  const minPrice = searchParams.get('minPrice') || '';
  const maxPrice = searchParams.get('maxPrice') || '';
  const beds = searchParams.get('beds') || '';
  const sort = searchParams.get('sort') || 'newest';
  const page = parseInt(searchParams.get('page') || '1', 10);

  const isFiltered = Boolean(
    q || city || type || listing || minPrice || maxPrice || beds || (sort && sort !== 'newest')
  );

  const filters = {
    q,
    city,
    type,
    listing,
    minPrice,
    maxPrice,
    beds,
    sort,
  };

  // 2. Filter changes reset page=1 and remove empty / default values
  const handleFilterChange = (key, value) => {
    const newParams = new URLSearchParams(searchParams);

    if (
      value === undefined ||
      value === null ||
      value === '' ||
      (key === 'sort' && value === 'newest')
    ) {
      newParams.delete(key);
    } else {
      newParams.set(key, String(value));
    }

    // Changing any filter resets page=1 (omit page parameter for canonical clean URL)
    newParams.delete('page');

    setSearchParams(newParams);
  };

  // 3. Clear all filters returns to canonical /listings with no parameters
  const handleClearFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  // 4. Changing only page preserves all other active parameters
  const handlePageChange = (newPage) => {
    const newParams = new URLSearchParams(searchParams);
    if (newPage <= 1) {
      newParams.delete('page');
    } else {
      newParams.set('page', String(newPage));
    }
    setSearchParams(newParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 5. Fetch properties whenever searchParams changes, with AbortController for race conditions
  useEffect(() => {
    const controller = new AbortController();

    const fetchProperties = async () => {
      try {
        setLoading(true);
        setError(null);

        const currentParams = {
          q,
          city,
          type,
          listing,
          minPrice,
          maxPrice,
          beds,
          sort,
          page,
          limit: 12,
        };

        const result = await propertyApi.getProperties(currentParams, {
          signal: controller.signal,
        });

        if (result.success) {
          setProperties(result.data.properties);
          setPagination(result.data.pagination);
        }
      } catch (err) {
        // Ignore aborted / cancelled requests
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
          return;
        }
        console.error('Failed to fetch properties:', err);
        setError('Failed to load properties. Please try again later.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchProperties();

    return () => {
      controller.abort();
    };
  }, [searchParams, q, city, type, listing, minPrice, maxPrice, beds, sort, page]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header section */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Discover Properties</h1>
        <p className="mt-1 text-sm text-gray-500">
          {pagination.total > 0
            ? `Showing ${properties.length} of ${pagination.total} properties`
            : 'Find your dream home today'}
        </p>
      </div>

      {/* Filter Bar */}
      <div className="mb-8">
        <PropertyFilters
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
          isFiltered={isFiltered}
        />
      </div>

      {/* Content area: Loading, Error, Empty, or Property Grid */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600"></div>
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 p-6 text-center">
          <h3 className="text-sm font-medium text-red-800">{error}</h3>
          <button
            onClick={() => handlePageChange(page)}
            className="mt-4 rounded bg-red-100 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-200"
          >
            Try Again
          </button>
        </div>
      ) : properties.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
          <h3 className="text-lg font-semibold text-gray-900">No properties found</h3>
          <p className="mt-2 max-w-md text-sm text-gray-500">
            {isFiltered
              ? 'No properties matched your current search and filter criteria. Try adjusting or clearing your filters.'
              : "We couldn't find any properties at this time."}
          </p>
          {isFiltered && (
            <button
              onClick={handleClearFilters}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Clear All Filters</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {properties.map((property) => (
              <PropertyCard key={property._id} property={property} />
            ))}
          </div>

          {/* Pagination Controls */}
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

export default Listings;
