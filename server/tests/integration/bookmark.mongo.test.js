import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../../src/models/User.js';
import Property from '../../src/models/Property.js';
import Bookmark from '../../src/models/Bookmark.js';
import * as bookmarkService from '../../src/services/bookmark.service.js';

let mongoServer;

const createTestProperty = (agentId, overrides = {}) => ({
  title: 'Test Property',
  description: 'A test property for integration tests',
  price: 5000000,
  propertyType: 'apartment',
  listingType: 'sale',
  location: { type: 'Point', coordinates: [77.5946, 12.9716] },
  address: { street: '123 Test St', city: 'Bangalore', state: 'Karnataka', zipCode: '560001', country: 'India' },
  agent: agentId,
  images: ['https://example.com/img1.jpg'],
  ...overrides,
});

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await User.init();
  await Property.init();
  await Bookmark.init();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  await User.deleteMany({});
  await Property.deleteMany({});
  await Bookmark.deleteMany({});
});

describe('Bookmark MongoDB Tests', () => {
  let userA, userB, agent, property1, property2;

  beforeEach(async () => {
    userA = await User.create({
      name: 'Buyer User A',
      email: 'usera@example.com',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
      role: 'buyer',
    });
    userB = await User.create({
      name: 'Buyer User B',
      email: 'userb@example.com',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
      role: 'buyer',
    });
    agent = await User.create({
      name: 'Agent User',
      email: 'agent@example.com',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
      role: 'agent',
    });

    property1 = await Property.create(createTestProperty(agent._id));
    property2 = await Property.create(createTestProperty(agent._id, { title: 'Property 2' }));
  });

  it('proves unique compound index on {user: 1, property: 1} exists in collection', async () => {
    const indexes = await Bookmark.collection.indexes();
    const uniqueIndex = indexes.find(
      (idx) => idx.key && idx.key.user === 1 && idx.key.property === 1 && idx.unique === true
    );
    expect(uniqueIndex).toBeDefined();
  });

  it('proves duplicate prevention at database level (E11000)', async () => {
    await Bookmark.create({ user: userA._id, property: property1._id });

    await expect(
      Bookmark.create({ user: userA._id, property: property1._id })
    ).rejects.toThrow(/E11000/);
  });

  it('proves idempotent service behavior on duplicate addBookmark', async () => {
    const first = await bookmarkService.addBookmark(userA._id.toString(), property1._id.toString());
    expect(first.alreadyExists).toBe(false);
    expect(first.bookmark.property.toString()).toBe(property1._id.toString());

    const second = await bookmarkService.addBookmark(userA._id.toString(), property1._id.toString());
    expect(second.alreadyExists).toBe(true);
    expect(second.bookmark.property.toString()).toBe(property1._id.toString());

    // Total documents in DB remains 1
    const total = await Bookmark.countDocuments({ user: userA._id });
    expect(total).toBe(1);
  });

  it('proves cross-user isolation: user A bookmarks are not returned for user B', async () => {
    await bookmarkService.addBookmark(userA._id.toString(), property1._id.toString());
    await bookmarkService.addBookmark(userB._id.toString(), property2._id.toString());

    const userAResult = await bookmarkService.listForUser(userA._id.toString(), 1, 10);
    expect(userAResult.bookmarks.length).toBe(1);
    expect(userAResult.bookmarks[0].property._id.toString()).toBe(property1._id.toString());
    expect(userAResult.pagination.total).toBe(1);

    const userBResult = await bookmarkService.listForUser(userB._id.toString(), 1, 10);
    expect(userBResult.bookmarks.length).toBe(1);
    expect(userBResult.bookmarks[0].property._id.toString()).toBe(property2._id.toString());
    expect(userBResult.pagination.total).toBe(1);
  });

  it('proves delete isolation: user A cannot delete user B bookmark', async () => {
    await Bookmark.create({ user: userB._id, property: property1._id });

    const removeResult = await bookmarkService.removeBookmark(userA._id.toString(), property1._id.toString());
    expect(removeResult.removed).toBe(false);

    const bBookmark = await Bookmark.findOne({ user: userB._id, property: property1._id });
    expect(bBookmark).not.toBeNull();
  });

  it('proves property ID listing returns only current user property IDs for hydration', async () => {
    await bookmarkService.addBookmark(userA._id.toString(), property1._id.toString());
    await bookmarkService.addBookmark(userA._id.toString(), property2._id.toString());
    await bookmarkService.addBookmark(userB._id.toString(), property1._id.toString());

    const idsA = await bookmarkService.listPropertyIds(userA._id.toString());
    expect(idsA.length).toBe(2);
    expect(idsA).toContain(property1._id.toString());
    expect(idsA).toContain(property2._id.toString());

    const idsB = await bookmarkService.listPropertyIds(userB._id.toString());
    expect(idsB.length).toBe(1);
    expect(idsB).toEqual([property1._id.toString()]);
  });

  it('proves deterministic ordering: newest first (createdAt DESC, _id DESC)', async () => {
    const b1 = await Bookmark.create({ user: userA._id, property: property1._id });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const b2 = await Bookmark.create({ user: userA._id, property: property2._id });

    const result = await bookmarkService.listForUser(userA._id.toString(), 1, 10);
    expect(result.bookmarks.length).toBe(2);
    expect(result.bookmarks[0]._id.toString()).toBe(b2._id.toString());
    expect(result.bookmarks[1]._id.toString()).toBe(b1._id.toString());
  });

  it('proves pagination totals and page counts are calculated correctly', async () => {
    const prop3 = await Property.create(createTestProperty(agent._id, { title: 'Property 3' }));
    await Bookmark.create({ user: userA._id, property: property1._id });
    await Bookmark.create({ user: userA._id, property: property2._id });
    await Bookmark.create({ user: userA._id, property: prop3._id });

    const page1 = await bookmarkService.listForUser(userA._id.toString(), 1, 2);
    expect(page1.bookmarks.length).toBe(2);
    expect(page1.pagination.total).toBe(3);
    expect(page1.pagination.pages).toBe(2);
    expect(page1.pagination.page).toBe(1);
    expect(page1.pagination.limit).toBe(2);

    const page2 = await bookmarkService.listForUser(userA._id.toString(), 2, 2);
    expect(page2.bookmarks.length).toBe(1);
    expect(page2.pagination.page).toBe(2);
  });

  it('proves projection shape: populated property exposes only public summary without agent user document', async () => {
    await bookmarkService.addBookmark(userA._id.toString(), property1._id.toString());

    const result = await bookmarkService.listForUser(userA._id.toString(), 1, 10);
    const prop = result.bookmarks[0].property;

    expect(prop.title).toBe('Test Property');
    expect(prop.price).toBe(5000000);
    expect(prop.propertyType).toBe('apartment');
    expect(prop.listingType).toBe('sale');
    expect(prop.images).toBeDefined();
    expect(prop.address.city).toBe('Bangalore');

    // Agent user document MUST NOT be exposed
    expect(prop.agent).toBeUndefined();
    expect(prop.description).toBeUndefined();
  });
});
