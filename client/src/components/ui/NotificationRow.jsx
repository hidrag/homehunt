import { Bell } from 'lucide-react';
import React from 'react';
import { TYPE_LABELS } from '../../lib/notifications';

export const NotificationRow = ({ notification, onOpen, onDelete }) => (
  <div className={`group relative min-w-0 rounded-lg border p-3 ${notification.read ? 'border-gray-200 bg-white' : 'border-indigo-100 bg-indigo-50/60'}`}>
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className="block w-full rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <Bell className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
        {TYPE_LABELS[notification.type] || 'Notification'}
        {!notification.read && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-indigo-600" aria-label="Unread" />}
      </span>
      <span className="mt-1 block break-words text-sm font-semibold text-gray-900">{notification.title}</span>
      <span className="mt-0.5 block whitespace-pre-wrap break-words text-sm text-gray-600">{notification.body}</span>
      <span className="mt-1 block text-xs text-gray-400">
        {new Date(notification.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
      </span>
    </button>
    {onDelete && (
      <button
        type="button"
        onClick={() => onDelete(notification)}
        className="absolute right-2 top-2 hidden rounded p-1 text-xs font-medium text-gray-400 hover:bg-gray-100 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 group-hover:block"
        aria-label="Dismiss notification"
      >
        Dismiss
      </button>
    )}
  </div>
);

export default NotificationRow;
