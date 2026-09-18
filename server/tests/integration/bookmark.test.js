import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../../src/app.js';
import User from '../../src/models/User.js';
import Property from '../../src/models/Property.js';
import Bookmark from '../../src/models/Bookmark.js';
import { AUTH_CONSTANTS } from '../../src/config/auth.js';
import { createAccessToken } from '../../src/utils/tokens.js';

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

const createUser = async (overrides = {}) => {
  return User.create({
    name: 'Test User',
    email: `test-${Date.now()}-${Math.random()}@example.com`,
    passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
    role: 'buyer',
    ...overrides,
  });
};

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-minimum-32-chars-long-12345';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-chars-long-12345';

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await User.init();
  await Property.init();
  await Bookmark.init();
});

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

describe('Bookmark API Integration Tests', () => {
  let user;
  let userAccessCookie;
  let agent;
  let property;
  let propertyId;

  beforeEach(async () => {
    user = await createUser({ name: 'Buyer One', email: 'buyer1@example.com', role: 'buyer' });
    userAccessCookie = createAccessToken(user);

    agent = await createUser({ name: 'Agent One', email: 'agent1@example.com', role: 'agent' });
    property = await Property.create(createTestProperty(agent._id));
    propertyId = property._id.toString();
  });

  describe('Authentication', () => {
    it('should return 401 for GET /api/bookmarks without auth', async () => {
      const res = await request(app).get('/api/bookmarks');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for POST /api/bookmarks without auth', async () => {
      const res = await request(app).post('/api/bookmarks').send({ propertyId });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for DELETE /api/bookmarks/:id without auth', async () => {
      const res = await request(app).delete(`/api/bookmarks/${propertyId}`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for GET /api/bookmarks/ids without auth', async () => {
      const res = await request(app).get('/api/bookmarks/ids');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/bookmarks', () => {
    it('should return 400 VALIDATION_ERROR if propertyId is missing', async () => {
      const res = await request(app)
        .post('/api/bookmarks')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`])
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 INVALID_ID if propertyId is malformed', async () => {
      const res = await request(app)
        .post('/api/bookmarks')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`])
        .send({ propertyId: 'not-a-valid-id' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_ID');
    });

    it('should return 404 NOT_FOUND if property does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post('/api/bookmarks')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`])
        .send({ propertyId: fakeId });
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should create a bookmark and return 201 with alreadyExists: false', async () => {
      const res = await request(app)
        .post('/api/bookmarks')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`])
        .send({ propertyId });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.alreadyExists).toBe(false);
      expect(res.body.data.bookmark.property.toString()).toBe(propertyId);
      expect(res.body.data.bookmark.user.toString()).toBe(user._id.toString());
    });

    it('should return 200 with alreadyExists: true for duplicate bookmark (idempotent)', async () => {
      await Bookmark.create({ user: user._id, property: property._id });
      const res = await request(app)
        .post('/api/bookmarks')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`])
        .send({ propertyId });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.alreadyExists).toBe(true);
      expect(res.body.data.bookmark.property.toString()).toBe(propertyId);
    });

    it('should ignore extra body fields', async () => {
      const fakeUserId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post('/api/bookmarks')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`])
        .send({ propertyId, user: fakeUserId, _id: fakeUserId, role: 'admin' });
      expect(res.status).toBe(201);
      expect(res.body.data.bookmark.user.toString()).toBe(user._id.toString());
      expect(res.body.data.bookmark._id).not.toBe(fakeUserId);
    });
  });

  describe('DELETE /api/bookmarks/:propertyId', () => {
    it('should return 400 INVALID_ID if propertyId is malformed', async () => {
      const res = await request(app)
        .delete('/api/bookmarks/invalid-id')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`]);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_ID');
    });

    it('should delete existing bookmark and return 200 with removed: true', async () => {
      await Bookmark.create({ user: user._id, property: property._id });
      const res = await request(app)
        .delete(`/api/bookmarks/${propertyId}`)
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`]);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.removed).toBe(true);
    });

    it('should return 200 with removed: false when deleting non-existent bookmark (idempotent)', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .delete(`/api/bookmarks/${fakeId}`)
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`]);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.removed).toBe(false);
    });
  });

  describe('GET /api/bookmarks', () => {
    beforeEach(async () => {
      for (let i = 0; i < 3; i++) {
        const prop = await Property.create(createTestProperty(agent._id, { title: `Test ${i}` }));
        await Bookmark.create({ user: user._id, property: prop._id });
      }
    });

    it('should use pagination defaults (page=1, limit=10)', async () => {
      const res = await request(app)
        .get('/api/bookmarks')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`]);
      expect(res.status).toBe(200);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(10);
      expect(res.body.data.bookmarks.length).toBe(3);
    });

    it('should clamp limit > 50 to 50 and page < 1 to 1', async () => {
      const res = await request(app)
        .get('/api/bookmarks?page=0&limit=100')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`]);
      expect(res.status).toBe(200);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(50);
    });

    it('should return empty bookmarks array for out-of-range page', async () => {
      const res = await request(app)
        .get('/api/bookmarks?page=100')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`]);
      expect(res.status).toBe(200);
      expect(res.body.data.bookmarks.length).toBe(0);
      expect(res.body.data.pagination.page).toBe(100);
    });

    it('should scope bookmarks to the own-user', async () => {
      const userB = await createUser({ name: 'Buyer Two', email: 'buyer2@example.com', role: 'buyer' });
      const userBAccessCookie = createAccessToken(userB);

      const res = await request(app)
        .get('/api/bookmarks')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userBAccessCookie}`]);

      expect(res.status).toBe(200);
      expect(res.body.data.bookmarks.length).toBe(0);
      expect(res.body.data.pagination.total).toBe(0);
    });
  });

  describe('GET /api/bookmarks/ids', () => {
    it('should return an array of property ID strings', async () => {
      await Bookmark.create({ user: user._id, property: property._id });
      const res = await request(app)
        .get('/api/bookmarks/ids')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`]);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.ids)).toBe(true);
      expect(res.body.data.ids).toContain(propertyId);
    });
  });

  describe('Source-of-truth consistency (GET /ids vs GET /bookmarks)', () => {
    it('keeps /ids and /bookmarks agreeing after a create-then-delete sequence', async () => {
      const cookie = [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`];
      const props = [];
      for (let i = 0; i < 5; i++) {
        props.push(await Property.create(createTestProperty(agent._id, { title: `P${i}` })));
      }

      for (const p of props) {
        const res = await request(app)
          .post('/api/bookmarks')
          .set('Cookie', cookie)
          .send({ propertyId: p._id.toString() });
        expect(res.status).toBe(201);
      }

      const idsAfterCreate = await request(app).get('/api/bookmarks/ids').set('Cookie', cookie);
      const listAfterCreate = await request(app).get('/api/bookmarks').set('Cookie', cookie);
      expect(idsAfterCreate.body.data.ids.slice().sort()).toEqual(
        props.map((p) => p._id.toString()).slice().sort()
      );
      expect(listAfterCreate.body.data.pagination.total).toBe(5);
      expect(listAfterCreate.body.data.bookmarks.map((b) => b.property._id.toString()).sort())
        .toEqual(props.map((p) => p._id.toString()).sort());

      await request(app).delete(`/api/bookmarks/${props[0]._id}`).set('Cookie', cookie);
      await request(app).delete(`/api/bookmarks/${props[1]._id}`).set('Cookie', cookie);

      const idsAfterDelete = await request(app).get('/api/bookmarks/ids').set('Cookie', cookie);
      const listAfterDelete = await request(app).get('/api/bookmarks').set('Cookie', cookie);
      const remaining = props.slice(2).map((p) => p._id.toString()).sort();

      expect(idsAfterDelete.body.data.ids.slice().sort()).toEqual(remaining);
      expect(listAfterDelete.body.data.pagination.total).toBe(3);
      expect(listAfterDelete.body.data.bookmarks.map((b) => b.property._id.toString()).sort())
        .toEqual(remaining);

      const dbCount = await Bookmark.countDocuments({ user: user._id });
      expect(dbCount).toBe(3);
    });

    it('does not resurrect a deleted bookmark on a subsequent read', async () => {
      const cookie = [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`];
      await request(app).post('/api/bookmarks').set('Cookie', cookie).send({ propertyId });
      const del = await request(app).delete(`/api/bookmarks/${propertyId}`).set('Cookie', cookie);
      expect(del.status).toBe(200);
      expect(del.body.data.removed).toBe(true);

      const ids = await request(app).get('/api/bookmarks/ids').set('Cookie', cookie);
      const list = await request(app).get('/api/bookmarks').set('Cookie', cookie);
      expect(ids.body.data.ids).not.toContain(propertyId);
      expect(list.body.data.bookmarks.map((b) => b.property._id.toString())).not.toContain(propertyId);
      expect(list.body.data.pagination.total).toBe(0);
    });
  });
});
