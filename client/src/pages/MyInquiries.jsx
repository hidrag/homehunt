import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { MessageSquare, Search } from 'lucide-react';
import inquiryApi from '../services/inquiryApi';

const STATUS_STYLES = {
  pending: 'bg-yellow-100 text-yellow-800',
  responded: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-800',
};

const MyInquiries = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [pagination, setPagination] = useState({ pages: 1, total: 0, limit: 12 });

  const page = parseInt(searchParams.get('page') || '1', 10);

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

  useEffect(() => {
    const controller = new AbortController();

    const fetchInquiries = async () => {
      try {
        setLoading(true);
        setError(null);

        const result = await inquiryApi.getInquiries({ page, limit: 12 });

        if (result.success) {
          setInquiries(result.data.inquiries);
          setPagination(result.data.pagination);
        }
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
          return;
        }
        console.error('Failed to fetch inquiries:', err);
        setError('Failed to load your inquiries. Please try again.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchInquiries();

    return () => {
      controller.abort();
    };
  }, [page, retryCount]);

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">My Inquiries</h1>
        <p className="mt-1 text-sm text-gray-500">
          {pagination.total > 0
            ? `${pagination.total} ${pagination.total === 1 ? 'inquiry' : 'inquiries'} sent`
            : 'Your property inquiries'}
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
      ) : inquiries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <MessageSquare className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            You haven&apos;t sent any inquiries yet
          </h3>
          <p className="mt-2 max-w-md text-sm text-gray-500">
            Find a property you&apos;re interested in and use the Contact Agent form to send an inquiry.
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
          <div className="space-y-4">
            {inquiries.map((inquiry) => (
              <div
                key={inquiry._id}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="flex flex-col sm:flex-row">
                  {/* Property thumbnail */}
                  {inquiry.property && (
                    <Link
                      to={`/listings/${inquiry.property._id}`}
                      className="block shrink-0 sm:w-48"
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100 sm:h-full">
                        {inquiry.property.images && inquiry.property.images.length > 0 ? (
                          <img
                            src={inquiry.property.images[0]}
                            alt={inquiry.property.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-gray-400">
                            No Image
                          </div>
                        )}
                      </div>
                    </Link>
                  )}

                  {/* Inquiry details */}
                  <div className="flex-1 p-4 sm:p-5">
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        {inquiry.property && (
                          <Link
                            to={`/listings/${inquiry.property._id}`}
                            className="text-base font-semibold text-gray-900 hover:text-indigo-600 transition-colors"
                          >
                            {inquiry.property.title}
                          </Link>
                        )}
                        {inquiry.property && (
                          <p className="text-sm text-gray-500">
                            {inquiry.property.address?.city} · {formatPrice(inquiry.property.price)}
                          </p>
                        )}
                      </div>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                          STATUS_STYLES[inquiry.status] || STATUS_STYLES.pending
                        }`}
                      >
                        {inquiry.status}
                      </span>
                    </div>

                    <p className="mb-2 text-sm text-gray-600 line-clamp-2">
                      {inquiry.message}
                    </p>

                    <p className="text-xs text-gray-400">
                      Sent on {formatDate(inquiry.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
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

export default MyInquiries;
