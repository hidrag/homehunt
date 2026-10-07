import mongoose from 'mongoose';
import Visit from '../models/Visit.js';
import Property from '../models/Property.js';
import User from '../models/User.js';
import { sendEmail } from './email.service.js';
import { notifyVisitUpdate } from './notification.service.js';

const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const tails = new Map();
const fail = (status, code, message) => { throw { status, code, message }; };
const validZones = new Set(Intl.supportedValuesOf('timeZone'));
validZones.add(DEFAULT_TIMEZONE);
const normalizeTimezone = (value) => { const zone = value || DEFAULT_TIMEZONE; if (zone === 'Asia/Calcutta') return DEFAULT_TIMEZONE; if (!validZones.has(zone)) fail(400, 'VALIDATION_ERROR', 'Invalid timezone'); return zone; };
const parseDate = (value) => typeof value === 'string' && /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)) ? new Date(value) : null;
const validateWindow = (startAt, endAt) => { const start = parseDate(startAt); const end = parseDate(endAt); const now = Date.now(); const duration = end && start ? end - start : 0; if (!start || !end || start <= now || end <= start || duration < 30 * 60000 || duration > 120 * 60000 || start.getTime() - now > 30 * 86400000) fail(400, 'VALIDATION_ERROR', 'Visit must be a future 30-120 minute appointment within 30 days'); return { start, end }; };
const safe = (visit) => visit.toObject ? visit.toObject() : visit;
const notify = async (event, visit, emails) => { for (const email of emails.filter(Boolean)) { try { await sendEmail({ to: email, event, visit }); } catch (error) { console.error('[VISIT_EMAIL_ERROR]', error.message); } } };

export const create = async (buyerId, input = {}) => {
  const { propertyId, startAt, endAt, timezone, note } = input;
  if (!mongoose.isValidObjectId(propertyId)) fail(400, 'INVALID_ID', 'Invalid property id');
  const { start, end } = validateWindow(startAt, endAt); const normalizedTimezone = normalizeTimezone(timezone);
  if (note !== undefined && (typeof note !== 'string' || note.trim().length > 2000)) fail(400, 'VALIDATION_ERROR', 'Note must be 2000 characters or fewer');
  const property = await Property.findById(propertyId).select('agent status title').lean();
  if (!property || property.status !== 'available' || !property.agent) fail(property ? 409 : 404, property ? 'PROPERTY_UNAVAILABLE' : 'NOT_FOUND', property ? 'Property is unavailable' : 'Property not found');
  if (await Visit.exists({ buyer: buyerId, property: propertyId, startAt: start, endAt: end, status: { $in: ['pending', 'confirmed'] } })) fail(409, 'DUPLICATE_VISIT', 'An active visit already exists for this time');
  let visit;
  try { visit = await Visit.create({ property: propertyId, buyer: buyerId, agent: property.agent, startAt: start, endAt: end, timezone: normalizedTimezone, note: note?.trim() }); } catch (error) { if (error?.code === 11000) fail(409, 'DUPLICATE_VISIT', 'An active visit already exists for this time'); throw error; }
  const users = await User.find({ _id: { $in: [buyerId, property.agent] } }).select('email').lean();
  await notify('requested', { ...safe(visit), property }, users.map((user) => user.email)); return safe(visit);
};

export const list = async (filter, page = 1, limit = 10) => { const [visits, total] = await Promise.all([Visit.find(filter).sort({ startAt: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).populate('property', 'title price images address.city address.state listingType').populate('buyer', 'name email').populate('agent', 'name email').lean(), Visit.countDocuments(filter)]); return { visits, pagination: { total, page, pages: Math.ceil(total / limit), limit } }; };

const transitions = { pending: ['confirmed', 'declined', 'cancelled'], confirmed: ['completed', 'cancelled'], declined: [], cancelled: [], completed: [] };
export const transition = async (id, actorId, role, nextStatus) => {
  if (!mongoose.isValidObjectId(id)) fail(400, 'INVALID_ID', 'Invalid visit id');
  if (!Object.keys(transitions).includes(nextStatus)) fail(400, 'VALIDATION_ERROR', 'Invalid status');
  const initial = await Visit.findById(id).populate('property').populate('buyer', 'email').populate('agent', 'email');
  if (!initial || (role === 'buyer' && String(initial.buyer?._id || initial.buyer) !== actorId) || (role === 'agent' && String(initial.agent?._id || initial.agent) !== actorId)) fail(404, 'NOT_FOUND', 'Visit not found');
  if (role === 'buyer' && nextStatus !== 'cancelled') fail(409, 'INVALID_STATUS_TRANSITION', 'Buyer may only cancel visits');
  if (role === 'agent' && !((initial.status === 'pending' && ['confirmed', 'declined'].includes(nextStatus)) || (initial.status === 'confirmed' && ['cancelled', 'completed'].includes(nextStatus)))) fail(409, 'INVALID_STATUS_TRANSITION', 'Invalid status transition');
  const key = String(initial.agent?._id || initial.agent); const previous = tails.get(key) || Promise.resolve(); let release; const current = new Promise((resolve) => { release = resolve; }); tails.set(key, current); await previous;
  try {
    const visit = await Visit.findById(id).populate('property').populate('buyer', 'email').populate('agent', 'email');
    if (!visit || visit.status !== initial.status) fail(409, 'INVALID_STATUS_TRANSITION', 'Visit changed before this operation');
    if (nextStatus === 'confirmed') { if (!visit.property || visit.property.status !== 'available') fail(409, 'PROPERTY_UNAVAILABLE', 'Property is unavailable'); const conflict = await Visit.exists({ agent: visit.agent._id || visit.agent, status: 'confirmed', _id: { $ne: visit._id }, startAt: { $lt: visit.endAt }, endAt: { $gt: visit.startAt } }); if (conflict) fail(409, 'SCHEDULE_CONFLICT', 'Agent already has an overlapping confirmed visit'); }
    // Admins obey the exact same state machine as agents and buyers —
    // there is deliberately no admin transition bypass.
    if (!transitions[visit.status].includes(nextStatus)) fail(409, 'INVALID_STATUS_TRANSITION', 'Invalid status transition');
    visit.status = nextStatus; if (nextStatus === 'cancelled') { visit.cancelledAt = new Date(); visit.cancelledBy = actorId; } await visit.save();
    const event = nextStatus === 'cancelled' ? (role === 'buyer' ? 'buyer_cancelled' : role === 'agent' ? 'agent_cancelled' : null) : nextStatus; const recipients = event === 'requested' ? [visit.buyer.email, visit.agent.email] : event === 'confirmed' || event === 'declined' || event === 'agent_cancelled' ? [visit.buyer.email] : event === 'buyer_cancelled' ? [visit.agent.email] : []; if (event) await notify(event, visit, recipients); void notifyVisitUpdate(visit, nextStatus, role); return safe(visit);
  } finally { release(); if (tails.get(key) === current) tails.delete(key); }
};
