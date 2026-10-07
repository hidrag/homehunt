import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Property from '../models/Property.js';
import { emitToConversation } from '../sockets/registry.js';
import { notifyMessageAlert } from './notification.service.js';

const fail = (status, code, message) => { throw { status, code, message }; };
const safe = (doc) => (doc?.toObject ? doc.toObject() : doc);

const PROPERTY_SUMMARY = 'title price images address.city address.state listingType';
const USER_SUMMARY = 'name email';

const participantFilter = (id, userId) => ({ _id: id, $or: [{ buyer: userId }, { agent: userId }] });

/**
 * Resolves a conversation the caller participates in, or throws 404.
 * Cross-participant access never reveals record existence (enumeration guard).
 */
const requireParticipant = async (id, userId) => {
  if (!mongoose.isValidObjectId(id)) fail(400, 'INVALID_ID', 'Invalid conversation id');
  const conversation = await Conversation.findOne(participantFilter(id, userId));
  if (!conversation) fail(404, 'NOT_FOUND', 'Conversation not found');
  return conversation;
};

export const isParticipant = (conversation, userId) => {
  const actor = String(userId);
  return Boolean(conversation) && (String(conversation.buyer) === actor || String(conversation.agent) === actor);
};

/**
 * Opens (or reuses) the property-bound thread between the caller and the
 * property's agent, persisting the opening message. Idempotent on
 * (property, buyer) — ADR-027.
 */
export const openConversation = async (buyerId, input = {}) => {
  const { propertyId, body } = input;
  if (!mongoose.isValidObjectId(propertyId)) fail(400, 'INVALID_ID', 'Invalid property id');
  if (typeof body !== 'string' || body.trim().length < 1) fail(400, 'VALIDATION_ERROR', 'Message body is required');
  if (body.trim().length > 2000) fail(400, 'VALIDATION_ERROR', 'Message must be 2000 characters or fewer');

  const property = await Property.findById(propertyId).select('agent status').lean();
  if (!property || !property.agent) fail(404, 'NOT_FOUND', 'Property not found');

  const trimmed = body.trim();
  let conversation = await Conversation.findOne({ property: propertyId, buyer: buyerId });
  const created = !conversation;
  if (created) {
    try {
      conversation = await Conversation.create({ property: propertyId, buyer: buyerId, agent: property.agent });
    } catch (error) {
      // Concurrent open: the unique (property, buyer) index rejects the loser.
      if (error?.code === 11000) conversation = await Conversation.findOne({ property: propertyId, buyer: buyerId });
      else throw error;
    }
  }

  const message = await Message.create({ conversation: conversation._id, sender: buyerId, body: trimmed });
  conversation.lastMessage = { body: trimmed, sender: buyerId, sentAt: message.createdAt };
  conversation.agentUnread += 1;
  await conversation.save();

  const payload = await Message.findById(message._id).populate('sender', USER_SUMMARY).lean();
  emitToConversation(conversation._id, 'message:new', payload);
  void notifyMessageAlert(conversation, buyerId, trimmed);

  return { conversation: safe(conversation), message: payload, created };
};

/**
 * Paginated inbox for a participant role. `role` is 'buyer' or 'agent'.
 * Newest activity first; deleted properties resolve to null.
 */
export const listConversations = async (userId, role, page = 1, limit = 10) => {
  const filter = { [role]: userId };
  const [conversations, total] = await Promise.all([
    Conversation.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('property', PROPERTY_SUMMARY)
      .populate('buyer', USER_SUMMARY)
      .populate('agent', USER_SUMMARY)
      .lean(),
    Conversation.countDocuments(filter),
  ]);
  return { conversations, pagination: { total, page, pages: Math.ceil(total / limit), limit } };
};

/** Paginated message history (newest first) for a participant. */
export const listMessages = async (id, userId, page = 1, limit = 20) => {
  const conversation = await requireParticipant(id, userId);
  const [messages, total] = await Promise.all([
    Message.find({ conversation: conversation._id })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('sender', USER_SUMMARY)
      .lean(),
    Message.countDocuments({ conversation: conversation._id }),
  ]);
  return { messages, pagination: { total, page, pages: Math.ceil(total / limit), limit } };
};

