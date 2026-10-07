import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Bell } from 'lucide-react';
import notificationApi from '../../services/notificationApi';
import { NotificationRow } from './NotificationRow';
import { notificationHref } from '../../lib/notifications';
import { clearUnread, fetchUnreadCount } from '../../features/notifications/notificationsSlice';

/**
 * Header bell with live unread badge + flyout of the most recent 8
 * notifications (S10). Real-time count bumps arrive via the socket
 * (notifications slice); opening the flyout refreshes the list once.
 */
const NotificationBell = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const unread = useSelector((state) => state.notifications.unread);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const fetchResult = await notificationApi.list({ page: 1, limit: 8 });
        if (!cancelled) setItems(fetchResult.data.notifications);
      } catch {
        // Flyout stays empty on failure — the full page has its own retry.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
  }, [open, unread]);

  const openNotification = async (notification) => {
    try {
      if (!notification.read) {
        await notificationApi.markRead(notification._id);
        setItems((prev) => prev.map((n) => (n._id === notification._id ? { ...n, read: true } : n)));
        dispatch(fetchUnreadCount());
      }
    } catch {
      // still navigate below
    }
    setOpen(false);
    navigate(notificationHref(notification));
  };

  const markAll = async () => {
    try {
      setMarkingAll(true);
      await notificationApi.markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      dispatch(clearUnread());
    } catch {
      // best effort; the full page offers retry
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
        className="relative flex h-11 w-11 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
            <button
              type="button"
              onClick={markAll}
              disabled={markingAll || unread === 0}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              {markingAll ? 'Marking…' : 'Mark all read'}
            </button>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto p-3">
            {loading && items.length === 0 ? (
              <div className="flex h-24 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600"></div>
              </div>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">You&apos;re all caught up.</p>
            ) : (
              items.map((notification) => (
                <NotificationRow
                  key={notification._id}
                  notification={notification}
                  onOpen={openNotification}
                  onDelete={() => {}}
                />
              ))
            )}
          </div>
          <div className="border-t border-gray-100 p-2">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center justify-center rounded-lg text-sm font-medium text-indigo-600 hover:bg-indigo-50"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
