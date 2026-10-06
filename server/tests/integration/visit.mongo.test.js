/**
 * S8 — Visit scheduling service/database integration suite.
 *
 * Service- and persistence-level coverage for the S8 brief: domain state
 * machine, server-derived ownership, duplicate & overlap protection,
 * concurrency serialization, timezone normalization + UTC persistence,
 * duration/horizon edge rules, historical-reference semantics after
 * property deletion, and the email event matrix (incl. XSS escaping and
 * provider-failure isolation).
 *
 * HTTP-level authorization matrices live in visit.api.test.js.
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../../src/models/User.js';
import Property from '../../src/models/Property.js';
import Visit from '../../src/models/Visit.js';
import * as visits from '../../src/services/visit.service.js';
import { fakeEmailProvider, sendEmail } from '../../src/services/email.service.js';
import { escapeHtml } from '../../src/services/email/visit.templates.js';

let mongo;

const DAY = 86400000;
const MIN = 60000;

const propertyData = (agent, overrides = {}) => ({
  title: 'Visit home',
  description: 'A suitable test home for visit scheduling tests.',
  price: 100,
  propertyType: 'house',
  listingType: 'sale',
  location: { type: 'Point', coordinates: [77, 12] },
  address: { street: '1', city: 'B', state: 'K', zipCode: '1', country: 'India' },
  agent,
  ...overrides,
});

const iso = (epoch) => new Date(epoch).toISOString();
const window = (startEpoch, minutes = 60) => ({
  startAt: iso(startEpoch),
  endAt: iso(startEpoch + minutes * MIN),
});
const future = (days = 2) => Date.now() + days * DAY;
// Build a wall-clock ISO timestamp on the calendar date `days` ahead of now.
// The expected UTC instant is Date.parse(startAt) — the same ground truth
// the service uses — so this helper cannot disagree with the parser.
const offsetWall = (days, wallMs, offsetMin) => {
  const d = new Date(Date.now() + days * DAY);
  const p = (n) => String(n).padStart(2, '0');
  const dateStr = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const clock = `${p(Math.floor(wallMs / 3600000))}:${p(Math.floor((wallMs % 3600000) / MIN))}`;
  const sign = offsetMin >= 0 ? '+' : '-';
  const mag = Math.abs(offsetMin);
  const startAt = `${dateStr}T${clock}:00${sign}${p(Math.floor(mag / 60))}:${p(mag % 60)}`;
  return { startAt, utcEpoch: Date.parse(startAt) };
};

const eventsFor = (event) => fakeEmailProvider.sentEmails.filter((m) => m.event === event);

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.EMAIL_PROVIDER = 'fake';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
  await Property.init();
  await Visit.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Property.deleteMany({});
  await Visit.deleteMany({});
  fakeEmailProvider.clear();
  process.env.EMAIL_PROVIDER = 'fake';
});

describe('S8 Visits — domain & persistence (service level)', () => {
  let buyer, otherBuyer, agent, otherAgent, admin, property;

  beforeEach(async () => {
    buyer = await User.create({ name: 'Buyer', email: 'buyer@test.local', passwordHash: 'x', role: 'buyer' });
    otherBuyer = await User.create({ name: 'Other', email: 'other@test.local', passwordHash: 'x', role: 'buyer' });
    agent = await User.create({ name: 'Agent', email: 'agent@test.local', passwordHash: 'x', role: 'agent' });
    otherAgent = await User.create({ name: 'Other Agent', email: 'agent2@test.local', passwordHash: 'x', role: 'agent' });
    admin = await User.create({ name: 'Admin', email: 'admin@test.local', passwordHash: 'x', role: 'admin' });
    property = await Property.create(propertyData(agent._id));
  });

  describe('creation invariants (server-derived ownership)', () => {
    it('creates a pending visit with buyer and agent derived server-side', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      expect(v.status).toBe('pending');
      expect(v.buyer.toString()).toBe(buyer._id.toString());
      expect(v.agent.toString()).toBe(agent._id.toString());
      expect(v.property.toString()).toBe(property._id.toString());
    });

    it('ignores mass-assigned buyer, agent, status and cancelledBy fields', async () => {
      const v = await visits.create(buyer._id, {
        propertyId: property._id,
        ...window(future()),
        buyer: otherBuyer._id,
        agent: otherAgent._id,
        status: 'confirmed',
        cancelledAt: new Date(),
        cancelledBy: otherBuyer._id,
      });
      expect(v.status).toBe('pending');
      expect(v.buyer.toString()).toBe(buyer._id.toString());
      expect(v.agent.toString()).toBe(agent._id.toString());
      expect(v.cancelledAt).toBeNull();
      expect(v.cancelledBy).toBeNull();
    });

    it('derives the agent from the property even when the client supplies another agent id', async () => {
      const v = await visits.create(buyer._id, {
        propertyId: property._id,
        ...window(future()),
        agent: otherAgent._id.toString(),
      });
      expect(v.agent.toString()).toBe(agent._id.toString());
    });

    it('rejects a malformed property id with 400 INVALID_ID', async () => {
      await expect(visits.create(buyer._id, { propertyId: 'not-an-id', ...window(future()) }))
        .rejects.toMatchObject({ status: 400, code: 'INVALID_ID' });
    });

    it('returns 404 NOT_FOUND for an unknown property', async () => {
      await expect(
        visits.create(buyer._id, { propertyId: new mongoose.Types.ObjectId(), ...window(future()) }),
      ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });

    it('rejects creation against a deleted property before any visit exists', async () => {
      await Property.deleteOne({ _id: property._id });
      await expect(visits.create(buyer._id, { propertyId: property._id, ...window(future()) }))
        .rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
      expect(await Visit.countDocuments()).toBe(0);
    });

    it('rejects creation when the property is not available', async () => {
      await Property.updateOne({ _id: property._id }, { status: 'sold' });
      await expect(visits.create(buyer._id, { propertyId: property._id, ...window(future()) }))
        .rejects.toMatchObject({ status: 409, code: 'PROPERTY_UNAVAILABLE' });
    });

    it('persists the note trimmed and rejects an over-long note', async () => {
      const v = await visits.create(buyer._id, {
        propertyId: property._id, ...window(future()), note: '  hello agent  ',
      });
      expect(v.note).toBe('hello agent');

      await expect(visits.create(otherBuyer._id, {
        propertyId: property._id, ...window(future(3)), note: 'x'.repeat(2001),
      })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    });
  });

  describe('duration and horizon edge rules', () => {
    it('accepts exactly 30 minutes', async () => {
      await expect(visits.create(buyer._id, { propertyId: property._id, ...window(future(), 30) }))
        .resolves.toBeDefined();
    });

    it('accepts exactly 120 minutes', async () => {
      await expect(visits.create(buyer._id, { propertyId: property._id, ...window(future(), 120) }))
        .resolves.toBeDefined();
    });

    it('rejects 29 minutes and 121 minutes', async () => {
      await expect(visits.create(buyer._id, { propertyId: property._id, ...window(future(), 29) }))
        .rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
      await expect(visits.create(otherBuyer._id, { propertyId: property._id, ...window(future(), 121) }))
        .rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    });

    it('rejects start == end and end before start', async () => {
      const t = future();
      await expect(visits.create(buyer._id, { propertyId: property._id, startAt: iso(t), endAt: iso(t) }))
        .rejects.toMatchObject({ status: 400 });
      await expect(visits.create(buyer._id, { propertyId: property._id, startAt: iso(t), endAt: iso(t - 30 * MIN) }))
        .rejects.toMatchObject({ status: 400 });
    });

    it('rejects a start in the past', async () => {
      await expect(visits.create(buyer._id, { propertyId: property._id, ...window(Date.now() - DAY) }))
        .rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    });

    it('rejects a start beyond the 30-day horizon', async () => {
      await expect(visits.create(buyer._id, { propertyId: property._id, ...window(Date.now() + 31 * DAY) }))
        .rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    });

    it('accepts a start just inside the 30-day horizon', async () => {
      await expect(visits.create(buyer._id, { propertyId: property._id, ...window(Date.now() + 29 * DAY) }))
        .resolves.toBeDefined();
    });

    it('rejects a malformed timestamp and a timezone-less local timestamp', async () => {
      await expect(visits.create(buyer._id, { propertyId: property._id, startAt: 'tomorrow', endAt: 'later' }))
        .rejects.toMatchObject({ status: 400 });
      const naive = new Date(future()).toISOString().replace('Z', '');
      await expect(visits.create(buyer._id, { propertyId: property._id, startAt: naive, endAt: naive }))
        .rejects.toMatchObject({ status: 400 });
    });
  });

  describe('timezone handling and UTC persistence', () => {
    it('defaults the timezone to Asia/Kolkata when omitted', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      expect(v.timezone).toBe('Asia/Kolkata');
    });

    it('normalizes the legacy Asia/Calcutta alias to Asia/Kolkata', async () => {
      const v = await visits.create(buyer._id, {
        propertyId: property._id, ...window(future()), timezone: 'Asia/Calcutta',
      });
      expect(v.timezone).toBe('Asia/Kolkata');
    });

    it('accepts another valid IANA timezone unchanged', async () => {
      const v = await visits.create(buyer._id, {
        propertyId: property._id, ...window(future()), timezone: 'Europe/London',
      });
      expect(v.timezone).toBe('Europe/London');
    });

    it('rejects an invalid timezone', async () => {
      await expect(visits.create(buyer._id, {
        propertyId: property._id, ...window(future()), timezone: 'Mars/Olympus',
      })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    });

    it('persists startAt/endAt as UTC Dates equal to the instant of a Z timestamp', async () => {
      const start = future();
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(start, 60) });
      const stored = await Visit.findById(v._id);
      expect(stored.startAt instanceof Date).toBe(true);
      expect(stored.startAt.getTime()).toBe(new Date(iso(start)).getTime());
      expect(stored.endAt.getTime()).toBe(new Date(iso(start + 60 * MIN)).getTime());
    });

    it('persists the correct UTC instant for a +05:30 offset timestamp', async () => {
      const wall = offsetWall(2, 10 * 3600000, 330);
      const v = await visits.create(buyer._id, {
        propertyId: property._id,
        startAt: wall.startAt,
        endAt: new Date(wall.utcEpoch + 60 * MIN).toISOString(),
      });
      const stored = await Visit.findById(v._id);
      expect(stored.startAt.getTime()).toBe(wall.utcEpoch);
    });

    it('persists the correct UTC instant for a negative offset timestamp', async () => {
      const wall = offsetWall(2, 14 * 3600000, -300);
      const v = await visits.create(buyer._id, {
        propertyId: property._id,
        startAt: wall.startAt,
        endAt: new Date(wall.utcEpoch + 45 * MIN).toISOString(),
      });
      const stored = await Visit.findById(v._id);
      expect(stored.startAt.getTime()).toBe(wall.utcEpoch);
    });
  });

  describe('duplicate and overlap protection', () => {
    it('rejects an identical active (pending) duplicate with 409 DUPLICATE_VISIT', async () => {
      const w = window(future());
      await visits.create(buyer._id, { propertyId: property._id, ...w });
      await expect(visits.create(buyer._id, { propertyId: property._id, ...w }))
        .rejects.toMatchObject({ status: 409, code: 'DUPLICATE_VISIT' });
    });

    it('rejects an identical duplicate while the first is confirmed', async () => {
      const w = window(future());
      const v = await visits.create(buyer._id, { propertyId: property._id, ...w });
      await visits.transition(v._id, agent._id.toString(), 'agent', 'confirmed');
      await expect(visits.create(buyer._id, { propertyId: property._id, ...w }))
        .rejects.toMatchObject({ status: 409, code: 'DUPLICATE_VISIT' });
    });

    it('allows recreation after the first visit is cancelled', async () => {
      const w = window(future());
      const v = await visits.create(buyer._id, { propertyId: property._id, ...w });
      await visits.transition(v._id, buyer._id.toString(), 'buyer', 'cancelled');
      await expect(visits.create(buyer._id, { propertyId: property._id, ...w })).resolves.toBeDefined();
    });

    it('allows recreation after the first visit is declined', async () => {
      const w = window(future());
      const v = await visits.create(buyer._id, { propertyId: property._id, ...w });
      await visits.transition(v._id, agent._id.toString(), 'agent', 'declined');
      await expect(visits.create(buyer._id, { propertyId: property._id, ...w })).resolves.toBeDefined();
    });

    it('allows recreation after the first visit is completed', async () => {
      const w = window(future());
      const v = await visits.create(buyer._id, { propertyId: property._id, ...w });
      await visits.transition(v._id, agent._id.toString(), 'agent', 'confirmed');
      await visits.transition(v._id, agent._id.toString(), 'agent', 'completed');
      await expect(visits.create(buyer._id, { propertyId: property._id, ...w })).resolves.toBeDefined();
    });

    it('does not treat a different buyer, property or slot as a duplicate', async () => {
      const w = window(future());
      await visits.create(buyer._id, { propertyId: property._id, ...w });
      await expect(visits.create(otherBuyer._id, { propertyId: property._id, ...w })).resolves.toBeDefined();
      await expect(visits.create(buyer._id, { propertyId: property._id, ...window(future(), 45) }))
        .resolves.toBeDefined();
    });

    it('blocks confirming an overlapping confirmed visit for the same agent', async () => {
      const base = future();
      const a = await visits.create(buyer._id, { propertyId: property._id, ...window(base, 60) });
      const b = await visits.create(otherBuyer._id, { propertyId: property._id, ...window(base + 30 * MIN, 60) });
      await visits.transition(a._id, agent._id.toString(), 'agent', 'confirmed');
      await expect(visits.transition(b._id, agent._id.toString(), 'agent', 'confirmed'))
        .rejects.toMatchObject({ status: 409, code: 'SCHEDULE_CONFLICT' });
    });

    it('allows a pending overlap to coexist (only confirmation conflicts)', async () => {
      const base = future();
      await visits.create(buyer._id, { propertyId: property._id, ...window(base, 60) });
      await expect(visits.create(otherBuyer._id, { propertyId: property._id, ...window(base + 30 * MIN, 60) }))
        .resolves.toBeDefined();
    });

    it('allows boundary-touching visits to both be confirmed (strict overlap)', async () => {
      const base = future();
      const a = await visits.create(buyer._id, { propertyId: property._id, ...window(base, 60) });
      const b = await visits.create(otherBuyer._id, { propertyId: property._id, ...window(base + 60 * MIN, 60) });
      await visits.transition(a._id, agent._id.toString(), 'agent', 'confirmed');
      await expect(visits.transition(b._id, agent._id.toString(), 'agent', 'confirmed')).resolves.toBeDefined();
    });

    it('allows the same slot for two different agents', async () => {
      const otherProperty = await Property.create(propertyData(otherAgent._id));
      const base = future();
      const a = await visits.create(buyer._id, { propertyId: property._id, ...window(base, 60) });
      const b = await visits.create(buyer._id, { propertyId: otherProperty._id, ...window(base, 60) });
      await visits.transition(a._id, agent._id.toString(), 'agent', 'confirmed');
      await expect(visits.transition(b._id, otherAgent._id.toString(), 'agent', 'confirmed')).resolves.toBeDefined();
    });
  });

  describe('state machine and ownership', () => {
    it('rejects a buyer confirming their own visit (409)', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      await expect(visits.transition(v._id, buyer._id.toString(), 'buyer', 'confirmed'))
        .rejects.toMatchObject({ status: 409, code: 'INVALID_STATUS_TRANSITION' });
    });

    it('allows an agent to confirm then complete a pending visit', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      const confirmed = await visits.transition(v._id, agent._id.toString(), 'agent', 'confirmed');
      expect(confirmed.status).toBe('confirmed');
      const completed = await visits.transition(v._id, agent._id.toString(), 'agent', 'completed');
      expect(completed.status).toBe('completed');
    });

    it('allows an agent to decline a pending visit', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      const declined = await visits.transition(v._id, agent._id.toString(), 'agent', 'declined');
      expect(declined.status).toBe('declined');
    });

    it('rejects agent confirm on an already-confirmed visit and decline on a confirmed visit', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      await visits.transition(v._id, agent._id.toString(), 'agent', 'confirmed');
      await expect(visits.transition(v._id, agent._id.toString(), 'agent', 'confirmed'))
        .rejects.toMatchObject({ status: 409 });
      await expect(visits.transition(v._id, agent._id.toString(), 'agent', 'declined'))
        .rejects.toMatchObject({ status: 409 });
    });

    it('rejects transitions out of terminal declined and cancelled states', async () => {
      const declined = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      await visits.transition(declined._id, agent._id.toString(), 'agent', 'declined');
      await expect(visits.transition(declined._id, agent._id.toString(), 'agent', 'confirmed'))
        .rejects.toMatchObject({ status: 409 });

      const cancelled = await visits.create(otherBuyer._id, { propertyId: property._id, ...window(future(3)) });
      await visits.transition(cancelled._id, otherBuyer._id.toString(), 'buyer', 'cancelled');
      await expect(visits.transition(cancelled._id, agent._id.toString(), 'agent', 'confirmed'))
        .rejects.toMatchObject({ status: 409 });
    });

    it('lets a buyer cancel both pending and confirmed visits', async () => {
      const pending = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      await expect(visits.transition(pending._id, buyer._id.toString(), 'buyer', 'cancelled')).resolves.toBeDefined();

      const confirmed = await visits.create(otherBuyer._id, { propertyId: property._id, ...window(future(3)) });
      await visits.transition(confirmed._id, agent._id.toString(), 'agent', 'confirmed');
      await expect(visits.transition(confirmed._id, otherBuyer._id.toString(), 'buyer', 'cancelled'))
        .resolves.toBeDefined();
    });

    it('records cancelledAt and cancelledBy on cancellation', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      const cancelled = await visits.transition(v._id, buyer._id.toString(), 'buyer', 'cancelled');
      expect(cancelled.cancelledAt).toBeInstanceOf(Date);
      expect(cancelled.cancelledBy.toString()).toBe(buyer._id.toString());
    });

    it('returns 404 (not 403) when another buyer targets the visit', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      await expect(visits.transition(v._id, otherBuyer._id.toString(), 'buyer', 'cancelled'))
        .rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
      const stored = await Visit.findById(v._id);
      expect(stored.status).toBe('pending');
    });

    it('returns 404 when another agent targets the visit', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      await expect(visits.transition(v._id, otherAgent._id.toString(), 'agent', 'confirmed'))
        .rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });

    it('rejects a malformed visit id with 400 INVALID_ID and an invalid status with 400', async () => {
      await expect(visits.transition('nope', agent._id.toString(), 'agent', 'confirmed'))
        .rejects.toMatchObject({ status: 400, code: 'INVALID_ID' });
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      await expect(visits.transition(v._id, agent._id.toString(), 'agent', 'bogus'))
        .rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    });

    it('lets an admin drive any visit through the same state machine (no bypass)', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      const confirmed = await visits.transition(v._id, admin._id.toString(), 'admin', 'confirmed');
      expect(confirmed.status).toBe('confirmed');
      await expect(visits.transition(v._id, admin._id.toString(), 'admin', 'pending'))
        .rejects.toMatchObject({ status: 409 });
      const completed = await visits.transition(v._id, admin._id.toString(), 'admin', 'completed');
      expect(completed.status).toBe('completed');
    });
  });

  describe('concurrency (per-agent serialization)', () => {
    it('confirms exactly one of two overlapping pending visits concurrently', async () => {
      const base = future();
      const a = await visits.create(buyer._id, { propertyId: property._id, ...window(base, 60) });
      const b = await visits.create(otherBuyer._id, { propertyId: property._id, ...window(base + 30 * MIN, 60) });
      const results = await Promise.allSettled([
        visits.transition(a._id, agent._id.toString(), 'agent', 'confirmed'),
        visits.transition(b._id, agent._id.toString(), 'agent', 'confirmed'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toMatchObject({ status: 409, code: 'SCHEDULE_CONFLICT' });
      expect(await Visit.countDocuments({ agent: agent._id, status: 'confirmed' })).toBe(1);
    });

    it('serializes agent and admin confirmation through the same per-agent lock', async () => {
      const base = future();
      const a = await visits.create(buyer._id, { propertyId: property._id, ...window(base, 60) });
      const b = await visits.create(otherBuyer._id, { propertyId: property._id, ...window(base + 30 * MIN, 60) });
      const results = await Promise.allSettled([
        visits.transition(a._id, agent._id.toString(), 'agent', 'confirmed'),
        visits.transition(b._id, admin._id.toString(), 'admin', 'confirmed'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await Visit.countDocuments({ agent: agent._id, status: 'confirmed' })).toBe(1);
    });

    it('releases the per-agent lock after success and failure', async () => {
      const base = future();
      const a = await visits.create(buyer._id, { propertyId: property._id, ...window(base, 60) });
      const b = await visits.create(otherBuyer._id, { propertyId: property._id, ...window(base + 30 * MIN, 60) });
      const results = await Promise.allSettled([
        visits.transition(a._id, agent._id.toString(), 'agent', 'confirmed'),
        visits.transition(b._id, agent._id.toString(), 'agent', 'confirmed'),
      ]);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      const c = await visits.create(buyer._id, { propertyId: property._id, ...window(base + 5 * 3600000, 60) });
      await expect(visits.transition(c._id, agent._id.toString(), 'agent', 'confirmed')).resolves.toBeDefined();
    });

    it('confirms only one of two identical concurrent creates (unique index)', async () => {
      const w = window(future());
      const results = await Promise.allSettled([
        visits.create(buyer._id, { propertyId: property._id, ...w }),
        visits.create(buyer._id, { propertyId: property._id, ...w }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')[0].reason)
        .toMatchObject({ status: 409, code: 'DUPLICATE_VISIT' });
      expect(await Visit.countDocuments({ buyer: buyer._id })).toBe(1);
    });
  });

  describe('property deletion and historical references', () => {
    it('retains the visit and resolves property to null in the buyer list', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      await Property.deleteOne({ _id: property._id });
      const result = await visits.list({ buyer: buyer._id });
      expect(result.visits[0].property).toBeNull();
      expect(await Visit.exists({ _id: v._id })).toBeTruthy();
    });

    it('refuses to confirm a pending visit whose property was deleted', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      await Property.deleteOne({ _id: property._id });
      await expect(visits.transition(v._id, agent._id.toString(), 'agent', 'confirmed'))
        .rejects.toMatchObject({ status: 409, code: 'PROPERTY_UNAVAILABLE' });
    });

    it('keeps a historical confirmed visit manageable after deletion', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      await visits.transition(v._id, agent._id.toString(), 'agent', 'confirmed');
      await Property.deleteOne({ _id: property._id });
      const completed = await visits.transition(v._id, agent._id.toString(), 'agent', 'completed');
      expect(completed.status).toBe('completed');
    });
  });

  describe('listing, ordering, filters and pagination', () => {
    beforeEach(async () => {
      await visits.create(buyer._id, { propertyId: property._id, ...window(future(2), 30) });
      await visits.create(buyer._id, { propertyId: property._id, ...window(future(4), 30) });
      await visits.create(buyer._id, { propertyId: property._id, ...window(future(6), 30) });
    });

    it('orders by startAt ascending (deterministic)', async () => {
      const result = await visits.list({ buyer: buyer._id });
      const starts = result.visits.map((v) => v.startAt.getTime());
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
    });

    it('scopes the buyer list strictly to the caller', async () => {
      const result = await visits.list({ buyer: otherBuyer._id });
      expect(result.visits).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });

    it('scopes the agent list strictly to the caller with summaries', async () => {
      const result = await visits.list({ agent: agent._id });
      expect(result.visits).toHaveLength(3);
      expect(result.visits[0].buyer.email).toBe('buyer@test.local');
      expect(result.visits[0].property.title).toBe('Visit home');
      expect((await visits.list({ agent: otherAgent._id })).visits).toHaveLength(0);
    });

    it('applies a whitelisted status filter', async () => {
      const [first] = (await visits.list({ buyer: buyer._id })).visits;
      await visits.transition(first._id, agent._id.toString(), 'agent', 'declined');
      const declined = await visits.list({ buyer: buyer._id, status: 'declined' });
      expect(declined.visits).toHaveLength(1);
      expect(declined.pagination.total).toBe(1);
      const pending = await visits.list({ buyer: buyer._id, status: 'pending' });
      expect(pending.visits).toHaveLength(2);
    });

    it('paginates deterministically with an empty out-of-range page', async () => {
      const page1 = await visits.list({ buyer: buyer._id }, 1, 2);
      expect(page1.visits).toHaveLength(2);
      expect(page1.pagination).toMatchObject({ total: 3, page: 1, pages: 2, limit: 2 });
      const page2 = await visits.list({ buyer: buyer._id }, 2, 2);
      expect(page2.visits).toHaveLength(1);
      const page9 = await visits.list({ buyer: buyer._id }, 9, 2);
      expect(page9.visits).toHaveLength(0);
      expect(page9.pagination.total).toBe(3);
    });
  });

  describe('email event matrix', () => {
    it('emails both buyer and agent on request', async () => {
      await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      const requested = eventsFor('requested');
      expect(requested).toHaveLength(2);
      expect(requested.map((m) => m.to).sort()).toEqual(['agent@test.local', 'buyer@test.local']);
    });

    it('emails only the buyer on confirmation', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      await visits.transition(v._id, agent._id.toString(), 'agent', 'confirmed');
      const confirmed = eventsFor('confirmed');
      expect(confirmed).toHaveLength(1);
      expect(confirmed[0].to).toBe('buyer@test.local');
    });

    it('emails only the buyer on decline', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      await visits.transition(v._id, agent._id.toString(), 'agent', 'declined');
      const declined = eventsFor('declined');
      expect(declined).toHaveLength(1);
      expect(declined[0].to).toBe('buyer@test.local');
    });

    it('emails the agent on buyer cancellation', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      await visits.transition(v._id, buyer._id.toString(), 'buyer', 'cancelled');
      const cancelled = eventsFor('buyer_cancelled');
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0].to).toBe('agent@test.local');
    });

    it('emails the buyer on agent cancellation', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      await visits.transition(v._id, agent._id.toString(), 'agent', 'confirmed');
      await visits.transition(v._id, agent._id.toString(), 'agent', 'cancelled');
      const cancelled = eventsFor('agent_cancelled');
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0].to).toBe('buyer@test.local');
    });

    it('sends no email on completion', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      fakeEmailProvider.clear();
      await visits.transition(v._id, agent._id.toString(), 'agent', 'confirmed');
      await visits.transition(v._id, agent._id.toString(), 'agent', 'completed');
      expect(fakeEmailProvider.sentEmails.filter((m) => m.event === 'completed')).toHaveLength(0);
    });

    it('sends no email on admin cancellation', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      fakeEmailProvider.clear();
      await visits.transition(v._id, admin._id.toString(), 'admin', 'cancelled');
      expect(fakeEmailProvider.sentEmails).toHaveLength(0);
    });

    it('derives recipients from persisted users, never from client input', async () => {
      await visits.create(buyer._id, {
        propertyId: property._id, ...window(future()),
        email: 'attacker@evil.local', to: 'attacker@evil.local',
      });
      const recipients = fakeEmailProvider.sentEmails.map((m) => m.to);
      expect(recipients).not.toContain('attacker@evil.local');
      expect(recipients.sort()).toEqual(['agent@test.local', 'buyer@test.local']);
    });

    it('escapes user-controlled HTML in generated email content', async () => {
      const evil = '<script>alert(1)</script>';
      const evilProperty = await Property.create(propertyData(agent._id, { title: evil }));
      await visits.create(buyer._id, {
        propertyId: evilProperty._id, ...window(future()), note: '" onmouseover="alert(2)',
      });
      const [message] = eventsFor('requested');
      expect(message.html).not.toContain('<script>');
      expect(message.html).toContain('&lt;script&gt;');
      expect(message.html).not.toContain('onmouseover="alert(2)"');
      expect(message.html).toContain('&quot;');
    });

    it('keeps the DB mutation successful when the email provider fails', async () => {
      fakeEmailProvider.setFailure(true);
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      expect(v.status).toBe('pending');
      expect(await Visit.exists({ _id: v._id })).toBeTruthy();
    });

    it('does not surface provider errors to the caller', async () => {
      fakeEmailProvider.setFailure(true);
      const v = await visits.create(buyer._id, { propertyId: property._id, ...window(future()) });
      const result = await visits.transition(v._id, agent._id.toString(), 'agent', 'confirmed');
      expect(result.status).toBe('confirmed');
      expect(JSON.stringify(result)).not.toMatch(/configured fake email failure|api[_-]?key/i);
    });

    it('refuses to send through Resend without configuration', async () => {
      process.env.EMAIL_PROVIDER = 'resend';
      delete process.env.RESEND_API_KEY;
      await expect(sendEmail({
        to: 'x@test.local', event: 'confirmed', visit: { startAt: new Date(), endAt: new Date() },
      })).rejects.toThrow(/configuration is incomplete/i);
      process.env.EMAIL_PROVIDER = 'fake';
    });
  });

  describe('escapeHtml helper', () => {
    it('escapes every HTML-significant character', () => {
      expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
      expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    });
  });

  describe('Visit index contract', () => {
    it('declares buyer, agent, compound and unique active-duplicate indexes', async () => {
      const indexes = await Visit.collection.indexes();
      const has = (pred) => indexes.some(pred);
      expect(has((i) => i.key.buyer === 1 && i.key.startAt === -1)).toBe(true);
      expect(has((i) => i.key.agent === 1 && i.key.startAt === -1)).toBe(true);
      expect(has((i) => i.key.agent === 1 && i.key.status === 1 && i.key.startAt === 1)).toBe(true);
      const unique = indexes.find(
        (i) => i.key.buyer === 1 && i.key.property === 1 && i.key.startAt === 1 && i.key.endAt === 1,
      );
      expect(unique.unique).toBe(true);
      expect(unique.partialFilterExpression).toMatchObject({ status: { $in: ['pending', 'confirmed'] } });
    });
  });
});
