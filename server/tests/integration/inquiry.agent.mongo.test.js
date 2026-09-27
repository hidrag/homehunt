import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../../src/app.js';
import User from '../../src/models/User.js';
import Property from '../../src/models/Property.js';
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

const createTestInquiry = (propertyId, buyerId, agentId, overrides = {}) => ({
  property: propertyId,
  buyer: buyerId,
  agent: agentId,
  name: 'Interested Buyer',
  email: 'buyer@example.com',
  phone: '1234567890',
  message: 'Hello! I would like to know more about this property.',
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
  await Inquiry.deleteMany({});
});

describe('Agent Inquiry Inbox API (S6)', () => {
  let agentA;
  let agentB;
  let admin;
  let buyer;
  let agentACookie;
  let agentBCookie;
  let adminCookie;
  let buyerCookie;
  let propertyA;
  let inquiryOne;
  let inquiryTwo;
  let inquiryForAgentB;

  beforeEach(async () => {
    agentA = await createUser({ name: 'Agent A', email: 'agenta@example.com', role: 'agent' });
    agentB = await createUser({ name: 'Agent B', email: 'agentb@example.com', role: 'agent' });
    admin = await createUser({ name: 'Admin One', email: 'admin@example.com', role: 'admin' });
    buyer = await createUser({ name: 'Buyer One', email: 'buyer1@example.com', role: 'buyer' });

    agentACookie = createAccessToken(agentA);
    agentBCookie = createAccessToken(agentB);
    adminCookie = createAccessToken(admin);
    buyerCookie = createAccessToken(buyer);

    propertyA = await Property.create(createTestProperty(agentA._id));

    inquiryOne = await Inquiry.create(createTestInquiry(propertyA._id, buyer._id, agentA._id));
    inquiryTwo = await Inquiry.create(
      createTestInquiry(propertyA._id, buyer._id, agentA._id, {
        message: 'Following up on my previous question, is it still available?',
      }),
    );
    inquiryForAgentB = await Inquiry.create(createTestInquiry(propertyA._id, buyer._id, agentB._id));
  });

  const cookie = (token) => [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${token}`];

  describe('GET /api/inquiries/agent', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/inquiries/agent');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 for buyer role', async () => {
      const res = await request(app)
        .get('/api/inquiries/agent')
        .set('Cookie', cookie(buyerCookie));
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return only inquiries addressed to the authenticated agent', async () => {
      const res = await request(app)
        .get('/api/inquiries/agent')
        .set('Cookie', cookie(agentACookie));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pagination.total).toBe(2);
      expect(res.body.data.inquiries).toHaveLength(2);

      const ids = res.body.data.inquiries.map((inquiry) => inquiry._id);
      expect(ids).toContain(inquiryOne._id.toString());
      expect(ids).toContain(inquiryTwo._id.toString());
      expect(ids).not.toContain(inquiryForAgentB._id.toString());

      res.body.data.inquiries.forEach((inquiry) => {
        expect(inquiry.agent).toBe(agentA._id.toString());
      });
    });

    it('should populate the property summary for the agent inbox', async () => {
      const res = await request(app)
        .get('/api/inquiries/agent')
        .set('Cookie', cookie(agentACookie));

      expect(res.status).toBe(200);
      const [first] = res.body.data.inquiries;
      expect(first.property).toBeTruthy();
      expect(first.property.title).toBe('Test Property');
      expect(first.property.price).toBe(5000000);
      expect(first.property.address.city).toBe('Bangalore');
      expect(first.name).toBe('Interested Buyer');
      expect(first.email).toBe('buyer@example.com');
    });

    it('should order inquiries newest first', async () => {
      const res = await request(app)
        .get('/api/inquiries/agent')
        .set('Cookie', cookie(agentACookie));

      expect(res.status).toBe(200);
      expect(res.body.data.inquiries[0]._id).toBe(inquiryTwo._id.toString());
      expect(res.body.data.inquiries[1]._id).toBe(inquiryOne._id.toString());
    });

    it('should clamp pagination limits and return empty pages with 200', async () => {
      const clamped = await request(app)
        .get('/api/inquiries/agent?limit=999')
        .set('Cookie', cookie(agentACookie));
      expect(clamped.status).toBe(200);
      expect(clamped.body.data.pagination.limit).toBe(50);

      const outOfRange = await request(app)
        .get('/api/inquiries/agent?page=99')
        .set('Cookie', cookie(agentACookie));
      expect(outOfRange.status).toBe(200);
      expect(outOfRange.body.data.inquiries).toHaveLength(0);
      expect(outOfRange.body.data.pagination.total).toBe(2);
    });
  });

  describe('PATCH /api/inquiries/:id/status', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .patch(`/api/inquiries/${inquiryOne._id}/status`)
        .send({ status: 'responded' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 for buyer role', async () => {
      const res = await request(app)
        .patch(`/api/inquiries/${inquiryOne._id}/status`)
        .set('Cookie', cookie(buyerCookie))
        .send({ status: 'responded' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return 400 INVALID_ID for a malformed id', async () => {
      const res = await request(app)
        .patch('/api/inquiries/not-a-valid-id/status')
        .set('Cookie', cookie(agentACookie))
        .send({ status: 'responded' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ID');
    });

    it('should return 404 NOT_FOUND for an unknown inquiry', async () => {
      const unknownId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .patch(`/api/inquiries/${unknownId}/status`)
        .set('Cookie', cookie(agentACookie))
        .send({ status: 'responded' });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 when an agent updates another agent\'s inquiry', async () => {
      const res = await request(app)
        .patch(`/api/inquiries/${inquiryOne._id}/status`)
        .set('Cookie', cookie(agentBCookie))
        .send({ status: 'responded' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');

      const stored = await Inquiry.findById(inquiryOne._id);
      expect(stored.status).toBe('pending');
    });

    it('should return 403 when an admin updates another agent\'s inquiry (manage-own scope)', async () => {
      const res = await request(app)
        .patch(`/api/inquiries/${inquiryOne._id}/status`)
        .set('Cookie', cookie(adminCookie))
        .send({ status: 'responded' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow an admin to manage an inquiry addressed to the admin', async () => {
      const ownInquiry = await Inquiry.create(createTestInquiry(propertyA._id, buyer._id, admin._id));

      const res = await request(app)
        .patch(`/api/inquiries/${ownInquiry._id}/status`)
        .set('Cookie', cookie(adminCookie))
        .send({ status: 'responded' });

      expect(res.status).toBe(200);
      expect(res.body.data.inquiry.status).toBe('responded');
    });

    it('should mark an inquiry as responded and persist the change', async () => {
      const res = await request(app)
        .patch(`/api/inquiries/${inquiryOne._id}/status`)
        .set('Cookie', cookie(agentACookie))
        .send({ status: 'responded' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.inquiry.status).toBe('responded');

      const stored = await Inquiry.findById(inquiryOne._id);
      expect(stored.status).toBe('responded');
    });

    it('should allow closing an inquiry', async () => {
      const res = await request(app)
        .patch(`/api/inquiries/${inquiryOne._id}/status`)
        .set('Cookie', cookie(agentACookie))
        .send({ status: 'closed' });

      expect(res.status).toBe(200);
      expect(res.body.data.inquiry.status).toBe('closed');

      const stored = await Inquiry.findById(inquiryOne._id);
      expect(stored.status).toBe('closed');
    });

    it('should return 400 when status is missing', async () => {
      const res = await request(app)
        .patch(`/api/inquiries/${inquiryOne._id}/status`)
        .set('Cookie', cookie(agentACookie))
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when status is not a valid management transition', async () => {
      const res = await request(app)
        .patch(`/api/inquiries/${inquiryOne._id}/status`)
        .set('Cookie', cookie(agentACookie))
        .send({ status: 'pending' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');

      const stored = await Inquiry.findById(inquiryOne._id);
      expect(stored.status).toBe('pending');
    });
  });
});
