/**
 * S10 — Saved-search & notification HTTP-level authorization matrices.
 *
 * Focus: the role gates (buyer-only saved searches; any-role notifications),
 * authentication, malformed ids, and the standard envelopes. Domain depth
 * lives in savedSearch.mongo.test.js / notification.mongo.test.js.
 *
 * Own app instance for rate-limit budget isolation (S8/S9 convention).
 */
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../../src/models/User.js';
import Notification from '../../src/models/Notification.js';
import SavedSearch from '../../src/models/SavedSearch.js';
import { AUTH_CONSTANTS } from '../../src/config/auth.js';
import { createAccessToken } from '../../src/utils/tokens.js';
import savedSearchRoutes from '../../src/routes/savedSearch.routes.js';
import notificationRoutes from '../../src/routes/notification.routes.js';

let mongo;
let api;

const cookie = (token) => [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${token}`];

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-minimum-32-chars-long-12345';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-chars-long-12345';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
  await Notification.init();
  await SavedSearch.init();

  // Own minimal app instance: no global rate limiter (budget isolation),
  // routes otherwise identical to app.js mounts.
  api = express();
  api.use(express.json());
  api.use('/api/saved-searches', savedSearchRoutes);
  api.use('/api/notifications', notificationRoutes);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Notification.deleteMany({});
  await SavedSearch.deleteMany({});
});

describe('S10 Saved-search HTTP API', () => {
  let buyer, agent, admin;
  let buyerCookie, agentCookie, adminCookie;

  beforeEach(async () => {
    buyer = await User.create({ name: 'Buyer', email: 'buyer@test.local', passwordHash: 'x', role: 'buyer' });
    agent = await User.create({ name: 'Agent', email: 'agent@test.local', passwordHash: 'x', role: 'agent' });
    admin = await User.create({ name: 'Admin', email: 'admin@test.local', passwordHash: 'x', role: 'admin' });
    buyerCookie = createAccessToken(buyer);
    agentCookie = createAccessToken(agent);
    adminCookie = createAccessToken(admin);
  });

  const validBody = { name: 'My search', criteria: { city: 'Bengaluru', listingType: 'sale' } };

  it('requires authentication on every route', async () => {
    expect((await request(api).post('/api/saved-searches').send(validBody)).status).toBe(401);
    expect((await request(api).get('/api/saved-searches')).status).toBe(401);
    expect((await request(api).get('/api/saved-searches/000000000000000000000000')).status).toBe(401);
    expect((await request(api).patch('/api/saved-searches/000000000000000000000000')).status).toBe(401);
    expect((await request(api).delete('/api/saved-searches/000000000000000000000000')).status).toBe(401);
    expect((await request(api).post('/api/saved-searches/000000000000000000000000/run')).status).toBe(401);
  });

  it('rejects agent and admin with 403 (buyer-only)', async () => {
    for (const ck of [agentCookie, adminCookie]) {
      expect((await request(api).post('/api/saved-searches').send(validBody).set('Cookie', cookie(ck))).status).toBe(403);
      expect((await request(api).get('/api/saved-searches').set('Cookie', cookie(ck))).status).toBe(403);
    }
  });

  it('buyer happy path: create -> list -> get -> patch -> run -> delete envelopes', async () => {
    const created = await request(api).post('/api/saved-searches').send(validBody).set('Cookie', cookie(buyerCookie));
    expect(created.status).toBe(201);
    expect(created.body.success).toBe(true);
    expect(created.body.data.savedSearch.user).toBe(String(buyer._id));
    const id = created.body.data.savedSearch._id;

    const list = await request(api).get('/api/saved-searches').set('Cookie', cookie(buyerCookie));
    expect(list.status).toBe(200);
    expect(list.body.data.pagination).toMatchObject({ total: 1, page: 1, limit: 10 });
    expect(list.body.data.savedSearches).toHaveLength(1);

    const one = await request(api).get(`/api/saved-searches/${id}`).set('Cookie', cookie(buyerCookie));
    expect(one.status).toBe(200);
    expect(one.body.data.savedSearch.name).toBe('My search');

    const run = await request(api).post(`/api/saved-searches/${id}/run`).set('Cookie', cookie(buyerCookie));
    expect(run.status).toBe(200);
    expect(Array.isArray(run.body.data.properties)).toBe(true);
    expect(typeof run.body.data.query).toBe('string');

    const patched = await request(api).patch(`/api/saved-searches/${id}`).send({ active: false }).set('Cookie', cookie(buyerCookie));
    expect(patched.status).toBe(200);
    expect(patched.body.data.savedSearch.active).toBe(false);

    const removed = await request(api).delete(`/api/saved-searches/${id}`).set('Cookie', cookie(buyerCookie));
    expect(removed.status).toBe(200);
    expect(removed.body.data).toEqual({ deleted: true });
  });

  it('validation & malformed ids flow through the envelope', async () => {
    const bad = await request(api).post('/api/saved-searches').send({ name: 'x', criteria: { propertyType: 'yacht' } }).set('Cookie', cookie(buyerCookie));
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    const daily = await request(api).post('/api/saved-searches').send({ ...validBody, frequency: 'daily' }).set('Cookie', cookie(buyerCookie));
    expect(daily.status).toBe(400);
    expect(daily.body.error.message).toBe('Daily digest is not supported in this version');

    const badId = await request(api).get('/api/saved-searches/not-an-id').set('Cookie', cookie(buyerCookie));
    expect(badId.status).toBe(400);
    expect(badId.body.error.code).toBe('INVALID_ID');

    const missing = await request(api).get('/api/saved-searches/000000000000000000000000').set('Cookie', cookie(buyerCookie));
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });

  it('another buyer cannot see or mutate (404, not 403)', async () => {
    const created = await request(api).post('/api/saved-searches').send(validBody).set('Cookie', cookie(buyerCookie));
    const id = created.body.data.savedSearch._id;
    const thief = await User.create({ name: 'Thief', email: 'thief@test.local', passwordHash: 'x', role: 'buyer' });
    const thiefCookie = createAccessToken(thief);
    expect((await request(api).get(`/api/saved-searches/${id}`).set('Cookie', cookie(thiefCookie))).status).toBe(404);
    expect((await request(api).patch(`/api/saved-searches/${id}`).send({ name: 'mine' }).set('Cookie', cookie(thiefCookie))).status).toBe(404);
    expect((await request(api).delete(`/api/saved-searches/${id}`).set('Cookie', cookie(thiefCookie))).status).toBe(404);
  });

  it('surface a 21st active search as 429 SEARCH_LIMIT', async () => {
    for (let i = 0; i < 20; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await request(api).post('/api/saved-searches').send({ name: `s${i}`, criteria: { city: 'B' } }).set('Cookie', cookie(buyerCookie));
    }
    const over = await request(api).post('/api/saved-searches').send({ name: 'over', criteria: { city: 'B' } }).set('Cookie', cookie(buyerCookie));
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('SEARCH_LIMIT');
  });
});

describe('S10 Notification HTTP API', () => {
  let buyer, agent, admin;
  let buyerCookie, agentCookie, adminCookie;

  beforeEach(async () => {
    buyer = await User.create({ name: 'Buyer', email: 'buyer@test.local', passwordHash: 'x', role: 'buyer' });
    agent = await User.create({ name: 'Agent', email: 'agent@test.local', passwordHash: 'x', role: 'agent' });
    admin = await User.create({ name: 'Admin', email: 'admin@test.local', passwordHash: 'x', role: 'admin' });
    buyerCookie = createAccessToken(buyer);
    agentCookie = createAccessToken(agent);
    adminCookie = createAccessToken(admin);
  });

  const makeNote = (recipient) => Notification.create({
    recipient, type: 'visit_update', title: 'Visit confirmed', body: 'body',
  });

  it('requires authentication', async () => {
    expect((await request(api).get('/api/notifications')).status).toBe(401);
    expect((await request(api).get('/api/notifications/unread-count')).status).toBe(401);
    expect((await request(api).patch('/api/notifications/read-all')).status).toBe(401);
    expect((await request(api).patch('/api/notifications/000000000000000000000000/read')).status).toBe(401);
    expect((await request(api).delete('/api/notifications/000000000000000000000000')).status).toBe(401);
  });

  it('any authenticated role gets its OWN inbox (buyer, agent, admin alike)', async () => {
    const buyerNote = await makeNote(buyer._id);
    const agentNote = await makeNote(agent._id);
    await makeNote(admin._id);

    const b = await request(api).get('/api/notifications').set('Cookie', cookie(buyerCookie));
    expect(b.status).toBe(200);
    expect(b.body.data.notifications.map((n) => String(n._id))).toEqual([String(buyerNote._id)]);

    const a = await request(api).get('/api/notifications').set('Cookie', cookie(agentCookie));
    expect(a.body.data.notifications.map((n) => String(n._id))).toEqual([String(agentNote._id)]);

    const counts = await Promise.all([
      request(api).get('/api/notifications/unread-count').set('Cookie', cookie(buyerCookie)),
      request(api).get('/api/notifications/unread-count').set('Cookie', cookie(agentCookie)),
      request(api).get('/api/notifications/unread-count').set('Cookie', cookie(adminCookie)),
    ]);
    expect(counts.map((r) => r.body.data.unread)).toEqual([1, 1, 1]);
  });

  it('unread filter is whitelisted (true/false; junk ignored)', async () => {
    const note = await makeNote(buyer._id);
    await request(api).patch(`/api/notifications/${note._id}/read`).set('Cookie', cookie(buyerCookie));
    await makeNote(buyer._id);

    const unread = await request(api).get('/api/notifications?unread=true').set('Cookie', cookie(buyerCookie));
    expect(unread.body.data.pagination.total).toBe(1);
    const read = await request(api).get('/api/notifications?unread=false').set('Cookie', cookie(buyerCookie));
    expect(read.body.data.pagination.total).toBe(1);
    const junk = await request(api).get('/api/notifications?unread=$where').set('Cookie', cookie(buyerCookie));
    expect(junk.body.data.pagination.total).toBe(2);
  });

  it('read-all, per-read, and cross-user 404s', async () => {
    const note = await makeNote(buyer._id);
    await makeNote(buyer._id);

    const readOne = await request(api).patch(`/api/notifications/${note._id}/read`).set('Cookie', cookie(buyerCookie));
    expect(readOne.status).toBe(200);
    expect(readOne.body.data.notification.read).toBe(true);

    // stranger cannot read/delete the remaining one
    expect((await request(api).patch('/api/notifications/000000000000000000000000/read').set('Cookie', cookie(buyerCookie))).status).toBe(404);
    expect((await request(api).delete('/api/notifications/000000000000000000000000').set('Cookie', cookie(buyerCookie))).status).toBe(404);
    const strangerNote = await makeNote(agent._id);
    expect((await request(api).delete(`/api/notifications/${strangerNote._id}`).set('Cookie', cookie(buyerCookie))).status).toBe(404);

    const all = await request(api).patch('/api/notifications/read-all').set('Cookie', cookie(buyerCookie));
    expect(all.status).toBe(200);
    expect(all.body.data.updated).toBe(1);

    const badId = await request(api).patch('/api/notifications/nope/read').set('Cookie', cookie(buyerCookie));
    expect(badId.status).toBe(400);
    expect(badId.body.error.code).toBe('INVALID_ID');
  });

  it('pagination envelope follows the project convention', async () => {
    for (let i = 0; i < 12; i += 1) await makeNote(buyer._id);
    const page = await request(api).get('/api/notifications?page=2&limit=5').set('Cookie', cookie(buyerCookie));
    expect(page.status).toBe(200);
    expect(page.body.data.pagination).toMatchObject({ total: 12, page: 2, pages: 3, limit: 5 });
    expect(page.body.data.notifications).toHaveLength(5);
    const clamped = await request(api).get('/api/notifications?limit=900').set('Cookie', cookie(buyerCookie));
    expect(clamped.body.data.pagination.limit).toBe(50);
  });
});
