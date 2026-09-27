import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../../src/app.js';
import User from '../../src/models/User.js';
import Property from '../../src/models/Property.js';
import Bookmark from '../../src/models/Bookmark.js';
import Inquiry from '../../src/models/Inquiry.js';
import { AUTH_CONSTANTS } from '../../src/config/auth.js';
import { createAccessToken } from '../../src/utils/tokens.js';

let mongoServer;

const createUser = async (overrides = {}) => {
  return User.create({
    name: 'Test User',
    email: `test-${Date.now()}-${Math.random()}@example.com`,
    passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
    role: 'buyer',
    ...overrides,
  });
};

const validPropertyPayload = (overrides = {}) => ({
  title: 'Luxury Apartment in Bandra',
  description: 'A spacious 3BHK apartment with a sea view and modern amenities.',
  price: 8500000,
  propertyType: 'apartment',
  listingType: 'sale',
  location: { type: 'Point', coordinates: [72.8296, 19.0596] },
  address: { street: '14 Carter Road', city: 'Mumbai', state: 'Maharashtra', zipCode: '400050' },
  bedrooms: 3,
  bathrooms: 2,
  area: 1450,
  amenities: ['Parking', 'Lift'],
  images: ['https://example.com/listing-1.jpg'],
  ...overrides,
});

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-minimum-32-chars-long-12345';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-chars-long-12345';

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await User.init();
  await Property.init();
  await Bookmark.init();
  await Inquiry.init();
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
  await Inquiry.deleteMany({});
});

