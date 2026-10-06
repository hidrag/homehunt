/**
 * S9 — Conversation service/database integration suite.
 *
 * Service- and persistence-level coverage: creation invariants with
 * server-derived participants, idempotent thread reuse, participant
 * scoping, 404 enumeration resistance, unread counters and read receipts,
 * message history ordering/pagination, append-only guarantees, and
 * deleted-property resilience.
 *
 * HTTP-level authorization matrices live in conversation.api.test.js;
 * Socket.io delivery lives in conversation.socket.test.js.
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../../src/models/User.js';
import Property from '../../src/models/Property.js';
import Conversation from '../../src/models/Conversation.js';
import Message from '../../src/models/Message.js';
import * as chat from '../../src/services/conversation.service.js';

let mongo;

const propertyData = (agent, overrides = {}) => ({
  title: 'Chat home',
  description: 'A suitable test home for conversation tests.',
  price: 100,
  propertyType: 'house',
  listingType: 'sale',
  location: { type: 'Point', coordinates: [77, 12] },
  address: { street: '1', city: 'B', state: 'K', zipCode: '1', country: 'India' },
  agent,
  ...overrides,
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

beforeEach(async () => {
  await User.deleteMany({});
  await Property.deleteMany({});
  await Conversation.deleteMany({});
  await Message.deleteMany({});
});

describe('S9 Conversations — domain & persistence (service level)', () => {
  let buyer, otherBuyer, agent, otherAgent, admin, property, otherProperty;

  beforeEach(async () => {
    buyer = await User.create({ name: 'Buyer', email: 'buyer@test.local', passwordHash: 'x', role: 'buyer' });
    otherBuyer = await User.create({ name: 'Other', email: 'other@test.local', passwordHash: 'x', role: 'buyer' });
    agent = await User.create({ name: 'Agent', email: 'agent@test.local', passwordHash: 'x', role: 'agent' });
    otherAgent = await User.create({ name: 'Agent Two', email: 'agent2@test.local', passwordHash: 'x', role: 'agent' });
    admin = await User.create({ name: 'Admin', email: 'admin@test.local', passwordHash: 'x', role: 'admin' });
    property = await Property.create(propertyData(agent._id));
    otherProperty = await Property.create(propertyData(otherAgent._id));
  });

  describe('creation invariants (server-derived participants)', () => {
    it('creates a thread with buyer from the caller and agent from the property', async () => {
      const { conversation, message, created } = await chat.openConversation(buyer._id, {
        propertyId: property._id, body: 'Hello about this listing',
      });
      expect(created).toBe(true);
      expect(conversation.buyer.toString()).toBe(buyer._id.toString());
      expect(conversation.agent.toString()).toBe(agent._id.toString());
      expect(conversation.property.toString()).toBe(property._id.toString());
      expect(message.sender._id.toString()).toBe(buyer._id.toString());
      expect(message.body).toBe('Hello about this listing');
    });

    it('ignores mass-assigned buyer, agent and unread fields', async () => {
      const { conversation, message } = await chat.openConversation(buyer._id, {
        propertyId: property._id,
        body: 'Hi',
        buyer: otherBuyer._id,
        agent: otherAgent._id,
        buyerUnread: 99,
        agentUnread: 99,
      });
      expect(conversation.buyer.toString()).toBe(buyer._id.toString());
      expect(conversation.agent.toString()).toBe(agent._id.toString());
      expect(conversation.buyerUnread).toBe(0);
      expect(conversation.agentUnread).toBe(1);
      expect(message.sender._id.toString()).toBe(buyer._id.toString());
    });

    it('derives the agent from the property even when the client supplies another agent', async () => {
      const { conversation } = await chat.openConversation(buyer._id, {
        propertyId: property._id, body: 'Hi', agent: otherAgent._id.toString(),
      });
      expect(conversation.agent.toString()).toBe(agent._id.toString());
    });

    it('rejects a malformed property id with 400 INVALID_ID', async () => {
      await expect(chat.openConversation(buyer._id, { propertyId: 'nope', body: 'Hi' }))
        .rejects.toMatchObject({ status: 400, code: 'INVALID_ID' });
    });

    it('returns 404 NOT_FOUND for an unknown property', async () => {
      await expect(chat.openConversation(buyer._id, {
        propertyId: new mongoose.Types.ObjectId(), body: 'Hi',
      })).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });

    it('rejects an empty or over-long opening message', async () => {
      await expect(chat.openConversation(buyer._id, { propertyId: property._id, body: '   ' }))
        .rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
      await expect(chat.openConversation(buyer._id, { propertyId: property._id, body: 'x'.repeat(2001) }))
        .rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    });

    it('trims the stored body', async () => {
      const { message } = await chat.openConversation(buyer._id, {
        propertyId: property._id, body: '  spaced  ',
      });
      expect(message.body).toBe('spaced');
    });

    it('is idempotent: reopening reuses the thread and appends the message', async () => {
      const first = await chat.openConversation(buyer._id, { propertyId: property._id, body: 'First' });
      const second = await chat.openConversation(buyer._id, { propertyId: property._id, body: 'Second' });
      expect(second.created).toBe(false);
      expect(second.conversation._id.toString()).toBe(first.conversation._id.toString());
      expect(await Conversation.countDocuments()).toBe(1);
      expect(await Message.countDocuments({ conversation: first.conversation._id })).toBe(2);
      expect(second.conversation.lastMessage.body).toBe('Second');
      expect(second.conversation.agentUnread).toBe(2);
    });

    it('prevents duplicate threads for the same (property, buyer) under concurrency', async () => {
      const results = await Promise.allSettled([
        chat.openConversation(buyer._id, { propertyId: property._id, body: 'A' }),
        chat.openConversation(buyer._id, { propertyId: property._id, body: 'B' }),
      ]);
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(await Conversation.countDocuments({ property: property._id, buyer: buyer._id })).toBe(1);
    });

    it('allows separate threads for different buyers on the same property', async () => {
      await chat.openConversation(buyer._id, { propertyId: property._id, body: 'Hi' });
      await chat.openConversation(otherBuyer._id, { propertyId: property._id, body: 'Hi' });
      expect(await Conversation.countDocuments({ property: property._id })).toBe(2);
    });

    it('allows the same buyer to open threads on different properties', async () => {
      await chat.openConversation(buyer._id, { propertyId: property._id, body: 'Hi' });
      await chat.openConversation(buyer._id, { propertyId: otherProperty._id, body: 'Hi' });
      expect(await Conversation.countDocuments({ buyer: buyer._id })).toBe(2);
    });
  });

  describe('participant scoping and enumeration resistance', () => {
    let conversation;

    beforeEach(async () => {
      ({ conversation } = await chat.openConversation(buyer._id, { propertyId: property._id, body: 'Hi' }));
    });

    it('scopes the buyer inbox strictly to the caller', async () => {
      const mine = await chat.listConversations(buyer._id, 'buyer');
      expect(mine.conversations).toHaveLength(1);
      expect((await chat.listConversations(otherBuyer._id, 'buyer')).conversations).toHaveLength(0);
    });

    it('scopes the agent inbox strictly to the caller', async () => {
      const mine = await chat.listConversations(agent._id, 'agent');
      expect(mine.conversations).toHaveLength(1);
      expect(mine.conversations[0].buyer.name).toBe('Buyer');
      expect(mine.conversations[0].property.title).toBe('Chat home');
      expect((await chat.listConversations(otherAgent._id, 'agent')).conversations).toHaveLength(0);
    });

    it('lets both participants read history and rejects everyone else with 404', async () => {
      await expect(chat.listMessages(conversation._id, buyer._id)).resolves.toBeDefined();
      await expect(chat.listMessages(conversation._id, agent._id)).resolves.toBeDefined();
      await expect(chat.listMessages(conversation._id, otherBuyer._id))
        .rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
      await expect(chat.listMessages(conversation._id, otherAgent._id))
        .rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });

    it('rejects an admin on participant-only thread operations (not a participant)', async () => {
      await expect(chat.listMessages(conversation._id, admin._id))
        .rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
      await expect(chat.sendMessage(conversation._id, admin._id, { body: 'peek' }))
        .rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });

    it('rejects malformed and unknown conversation ids with 400 and 404', async () => {
      await expect(chat.listMessages('bad', buyer._id)).rejects.toMatchObject({ status: 400, code: 'INVALID_ID' });
      await expect(chat.listMessages(new mongoose.Types.ObjectId(), buyer._id))
        .rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });
  });

  describe('messaging, unread counters and read receipts', () => {
    let conversation;

    beforeEach(async () => {
      ({ conversation } = await chat.openConversation(buyer._id, { propertyId: property._id, body: 'Hello' }));
    });

    it('lets the agent reply and increments the buyer unread counter', async () => {
      const { message } = await chat.sendMessage(conversation._id, agent._id, { body: 'Hi there' });
      expect(message.sender._id.toString()).toBe(agent._id.toString());
      const stored = await Conversation.findById(conversation._id);
      expect(stored.buyerUnread).toBe(1);
      expect(stored.agentUnread).toBe(1);
      expect(stored.lastMessage.body).toBe('Hi there');
      expect(stored.lastMessage.sender.toString()).toBe(agent._id.toString());
    });

    it('derives the sender from the caller, never the payload', async () => {
      const { message } = await chat.sendMessage(conversation._id, agent._id, {
        body: 'Reply', sender: buyer._id, readAt: new Date(),
      });
      expect(message.sender._id.toString()).toBe(agent._id.toString());
      expect(message.readAt).toBeNull();
    });

    it('rejects empty and over-long message bodies', async () => {
      await expect(chat.sendMessage(conversation._id, agent._id, { body: '  ' }))
        .rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
      await expect(chat.sendMessage(conversation._id, agent._id, { body: 'x'.repeat(2001) }))
        .rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    });

    it('zeroes the caller unread and stamps readAt on the other side when read', async () => {
      await chat.sendMessage(conversation._id, agent._id, { body: 'Reply' });
      const updated = await chat.markRead(conversation._id, buyer._id);
      expect(updated.buyerUnread).toBe(0);
      expect(updated.agentUnread).toBe(1);
      const agentMessage = await Message.findOne({ conversation: conversation._id, sender: agent._id });
      expect(agentMessage.readAt).toBeInstanceOf(Date);
      const buyerMessage = await Message.findOne({ conversation: conversation._id, sender: buyer._id });
      expect(buyerMessage.readAt).toBeNull();
    });

    it('leaves the other participant counter untouched when the sender reads', async () => {
      await chat.markRead(conversation._id, agent._id);
      const stored = await Conversation.findById(conversation._id);
      expect(stored.agentUnread).toBe(0);
      expect(stored.buyerUnread).toBe(0);
    });

    it('sums unread across conversations for the caller only', async () => {
      const second = await chat.openConversation(buyer._id, { propertyId: otherProperty._id, body: 'Second thread' });
      await chat.sendMessage(second.conversation._id, otherAgent._id, { body: 'Reply' });
      await chat.sendMessage(conversation._id, agent._id, { body: 'Reply' });
      const buyerUnread = await chat.unreadCount(buyer._id);
      expect(buyerUnread.unread).toBe(2);
      const agentUnread = await chat.unreadCount(agent._id);
      expect(agentUnread.unread).toBe(1);
    });
  });

  describe('history ordering and pagination', () => {
    let conversation;

    beforeEach(async () => {
      ({ conversation } = await chat.openConversation(buyer._id, { propertyId: property._id, body: 'm1' }));
      for (const body of ['m2', 'm3', 'm4']) {
        await chat.sendMessage(conversation._id, agent._id, { body });
      }
    });

    it('returns history newest first with deterministic ordering', async () => {
      const { messages } = await chat.listMessages(conversation._id, buyer._id);
      const times = messages.map((m) => new Date(m.createdAt).getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));
      expect(messages[0].body).toBe('m4');
    });

    it('paginates deterministically with an empty out-of-range page', async () => {
      const page1 = await chat.listMessages(conversation._id, buyer._id, 1, 2);
      expect(page1.messages).toHaveLength(2);
      expect(page1.pagination).toMatchObject({ total: 4, page: 1, pages: 2, limit: 2 });
      const page2 = await chat.listMessages(conversation._id, buyer._id, 2, 2);
      expect(page2.messages).toHaveLength(2);
      const page9 = await chat.listMessages(conversation._id, buyer._id, 9, 2);
      expect(page9.messages).toHaveLength(0);
      expect(page9.pagination.total).toBe(4);
    });

    it('lists the inbox newest-activity-first', async () => {
      const second = await chat.openConversation(buyer._id, { propertyId: otherProperty._id, body: 'newer' });
      const { conversations } = await chat.listConversations(buyer._id, 'buyer');
      expect(conversations[0]._id.toString()).toBe(second.conversation._id.toString());
      expect(conversations[1]._id.toString()).toBe(conversation._id.toString());
    });
  });

  describe('property deletion resilience', () => {
    it('retains the conversation and resolves property to null', async () => {
      const { conversation } = await chat.openConversation(buyer._id, { propertyId: property._id, body: 'Hi' });
      await Property.deleteOne({ _id: property._id });
      const { conversations } = await chat.listConversations(buyer._id, 'buyer');
      expect(conversations[0]._id.toString()).toBe(conversation._id.toString());
      expect(conversations[0].property).toBeNull();
      expect(await Conversation.exists({ _id: conversation._id })).toBeTruthy();
    });

    it('still allows messaging on a thread whose property was deleted', async () => {
      const { conversation } = await chat.openConversation(buyer._id, { propertyId: property._id, body: 'Hi' });
      await Property.deleteOne({ _id: property._id });
      await expect(chat.sendMessage(conversation._id, agent._id, { body: 'Still here' })).resolves.toBeDefined();
    });
  });

  describe('append-only lifecycle', () => {
    it('exposes no edit or delete service surface', () => {
      const exported = Object.keys(chat);
      expect(exported).not.toContain('editMessage');
      expect(exported).not.toContain('deleteMessage');
      expect(exported).not.toContain('updateMessage');
    });

    it('keeps message count monotonic across sends', async () => {
      const { conversation } = await chat.openConversation(buyer._id, { propertyId: property._id, body: 'a' });
      await chat.sendMessage(conversation._id, agent._id, { body: 'b' });
      await chat.sendMessage(conversation._id, buyer._id, { body: 'c' });
      expect(await Message.countDocuments({ conversation: conversation._id })).toBe(3);
    });
  });

  describe('admin audit surface', () => {
    beforeEach(async () => {
      await chat.openConversation(buyer._id, { propertyId: property._id, body: 'Hi' });
      await chat.openConversation(otherBuyer._id, { propertyId: otherProperty._id, body: 'Hi' });
    });

    it('lists every conversation with safe participant summaries', async () => {
      const { conversations, pagination } = await chat.adminListConversations();
      expect(conversations).toHaveLength(2);
      expect(pagination.total).toBe(2);
      expect(conversations[0].buyer.passwordHash).toBeUndefined();
      expect(conversations[0].agent.email).toBeDefined();
    });

    it('reads any conversation history without being a participant', async () => {
      const [conversation] = await Conversation.find({});
      const { messages } = await chat.adminListMessages(conversation._id);
      expect(messages).toHaveLength(1);
    });

    it('rejects malformed and unknown ids', async () => {
      await expect(chat.adminListMessages('bad')).rejects.toMatchObject({ status: 400, code: 'INVALID_ID' });
      await expect(chat.adminListMessages(new mongoose.Types.ObjectId()))
        .rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });
  });

  describe('index contract', () => {
    it('declares inbox, unique-thread and history indexes', async () => {
      const conversationIndexes = await Conversation.collection.indexes();
      const messageIndexes = await Message.collection.indexes();
      const has = (indexes, pred) => indexes.some(pred);
      expect(has(conversationIndexes, (i) => i.key.buyer === 1 && i.key.updatedAt === -1)).toBe(true);
      expect(has(conversationIndexes, (i) => i.key.agent === 1 && i.key.updatedAt === -1)).toBe(true);
      const unique = conversationIndexes.find((i) => i.key.property === 1 && i.key.buyer === 1);
      expect(unique.unique).toBe(true);
      expect(has(messageIndexes, (i) => i.key.conversation === 1 && i.key.createdAt === 1 && i.key._id === 1)).toBe(true);
    });
  });
});