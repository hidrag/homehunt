/**
 * S14 (ADR-038) — comparison endpoint HTTP suite (own app instance,
 * rate-budgeted: ~10 calls, well under the 100-per-instance cap).
 */
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../../src/app.js';
import Property from '../../src/models/Property.js';

let mongo;

const agentId = new mongoose.Types.ObjectId();
const ids = [];

const row = (n, extra = {}) => ({
  title: `Compare home ${n}`,
  description: 'A suitable test home for the S14 comparison HTTP suite.',
  price: 100 * n,
  propertyType: 'house',
  listingType: 'sale',
  location: { type: 'Point', coordinates: [77, 12] },
  address: { street: '1', city: 'Bengaluru', state: 'K', zipCode: '1', country: 'India' },
  agent: agentId,
  status: 'available',
  images: [`https://cdn.example/${n}.jpg`],
  ...extra,
});

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-minimum-32-chars-long-12345';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-chars-long-123456';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Property.init();
  const docs = await Property.insertMany([
    row(1, { bedrooms: 2, bathrooms: 1, area: 800, price: 8000000 }),
    row(2, { bedrooms: 3, bathrooms: 2, area: 1200, price: 15000000 }),
    row(3, { status: 'sold', price: 30000000 }),
  ]);
  ids.push(...docs.map((d) => String(d._id)));
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe('GET /api/properties/compare', () => {
  it('serves anonymous callers the matrix with derived pricePerSqft', async () => {
    const res = await request(app).get(`/api/properties/compare?ids=${ids.slice(0, 2).join(',')}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { properties, missing } = res.body.data;
    expect(properties).toHaveLength(2);
    expect(missing).toEqual([]);
    // Request order preserved.
    expect(String(properties[0]._id)).toBe(ids[0]);
    expect(properties[0].images).toEqual(['https://cdn.example/1.jpg']); // publicized strings
    expect(properties[0].pricePerSqft).toBe(10000); // 8,000,000 / 800
    expect(properties[0].bedrooms).toBe(2);
  });

  it('returns found + missing for unknown ids (partial results by design)', async () => {
    const ghost = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/properties/compare?ids=${ids[0]},${ghost}`);
    expect(res.status).toBe(200);
    expect(res.body.data.properties).toHaveLength(1);
    expect(res.body.data.missing).toEqual([String(ghost)]);
  });

  it('includes sold listings (mixed statuses allowed — browse semantics)', async () => {
    const res = await request(app).get(`/api/properties/compare?ids=${ids[2]}`);
    expect(res.status).toBe(200);
    expect(res.body.data.properties[0].status).toBe('sold');
  });

  it('rejects 400 VALIDATION_ERROR: missing, empty, malformed, >4', async () => {
    const tooMany = `${ids.join(',')},${ids[0]},${ids[1]}`;
    for (const qs of ['', '?ids=', '?ids=nope', `?ids=${tooMany}`]) {
      const res = await request(app).get(`/api/properties/compare${qs}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('dedupes repeated ids before querying', async () => {
    const res = await request(app).get(`/api/properties/compare?ids=${ids[0]},${ids[0]}`);
    expect(res.status).toBe(200);
    expect(res.body.data.properties).toHaveLength(1);
  });

  it('does not shadow /:id or /:id/neighborhood (route ordering)', async () => {
    const detail = await request(app).get(`/api/properties/${ids[0]}`);
    expect(detail.status).toBe(200);
    const hood = await request(app).get(`/api/properties/${ids[0]}/neighborhood`);
    expect(hood.status).toBe(200);
  });
});

describe('GET /api/analytics/market', () => {
  it('serves public city aggregates (no auth)', async () => {
    const res = await request(app).get('/api/analytics/market?city=Bengaluru');
    expect(res.status).toBe(200);
    // Only 2 of 3 fixtures are available in Bengaluru -> below the floor.
    expect(res.body.data.analytics.dataAvailable).toBe(false);
    expect(res.body.data.analytics.minSample).toBe(3);
  });

  it('rejects a missing city with 400', async () => {
    const res = await request(app).get('/api/analytics/market');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