/**
 * Appends a message as the caller (server-derived sender), updates the
 * denormalized lastMessage, and increments the *other* participant's unread
 * counter atomically. REST is the only send path (ADR-026): the DB write
 * completes before any socket emit.
 */
export const sendMessage = async (id, userId, input = {}) => {
  const { body } = input;
  if (typeof body !== 'string' || body.trim().length < 1) fail(400, 'VALIDATION_ERROR', 'Message body is required');
  if (body.trim().length > 2000) fail(400, 'VALIDATION_ERROR', 'Message must be 2000 characters or fewer');

  const conversation = await requireParticipant(id, userId);
  const trimmed = body.trim();
  const isBuyer = String(conversation.buyer) === String(userId);

  const message = await Message.create({ conversation: conversation._id, sender: userId, body: trimmed });
  const unreadField = isBuyer ? 'agentUnread' : 'buyerUnread';
  const updated = await Conversation.findByIdAndUpdate(
    conversation._id,
    {
      $set: { lastMessage: { body: trimmed, sender: userId, sentAt: message.createdAt } },
      $inc: { [unreadField]: 1 },
    },
    { returnDocument: 'after' },
  );

  const payload = await Message.findById(message._id).populate('sender', USER_SUMMARY).lean();
  emitToConversation(conversation._id, 'message:new', payload);
  void notifyMessageAlert(conversation, userId, trimmed);

  return { conversation: safe(updated), message: payload };
};

/**
 * Marks the caller's side read: zeroes their unread counter and stamps
 * readAt on the other participant's previously-unread messages.
 */
export const markRead = async (id, userId) => {
  const conversation = await requireParticipant(id, userId);
  const isBuyer = String(conversation.buyer) === String(userId);
  const unreadField = isBuyer ? 'buyerUnread' : 'agentUnread';

  await Message.updateMany(
    { conversation: conversation._id, sender: { $ne: userId }, readAt: null },
    { $set: { readAt: new Date() } },
  );
  const updated = await Conversation.findByIdAndUpdate(
    conversation._id,
    { $set: { [unreadField]: 0 } },
    { returnDocument: 'after' },
  );

  emitToConversation(conversation._id, 'conversation:updated', {
    _id: conversation._id,
    lastMessage: updated.lastMessage,
    buyerUnread: updated.buyerUnread,
    agentUnread: updated.agentUnread,
  });

  return safe(updated);
};

/** Total unread messages across all of the caller's conversations. */
export const unreadCount = async (userId) => {
  const [result] = await Conversation.aggregate([
    { $match: { $or: [{ buyer: new mongoose.Types.ObjectId(userId) }, { agent: new mongoose.Types.ObjectId(userId) }] } },
    {
      $group: {
        _id: null,
        total: {
          $sum: {
            $cond: [{ $eq: ['$buyer', new mongoose.Types.ObjectId(userId)] }, '$buyerUnread', '$agentUnread'],
          },
        },
      },
    },
  ]);
  return { unread: result?.total ?? 0 };
};

/** Admin-only cross-marketplace audit listing (read-only). */
export const adminListConversations = async (page = 1, limit = 10) => {
  const [conversations, total] = await Promise.all([
    Conversation.find({})
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('property', PROPERTY_SUMMARY)
      .populate('buyer', USER_SUMMARY)
      .populate('agent', USER_SUMMARY)
      .lean(),
    Conversation.countDocuments({}),
  ]);
  return { conversations, pagination: { total, page, pages: Math.ceil(total / limit), limit } };
};

/** Admin-only message history for any conversation (read-only audit). */
export const adminListMessages = async (id, page = 1, limit = 20) => {
  if (!mongoose.isValidObjectId(id)) fail(400, 'INVALID_ID', 'Invalid conversation id');
  const conversation = await Conversation.findById(id);
  if (!conversation) fail(404, 'NOT_FOUND', 'Conversation not found');
  const [messages, total] = await Promise.all([
    Message.find({ conversation: conversation._id })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('sender', USER_SUMMARY)
      .lean(),
    Message.countDocuments({ conversation: conversation._id }),
  ]);
  return { messages, pagination: { total, page, pages: Math.ceil(total / limit), limit } };
};