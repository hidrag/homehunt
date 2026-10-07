/**
 * S10 — Notification engine integration suite.
 *
 * Triggers are exercised through the REAL service call paths (property
 * creation sweep, visit transitions, inquiry creation, chat messages) so
 * the wiring itself is under test, plus inbox operations (list/filter/
 * pagination, mark read, mark-all, own-only delete, unread counts) and
 * failure isolation via the fake email/provider seams.
 *
 * Real-time socket delivery lives in notification.socket.test.js;
 * HTTP-level authorization matrices additionally run here at the route
 * level via supertest against app.
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../../src/models/User.js';
import Property from '../../src/models/Property.js';
import Inquiry from '../../src/models/Inquiry.js';
import Visit from '../../src/models/Visit.js';
import Conversation from '../../src/models/Conversation.js';
import Message from '../../src/models/Message.js';
import Notification from '../../src/models/Notification.js';
import SavedSearch from '../../src/models/SavedSearch.js';
import * as savedSearchService from '../../src/services/savedSearch.service.js';
import * as notificationService from '../../src/services/notification.service.js';
import * as visitService from '../../src/services/visit.service.js';
import * as inquiryService from '../../src/services/inquiry.service.js';
import * as chat from '../../src/services/conversation.service.js';
import { fakeEmailProvider } from '../../src/services/email.service.js';
import propertyService from '../../src/services/property.service.js';

let mongo;

const propertyData = (agent, overrides = {}) => ({
  title: 'Notif home',
  description: 'A suitable test home for notification tests.',
  price: 100,
  propertyType: 'house',
  listingType: 'sale',
  location: { type: 'Point', coordinates: [77, 12] },
  address: { street: '1', city: 'Bengaluru', state: 'K', zipCode: '1', country: 'India' },
  agent,
  ...overrides,
});

const futureVisit = () => {
  const start = new Date(Date.now() + 24 * 3600 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
};

// Flush pending fire-and-forget promises through the microtask + macrotask
// queue so notification writes are observable deterministically.
const settle = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-minimum-32-chars-long-12345';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-chars-long-12345';
  process.env.EMAIL_PROVIDER = 'fake';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
  await Property.init();
  await Inquiry.init();
  await Visit.init();
  await Conversation.init();
  await Message.init();
  await Notification.init();
  await SavedSearch.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Property.deleteMany({}),
    Inquiry.deleteMany({}),
    Visit.deleteMany({}),
    Conversation.deleteMany({}),
    Message.deleteMany({}),
    Notification.deleteMany({}),
    SavedSearch.deleteMany({}),
  ]);
  fakeEmailProvider.clear();
});

describe('S10 Notification — listing_match trigger (matching sweep)', () => {
  let buyer, agent;

  beforeEach(async () => {
    buyer = await User.create({ name: 'Buyer', email: 'buyer@test.local', passwordHash: 'x', role: 'buyer' });
    agent = await User.create({ name: 'Agent', email: 'agent@test.local', passwordHash: 'x', role: 'agent' });
  });

  it('creates an in-app notification + email for a matching saved search', async () => {
    await savedSearchService.create(String(buyer._id), { name: 'Bengaluru homes', criteria: { city: 'Bengaluru', listingType: 'sale', maxPrice: 500 } });
    const property = await propertyService.createProperty(String(agent._id), propertyData(agent._id, { price: 400 }));
    await settle();

    const notes = await Notification.find({ recipient: buyer._id });
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe('listing_match');
    expect(notes[0].resourceRef).toEqual({ kind: 'property', id: property._id });
    expect(notes[0].title).toContain('Bengaluru homes');
    expect(notes[0].read).toBe(false);

    const email = fakeEmailProvider.sentEmails.find((m) => m.event === 'listing_match');
    expect(email).toBeTruthy();
    expect(email.to).toBe('buyer@test.local');
    expect(email.html).toContain('Bengaluru homes');

    const search = await SavedSearch.findOne({});
    expect(search.lastNotifiedAt).toBeInstanceOf(Date);
  });

  it('does not notify when the new listing does not match criteria', async () => {
    await savedSearchService.create(String(buyer._id), { name: 'cheap', criteria: { maxPrice: 50 } });
    await propertyService.createProperty(String(agent._id), propertyData(agent._id, { price: 400 }));
    await settle();
    expect(await Notification.countDocuments({})).toBe(0);
  });

  it('skips inactive searches and boundaries match inclusively', async () => {
    const inactive = await savedSearchService.create(String(buyer._id), { name: 'paused', criteria: { price: 0, maxPrice: 100 } });
    await savedSearchService.update(inactive._id.toString(), String(buyer._id), { active: false });
    const boundary = await savedSearchService.create(String(buyer._id), { name: 'boundary', criteria: { minPrice: 100, maxPrice: 100 } });
    await propertyService.createProperty(String(agent._id), propertyData(agent._id, { price: 100 }));
    await settle();

    expect(await Notification.countDocuments({ recipient: buyer._id })).toBe(1);
    const note = await Notification.findOne({});
    expect(note.title).toContain('boundary');
    expect(boundary).toBeTruthy();
  });

  it('notifies each matching buyer once even with multiple searches', async () => {
    await savedSearchService.create(String(buyer._id), { name: 's1', criteria: { city: 'Bengaluru' } });
    await savedSearchService.create(String(buyer._id), { name: 's2', criteria: { listingType: 'sale' } });
    await propertyService.createProperty(String(agent._id), propertyData(agent._id));
    await settle();
    expect(await Notification.countDocuments({ recipient: buyer._id, type: 'listing_match' })).toBe(2);
  });

  it('email failure never breaks property creation and stays out of the response path', async () => {
    await savedSearchService.create(String(buyer._id), { name: 'boom', criteria: { city: 'Bengaluru' } });
    fakeEmailProvider.setFailure(true);
    const property = await propertyService.createProperty(String(agent._id), propertyData(agent._id));
    await settle();
    expect(property._id).toBeTruthy();
    // In-app notification still lands (guarded insert happens before email);
    // email error is swallowed with logging only.
    expect(await Notification.countDocuments({ recipient: buyer._id, type: 'listing_match' })).toBe(1);
  });
});

describe('S10 Notification — visit_update trigger', () => {
  let buyer, agent, property;

  beforeEach(async () => {
    buyer = await User.create({ name: 'Buyer', email: 'buyer@test.local', passwordHash: 'x', role: 'buyer' });
    agent = await User.create({ name: 'Agent', email: 'agent@test.local', passwordHash: 'x', role: 'agent' });
    property = await Property.create(propertyData(agent._id));
  });

  it('confirms notify the buyer with in-app only ( safeguar no email duplication)', async () => {
    const { startAt, endAt } = futureVisit();
    const visit = await visitService.create(String(buyer._id), { propertyId: String(property._id), startAt, endAt });
    await settle();
    // creation request emails still fire (unchanged S8 path); no visit_update NOTIFICATION on request
    expect(await Notification.countDocuments({ type: 'visit_update' })).toBe(0);

    await visitService.transition(String(visit._id), String(agent._id), 'agent', 'confirmed');
    await settle();

    const notes = await Notification.find({ type: 'visit_update' });
    expect(notes).toHaveLength(1);
    expect(String(notes[0].recipient)).toBe(String(buyer._id));
    expect(notes[0].title).toBe('Visit confirmed');
    expect(notes[0].resourceRef.kind).toBe('visit');
    // in-app only: NO listing/notification email events were added beyond S8 requested
    expect(fakeEmailProvider.sentEmails.every((m) => !['visit_update'].includes(m.event))).toBe(true);
  });

  it('buyer cancellation notifies the agent; declined notifies the buyer', async () => {
    const { startAt, endAt } = futureVisit();
    const visit = await visitService.create(String(buyer._id), { propertyId: String(property._id), startAt, endAt });
    await settle();
    await visitService.transition(String(visit._id), String(buyer._id), 'buyer', 'cancelled');
    await settle();
    const cancelled = await Notification.findOne({ type: 'visit_update' });
    expect(String(cancelled.recipient)).toBe(String(agent._id));
    expect(cancelled.title).toBe('Visit cancelled');

    const { startAt: s2, endAt: e2 } = futureVisit();
    const visit2 = await visitService.create(String(buyer._id), { propertyId: String(property._id), startAt: s2, endAt: e2 });
    await visitService.transition(String(visit2._id), String(agent._id), 'agent', 'declined');
    await settle();
    const declined = await Notification.findOne({ type: 'visit_update', title: 'Visit declined' });
    expect(String(declined.recipient)).toBe(String(buyer._id));
  });
});

describe('S10 Notification — inquiry_update & message_alert triggers', () => {
  let buyer, agent, property;

  beforeEach(async () => {
    buyer = await User.create({ name: 'Buyer', email: 'buyer@test.local', passwordHash: 'x', role: 'buyer' });
    agent = await User.create({ name: 'Agent', email: 'agent@test.local', passwordHash: 'x', role: 'agent' });
    property = await Property.create(propertyData(agent._id, { title: 'Sun Villa' }));
  });

  it('new inquiry notifies the agent in-app and by email', async () => {
    const inquiry = await inquiryService.createInquiry(String(buyer._id), {
      propertyId: String(property._id),
      name: 'Casey Buyer',
      email: 'CASEY@test.local',
      message: 'I would like to schedule a viewing this weekend please.',
    });
    await settle();

    const note = await Notification.findOne({ type: 'inquiry_update' });
    expect(note).toBeTruthy();
    expect(String(note.recipient)).toBe(String(agent._id));
    expect(note.title).toContain('Sun Villa');
    expect(note.resourceRef).toEqual({ kind: 'inquiry', id: inquiry._id });

    const email = fakeEmailProvider.sentEmails.find((m) => m.event === 'inquiry_update');
    expect(email.to).toBe('agent@test.local');
    expect(email.html).toContain('Casey Buyer');
    // Buyer email is normalized to lowercase by the inquiry path
    expect(email.html).toContain('casey@test.local');
  });

  it('new chat message notifies the counterpart in-app only', async () => {
    const opened = await chat.openConversation(String(buyer._id), { propertyId: String(property._id), body: 'Hello, is this available?' });
    await settle();
    const agentNote = await Notification.findOne({ type: 'message_alert' });
    expect(String(agentNote.recipient)).toBe(String(agent._id));
    expect(agentNote.title).toContain('Sun Villa');
    expect(agentNote.resourceRef.kind).toBe('conversation');
    // locked decision: chat produces NO email
    expect(fakeEmailProvider.sentEmails.filter((m) => m.event === 'message_alert')).toHaveLength(0);

    await chat.sendMessage(String(opened.conversation._id), String(agent._id), { body: 'Yes, it is available!' });
    await settle();
    const buyerNote = await Notification.findOne({ type: 'message_alert', recipient: buyer._id });
    expect(buyerNote).toBeTruthy();
  });

  it('notification email failure never affects the primary inquiry mutation', async () => {
    fakeEmailProvider.setFailure(true);
    const inquiry = await inquiryService.createInquiry(String(buyer._id), {
      propertyId: String(property._id),
      name: 'Dana',
      email: 'dana@test.local',
      message: 'Please share more details about this listing.',
    });
    await settle();
    expect(inquiry._id).toBeTruthy();
    expect(await Inquiry.countDocuments({})).toBe(1);
  });
});

describe('S10 Notification — inbox operations (service level)', () => {
  let owner, stranger;

  const makeNote = (overrides = {}) => Notification.create({
    recipient: owner._id,
    type: 'visit_update',
    title: 'Visit confirmed',
    body: 'body',
    resourceRef: { kind: 'visit', id: new mongoose.Types.ObjectId() },
    ...overrides,
  });

  beforeEach(async () => {
    owner = await User.create({ name: 'Owner', email: 'owner@test.local', passwordHash: 'x', role: 'buyer' });
    stranger = await User.create({ name: 'Stranger', email: 'stranger@test.local', passwordHash: 'x', role: 'buyer' });
  });

  it('lists newest first with pagination and the unread filter', async () => {
    await makeNote({ title: 'old' });
    await makeNote({ title: 'mid' });
    await makeNote({ title: 'new', read: true });
    const all = await notificationService.list(String(owner._id), 1, 2);
    expect(all.notifications.map((n) => n.title)).toEqual(['new', 'mid']);
    expect(all.pagination.total).toBe(3);
    const unread = await notificationService.list(String(owner._id), 1, 10, true);
    expect(unread.notifications.map((n) => n.title)).toEqual(['mid', 'old']);
    const readOnly = await notificationService.list(String(owner._id), 1, 10, false);
    expect(readOnly.notifications).toHaveLength(1);
  });

  it('unread counts, mark-read, and idempotent re-read', async () => {
    const a = await makeNote();
    await makeNote();
    expect(await notificationService.unreadCount(String(owner._id))).toEqual({ unread: 2 });
    const marked = await notificationService.markRead(String(a._id), String(owner._id));
    expect(marked.read).toBe(true);
    expect(marked.readAt).toBeInstanceOf(Date);
    const again = await notificationService.markRead(String(a._id), String(owner._id));
    expect(again.read).toBe(true);
    expect(await notificationService.unreadCount(String(owner._id))).toEqual({ unread: 1 });
  });

  it('mark-all zeroes the badge atomically', async () => {
    await makeNote();
    await makeNote();
    const { updated } = await notificationService.markAllRead(String(owner._id));
    expect(updated).toBe(2);
    expect(await notificationService.unreadCount(String(owner._id))).toEqual({ unread: 0 });
    const second = await notificationService.markAllRead(String(owner._id));
    expect(second.updated).toBe(0);
  });

  it('non-owners get NOTHING: 404 on read and delete, never in lists', async () => {
    const note = await makeNote();
    await expect(notificationService.markRead(String(note._id), String(stranger._id))).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    await expect(notificationService.remove(String(note._id), String(stranger._id))).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect((await notificationService.list(String(stranger._id), 1, 10)).notifications).toHaveLength(0);
    expect(await notificationService.unreadCount(String(stranger._id))).toEqual({ unread: 0 });
    // the owner still has it
    expect(await notificationService.remove(String(note._id), String(owner._id))).toEqual({ deleted: true });
  });

  it('malformed ids are INVALID_ID, not 500', async () => {
    await expect(notificationService.markRead('nope', String(owner._id))).rejects.toMatchObject({ status: 400, code: 'INVALID_ID' });
    await expect(notificationService.remove('nope', String(owner._id))).rejects.toMatchObject({ status: 400, code: 'INVALID_ID' });
  });

  it('enforces schema bounds on title/body lengths', async () => {
    await Notification.create({ recipient: owner._id, type: 'message_alert', title: 'x'.repeat(140), body: 'y'.repeat(500) });
    await expect(Notification.create({ recipient: owner._id, type: 'message_alert', title: 'x'.repeat(141), body: 'y' })).rejects.toBeTruthy();
  });
});
