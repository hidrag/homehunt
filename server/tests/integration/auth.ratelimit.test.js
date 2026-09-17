import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app.js';
import User from '../../src/models/User.js';

describe('Auth Rate Limiter Integration Test', () => {
  let mongoServer;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test_access_secret_super_secure_32_characters_long';
    process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_super_secure_32_characters_long';
    process.env.NODE_ENV = 'test';
    process.env.ENABLE_AUTH_RATE_LIMIT = 'true';

    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    delete process.env.ENABLE_AUTH_RATE_LIMIT;
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('allows 10 requests and rejects the 11th with 429 RATE_LIMITED', async () => {
    // Make 10 requests to rate-limited /api/auth/login
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/api/auth/login').send({
        email: `rate${i}@example.com`,
        password: 'Password123!',
      });
      // Requests should be processed (401 because user does not exist, but NOT 429)
      expect(res.status).not.toBe(429);
    }

    // 11th request should be rate-limited
    const rateLimitedRes = await request(app).post('/api/auth/login').send({
      email: 'rate11@example.com',
      password: 'Password123!',
    });

    expect(rateLimitedRes.status).toBe(429);
    expect(rateLimitedRes.body.success).toBe(false);
    expect(rateLimitedRes.body.error.code).toBe('RATE_LIMITED');
  });
});
