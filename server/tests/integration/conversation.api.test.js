/**
 * S9 — Conversation HTTP API suite (own app instance, isolated rate budget).
 *
 * Role matrices (anon/buyer/agent/admin), participant-only access with 404
 * enumeration resistance, admin read-only audit routes, input validation,
 * and pagination conventions. Service-level rules live in
 * conversation.mongo.test.js; real-time delivery in conversation.socket.test.js.
 */
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../../src/app.js';
import User from '../../src/models/User.js';
import Property from '../../src/models/Property.js';
import Conversation from '../../src/models/Conversation.js';
import Message from '../../src/models/Message.js';
import { AUTH_CONSTANTS } from '../../src/config/auth.js';
import { createAccessToken } from '../../src/utils/tokens.js';

let mongo;

const cookie = (token) => [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${token}`];

const propertyData = (agent) => ({
  title: 'Chat home',
  description: 'A suitable test home for conversation API tests.',
  price: 100,
  propertyType: 'house',
  listingType: 'sale',
  location: { type: 'Point', coordinates: [77, 12] },
  address: { street: '1', city: 'B', state: 'K', zipCode: '1', country: 'India' },
  agent,
});

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-minimum-32-chars-long-12345';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-chars-long-12345';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
  await Property.init();
  await Conversation.init();
  await Message.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('S9 Conversations — HTTP API', () => {
  let buyer, otherBuyer, agent, otherAgent, admin;
  let buyerCookie, otherBuyerCookie, agentCookie, otherAgentCookie, adminCookie;
  let property, otherProperty;

  beforeEach(async () => {
    await User.deleteMany({});
    await Property.deleteMany({});
    await Conversation.deleteMany({});
    await Message.deleteMany({});
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
    it('returns 401 UNAUTHORIZED for every endpoint when anonymous', async () => {
      const calls = [
        ['post', '/api/conversations'],
        ['get', '/api/conversations'],
        ['get', '/api/conversations/unread-count'],
        ['get', `/api/conversations/${new mongoose.Types.ObjectId()}/messages`],
        ['post', `/api/conversations/${new mongoose.Types.ObjectId()}/messages`],
        ['post', `/api/conversations/${new mongoose.Types.ObjectId()}/read`],
        ['get', '/api/admin/conversations'],
        ['get', `/api/admin/conversations/${new mongoose.Types.ObjectId()}/messages`],
      ];
      for (const [method, path] of calls) {
        const res = await request(app)[method](path).send({});
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      }
    });
  });

  describe('buyer routes', () => {
    it('opens a thread, lists it, reads it and sends messages', async () => {
      const created = await request(app).post('/api/conversations').set('Cookie', cookie(buyerCookie))
        .send({ propertyId: property._id.toString(), body: 'Is this available?' });
      expect(created.status).toBe(201);
      expect(created.body.data.conversation.buyer).toBe(buyer._id.toString());
      expect(created.body.data.conversation.agent).toBe(agent._id.toString());
      expect(created.body.data.message.body).toBe('Is this available?');

      const inbox = await request(app).get('/api/conversations').set('Cookie', cookie(buyerCookie));
      expect(inbox.status).toBe(200);
      expect(inbox.body.data.conversations).toHaveLength(1);
      expect(inbox.body.data.conversations[0].property.title).toBe('Chat home');

      const conversationId = created.body.data.conversation._id;
      const history = await request(app).get(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', cookie(buyerCookie));
      expect(history.status).toBe(200);
      expect(history.body.data.messages).toHaveLength(1);

      const sent = await request(app).post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', cookie(buyerCookie)).send({ body: 'Following up' });
      expect(sent.status).toBe(201);
      expect(sent.body.data.message.body).toBe('Following up');

      const read = await request(app).post(`/api/conversations/${conversationId}/read`)
        .set('Cookie', cookie(buyerCookie));
      expect(read.status).toBe(200);
      expect(read.body.data.conversation.buyerUnread).toBe(0);

      const unread = await request(app).get('/api/conversations/unread-count')
        .set('Cookie', cookie(buyerCookie));
      expect(unread.status).toBe(200);
      expect(unread.body.data.unread).toBe(0);
    });

    it('reuses the thread on a repeat open (200, not 201)', async () => {
      const first = await request(app).post('/api/conversations').set('Cookie', cookie(buyerCookie))
        .send({ propertyId: property._id.toString(), body: 'First' });
      const second = await request(app).post('/api/conversations').set('Cookie', cookie(buyerCookie))
        .send({ propertyId: property._id.toString(), body: 'Second' });
      expect(second.status).toBe(200);
      expect(second.body.data.conversation._id).toBe(first.body.data.conversation._id);
      expect(await Conversation.countDocuments()).toBe(1);
    });

    it('rejects agents and admins from opening threads', async () => {
      const asAgent = await request(app).post('/api/conversations').set('Cookie', cookie(agentCookie))
        .send({ propertyId: property._id.toString(), body: 'Hi' });
      expect(asAgent.status).toBe(403);
      const asAdmin = await request(app).post('/api/conversations').set('Cookie', cookie(adminCookie))
        .send({ propertyId: property._id.toString(), body: 'Hi' });
      expect(asAdmin.status).toBe(403);
    });

    it('validates propertyId and body input', async () => {
      const malformed = await request(app).post('/api/conversations').set('Cookie', cookie(buyerCookie))
        .send({ propertyId: 'nope', body: 'Hi' });
      expect(malformed.status).toBe(400);
      expect(malformed.body.error.code).toBe('INVALID_ID');

      const unknown = await request(app).post('/api/conversations').set('Cookie', cookie(buyerCookie))
        .send({ propertyId: new mongoose.Types.ObjectId().toString(), body: 'Hi' });
      expect(unknown.status).toBe(404);
      expect(unknown.body.error.code).toBe('NOT_FOUND');

      const empty = await request(app).post('/api/conversations').set('Cookie', cookie(buyerCookie))
        .send({ propertyId: property._id.toString(), body: '   ' });
      expect(empty.status).toBe(400);
      expect(empty.body.error.code).toBe('VALIDATION_ERROR');

      const long = await request(app).post('/api/conversations').set('Cookie', cookie(buyerCookie))
        .send({ propertyId: property._id.toString(), body: 'x'.repeat(2001) });
      expect(long.status).toBe(400);
      expect(long.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('does not leak conversation existence to another buyer (404)', async () => {
      const created = await request(app).post('/api/conversations').set('Cookie', cookie(buyerCookie))
        .send({ propertyId: property._id.toString(), body: 'Hi' });
      const conversationId = created.body.data.conversation._id;

      const read = await request(app).get(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', cookie(otherBuyerCookie));
      expect(read.status).toBe(404);
      expect(read.body.error.code).toBe('NOT_FOUND');

      const write = await request(app).post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', cookie(otherBuyerCookie)).send({ body: 'intrude' });
      expect(write.status).toBe(404);

      expect(await Message.countDocuments({ conversation: conversationId })).toBe(1);
    });

    it('rejects an agent who is not the thread participant (404)', async () => {
      const created = await request(app).post('/api/conversations').set('Cookie', cookie(buyerCookie))
        .send({ propertyId: property._id.toString(), body: 'Hi' });
      const conversationId = created.body.data.conversation._id;
      const res = await request(app).get(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', cookie(otherAgentCookie));
      expect(res.status).toBe(404);
    });
  });

  describe('agent routes', () => {
    it('scopes the agent inbox to the caller and allows replying', async () => {
      const created = await request(app).post('/api/conversations').set('Cookie', cookie(buyerCookie))
        .send({ propertyId: property._id.toString(), body: 'Hi' });
      const conversationId = created.body.data.conversation._id;

      const inbox = await request(app).get('/api/conversations').set('Cookie', cookie(agentCookie));
      expect(inbox.status).toBe(200);
      expect(inbox.body.data.conversations).toHaveLength(1);
      expect(inbox.body.data.conversations[0].buyer.name).toBe('Buyer');

      const otherInbox = await request(app).get('/api/conversations').set('Cookie', cookie(otherAgentCookie));
      expect(otherInbox.body.data.conversations).toHaveLength(0);

      const reply = await request(app).post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', cookie(agentCookie)).send({ body: 'Yes it is' });
      expect(reply.status).toBe(201);
      expect(reply.body.data.message.sender._id).toBe(agent._id.toString());

      const agentUnread = await request(app).get('/api/conversations/unread-count')
        .set('Cookie', cookie(agentCookie));
      expect(agentUnread.body.data.unread).toBe(1);
    });

    it('rejects the admin on participant-only thread routes (403 at the role gate)', async () => {
      const created = await request(app).post('/api/conversations').set('Cookie', cookie(buyerCookie))
        .send({ propertyId: property._id.toString(), body: 'Hi' });
      const conversationId = created.body.data.conversation._id;
      const read = await request(app).get(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', cookie(adminCookie));
      expect(read.status).toBe(403);
      expect(read.body.error.code).toBe('FORBIDDEN');
      const post = await request(app).post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', cookie(adminCookie)).send({ body: 'audit note' });
      expect(post.status).toBe(403);
    });
  });

  describe('admin audit routes', () => {
    beforeEach(async () => {
      await request(app).post('/api/conversations').set('Cookie', cookie(buyerCookie))
        .send({ propertyId: property._id.toString(), body: 'Hi' });
      await request(app).post('/api/conversations').set('Cookie', cookie(otherBuyerCookie))
        .send({ propertyId: otherProperty._id.toString(), body: 'Hi' });
    });

    it('lets an admin list every conversation with safe summaries', async () => {
      const res = await request(app).get('/api/admin/conversations').set('Cookie', cookie(adminCookie));
      expect(res.status).toBe(200);
      expect(res.body.data.conversations).toHaveLength(2);
      expect(res.body.data.pagination.total).toBe(2);
      expect(res.body.data.conversations[0].buyer.passwordHash).toBeUndefined();
    });

    it('lets an admin read any conversation history', async () => {
      const [conversation] = await Conversation.find({});
      const res = await request(app).get(`/api/admin/conversations/${conversation._id}/messages`)
        .set('Cookie', cookie(adminCookie));
      expect(res.status).toBe(200);
      expect(res.body.data.messages).toHaveLength(1);
    });

    it('rejects buyers and agents on the admin routes', async () => {
      expect((await request(app).get('/api/admin/conversations').set('Cookie', cookie(buyerCookie))).status).toBe(403);
      expect((await request(app).get('/api/admin/conversations').set('Cookie', cookie(agentCookie))).status).toBe(403);
      const [conversation] = await Conversation.find({});
      const path = `/api/admin/conversations/${conversation._id}/messages`;
      expect((await request(app).get(path).set('Cookie', cookie(buyerCookie))).status).toBe(403);
      expect((await request(app).get(path).set('Cookie', cookie(agentCookie))).status).toBe(403);
    });

    it('rejects malformed and unknown admin message ids', async () => {
      const malformed = await request(app).get('/api/admin/conversations/garbage/messages')
        .set('Cookie', cookie(adminCookie));
      expect(malformed.status).toBe(400);
      expect(malformed.body.error.code).toBe('INVALID_ID');
      const unknown = await request(app).get(`/api/admin/conversations/${new mongoose.Types.ObjectId()}/messages`)
        .set('Cookie', cookie(adminCookie));
      expect(unknown.status).toBe(404);
    });

    it('clamps pagination and returns empty pages with 200', async () => {
      const clamped = await request(app).get('/api/admin/conversations?limit=999&page=0')
        .set('Cookie', cookie(adminCookie));
      expect(clamped.status).toBe(200);
      expect(clamped.body.data.pagination).toMatchObject({ page: 1, limit: 50 });

      const outOfRange = await request(app).get('/api/admin/conversations?page=99')
        .set('Cookie', cookie(adminCookie));
      expect(outOfRange.status).toBe(200);
      expect(outOfRange.body.data.conversations).toHaveLength(0);
      expect(outOfRange.body.data.pagination.total).toBe(2);

      const badNumbers = await request(app).get('/api/admin/conversations?page=abc&limit=xyz')
        .set('Cookie', cookie(adminCookie));
      expect(badNumbers.body.data.pagination).toMatchObject({ page: 1, limit: 10 });
    });
  });

  describe('deleted property handling', () => {
    it('keeps the thread with property: null after the listing is removed', async () => {
      const created = await request(app).post('/api/conversations').set('Cookie', cookie(buyerCookie))
        .send({ propertyId: property._id.toString(), body: 'Hi' });
      await Property.deleteOne({ _id: property._id });
      const inbox = await request(app).get('/api/conversations').set('Cookie', cookie(buyerCookie));
      const thread = inbox.body.data.conversations.find((c) => c._id === created.body.data.conversation._id);
      expect(thread.property).toBeNull();
    });
  });
});