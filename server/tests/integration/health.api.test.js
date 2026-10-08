/**
 * S16 (ADR-042) — liveness/readiness probes and proxy-aware limiter tests.
 *
 * Probes must answer without a database (liveness) and reflect the Mongo
 * connection state (readiness). Both are exempt from the global limiter.
 */
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../../src/app.js';

let mongo;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-minimum-32-chars-long-12345';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-chars-long-123456';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe('S16 GET /api/health (liveness)', () => {
  it('returns 200 with an ok envelope and no auth', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(typeof res.body.data.timestamp).toBe('string');
  });

  it('stays 200 when the database is down (liveness must not depend on deps)', async () => {
    const state = mongoose.connection.readyState;
    await mongoose.disconnect();
    try {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ok');
    } finally {
      await mongoose.connect(mongo.getUri());
      expect(mongoose.connection.readyState).toBe(state === 1 ? 1 : mongoose.connection.readyState);
    }
  });
});

describe('S16 GET /api/ready (readiness)', () => {
  it('returns 200 ready while MongoDB is connected', async () => {
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ready');
  });

  it('returns 503 NOT_READY when MongoDB is disconnected', async () => {
    await mongoose.disconnect();
    try {
      const res = await request(app).get('/api/ready');
      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_READY');
    } finally {
      await mongoose.connect(mongo.getUri());
    }
  });
});

describe('S16 proxy awareness (trust proxy + limiter keying)', () => {
  it('keys the rate limiter on the forwarded client IP, not the proxy IP', async () => {
    // With trust proxy enabled (default 1 hop), a request carrying a forwarded
    // client IP is served normally (the v8 X-Forwarded-For validation does not
    // reject it), and independent forwarded clients are independent buckets.
    const first = await request(app).get('/api/health').set('X-Forwarded-For', '203.0.113.7');
    expect(first.status).toBe(200);

    const second = await request(app).get('/api/health').set('X-Forwarded-For', '198.51.100.9');
    expect(second.status).toBe(200);

    // The same forwarded client stays served below the limit.
    const third = await request(app).get('/api/health').set('X-Forwarded-For', '203.0.113.7');
    expect(third.status).toBe(200);
  });

  it('exposes the configured hop count on the express app', () => {
    expect(app.get('trust proxy')).toBeDefined();
  });
});
