/**
 * Notification delivery service (S10, ADR-030).
 *
 * Every trigger is fire-and-forget: helpers swallow their own errors and log
 * `[NOTIFY_ERROR]` — a notification or email failure never aborts, delays,
 * or rolls back the primary mutation (property creation, visit transition,
 * inquiry, message send).
 *
 * Recipients are always server-derived from persisted event participants,
 * never request input (ADR-024 recipient rule). Titles/bodies are
 * server-authored template text.
 */
import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Property from '../models/Property.js';
import { emitToUser } from '../sockets/registry.js';
import { sendNotificationEmail } from './email.service.js';
import { escapeHtml } from './email/visit.templates.js';

const fail = (status, code, message) => { throw { status, code, message }; };

const guarded = async (label, fn) => {
  try {
    await fn();
  } catch (error) {
    console.error('[NOTIFY_ERROR]', label, error.message);
  }
};

const truncate = (value, max) => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const idOf = (value) => (value && value._id ? value._id : value);

const money = (value) => Number(value || 0).toLocaleString('en-US');

const clientUrl = () => process.env.CLIENT_URL || 'http://localhost:5173';

/** Persist a notification, then push it to the recipient's user room. */
const insert = async ({ recipient, type, title, body, resourceRef }) => {
  const doc = await Notification.create({
    recipient,
    type,
    title: truncate(title, 140),
    body: truncate(body, 500),
    resourceRef,
  });
  emitToUser(recipient, 'notification:new', { notification: doc.toObject() });
  return doc;
};

/**
 * `listing_match` — in-app + email (locked matrix). Called from the matching
 * sweep with the search owner's email (may be undefined → in-app only).
 */
export const notifyListingMatch = async (search, property, email) => guarded('listing_match', async () => {
  const city = property.address?.city || '';
  const title = `New match for "${truncate(search.name, 60)}"`;
  const body = `${truncate(property.title, 120)} — ${property.listingType}${city ? ` in ${city}` : ''}, ${money(property.price)}`;
  await insert({ recipient: search.user, type: 'listing_match', title, body, resourceRef: { kind: 'property', id: property._id } });
  if (email) {
    await sendNotificationEmail({
      to: email,
      event: 'listing_match',
      subject: 'New listing matches your saved search',
      html: `<h1>New listing matches your saved search</h1><p><strong>${escapeHtml(search.name)}</strong></p><p>${escapeHtml(property.title)} — ${escapeHtml(money(property.price))}${city ? ` in ${escapeHtml(city)}` : ''}</p><p><a href="${escapeHtml(clientUrl())}/listings/${escapeHtml(String(property._id))}">View listing</a></p>`,
    });
  }
});

const VISIT_TITLES = { confirmed: 'Visit confirmed', declined: 'Visit declined', cancelled: 'Visit cancelled' };

/**
 * `visit_update` — in-app only (locked matrix; S8 emails preserved, never
 * duplicated). `requested` and `completed` produce no notification.
 * Cancellation notifies the opposite party (admin cancels notify both).
 */
export const notifyVisitUpdate = async (visit, nextStatus, role) => guarded('visit_update', async () => {
  const title = VISIT_TITLES[nextStatus];
  if (!title) return;
  const buyer = idOf(visit.buyer);
  const agent = idOf(visit.agent);
  const recipients = nextStatus === 'cancelled'
    ? (role === 'buyer' ? [agent] : role === 'agent' ? [buyer] : [buyer, agent])
    : [buyer];
  const propertyTitle = visit.property?.title || 'Listing no longer available';
  const body = `${propertyTitle} — ${new Date(visit.startAt).toISOString()}`;
  for (const recipient of recipients.filter(Boolean)) {
    await insert({ recipient, type: 'visit_update', title, body, resourceRef: { kind: 'visit', id: visit._id } });
  }
});

/** `inquiry_update` — in-app + email to the agent (locked matrix). */
export const notifyInquiryUpdate = async ({ agentId, inquiryId, propertyTitle, buyerName, buyerEmail, message }) => guarded('inquiry_update', async () => {
  const title = `New inquiry: ${truncate(propertyTitle || 'Listing', 100)}`;
  const body = `${truncate(buyerName, 80)} (${truncate(buyerEmail, 120)}) — ${truncate(message, 160)}`;
  await insert({ recipient: agentId, type: 'inquiry_update', title, body, resourceRef: { kind: 'inquiry', id: inquiryId } });
  const agent = await User.findById(agentId).select('email').lean();
  if (agent?.email) {
    await sendNotificationEmail({
      to: agent.email,
      event: 'inquiry_update',
      subject: 'New inquiry on your listing',
      html: `<h1>New inquiry on your listing</h1><p>${escapeHtml(propertyTitle || 'Listing')}</p><p>${escapeHtml(buyerName)} (${escapeHtml(buyerEmail)})</p><p>${escapeHtml(message)}</p>`,
    });
  }
});

