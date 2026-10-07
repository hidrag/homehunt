/**
 * Click-through mapping for notification resources (ADR-030). A fixed
 * switch on resourceRef.kind — no server-stored URLs are ever rendered,
 * so no open-redirect surface exists. Deleted entities navigate like the
 * live ones; the destination renders its own "no longer available" state.
 */
export const notificationHref = (notification) => {
  const ref = notification?.resourceRef;
  if (!ref || !ref.id) return '/notifications';
  switch (ref.kind) {
    case 'property':
      return `/listings/${ref.id}`;
    case 'conversation':
      return `/messages/${ref.id}`;
    case 'visit':
      return '/visits';
    case 'inquiry':
      return '/inquiries';
    default:
      return '/notifications';
  }
};

export const TYPE_LABELS = {
  listing_match: 'Saved search',
  visit_update: 'Visit',
  message_alert: 'Message',
  inquiry_update: 'Inquiry',
};
