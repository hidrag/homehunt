import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Trash2,
  XCircle,
  CalendarDays,
  User,
  MessagesSquare,
} from 'lucide-react';
import propertyApi from '../services/propertyApi';
import inquiryApi from '../services/inquiryApi';
import StatusBadge from '../components/ui/StatusBadge';
import visitApi from '../services/visitApi';
import conversationApi from '../services/conversationApi';

const PAGE_SIZE = 10;

const formatPrice = (price) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(price);

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const AgentDashboard = () => {
  const { user } = useSelector((state) => state.auth);
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = ['inquiries', 'visits', 'conversations'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'listings';
  const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
  const inquiryPage = Math.max(parseInt(searchParams.get('ipage') || '1', 10) || 1, 1);

  const [listings, setListings] = useState([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [listingsError, setListingsError] = useState(null);
  const [listingsRetry, setListingsRetry] = useState(0);
  const [listingsPagination, setListingsPagination] = useState({ pages: 1, total: 0 });

  const [inquiries, setInquiries] = useState([]);
  const [inquiriesLoading, setInquiriesLoading] = useState(true);
  const [inquiriesError, setInquiriesError] = useState(null);
  const [inquiriesRetry, setInquiriesRetry] = useState(0);
  const [inquiriesPagination, setInquiriesPagination] = useState({ pages: 1, total: 0 });

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingStatusId, setUpdatingStatusId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [visits, setVisits] = useState([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [visitsError, setVisitsError] = useState(null);
  const [visitsPagination, setVisitsPagination] = useState({ pages: 1, total: 0 });
  const [visitsRevision, setVisitsRevision] = useState(0);
  const [visitAction, setVisitAction] = useState(null);
  const visitPage = Math.max(parseInt(searchParams.get('vpage') || '1', 10) || 1, 1);

  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsError, setConversationsError] = useState(null);
  const [conversationsPagination, setConversationsPagination] = useState({ pages: 1, total: 0 });
  const [conversationsRevision, setConversationsRevision] = useState(0);
  const conversationPage = Math.max(parseInt(searchParams.get('cpage') || '1', 10) || 1, 1);

  useEffect(() => {
    let cancelled = false;

    const fetchListings = async () => {
      try {
        setListingsLoading(true);
        setListingsError(null);

        const result = await propertyApi.getMyProperties({ page, limit: PAGE_SIZE });

        if (cancelled) return;
        if (result.success) {
          setListings(result.data.properties);
          setListingsPagination(result.data.pagination);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to fetch your listings:', err);
        setListingsError('Failed to load your listings. Please try again.');
      } finally {
        if (!cancelled) {
          setListingsLoading(false);
        }
      }
    };

    fetchListings();

    return () => {
      cancelled = true;
    };
  }, [page, listingsRetry]);

  useEffect(() => {
    let cancelled = false;

    const fetchInquiries = async () => {
      try {
        setInquiriesLoading(true);
        setInquiriesError(null);

        const result = await inquiryApi.getAgentInquiries({ page: inquiryPage, limit: PAGE_SIZE });

        if (cancelled) return;
        if (result.success) {
          setInquiries(result.data.inquiries);
          setInquiriesPagination(result.data.pagination);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to fetch your inquiries:', err);
        setInquiriesError('Failed to load your inquiries. Please try again.');
      } finally {
        if (!cancelled) {
          setInquiriesLoading(false);
        }
      }
    };

    fetchInquiries();

    return () => {
      cancelled = true;
    };
  }, [inquiryPage, inquiriesRetry]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => { setVisitsLoading(true); setVisitsError(null); try { const result = await visitApi.getAgent({ page: visitPage, limit: PAGE_SIZE }); if (!cancelled) { setVisits(result.data.visits); setVisitsPagination(result.data.pagination); } } catch { if (!cancelled) setVisitsError('Failed to load visits. Please try again.'); } finally { if (!cancelled) setVisitsLoading(false); } };
    load(); return () => { cancelled = true; };
  }, [visitPage, visitsRevision]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setConversationsLoading(true); setConversationsError(null);
      try {
        const result = await conversationApi.getMine({ page: conversationPage, limit: PAGE_SIZE });
        if (!cancelled) { setConversations(result.data.conversations); setConversationsPagination(result.data.pagination); }
      } catch { if (!cancelled) setConversationsError('Failed to load conversations. Please try again.'); }
      finally { if (!cancelled) setConversationsLoading(false); }
    };
    load(); return () => { cancelled = true; };
  }, [conversationPage, conversationsRevision]);

  // Removing the final item on a page leaves it empty: step back one page.
  useEffect(() => {
    if (page > 1 && !listingsLoading && !listingsError && listings.length === 0) {
      const newParams = new URLSearchParams(searchParams);
      newParams.set('page', String(page - 1));
      setSearchParams(newParams, { replace: true });
    }
  }, [page, listingsLoading, listingsError, listings.length, searchParams, setSearchParams]);

  const changeTab = (nextTab) => {
    const newParams = new URLSearchParams(searchParams);
    if (nextTab === 'listings') {
      newParams.delete('tab');
    } else {
      newParams.set('tab', nextTab);
    }
    setSearchParams(newParams);
  };

  const changePage = (key, newPage) => {
    const newParams = new URLSearchParams(searchParams);
    if (newPage <= 1) {
      newParams.delete(key);
    } else {
      newParams.set(key, String(newPage));
    }
    setSearchParams(newParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    try {
      setDeletingId(id);
      setActionError(null);

      await propertyApi.deleteProperty(id);

      setConfirmDeleteId(null);
      setListingsRetry((count) => count + 1);
    } catch (err) {
      console.error('Failed to delete listing:', err);
      setActionError('Failed to delete the listing. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleStatusUpdate = async (id, status) => {
    try {
      setUpdatingStatusId(id);
      setActionError(null);

      const result = await inquiryApi.updateInquiryStatus(id, status);

      if (result.success) {
        setInquiries((prev) =>
          prev.map((inquiry) => (inquiry._id === id ? result.data.inquiry : inquiry)),
        );
      }
    } catch (err) {
      console.error('Failed to update inquiry status:', err);
      setActionError('Failed to update the inquiry status. Please try again.');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleVisitAction = async (approval) => {
    try {
      setVisitAction(null);
      setActionError(null);

      const result = await visitApi.updateStatus(approval.id, approval.status);

      if (result.success) {
        setVisits((prev) =>
          prev.map((visit) => (visit._id === approval.id ? result.data.visit : visit)),
        );
      }
    } catch (err) {
      console.error('Failed to update visit:', err);
      setActionError('Failed to update the visit. Please try again.');
    }
  };

  const tabClass = (isActive) =>
    `-mb-px flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
      isActive
        ? 'border-indigo-600 text-indigo-600'
        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
    }`;

  const paginationClass =
    'rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-white';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Agent Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Signed in as {user?.name} ({user?.role}) · Manage your listings and buyer inquiries
          </p>
        </div>
        <Link
          to="/agent/listings/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>Add Listing</span>
        </Link>
      </div>

      {actionError && (
        <div
          className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
            {actionError}
          </span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="font-medium text-red-700 hover:text-red-900"
          >
            Dismiss
          </button>
        </div>
      )}

      <div
        className="mb-6 flex gap-6 border-b border-gray-200"
        role="tablist"
        aria-label="Dashboard sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'listings'}
          onClick={() => changeTab('listings')}
          className={tabClass(tab === 'listings')}
        >
          <Building2 className="h-4 w-4" />
          <span>My Listings</span>
          {listingsPagination.total > 0 && (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
              {listingsPagination.total}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'inquiries'}
          onClick={() => changeTab('inquiries')}
          className={tabClass(tab === 'inquiries')}
        >
          <MessageSquare className="h-4 w-4" />
          <span>Inquiries</span>
          {inquiriesPagination.total > 0 && (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
              {inquiriesPagination.total}
            </span>
          )}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'visits'} onClick={() => changeTab('visits')} className={tabClass(tab === 'visits')}>
          <CalendarDays className="h-4 w-4" /><span>Visits</span>{visitsPagination.total > 0 && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{visitsPagination.total}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'conversations'} onClick={() => changeTab('conversations')} className={tabClass(tab === 'conversations')}>
          <MessagesSquare className="h-4 w-4" /><span>Conversations</span>{conversationsPagination.total > 0 && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{conversationsPagination.total}</span>}
        </button>
      </div>

      {tab === 'listings' ? listingsLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600"></div>
          </div>
        ) : listingsError ? (
          <div className="rounded-lg bg-red-50 p-6 text-center">
            <h3 className="text-sm font-medium text-red-800">{listingsError}</h3>
            <button
              onClick={() => setListingsRetry((count) => count + 1)}
              className="mt-4 rounded bg-red-100 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-200"
            >
              Try Again
            </button>
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <Building2 className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              You haven&apos;t created any listings yet
            </h3>
            <p className="mt-2 max-w-md text-sm text-gray-500">
              Create your first listing to start receiving inquiries from buyers.
            </p>
            <Link
              to="/agent/listings/new"
              className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              <span>Add Listing</span>
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {listings.map((listing) => (
                <div
                  key={listing._id}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row">
                    <Link to={`/listings/${listing._id}`} className="block shrink-0 sm:w-48">
                      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100 sm:h-full">
                        {listing.images && listing.images.length > 0 ? (
                          <img
                            src={listing.images[0]}
                            alt={listing.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-gray-400">
                            No Image
                          </div>
                        )}
                      </div>
                    </Link>

                    <div className="flex-1 p-4 sm:p-5">
                      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <Link
                            to={`/listings/${listing._id}`}
                            className="text-base font-semibold text-gray-900 hover:text-indigo-600 transition-colors"
                          >
                            {listing.title}
                          </Link>
                          <p className="text-sm text-gray-500">
                            {listing.address?.city} · {formatPrice(listing.price)} ·{' '}
                            <span className="capitalize">
                              {listing.listingType} · {listing.propertyType}
                            </span>
                          </p>
                        </div>
                        <StatusBadge status={listing.status} />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Link
                          to={`/agent/listings/${listing._id}/edit`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span>Edit</span>
                        </Link>
                        {confirmDeleteId === listing._id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDelete(listing._id)}
                              disabled={deletingId === listing._id}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>{deletingId === listing._id ? 'Deleting...' : 'Confirm Delete'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={deletingId === listing._id}
                              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(listing._id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {listingsPagination.pages > 1 && (
              <div className="mt-12 flex items-center justify-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => changePage('page', page - 1)}
                  className={paginationClass}
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {page} of {listingsPagination.pages}
                </span>
                <button
                  disabled={page >= listingsPagination.pages}
                  onClick={() => changePage('page', page + 1)}
                  className={paginationClass}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )
      : tab === 'inquiries' ? inquiriesLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600"></div>
        </div>
      ) : inquiriesError ? (
        <div className="rounded-lg bg-red-50 p-6 text-center">
          <h3 className="text-sm font-medium text-red-800">{inquiriesError}</h3>
          <button
            onClick={() => setInquiriesRetry((count) => count + 1)}
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
          <h3 className="text-lg font-semibold text-gray-900">No inquiries yet</h3>
          <p className="mt-2 max-w-md text-sm text-gray-500">
            When buyers contact you about your listings, their inquiries will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {inquiries.map((inquiry) => (
              <div
                key={inquiry._id}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="p-4 sm:p-5">
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      {inquiry.property ? (
                        <Link
                          to={`/listings/${inquiry.property._id}`}
                          className="text-base font-semibold text-gray-900 hover:text-indigo-600 transition-colors"
                        >
                          {inquiry.property.title}
                        </Link>
                      ) : (
                        <p className="text-base font-semibold text-gray-500">
                          Listing no longer available
                        </p>
                      )}
                      <p className="text-sm text-gray-500">
                        From <span className="font-medium text-gray-700">{inquiry.name}</span> ·{' '}
                        {formatDate(inquiry.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={inquiry.status} />
                  </div>

                  <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                    <a
                      href={`mailto:${inquiry.email}`}
                      className="inline-flex items-center gap-1.5 hover:text-indigo-600 transition-colors"
                    >
                      <Mail className="h-3.5 w-3.5 text-gray-400" />
                      <span>{inquiry.email}</span>
                    </a>
                    {inquiry.phone && (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-gray-400" />
                        <span>{inquiry.phone}</span>
                      </span>
                    )}
                  </div>

                  <p className="mb-3 text-sm text-gray-600">{inquiry.message}</p>

                  {inquiry.status !== 'closed' && (
                    <div className="flex flex-wrap items-center gap-2">
                      {inquiry.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => handleStatusUpdate(inquiry._id, 'responded')}
                          disabled={updatingStatusId === inquiry._id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Mark Responded</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleStatusUpdate(inquiry._id, 'closed')}
                        disabled={updatingStatusId === inquiry._id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        <span>Close Inquiry</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {inquiriesPagination.pages > 1 && (
            <div className="mt-12 flex items-center justify-center gap-2">
              <button
                disabled={inquiryPage <= 1}
                onClick={() => changePage('ipage', inquiryPage - 1)}
                className={paginationClass}
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {inquiryPage} of {inquiriesPagination.pages}
              </span>
              <button
                disabled={inquiryPage >= inquiriesPagination.pages}
                onClick={() => changePage('ipage', inquiryPage + 1)}
                className={paginationClass}
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : tab === 'visits' ? (
        visitsLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600"></div>
          </div>
        ) : visitsError ? (
          <div className="rounded-lg bg-red-50 p-6 text-center">
            <h3 className="text-sm font-medium text-red-800">{visitsError}</h3>
            <button
              onClick={() => setVisitsRevision((count) => count + 1)}
              className="mt-4 rounded bg-red-100 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-200"
            >
              Try Again
            </button>
          </div>
        ) : visits.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <CalendarDays className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">No visit requests yet</h3>
            <p className="mt-2 max-w-md text-sm text-gray-500">
              When buyers request a viewing for one of your listings, it will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {visits.map((visit) => (
                <div
                  key={visit._id}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                >
                  <div className="p-4 sm:p-5">
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        {visit.property ? (
                          <Link
                            to={`/listings/${visit.property._id}`}
                            className="text-base font-semibold text-gray-900 hover:text-indigo-600 transition-colors"
                          >
                            {visit.property.title}
                          </Link>
                        ) : (
                          <p className="text-base font-semibold text-gray-500">
                            Listing no longer available
                          </p>
                        )}
                        <p className="text-sm text-gray-500">
                          {new Date(visit.startAt).toLocaleString('en-IN')} · {visit.timezone} ·{' '}
                          {Math.round((new Date(visit.endAt) - new Date(visit.startAt)) / 60000)}{' '}
                          minutes
                        </p>
                      </div>
                      <StatusBadge status={visit.status} />
                    </div>

                    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                      <span className="inline-flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-gray-400" />
                        <span>
                          {visit.buyer?.name || 'Account unavailable'}
                          {visit.buyer?.email ? ` · ${visit.buyer.email}` : ''}
                        </span>
                      </span>
                    </div>

                    {visit.note && <p className="mb-3 text-sm text-gray-600">{visit.note}</p>}

                    {(visit.status === 'pending' || visit.status === 'confirmed') && (
                      <div className="flex flex-wrap items-center gap-2">
                        {visit.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setVisitAction({ id: visit._id, status: 'confirmed', label: 'Confirm this visit?' })
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 transition-colors"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Confirm</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setVisitAction({ id: visit._id, status: 'declined', label: 'Decline this visit request?' })
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              <span>Decline</span>
                            </button>
                          </>
                        )}
                        {visit.status === 'confirmed' && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setVisitAction({ id: visit._id, status: 'completed', label: 'Mark this visit as completed?' })
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Mark completed</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setVisitAction({ id: visit._id, status: 'cancelled', label: 'Cancel this visit?' })
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              <span>Cancel visit</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {visitAction?.id === visit._id && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-gray-800">
                        <p>{visitAction.label}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleVisitAction(visitAction)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setVisitAction(null)}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {visitsPagination.pages > 1 && (
              <div className="mt-12 flex items-center justify-center gap-2">
                <button
                  disabled={visitPage <= 1}
                  onClick={() => changePage('vpage', visitPage - 1)}
                  className={paginationClass}
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {visitPage} of {visitsPagination.pages}
                </span>
                <button
                  disabled={visitPage >= visitsPagination.pages}
                  onClick={() => changePage('vpage', visitPage + 1)}
                  className={paginationClass}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )
      ) : tab === 'conversations' ? (
        conversationsLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600"></div>
          </div>
        ) : conversationsError ? (
          <div className="rounded-lg bg-red-50 p-6 text-center">
            <h3 className="text-sm font-medium text-red-800">{conversationsError}</h3>
            <button
              onClick={() => setConversationsRevision((count) => count + 1)}
              className="mt-4 rounded bg-red-100 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-200"
            >
              Try Again
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <MessagesSquare className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">No conversations yet</h3>
            <p className="mt-2 max-w-md text-sm text-gray-500">
              When buyers message you about your listings, the conversations will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {conversations.map((conversation) => (
                <div key={conversation._id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="p-4 sm:p-5">
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        {conversation.property ? (
                          <Link to={`/listings/${conversation.property._id}`} className="text-base font-semibold text-gray-900 hover:text-indigo-600 transition-colors">
                            {conversation.property.title}
                          </Link>
                        ) : (
                          <p className="text-base font-semibold text-gray-500">Listing no longer available</p>
                        )}
                        <p className="text-sm text-gray-500">
                          From <span className="font-medium text-gray-700">{conversation.buyer?.name || 'Account unavailable'}</span>
                          {conversation.buyer?.email ? ` · ${conversation.buyer.email}` : ''}
                        </p>
                      </div>
                      {conversation.agentUnread > 0 && (
                        <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-indigo-600 px-2 text-xs font-semibold text-white">
                          {conversation.agentUnread}
                        </span>
                      )}
                    </div>
                    <p className="mb-3 line-clamp-2 break-words text-sm text-gray-600">
                      {conversation.lastMessage?.body}
                    </p>
                    <Link
                      to={`/messages/${conversation._id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <MessagesSquare className="h-3.5 w-3.5" />
                      <span>Open conversation</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {conversationsPagination.pages > 1 && (
              <div className="mt-12 flex items-center justify-center gap-2">
                <button
                  disabled={conversationPage <= 1}
                  onClick={() => changePage('cpage', conversationPage - 1)}
                  className={paginationClass}
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {conversationPage} of {conversationsPagination.pages}
                </span>
                <button
                  disabled={conversationPage >= conversationsPagination.pages}
                  onClick={() => changePage('cpage', conversationPage + 1)}
                  className={paginationClass}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )
      ) : null}
    </div>
  );
};

export default AgentDashboard;
