/**
 * S9 — Socket.io real-time delivery suite.
 *
 * Boots a real http.createServer(app) + Socket.io instance on an ephemeral
 * port (the same assembly server.js performs) so handshake auth, room
 * authorization and broadcast are exercised end to end with real clients.
 *
 * Covered: handshake rejection for missing/invalid tokens, participant-only
 * room joins, non-participant rejection + disconnect, and verification that a
 * REST POST produces `message:new` for sockets in the room only.
 */
import http from 'http';
import mongoose from 'mongoose';
import request from 'supertest';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../../src/app.js';
import User from '../../src/models/User.js';
import Property from '../../src/models/Property.js';
import Conversation from '../../src/models/Conversation.js';
import Message from '../../src/models/Message.js';
import { socketAuth } from '../../src/sockets/auth.middleware.js';
import { registerChatHandlers } from '../../src/sockets/chat.handler.js';
import { setIo } from '../../src/sockets/registry.js';
import { AUTH_CONSTANTS } from '../../src/config/auth.js';
import { createAccessToken } from '../../src/utils/tokens.js';

let mongo;
let server;
let io;
let baseUrl;

const cookie = (token) => [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${token}`];
const cookieHeader = (token) => `${AUTH_CONSTANTS.COOKIE_ACCESS}=${token}`;

const propertyData = (agent) => ({
  title: 'Chat home',
  description: 'A suitable test home for socket tests.',
  price: 100,
  propertyType: 'house',
  listingType: 'sale',
  location: { type: 'Point', coordinates: [77, 12] },
  address: { street: '1', city: 'B', state: 'K', zipCode: '1', country: 'India' },
  agent,
});

// Resolves on the given event, rejecting on timeout so a missing broadcast
// fails the test instead of hanging the suite.
const once = (socket, event, timeout = 2000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const connect = (token, { reconnection = false } = {}) =>
  ioClient(baseUrl, {
    transports: ['websocket'],
    reconnection,
    extraHeaders: token ? { Cookie: cookieHeader(token) } : {},
  });

const waitForConnect = (socket) =>
  new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => reject(err));
  });

const waitForConnectError = (socket) =>
  new Promise((resolve, reject) => {
    socket.once('connect_error', (err) => resolve(err));
    socket.once('connect', () => reject(new Error('expected connect_error')));
  });

const join = (socket, conversationId) =>
  new Promise((resolve) => socket.emit('conversation:join', conversationId, resolve));

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

  server = http.createServer(app);
  io = new SocketIOServer(server, { cors: { origin: '*', credentials: true } });
  io.use(socketAuth);
  registerChatHandlers(io);
  setIo(io);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

afterAll(async () => {
  setIo(null);
  await new Promise((resolve) => io.close(resolve));
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

describe('S9 Conversations — Socket.io delivery', () => {
  let buyer, otherBuyer, agent, otherAgent, admin;
  let buyerCookie, otherBuyerCookie, agentCookie, otherAgentCookie, adminCookie;
  let property, conversationId;

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
    buyerCookie = createAccessToken(buyer);
    otherBuyerCookie = createAccessToken(otherBuyer);
    agentCookie = createAccessToken(agent);
    otherAgentCookie = createAccessToken(otherAgent);
    adminCookie = createAccessToken(admin);

    const created = await request(app).post('/api/conversations').set('Cookie', cookie(buyerCookie))
      .send({ propertyId: property._id.toString(), body: 'Hello' });
    conversationId = created.body.data.conversation._id;
  });

  describe('handshake authentication', () => {
    it('rejects a connection with no cookie', async () => {
      const socket = connect(null);
      const err = await waitForConnectError(socket);
      expect(err.message).toBe('AUTH_UNAUTHORIZED');
      socket.close();
    });

    it('rejects a connection with an invalid token', async () => {
      const socket = connect('not-a-real-jwt');
      const err = await waitForConnectError(socket);
      expect(err.message).toBe('AUTH_UNAUTHORIZED');
      socket.close();
    });

    it('accepts a connection with a valid access cookie', async () => {
      const socket = connect(buyerCookie);
      await waitForConnect(socket);
      expect(socket.connected).toBe(true);
      socket.close();
    });
  });

  describe('room authorization', () => {
    it('lets a participant join and rejects a non-participant with a disconnect', async () => {
      const participant = connect(buyerCookie);
      await waitForConnect(participant);
      expect(await join(participant, conversationId)).toEqual({ joined: true });

      const outsider = connect(otherBuyerCookie);
      await waitForConnect(outsider);
      const rejected = await join(outsider, conversationId);
      expect(rejected).toEqual({ error: 'NOT_FOUND' });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(outsider.connected).toBe(false);

      participant.close();
      outsider.close();
    });

    it('rejects a malformed conversation id without disconnecting', async () => {
      const socket = connect(buyerCookie);
      await waitForConnect(socket);
      expect(await join(socket, 'not-an-id')).toEqual({ error: 'INVALID_ID' });
      expect(socket.connected).toBe(true);
      socket.close();
    });

    it('rejects an admin from joining any conversation room', async () => {
      const socket = connect(adminCookie);
      await waitForConnect(socket);
      expect(await join(socket, conversationId)).toEqual({ error: 'NOT_FOUND' });
      socket.close();
    });

    it('allows leave without error', async () => {
      const socket = connect(buyerCookie);
      await waitForConnect(socket);
      await join(socket, conversationId);
      const left = await new Promise((resolve) => socket.emit('conversation:leave', conversationId, resolve));
      expect(left).toEqual({ left: true });
      socket.close();
    });
  });

  describe('real-time broadcast (REST write → socket emit)', () => {
    it('delivers message:new to a participant in the room', async () => {
      const socket = connect(buyerCookie);
      await waitForConnect(socket);
      await join(socket, conversationId);

      const received = once(socket, 'message:new');
      await request(app).post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', cookie(agentCookie)).send({ body: 'Reply from agent' });

      const payload = await received;
      expect(payload.body).toBe('Reply from agent');
      expect(payload.sender._id).toBe(agent._id.toString());
      socket.close();
    });

    it('does not deliver to a socket that never joined the room', async () => {
      const inRoom = connect(buyerCookie);
      await waitForConnect(inRoom);
      await join(inRoom, conversationId);

      const notJoined = connect(agentCookie);
      await waitForConnect(notJoined);

      let leaked = false;
      notJoined.on('message:new', () => { leaked = true; });

      const received = once(inRoom, 'message:new');
      await request(app).post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', cookie(agentCookie)).send({ body: 'Only for the room' });
      await received;
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(leaked).toBe(false);
      inRoom.close();
      notJoined.close();
    });

    it('persists the message before emitting (REST-visible immediately after)', async () => {
      const socket = connect(buyerCookie);
      await waitForConnect(socket);
      await join(socket, conversationId);

      const received = once(socket, 'message:new');
      await request(app).post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', cookie(agentCookie)).send({ body: 'Persist first' });
      const payload = await received;

      const stored = await Message.findById(payload._id);
      expect(stored).not.toBeNull();
      expect(stored.body).toBe('Persist first');
      socket.close();
    });

    it('emits conversation:updated on read', async () => {
      const socket = connect(agentCookie);
      await waitForConnect(socket);
      await join(socket, conversationId);

      const received = once(socket, 'conversation:updated');
      await request(app).post(`/api/conversations/${conversationId}/read`)
        .set('Cookie', cookie(buyerCookie));
      const payload = await received;
      expect(payload._id).toBe(conversationId);
      expect(payload.buyerUnread).toBe(0);
      socket.close();
    });
  });
});