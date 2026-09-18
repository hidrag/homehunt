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

describe('Inquiry API Integration Tests', () => {
  let user;
  let userAccessCookie;
  let userId;
  let agent;
  let agentId;
  let property;
  let propertyId;

  beforeEach(async () => {
    user = await createUser({ name: 'Buyer User', email: 'buyer@example.com', role: 'buyer' });
    userAccessCookie = createAccessToken(user);
    userId = user._id.toString();

    agent = await createUser({ name: 'Agent User', email: 'agent@example.com', role: 'agent' });
    agentId = agent._id.toString();

    property = await Property.create(createTestProperty(agent._id));
    propertyId = property._id.toString();
  });

  describe('Authentication', () => {
    it('should return 401 for POST /api/inquiries without auth', async () => {
      const res = await request(app).post('/api/inquiries').send({});
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for GET /api/inquiries without auth', async () => {
      const res = await request(app).get('/api/inquiries');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/inquiries', () => {
    const validInquiry = {
      propertyId: null,
      name: 'John Doe',
      email: 'john@example.com',
      phone: '1234567890',
      message: 'I am interested in this property. Please contact me.',
    };

    beforeEach(() => {
      validInquiry.propertyId = propertyId;
    });

    it('should return 400 VALIDATION_ERROR if message is missing', async () => {
      const payload = { ...validInquiry };
      delete payload.message;
      const res = await request(app)
        .post('/api/inquiries')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`])
        .send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 VALIDATION_ERROR if message is too short', async () => {
      const payload = { ...validInquiry, message: 'Short' };
      const res = await request(app)
        .post('/api/inquiries')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`])
        .send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 VALIDATION_ERROR if message is too long', async () => {
      const payload = { ...validInquiry, message: 'A'.repeat(2001) };
      const res = await request(app)
        .post('/api/inquiries')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`])
        .send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 VALIDATION_ERROR if email is invalid', async () => {
      const payload = { ...validInquiry, email: 'not-an-email' };
      const res = await request(app)
        .post('/api/inquiries')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`])
        .send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 if required fields are missing', async () => {
      const res = await request(app)
        .post('/api/inquiries')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`])
        .send({ message: validInquiry.message });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 INVALID_ID if propertyId is malformed', async () => {
      const payload = { ...validInquiry, propertyId: 'invalid-id' };
      const res = await request(app)
        .post('/api/inquiries')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`])
        .send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ID');
    });

    it('should return 404 NOT_FOUND if property does not exist', async () => {
      const payload = { ...validInquiry, propertyId: new mongoose.Types.ObjectId().toString() };
      const res = await request(app)
        .post('/api/inquiries')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`])
        .send(payload);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should create an inquiry successfully with 201', async () => {
      const res = await request(app)
        .post('/api/inquiries')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`])
        .send(validInquiry);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.inquiry).toBeDefined();
    });

    it('should force buyer field to req.user.id, ignoring body', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const payload = { ...validInquiry, buyer: fakeId, user: fakeId };
      const res = await request(app)
        .post('/api/inquiries')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`])
        .send(payload);
      expect(res.body.data.inquiry.buyer.toString()).toBe(userId);
    });

    it('should derive agent field from property.agent, ignoring body', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const payload = { ...validInquiry, agent: fakeId };
      const res = await request(app)
        .post('/api/inquiries')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`])
        .send(payload);
      expect(res.body.data.inquiry.agent.toString()).toBe(agentId);
    });

    it('should always set status to pending', async () => {
      const payload = { ...validInquiry, status: 'responded' };
      const res = await request(app)
        .post('/api/inquiries')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`])
        .send(payload);
      expect(res.body.data.inquiry.status).toBe('pending');
    });
  });

  describe('GET /api/inquiries', () => {
    beforeEach(async () => {
      for (let i = 0; i < 3; i++) {
        await Inquiry.create({
          property: propertyId,
          buyer: userId,
          agent: agentId,
          name: 'John Doe',
          email: 'john@example.com',
          message: `Message ${i} at least ten chars`,
        });
      }
    });

    it('should use pagination defaults and clamps', async () => {
      const res = await request(app)
        .get('/api/inquiries?page=0&limit=100')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userAccessCookie}`]);
      expect(res.status).toBe(200);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(50);
      expect(res.body.data.inquiries.length).toBe(3);
    });

    it('should scope inquiries to the own-user', async () => {
      const userB = await createUser({ name: 'Buyer Two', email: 'userb@example.com', role: 'buyer' });
      const userBAccessCookie = createAccessToken(userB);

      const res = await request(app)
        .get('/api/inquiries')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${userBAccessCookie}`]);

      expect(res.status).toBe(200);
      expect(res.body.data.inquiries.length).toBe(0);
      expect(res.body.data.pagination.total).toBe(0);
    });
  });
});
