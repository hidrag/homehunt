import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Bell } from 'lucide-react';
import notificationApi from '../services/notificationApi';
import { NotificationRow } from '../components/ui/NotificationRow';
import { notificationHref } from '../lib/notifications';
import { clearUnread, fetchUnreadCount } from '../features/notifications/notificationsSlice';

const PAGE_SIZE = 20;

const Notifications = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [params, setParams] = useSearchParams();
  const page = Math.max(Number.parseInt(params.get('page') || '1', 10) || 1, 1);
  const unreadOnly = params.get('unread') === 'true';

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [actionError, setActionError] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    let cancelled = false;
    try {
      setLoading(true);
      setError(null);
      const result = await notificationApi.list({
        page,
        limit: PAGE_SIZE,
        ...(unreadOnly ? { unread: 'true' } : {}),
      });
      if (cancelled) return;
      setItems(result.data.notifications);
      setPagination(result.data.pagination);
    } catch {
      if (!cancelled) setError('Failed to load your notifications. Please try again.');
    } finally {
      if (!cancelled) setLoading(false);
    }
  }, [page, unreadOnly]);

  useEffect(() => {
    load();
  }, [load, retry]);

  const changeParams = (updates) => {
    const next = new URLSearchParams(params);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '' || value === undefined) next.delete(key);
      else next.set(key, String(value));
    });
    setParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openNotification = async (notification) => {
    try {
      if (!notification.read) {
        await notificationApi.markRead(notification._id);
        setItems((prev) => prev.map((n) => (n._id === notification._id ? { ...n, read: true } : n)));
        dispatch(fetchUnreadCount());
      }
    } catch {
      // Navigation should still work if the read receipt fails.
    }
    navigate(notificationHref(notification));
  };

  const dismiss = async (notification) => {
    try {
      await notificationApi.remove(notification._id);
      setItems((prev) => prev.filter((n) => n._id !== notification._id));
      setPagination((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
      dispatch(fetchUnreadCount());
    } catch {
      setActionError('Could not dismiss this notification. Please try again.');
    }
  };

  const markAll = async () => {
    try {
      setMarkingAll(true);
      setActionError(null);
      await notificationApi.markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      dispatch(clearUnread());
    } catch {
      setActionError('Could not mark all as read. Please try again.');
    } finally {
      setMarkingAll(false);
    }
  };

  const secondaryButton =
    'min-h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <main className="mx-auto w-full max-w-3xl min-w-0 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Notifications</h1>
          <p className="mt-1 text-sm text-gray-500">
            Saved-search matches, visit updates, inquiries and messages.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => changeParams({ unread: unreadOnly ? null : 'true', page: null })}
            aria-pressed={unreadOnly}
            className={`min-h-11 rounded-lg px-4 text-sm font-medium ${
              unreadOnly
                ? 'border border-indigo-600 bg-indigo-600 text-white'
                : secondaryButton
            }`}
          >
            Unread only
          </button>
          <button
            type="button"
            onClick={markAll}
            disabled={markingAll}
            className={secondaryButton}
          >
            {markingAll ? 'Marking…' : 'Mark all read'}
          </button>
        </div>
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
      ) : items.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <Bell className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            {unreadOnly ? 'No unread notifications' : 'No notifications yet'}
          </h3>
          <p className="mt-2 max-w-md text-sm text-gray-500">
            Alerts appear here when a new listing matches a saved search or your visits,
            inquiries and chats move.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-3">
            {items.map((notification) => (
              <NotificationRow
                key={notification._id}
                notification={notification}
                onOpen={openNotification}
                onDelete={dismiss}
              />
            ))}
          </div>

          {pagination.pages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2 text-sm">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => changeParams({ page: page - 1 })}
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
                onClick={() => changeParams({ page: page + 1 })}
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

export default Notifications;
