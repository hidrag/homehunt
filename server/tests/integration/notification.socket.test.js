/**
 * S10 — Notification real-time delivery suite.
 *
 * Boots the same http.createServer(app) + Socket.io assembly as server.js.
 * Verifies the ADR-030 model end to end: authenticated sockets auto-join
 * their `user:${id}` room on connect, and `notification:new` reaches only
 * the recipient's room when notifications are created by real triggers.
 */
import http from 'http';
import mongoose from 'mongoose';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../../src/app.js';
import User from '../../src/models/User.js';
import SavedSearch from '../../src/models/SavedSearch.js';
import Notification from '../../src/models/Notification.js';
import { socketAuth } from '../../src/sockets/auth.middleware.js';
import { registerChatHandlers } from '../../src/sockets/chat.handler.js';
import { setIo } from '../../src/sockets/registry.js';
import { AUTH_CONSTANTS } from '../../src/config/auth.js';
import { createAccessToken } from '../../src/utils/tokens.js';
import * as savedSearchService from '../../src/services/savedSearch.service.js';
import propertyService from '../../src/services/property.service.js';

let mongo;
let server;
let io;
let baseUrl;

const cookieHeader = (token) => `${AUTH_CONSTANTS.COOKIE_ACCESS}=${token}`;

const propertyData = (agent) => ({
  title: 'Socket notif home',
  description: 'A suitable test home for notification socket tests.',
  price: 100,
  propertyType: 'house',
  listingType: 'sale',
  location: { type: 'Point', coordinates: [77, 12] },
  address: { street: '1', city: 'Bengaluru', state: 'K', zipCode: '1', country: 'India' },
  agent,
});

// First websocket handshake + first text-index build on a fresh in-memory
// mongod can exceed the default budgets on Windows CI; per-test timeouts
// (ESM mode has no `jest` global).
const once = (socket, event, timeout = 10000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const expectNoEvent = (socket, event, ms = 350) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, onIt); resolve(); }, ms);
    function onIt() { clearTimeout(timer); reject(new Error(`unexpected ${event}`)); }
    socket.on(event, onIt);
  });

const connect = (token) =>
  ioClient(baseUrl, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: token ? { Cookie: cookieHeader(token) } : {},
  });

const waitForConnect = (socket, timeoutMs = 15000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for socket connect')), timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

const settle = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-minimum-32-chars-long-12345';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-chars-long-12345';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
  await SavedSearch.init();
  await Notification.init();

  server = http.createServer(app);
  io = new SocketIOServer(server, { cors: { origin: '*', credentials: true } });
  io.use(socketAuth);
  registerChatHandlers(io);
  setIo(io);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;

  // Windows hosts under full-suite load can make the very first websocket
  // handshake of a fresh server slow enough to dominate the first test's
  // budget. Warm the path once so the suite measures behavior, not cold
  // start (mirrors the S9 lesson, hardened after CI flake observation).
  const warmup = connect(createAccessToken({ _id: new mongoose.Types.ObjectId(), role: 'buyer' }));
  try {
    await waitForConnect(warmup, 30000);
  } catch {
    // Cold start failed anyway — let the real tests surface it.
  } finally {
    warmup.close();
  }
}, 90000);

afterAll(async () => {
  setIo(null);
  await new Promise((resolve) => io.close(resolve));
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

describe('S10 Notifications — Socket.io user-room delivery', () => {
  let buyer, otherBuyer, agent;

  beforeEach(async () => {
    await User.deleteMany({});
    await SavedSearch.deleteMany({});
    await Notification.deleteMany({});
    buyer = await User.create({ name: 'Buyer', email: 'buyer@test.local', passwordHash: 'x', role: 'buyer' });
    otherBuyer = await User.create({ name: 'Other', email: 'other@test.local', passwordHash: 'x', role: 'buyer' });
    agent = await User.create({ name: 'Agent', email: 'agent@test.local', passwordHash: 'x', role: 'agent' });
  });

  it('delivers notification:new to the recipient room, persisted BEFORE the emit', async () => {
    const recipient = connect(createAccessToken(buyer));
    const stranger = connect(createAccessToken(otherBuyer));
    await waitForConnect(recipient);
    await waitForConnect(stranger);

    const delivered = once(recipient, 'notification:new');
    const notForStranger = expectNoEvent(stranger, 'notification:new');

    // Real trigger path: create a matching property through the service.
    await savedSearchService.create(String(buyer._id), { name: 'Socket search', criteria: { city: 'Bengaluru' } });
    await propertyService.createProperty(String(agent._id), propertyData(agent._id));

    const payload = await delivered;
    expect(payload.notification.type).toBe('listing_match');
    expect(payload.notification.recipient).toBe(String(buyer._id));
    // ADR-030: the document must already be persisted when the event fires.
    const persisted = await Notification.findById(payload.notification._id);
    expect(persisted).toBeTruthy();

    await notForStranger;
    recipient.close();
    stranger.close();
  }, 30000);

  it('multiple sockets of the same user all receive the event', async () => {
    const token = createAccessToken(buyer);
    const s1 = connect(token);
    const s2 = connect(token);
    await waitForConnect(s1);
    await waitForConnect(s2);

    const p1 = once(s1, 'notification:new');
    const p2 = once(s2, 'notification:new');

    await savedSearchService.create(String(buyer._id), { name: 's', criteria: { listingType: 'sale' } });
    await propertyService.createProperty(String(agent._id), propertyData(agent._id));

    const [a, b] = await Promise.all([p1, p2]);
    expect(a.notification.title).toBe(b.notification.title);
    s1.close();
    s2.close();
  });

  it('unauthenticated sockets still cannot attach', async () => {
    const anon = connect(null);
    await new Promise((resolve, reject) => {
      anon.once('connect_error', resolve);
      anon.once('connect', () => reject(new Error('expected connect_error')));
    });
    anon.close();
  });
});