describe('Property CRUD API (S6)', () => {
  let agent;
  let otherAgent;
  let buyer;
  let admin;
  let agentCookie;
  let otherAgentCookie;
  let buyerCookie;
  let adminCookie;
  let property;
  let propertyId;

  beforeEach(async () => {
    agent = await createUser({ name: 'Agent One', email: 'agent1@example.com', role: 'agent' });
    otherAgent = await createUser({ name: 'Agent Two', email: 'agent2@example.com', role: 'agent' });
    buyer = await createUser({ name: 'Buyer One', email: 'buyer1@example.com', role: 'buyer' });
    admin = await createUser({ name: 'Admin One', email: 'admin1@example.com', role: 'admin' });

    agentCookie = createAccessToken(agent);
    otherAgentCookie = createAccessToken(otherAgent);
    buyerCookie = createAccessToken(buyer);
    adminCookie = createAccessToken(admin);

    property = await Property.create({ ...validPropertyPayload(), agent: agent._id });
    propertyId = property._id.toString();
  });

  const cookie = (token) => [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${token}`];

  describe('POST /api/properties', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).post('/api/properties').send(validPropertyPayload());
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 for buyer role', async () => {
      const res = await request(app)
        .post('/api/properties')
        .set('Cookie', cookie(buyerCookie))
        .send(validPropertyPayload());
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should create a property owned by the authenticated agent', async () => {
      const res = await request(app)
        .post('/api/properties')
        .set('Cookie', cookie(agentCookie))
        .send(validPropertyPayload());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.property.title).toBe('Luxury Apartment in Bandra');
      expect(res.body.data.property.agent).toBe(agent._id.toString());
      expect(res.body.data.property.status).toBe('available');
      expect(res.body.data.property.address.country).toBe('India');
      expect(res.body.data.property.__v).toBeUndefined();

      const stored = await Property.findById(res.body.data.property._id);
      expect(stored.agent.toString()).toBe(agent._id.toString());
      expect(stored.status).toBe('available');
    });

    it('should ignore client-supplied agent and status (server-derived ownership)', async () => {
      const res = await request(app)
        .post('/api/properties')
        .set('Cookie', cookie(agentCookie))
        .send({
          ...validPropertyPayload(),
          agent: otherAgent._id.toString(),
          status: 'sold',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.property.agent).toBe(agent._id.toString());
      expect(res.body.data.property.status).toBe('available');
    });

    it('should allow an admin to create a property owned by the admin', async () => {
      const res = await request(app)
        .post('/api/properties')
        .set('Cookie', cookie(adminCookie))
        .send(validPropertyPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.property.agent).toBe(admin._id.toString());
    });

    it('should return 400 VALIDATION_ERROR when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/properties')
        .set('Cookie', cookie(agentCookie))
        .send({ title: 'Only a title' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for an invalid propertyType', async () => {
      const res = await request(app)
        .post('/api/properties')
        .set('Cookie', cookie(agentCookie))
        .send(validPropertyPayload({ propertyType: 'castle' }));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for a negative price', async () => {
      const res = await request(app)
        .post('/api/properties')
        .set('Cookie', cookie(agentCookie))
        .send(validPropertyPayload({ price: -100 }));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for out-of-range coordinates', async () => {
      const res = await request(app)
        .post('/api/properties')
        .set('Cookie', cookie(agentCookie))
        .send(validPropertyPayload({ location: { type: 'Point', coordinates: [200, 95] } }));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for non-URL image entries', async () => {
      const res = await request(app)
        .post('/api/properties')
        .set('Cookie', cookie(agentCookie))
        .send(validPropertyPayload({ images: ['not-a-url'] }));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for oversized input', async () => {
      const res = await request(app)
        .post('/api/properties')
        .set('Cookie', cookie(agentCookie))
        .send(validPropertyPayload({ title: 'x'.repeat(201) }));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/properties/mine', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/properties/mine');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 for buyer role', async () => {
      const res = await request(app).get('/api/properties/mine').set('Cookie', cookie(buyerCookie));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return only the authenticated agent\'s listings', async () => {
      const second = await Property.create({
        ...validPropertyPayload({ title: 'Second Listing' }),
        agent: agent._id,
      });
      await Property.create({
        ...validPropertyPayload({ title: 'Other Agent Listing' }),
        agent: otherAgent._id,
      });

      const res = await request(app).get('/api/properties/mine').set('Cookie', cookie(agentCookie));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pagination.total).toBe(2);
      expect(res.body.data.properties).toHaveLength(2);

      const ids = res.body.data.properties.map((item) => item._id);
      expect(ids).toContain(second._id.toString());
      expect(ids).toContain(propertyId);
      res.body.data.properties.forEach((item) => {
        expect(item.agent).toBe(agent._id.toString());
      });
    });

    it('should order listings newest first', async () => {
      const second = await Property.create({
        ...validPropertyPayload({ title: 'Second Listing' }),
        agent: agent._id,
      });

      const res = await request(app).get('/api/properties/mine').set('Cookie', cookie(agentCookie));

      expect(res.status).toBe(200);
      expect(res.body.data.properties[0]._id).toBe(second._id.toString());
      expect(res.body.data.properties[1]._id).toBe(propertyId);
    });

    it('should clamp pagination limits', async () => {
      const res = await request(app)
        .get('/api/properties/mine?limit=999')
        .set('Cookie', cookie(agentCookie));

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.limit).toBe(50);
    });
  });

  describe('PATCH /api/properties/:id', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).patch(`/api/properties/${propertyId}`).send({ title: 'Updated' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 for buyer role', async () => {
      const res = await request(app)
        .patch(`/api/properties/${propertyId}`)
        .set('Cookie', cookie(buyerCookie))
        .send({ title: 'Updated' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return 400 INVALID_ID for a malformed id', async () => {
      const res = await request(app)
        .patch('/api/properties/not-a-valid-id')
        .set('Cookie', cookie(agentCookie))
        .send({ title: 'Updated' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ID');
    });

    it('should return 404 NOT_FOUND for an unknown property', async () => {
      const unknownId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .patch(`/api/properties/${unknownId}`)
        .set('Cookie', cookie(agentCookie))
        .send({ title: 'Updated' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 when an agent edits another agent\'s property', async () => {
      const res = await request(app)
        .patch(`/api/properties/${propertyId}`)
        .set('Cookie', cookie(otherAgentCookie))
        .send({ title: 'Hijacked Title' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');

      const stored = await Property.findById(propertyId);
      expect(stored.title).toBe('Luxury Apartment in Bandra');
    });

    it('should allow the owner to update fields and persist them', async () => {
      const res = await request(app)
        .patch(`/api/properties/${propertyId}`)
        .set('Cookie', cookie(agentCookie))
        .send({ title: 'Renovated Sea View Apartment', price: 9100000, status: 'under_offer' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.property.title).toBe('Renovated Sea View Apartment');
      expect(res.body.data.property.price).toBe(9100000);
      expect(res.body.data.property.status).toBe('under_offer');

      const stored = await Property.findById(propertyId);
      expect(stored.title).toBe('Renovated Sea View Apartment');
      expect(stored.price).toBe(9100000);
      expect(stored.status).toBe('under_offer');
    });

    it('should leave unspecified fields untouched on partial update', async () => {
      const res = await request(app)
        .patch(`/api/properties/${propertyId}`)
        .set('Cookie', cookie(agentCookie))
        .send({ price: 1 });

      expect(res.status).toBe(200);

      const stored = await Property.findById(propertyId);
      expect(stored.price).toBe(1);
      expect(stored.title).toBe('Luxury Apartment in Bandra');
      expect(stored.address.city).toBe('Mumbai');
    });

    it('should never allow the agent field to change through the API', async () => {
      const res = await request(app)
        .patch(`/api/properties/${propertyId}`)
        .set('Cookie', cookie(agentCookie))
        .send({ title: 'Renamed Listing', agent: otherAgent._id.toString() });

      expect(res.status).toBe(200);

      const stored = await Property.findById(propertyId);
      expect(stored.agent.toString()).toBe(agent._id.toString());
      expect(stored.title).toBe('Renamed Listing');
    });

    it('should allow an admin to update another agent\'s property', async () => {
      const res = await request(app)
        .patch(`/api/properties/${propertyId}`)
        .set('Cookie', cookie(adminCookie))
        .send({ status: 'sold' });

      expect(res.status).toBe(200);
      expect(res.body.data.property.status).toBe('sold');

      const stored = await Property.findById(propertyId);
      expect(stored.status).toBe('sold');
    });

    it('should return 400 when no valid fields are supplied', async () => {
      const res = await request(app)
        .patch(`/api/properties/${propertyId}`)
        .set('Cookie', cookie(agentCookie))
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for a disallowed status value', async () => {
      const res = await request(app)
        .patch(`/api/properties/${propertyId}`)
        .set('Cookie', cookie(agentCookie))
        .send({ status: 'pending' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/properties/:id', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).delete(`/api/properties/${propertyId}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 for buyer role', async () => {
      const res = await request(app)
        .delete(`/api/properties/${propertyId}`)
        .set('Cookie', cookie(buyerCookie));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return 400 INVALID_ID for a malformed id', async () => {
      const res = await request(app)
        .delete('/api/properties/not-a-valid-id')
        .set('Cookie', cookie(agentCookie));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ID');
    });

    it('should return 404 NOT_FOUND for an unknown property', async () => {
      const unknownId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .delete(`/api/properties/${unknownId}`)
        .set('Cookie', cookie(agentCookie));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 when an agent deletes another agent\'s property', async () => {
      const res = await request(app)
        .delete(`/api/properties/${propertyId}`)
        .set('Cookie', cookie(otherAgentCookie));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');

      const stored = await Property.findById(propertyId);
      expect(stored).not.toBeNull();
    });

    it('should allow the owner to delete their property', async () => {
      const res = await request(app)
        .delete(`/api/properties/${propertyId}`)
        .set('Cookie', cookie(agentCookie));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deleted).toBe(true);
      expect(await Property.findById(propertyId)).toBeNull();
    });

    it('should remove bookmark references but retain inquiries', async () => {
      await Bookmark.create({ user: buyer._id, property: property._id });
      await Inquiry.create({
        property: property._id,
        buyer: buyer._id,
        agent: agent._id,
        name: 'Test Buyer',
        email: 'testbuyer@example.com',
        phone: '',
        message: 'Interested in this property, please contact me.',
      });

      const res = await request(app)
        .delete(`/api/properties/${propertyId}`)
        .set('Cookie', cookie(agentCookie));

      expect(res.status).toBe(200);
      expect(await Property.findById(propertyId)).toBeNull();
      expect(await Bookmark.countDocuments({ property: property._id })).toBe(0);
      expect(await Inquiry.countDocuments({ property: property._id })).toBe(1);
    });

    it('should allow an admin to delete another agent\'s property', async () => {
      const res = await request(app)
        .delete(`/api/properties/${propertyId}`)
        .set('Cookie', cookie(adminCookie));

      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);
      expect(await Property.findById(propertyId)).toBeNull();
    });
  });

  describe('Property index (S6)', () => {
    it('should declare the agent + createdAt compound index', async () => {
      const indexes = await Property.collection.indexes();
      const hasAgentIndex = indexes.some(
        (index) => index.key && index.key.agent === 1 && index.key.createdAt === -1,
      );
      expect(hasAgentIndex).toBe(true);
    });
  });
});