/** `message_alert` — in-app only (locked matrix; no email on chat in S10). */
export const notifyMessageAlert = async (conversation, senderId, body) => guarded('message_alert', async () => {
  const buyer = idOf(conversation.buyer);
  const agent = idOf(conversation.agent);
  const recipient = String(senderId) === String(buyer) ? agent : buyer;
  if (!recipient) return;
  const property = await Property.findById(conversation.property).select('title').lean();
  const title = property?.title ? `New message about ${truncate(property.title, 100)}` : 'New message';
  await insert({ recipient, type: 'message_alert', title, body: truncate(body, 200), resourceRef: { kind: 'conversation', id: conversation._id } });
});

/**
 * `verification_update` — in-app only (S13, ADR-036; extends the locked
 * ADR-030 matrix with user approval). Recipient is the listing's agent,
 * server-derived from the Property document (never request input).
 */
export const notifyVerificationUpdate = async (property, decision, reason) => guarded('verification_update', async () => {
  const agent = idOf(property.agent);
  if (!agent) return;
  const title = decision === 'approve' ? 'Listing verified' : 'Verification rejected';
  const body = decision === 'approve'
    ? `${truncate(property.title, 120)} has been verified. Your listing now shows the Verified badge.`
    : `${truncate(property.title, 120)} was rejected: ${truncate(reason || 'No reason provided', 300)}`;
  await insert({ recipient: agent, type: 'verification_update', title, body, resourceRef: { kind: 'property', id: property._id } });
});

/**
 * `price_drop` — in-app + email (S14, ADR-037; extends the locked ADR-030
 * matrix with user approval). Called by the price-drop sweep for each
 * matching saved search whose owner opted into listing matches. Recipient
 * is the saved search's owner (server-derived).
 */
export const notifyPriceDrop = async (search, property, oldPrice, newPrice, email) => guarded('price_drop', async () => {
  const city = property.address?.city || '';
  const title = `Price drop on "${truncate(search.name, 50)}"`;
  const body = `${truncate(property.title, 120)}${city ? ` in ${city}` : ''}: ${money(oldPrice)} → ${money(newPrice)}`;
  await insert({ recipient: search.user, type: 'price_drop', title, body, resourceRef: { kind: 'property', id: property._id } });
  if (email) {
    await sendNotificationEmail({
      to: email,
      event: 'price_drop',
      subject: 'A saved-search listing dropped in price',
      html: `<h1>A saved-search listing dropped in price</h1><p><strong>${escapeHtml(search.name)}</strong></p><p>${escapeHtml(property.title)} — was ${escapeHtml(money(oldPrice))}, now <strong>${escapeHtml(money(newPrice))}</strong>${city ? ` in ${escapeHtml(city)}` : ''}</p><p><a href="${escapeHtml(clientUrl())}/listings/${escapeHtml(String(property._id))}">View listing</a></p>`,
    });
  }
});

/**
 * Inbox operations — every query is recipient-scoped; misses are 404
 * (enumeration guard, ADR-030).
 */
export const list = async (userId, page = 1, limit = 10, unread) => {
  const filter = { recipient: userId };
  if (unread === true) filter.read = false;
  else if (unread === false) filter.read = true;
  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
  ]);
  return { notifications, pagination: { total, page, pages: Math.ceil(total / limit), limit } };
};

export const unreadCount = async (userId) => ({ unread: await Notification.countDocuments({ recipient: userId, read: false }) });

export const markRead = async (id, userId) => {
  if (!mongoose.isValidObjectId(id)) fail(400, 'INVALID_ID', 'Invalid notification id');
  const updated = await Notification.findOneAndUpdate(
    { _id: id, recipient: userId, read: false },
    { $set: { read: true, readAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (updated) return updated.toObject();
  // Idempotent re-read returns the document; a foreign/missing id is 404.
  const existing = await Notification.findOne({ _id: id, recipient: userId });
  if (!existing) fail(404, 'NOT_FOUND', 'Notification not found');
  return existing.toObject();
};

export const markAllRead = async (userId) => {
  const result = await Notification.updateMany(
    { recipient: userId, read: false },
    { $set: { read: true, readAt: new Date() } },
  );
  return { updated: result.modifiedCount };
};

export const remove = async (id, userId) => {
  if (!mongoose.isValidObjectId(id)) fail(400, 'INVALID_ID', 'Invalid notification id');
  const doc = await Notification.findOneAndDelete({ _id: id, recipient: userId });
  if (!doc) fail(404, 'NOT_FOUND', 'Notification not found');
  return { deleted: true };
};