import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../../src/models/User.js';
import Property from '../../src/models/Property.js';
import Inquiry from '../../src/models/Inquiry.js';
import * as inquiryService from '../../src/services/inquiry.service.js';

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
  await Inquiry.init();
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
  await Inquiry.deleteMany({});
});

describe('Inquiry MongoDB Tests', () => {
  let userA, userB, agentUser, property;

  beforeEach(async () => {
    userA = await User.create({
      name: 'Buyer User A',
      email: 'a@example.com',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
      role: 'buyer',
    });
    userB = await User.create({
      name: 'Buyer User B',
      email: 'b@example.com',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
      role: 'buyer',
    });
    agentUser = await User.create({
      name: 'Agent User',
      email: 'agent@example.com',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
      role: 'agent',
    });

    property = await Property.create(createTestProperty(agentUser._id));
  });

  const validInquiryInput = {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '1234567890',
    message: 'Hello world! This is a test inquiry message.',
  };

  it('proves buyer field equals authenticated caller ID and agent is derived from property.agent', async () => {
    const inquiry = await inquiryService.createInquiry(userA._id.toString(), {
      propertyId: property._id.toString(),
      ...validInquiryInput,
    });

    expect(inquiry.buyer.toString()).toBe(userA._id.toString());
    expect(inquiry.agent.toString()).toBe(agentUser._id.toString());
    expect(inquiry.property.toString()).toBe(property._id.toString());
  });

  it('proves contact snapshot (name, email, phone, message) is persisted correctly', async () => {
    const inquiry = await inquiryService.createInquiry(userA._id.toString(), {
      propertyId: property._id.toString(),
      ...validInquiryInput,
    });

    expect(inquiry.name).toBe(validInquiryInput.name);
    expect(inquiry.email).toBe(validInquiryInput.email);
    expect(inquiry.phone).toBe(validInquiryInput.phone);
    expect(inquiry.message).toBe(validInquiryInput.message);
  });

  it('proves status defaults to pending', async () => {
    const inquiry = await inquiryService.createInquiry(userA._id.toString(), {
      propertyId: property._id.toString(),
      ...validInquiryInput,
    });

    expect(inquiry.status).toBe('pending');
  });

  it('proves cross-user isolation: user A inquiries are not returned for user B', async () => {
    await inquiryService.createInquiry(userA._id.toString(), {
      propertyId: property._id.toString(),
      ...validInquiryInput,
    });

    const userBResult = await inquiryService.listForBuyer(userB._id.toString(), 1, 10);
    expect(userBResult.inquiries.length).toBe(0);
    expect(userBResult.pagination.total).toBe(0);

    const userAResult = await inquiryService.listForBuyer(userA._id.toString(), 1, 10);
    expect(userAResult.inquiries.length).toBe(1);
    expect(userAResult.pagination.total).toBe(1);
  });

  it('proves deterministic ordering: newest first (createdAt DESC, _id DESC)', async () => {
    const i1 = await inquiryService.createInquiry(userA._id.toString(), {
      propertyId: property._id.toString(),
      ...validInquiryInput,
      message: 'First inquiry message here',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const i2 = await inquiryService.createInquiry(userA._id.toString(), {
      propertyId: property._id.toString(),
      ...validInquiryInput,
      message: 'Second inquiry message here',
    });

    const result = await inquiryService.listForBuyer(userA._id.toString(), 1, 10);
    expect(result.inquiries.length).toBe(2);
    expect(result.inquiries[0]._id.toString()).toBe(i2._id.toString());
    expect(result.inquiries[1]._id.toString()).toBe(i1._id.toString());
  });

  it('proves pagination works correctly for buyer inquiry listing', async () => {
    for (let i = 0; i < 3; i++) {
      await inquiryService.createInquiry(userA._id.toString(), {
        propertyId: property._id.toString(),
        ...validInquiryInput,
        message: `Inquiry message ${i} is long enough`,
      });
    }

    const page1 = await inquiryService.listForBuyer(userA._id.toString(), 1, 2);
    expect(page1.inquiries.length).toBe(2);
    expect(page1.pagination.total).toBe(3);
    expect(page1.pagination.pages).toBe(2);
    expect(page1.pagination.page).toBe(1);

    const page2 = await inquiryService.listForBuyer(userA._id.toString(), 2, 2);
    expect(page2.inquiries.length).toBe(1);
    expect(page2.pagination.page).toBe(2);
  });

  it('proves multiple inquiries for the same property are allowed (no unique constraint)', async () => {
    const first = await inquiryService.createInquiry(userA._id.toString(), {
      propertyId: property._id.toString(),
      ...validInquiryInput,
      message: 'First inquiry for this property',
    });
    const second = await inquiryService.createInquiry(userA._id.toString(), {
      propertyId: property._id.toString(),
      ...validInquiryInput,
      message: 'Second inquiry for this property',
    });

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first._id.toString()).not.toBe(second._id.toString());

    const total = await Inquiry.countDocuments({ buyer: userA._id, property: property._id });
    expect(total).toBe(2);
  });

  it('proves indexes exist (buyer+createdAt, agent+createdAt, property)', async () => {
    const indexes = await Inquiry.collection.indexes();

    const hasBuyerIndex = indexes.some((idx) => idx.key && idx.key.buyer === 1 && idx.key.createdAt === -1);
    const hasAgentIndex = indexes.some((idx) => idx.key && idx.key.agent === 1 && idx.key.createdAt === -1);
    const hasPropertyIndex = indexes.some((idx) => idx.key && idx.key.property === 1);

    expect(hasBuyerIndex).toBe(true);
    expect(hasAgentIndex).toBe(true);
    expect(hasPropertyIndex).toBe(true);
  });

  it('proves missing/invalid property agent fails cleanly and does NOT persist a broken record', async () => {
    // Property with no agent assigned
    const propertyWithoutAgent = await Property.collection.insertOne({
      title: 'No Agent Property',
      description: 'Property with missing agent reference',
      price: 1000000,
      propertyType: 'apartment',
      listingType: 'sale',
      location: { type: 'Point', coordinates: [77.5, 12.9] },
      address: { street: '1', city: 'B', state: 'K', zipCode: '5', country: 'India' },
      // agent omitted intentionally at MongoDB driver level
    });

    await expect(
      inquiryService.createInquiry(userA._id.toString(), {
        propertyId: propertyWithoutAgent.insertedId.toString(),
        ...validInquiryInput,
      })
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });

    const count = await Inquiry.countDocuments();
    expect(count).toBe(0);
  });

  it('proves failed inquiry on non-existent property does not persist a broken record', async () => {
    const fakePropertyId = new mongoose.Types.ObjectId().toString();

    await expect(
      inquiryService.createInquiry(userA._id.toString(), {
        propertyId: fakePropertyId,
        ...validInquiryInput,
      })
    ).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });

    const count = await Inquiry.countDocuments();
    expect(count).toBe(0);
  });
});
