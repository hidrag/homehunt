/**
 * S8 — Visit HTTP API suite (rate-limited app instance, own budget).
 *
 * HTTP-level authentication/authorization matrices, agent/buyer scoping,
 * admin administration, filter/pagination conventions, and shared-route
 * rejection semantics. Service-level rules (state machine internals,
 * concurrency, email) live in visit.mongo.test.js.
 *
 * The app-wide limiter allows 100 requests per module instance per
 * 15 minutes; every test below annotates its request count. Total is
 * tracked inline and kept well under budget.
 */
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../../src/app.js';
import User from '../../src/models/User.js';
import Property from '../../src/models/Property.js';
import Visit from '../../src/models/Visit.js';
import * as visits from '../../src/services/visit.service.js';
import { fakeEmailProvider } from '../../src/services/email.service.js';
import { AUTH_CONSTANTS } from '../../src/config/auth.js';
import { createAccessToken } from '../../src/utils/tokens.js';

let mongo;

const DAY = 86400000;
const MIN = 60000;

const cookie = (token) => [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${token}`];

const propertyData = (agent) => ({
  title: 'Visit home',
  description: 'A suitable test home for visit scheduling tests.',
  price: 100,
  propertyType: 'house',
  listingType: 'sale',
  location: { type: 'Point', coordinates: [77, 12] },
  address: { street: '1', city: 'B', state: 'K', zipCode: '1', country: 'India' },
  agent,
});

const slot = (daysAhead = 2, minutes = 60) => {
  const start = Date.now() + daysAhead * DAY;
  return { startAt: new Date(start).toISOString(), endAt: new Date(start + minutes * MIN).toISOString() };
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
  await Visit.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('S8 Visits — HTTP API', () => {
  let buyer, otherBuyer, agent, otherAgent, admin;
  let buyerCookie, otherBuyerCookie, agentCookie, otherAgentCookie, adminCookie;
  let property, otherProperty;

  // Fresh DB per test, but the rate-limit counter is per module instance
  // and can never be reset — hence the request accounting below.
  beforeEach(async () => {
    await User.deleteMany({});
    await Property.deleteMany({});
    await Visit.deleteMany({});
    fakeEmailProvider.clear();
    buyer = await User.create({ name: 'Buyer', email: 'buyer@test.local', passwordHash: 'x', role: 'buyer' });
    otherBuyer = await User.create({ name: 'Other', email: 'other@test.local', passwordHash: 'x', role: 'buyer' });
    agent = await User.create({ name: 'Agent', email: 'agent@test.local', passwordHash: 'x', role: 'agent' });
    otherAgent = await User.create({ name: 'Agent Two', email: 'agent2@test.local', passwordHash: 'x', role: 'agent' });
    admin = await User.create({ name: 'Admin', email: 'admin@test.local', passwordHash: 'x', role: 'admin' });
    property = await Property.create(propertyData(agent._id));
    otherProperty = await Property.create(propertyData(otherAgent._id));
    buyerCookie = createAccessToken(buyer);
    otherBuyerCookie = createAccessToken(otherBuyer);
    agentCookie = createAccessToken(agent);
    otherAgentCookie = createAccessToken(otherAgent);
    adminCookie = createAccessToken(admin);
  });

  describe('authentication', () => {
    // Requests: 6 (running total: 6)
    it('returns 401 UNAUTHORIZED for every endpoint when anonymous', async () => {
      const calls = [
        ['post', '/api/visits'],
        ['get', '/api/visits'],
        ['patch', `/api/visits/${new mongoose.Types.ObjectId()}/status`],
        ['get', '/api/visits/agent'],
        ['get', '/api/admin/visits'],
        ['patch', `/api/admin/visits/${new mongoose.Types.ObjectId()}/status`],
      ];
      for (const [method, path] of calls) {
        const res = await request(app)[method](path).send({});
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      }
    });
  });

  describe('buyer routes', () => {
    // Requests: 7 (running total: 13)
    it('buyer can create, list own, cancel own; agent and admin routes stay forbidden', async () => {
      const created = await request(app).post('/api/visits').set('Cookie', cookie(buyerCookie))
        .send({ propertyId: property._id.toString(), ...slot() });
      expect(created.status).toBe(201);
      expect(created.body.data.visit.status).toBe('pending');
      expect(created.body.data.visit.buyer).toBe(buyer._id.toString());
      expect(created.body.data.visit.agent).toBe(agent._id.toString());
      expect(created.body.data.visit.timezone).toBe('Asia/Kolkata');

      const mine = await request(app).get('/api/visits').set('Cookie', cookie(buyerCookie));
      expect(mine.status).toBe(200);
      expect(mine.body.data.visits).toHaveLength(1);
      expect(mine.body.data.visits[0]._id).toBe(created.body.data.visit._id);

      const asAgent = await request(app).get('/api/visits/agent').set('Cookie', cookie(buyerCookie));
      expect(asAgent.status).toBe(403);

      const adminList = await request(app).get('/api/admin/visits').set('Cookie', cookie(buyerCookie));
      expect(adminList.status).toBe(403);

      const adminPatch = await request(app).patch(`/api/admin/visits/${created.body.data.visit._id}/status`)
        .set('Cookie', cookie(buyerCookie)).send({ status: 'confirmed' });
      expect(adminPatch.status).toBe(403);

      // Buyers may only cancel: a confirm attempt is a state-machine 409.
      const confirm = await request(app).patch(`/api/visits/${created.body.data.visit._id}/status`)
        .set('Cookie', cookie(buyerCookie)).send({ status: 'confirmed' });
      expect(confirm.status).toBe(409);
      expect(confirm.body.error.code).toBe('INVALID_STATUS_TRANSITION');

      const cancel = await request(app).patch(`/api/visits/${created.body.data.visit._id}/status`)
        .set('Cookie', cookie(buyerCookie)).send({ status: 'cancelled' });
      expect(cancel.status).toBe(200);
      expect(cancel.body.data.visit.status).toBe('cancelled');
    });

    // Requests: 3 (running total: 16)
    it('rejects a missing status, an unknown property and a malformed body', async () => {
      const missingStatus = await request(app).patch('/api/visits/does-not-matter/status')
        .set('Cookie', cookie(buyerCookie)).send({});
      expect(missingStatus.status).toBe(400);

      const ghostProperty = new mongoose.Types.ObjectId().toString();
      const unknownProperty = await request(app).post('/api/visits').set('Cookie', cookie(buyerCookie))
        .send({ propertyId: ghostProperty, ...slot() });
      expect(unknownProperty.status).toBe(404);
      expect(unknownProperty.body.error.code).toBe('NOT_FOUND');

      const malformedProperty = await request(app).post('/api/visits').set('Cookie', cookie(buyerCookie))
        .send({ propertyId: 'not-an-id', ...slot() });
      expect(malformedProperty.status).toBe(400);
      expect(malformedProperty.body.error.code).toBe('INVALID_ID');
    });

    // Requests: 2 (running total: 18)
    it('does not leak visit existence across buyers (404, unchanged doc)', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...slot() });
      const res = await request(app).patch(`/api/visits/${v._id}/status`)
        .set('Cookie', cookie(otherBuyerCookie)).send({ status: 'cancelled' });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      const stored = await Visit.findById(v._id);
      expect(stored.status).toBe('pending');
    });
  });

  describe('agent routes', () => {
    // Requests: 4 (running total: 22)
    it('agent cannot create or use buyer routes but manages their own visits', async () => {
      const create = await request(app).post('/api/visits').set('Cookie', cookie(agentCookie)).send({});
      expect(create.status).toBe(403);

      const buyerList = await request(app).get('/api/visits').set('Cookie', cookie(agentCookie));
      expect(buyerList.status).toBe(403);

      const v = await visits.create(otherBuyer._id, { propertyId: property._id, ...slot() });
      const list = await request(app).get('/api/visits/agent').set('Cookie', cookie(agentCookie));
      expect(list.status).toBe(200);
      expect(list.body.data.visits).toHaveLength(1);
      expect(list.body.data.visits[0].buyer.name).toBe('Other');
      expect(list.body.data.visits[0].property._id).toBe(property._id.toString());

      const confirm = await request(app).patch(`/api/visits/${v._id}/status`)
        .set('Cookie', cookie(agentCookie)).send({ status: 'confirmed' });
      expect(confirm.status).toBe(200);
      expect(confirm.body.data.visit.status).toBe('confirmed');
    });

    // Requests: 3 (running total: 25)
    it('agent B cannot see or transition agent A visits (404)', async () => {
      await visits.create(buyer._id, { propertyId: property._id, ...slot() });
      const list = await request(app).get('/api/visits/agent').set('Cookie', cookie(otherAgentCookie));
      expect(list.status).toBe(200);
      expect(list.body.data.visits).toHaveLength(0);

      const aVisit = await Visit.findOne({ agent: agent._id });
      const patch = await request(app).patch(`/api/visits/${aVisit._id}/status`)
        .set('Cookie', cookie(otherAgentCookie)).send({ status: 'confirmed' });
      expect(patch.status).toBe(404);

      const unknown = await request(app).patch(`/api/visits/${new mongoose.Types.ObjectId()}/status`)
        .set('Cookie', cookie(agentCookie)).send({ status: 'confirmed' });
      expect(unknown.status).toBe(404);
    });

    // Requests: 2 (running total: 27)
    it('admin is rejected on the shared buyer/agent routes and must use admin routes', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...slot() });
      const shared = await request(app).patch(`/api/visits/${v._id}/status`)
        .set('Cookie', cookie(adminCookie)).send({ status: 'confirmed' });
      expect(shared.status).toBe(403);

      const buyerRoute = await request(app).get('/api/visits').set('Cookie', cookie(adminCookie));
      expect(buyerRoute.status).toBe(403);
    });
  });

  describe('admin routes', () => {
    // Requests: 3 (running total: 30)
    it('admin sees all visits across agents with summaries and pagination envelope', async () => {
      await visits.create(buyer._id, { propertyId: property._id, ...slot(2) });
      await visits.create(buyer._id, { propertyId: otherProperty._id, ...slot(4) });

      const res = await request(app).get('/api/admin/visits').set('Cookie', cookie(adminCookie));
      expect(res.status).toBe(200);
      expect(res.body.data.visits).toHaveLength(2);
      expect(res.body.data.pagination).toMatchObject({ total: 2, page: 1, pages: 1, limit: 10 });
      const starts = res.body.data.visits.map((item) => item.startAt);
      expect(starts).toEqual([...starts].sort());
      const first = res.body.data.visits[0];
      expect(first.buyer).toMatchObject({ name: 'Buyer' });
      expect(first.agent).toMatchObject({ name: 'Agent' });
      expect(first.buyer.passwordHash).toBeUndefined();
    });

    // Requests: 5 (running total: 35)
    it('filters by whitelisted status and by agent, ignoring invalid values', async () => {
      const pending = await visits.create(buyer._id, { propertyId: property._id, ...slot(2) });
      await visits.create(otherBuyer._id, { propertyId: otherProperty._id, ...slot(4) });

      const declined = await request(app).get('/api/admin/visits?status=declined')
        .set('Cookie', cookie(adminCookie));
      expect(declined.body.data.visits).toHaveLength(0);

      const byAgent = await request(app).get(`/api/admin/visits?agent=${otherAgent._id}`)
        .set('Cookie', cookie(adminCookie));
      expect(byAgent.body.data.visits).toHaveLength(1);
      expect(byAgent.body.data.visits[0].agent.name).toBe('Agent Two');

      const invalidAgent = await request(app).get('/api/admin/visits?agent=not-an-id')
        .set('Cookie', cookie(adminCookie));
      expect(invalidAgent.status).toBe(400);
      expect(invalidAgent.body.error.code).toBe('INVALID_ID');

      const injection = await request(app).get('/api/admin/visits?status=$where')
        .set('Cookie', cookie(adminCookie));
      expect(injection.status).toBe(200);
      expect(injection.body.data.pagination.total).toBe(2);

      await visits.transition(pending._id, admin._id.toString(), 'admin', 'declined');
      const nowDeclined = await request(app).get('/api/admin/visits?status=declined')
        .set('Cookie', cookie(adminCookie));
      expect(nowDeclined.body.data.visits).toHaveLength(1);
    });

    // Requests: 4 (running total: 39)
    it('clamps pagination limits and returns empty pages with 200', async () => {
      const clamped = await request(app).get('/api/admin/visits?limit=999&page=0')
        .set('Cookie', cookie(adminCookie));
      expect(clamped.status).toBe(200);
      expect(clamped.body.data.pagination).toMatchObject({ page: 1, limit: 50 });

      const outOfRange = await request(app).get('/api/admin/visits?page=99')
        .set('Cookie', cookie(adminCookie));
      expect(outOfRange.status).toBe(200);
      expect(outOfRange.body.data.visits).toHaveLength(0);

      const badNumbers = await request(app).get('/api/admin/visits?page=abc&limit=xyz')
        .set('Cookie', cookie(adminCookie));
      expect(badNumbers.status).toBe(200);
      expect(badNumbers.body.data.pagination).toMatchObject({ page: 1, limit: 10 });

      const custom = await request(app).get('/api/admin/visits?limit=1&page=1')
        .set('Cookie', cookie(adminCookie));
      expect(custom.body.data.visits.length).toBeLessThanOrEqual(1);
      expect(custom.body.data.pagination.limit).toBe(1);
    });

    // Requests: 5 (running total: 44)
    it('drives valid lifecycle transitions and rejects invalid ones via admin route', async () => {
      const v = await visits.create(buyer._id, { propertyId: property._id, ...slot() });

      const confirmed = await request(app).patch(`/api/admin/visits/${v._id}/status`)
        .set('Cookie', cookie(adminCookie)).send({ status: 'confirmed' });
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.data.visit.status).toBe('confirmed');

      // 'pending' is in the status vocabulary but is not a legal target
      // transition from 'confirmed' — the state machine answers 409.
      const badTarget = await request(app).patch(`/api/admin/visits/${v._id}/status`)
        .set('Cookie', cookie(adminCookie)).send({ status: 'pending' });
      expect(badTarget.status).toBe(409);
      expect(badTarget.body.error.code).toBe('INVALID_STATUS_TRANSITION');

      const skipped = await request(app).patch(`/api/admin/visits/${v._id}/status`)
        .set('Cookie', cookie(adminCookie)).send({ status: 'declined' });
      expect(skipped.status).toBe(409);

      const completed = await request(app).patch(`/api/admin/visits/${v._id}/status`)
        .set('Cookie', cookie(adminCookie)).send({ status: 'completed' });
      expect(completed.status).toBe(200);

      const closed = await request(app).patch(`/api/admin/visits/${v._id}/status`)
        .set('Cookie', cookie(adminCookie)).send({ status: 'cancelled' });
      expect(closed.status).toBe(409);
    });

    // Requests: 4 (running total: 48)
    it('rejects malformed ids, unknown visits and honors deleted properties', async () => {
      const malformed = await request(app).patch('/api/admin/visits/garbage/status')
        .set('Cookie', cookie(adminCookie)).send({ status: 'confirmed' });
      expect(malformed.status).toBe(400);
      expect(malformed.body.error.code).toBe('INVALID_ID');

      const unknown = await request(app).patch(`/api/admin/visits/${new mongoose.Types.ObjectId()}/status`)
        .set('Cookie', cookie(adminCookie)).send({ status: 'confirmed' });
      expect(unknown.status).toBe(404);

      const v = await visits.create(buyer._id, { propertyId: property._id, ...slot() });
      await Property.deleteOne({ _id: property._id });

      const list = await request(app).get('/api/admin/visits').set('Cookie', cookie(adminCookie));
      expect(list.body.data.visits[0].property).toBeNull();

      const cancel = await request(app).patch(`/api/admin/visits/${v._id}/status`)
        .set('Cookie', cookie(adminCookie)).send({ status: 'cancelled' });
      expect(cancel.status).toBe(200);
    });
  });

  describe('buyer list conventions', () => {
    // Requests: 6 (running total: 54)
    it('paginates, filters and nulls deleted properties per repository conventions', async () => {
      await visits.create(buyer._id, { propertyId: property._id, ...slot(2) });
      const deleted = await visits.create(buyer._id, { propertyId: otherProperty._id, ...slot(4) });
      await visits.create(otherBuyer._id, { propertyId: property._id, ...slot(6) });

      const all = await request(app).get('/api/visits').set('Cookie', cookie(buyerCookie));
      expect(all.body.data.visits).toHaveLength(2);
      expect(all.body.data.visits[0].startAt <= all.body.data.visits[1].startAt).toBe(true);

      const pageLimit = await request(app).get('/api/visits?page=2&limit=1').set('Cookie', cookie(buyerCookie));
      expect(pageLimit.body.data.visits).toHaveLength(1);
      expect(pageLimit.body.data.pagination).toMatchObject({ total: 2, page: 2, pages: 2, limit: 1 });

      const clamped = await request(app).get('/api/visits?limit=500').set('Cookie', cookie(buyerCookie));
      expect(clamped.body.data.pagination.limit).toBe(50);

      const byStatus = await request(app).get('/api/visits?status=pending').set('Cookie', cookie(buyerCookie));
      expect(byStatus.body.data.visits).toHaveLength(2);
      const noneConfirmed = await request(app).get('/api/visits?status=confirmed').set('Cookie', cookie(buyerCookie));
      expect(noneConfirmed.body.data.visits).toHaveLength(0);
      const invalid = await request(app).get('/api/visits?status=deleted').set('Cookie', cookie(buyerCookie));
      expect(invalid.body.data.pagination.total).toBe(2);

      await Property.deleteOne({ _id: deleted.property });
      const withDeleted = await request(app).get('/api/visits').set('Cookie', cookie(buyerCookie));
      const gone = withDeleted.body.data.visits.find((item) => item._id === deleted._id.toString());
      expect(gone.property).toBeNull();
    });
  });
});
