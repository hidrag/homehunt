/**
 * S15 (ADR-039) — local Notification API delivery for a backgrounded tab.
 *
 * Socket events already reach every open tab (ADR-030 user rooms). When a
 * `notification:new` arrives while the tab is hidden, this shows an OS-level
 * notification using the same fixed click-through routing as the bell
 * (notificationHref — no server-supplied URLs, so no open-redirect surface).
 *
 * Permission is NEVER requested here: the user grants it via the explicit
 * bell-menu toggle (user gesture requirement). VAPID/Web Push is deferred
 * post-MVP — this is local-only delivery, no service-worker push handler.
 */
import { notificationHref } from './notifications';

export const notificationPermission = () =>
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;

/** Must be called from a user gesture (browser requirement). */
export const requestNotificationPermission = async () => {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
};

/**
 * Show a local notification for a socket-delivered item, only when the tab
 * is hidden and permission is already granted. Clicking focuses the tab and
 * navigates through the shared routing helper.
 */
export const showBackgroundNotification = (notification) => {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission !== 'granted') return false;
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return false;

  try {
    const shown = new Notification(notification.title || 'HomeHunt', {
      body: notification.body || '',
      icon: '/pwa-192x192.png',
      tag: notification._id || undefined,
    });
    shown.onclick = () => {
      window.focus();
      const href = notificationHref(notification);
      if (href) window.location.assign(href);
      shown.close();
    };
    return true;
  } catch {
    return false;
  }
};
