/**
 * S12 — Neighborhood HTTP contract suite (own app instance, rate-budgeted).
 *
 * GET /api/properties/:id/neighborhood: public unauthenticated success,
 * INVALID_ID / NOT_FOUND / GEO_INVALID envelopes, category pass-through, and
 * envelope shape. Service semantics live in neighborhood.mongo.test.js.
 * Request budget: ~14 calls, well under the 100-per-instance cap.
 */
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../../src/app.js';
import Property from '../../src/models/Property.js';
import Poi from '../../src/models/Poi.js';

let mongo;

const CENTRE = { lng: 77.5946, lat: 12.9716 };
const AGENT_ID = new mongoose.Types.ObjectId('64b000000000000000000001');

let propertyId;

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-minimum-32-chars-long-12345';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-chars-long-123456';
  process.env.NODE_ENV = 'test';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Property.init();
  await Poi.init();

  const property = await Property.create({
    title: 'Contract home',
    description: 'A suitable test home for the neighborhood HTTP contract.',
    price: 100,
    propertyType: 'house',
    listingType: 'sale',
    location: { type: 'Point', coordinates: [CENTRE.lng, CENTRE.lat] },
    address: { street: '1', city: 'Bengaluru', state: 'K', zipCode: '1', country: 'India' },
    agent: AGENT_ID,
  });
  propertyId = String(property._id);

  await Poi.insertMany([
    {
      name: 'Contract Metro',
      category: 'transit',
      location: { type: 'Point', coordinates: [CENTRE.lng, CENTRE.lat + 0.003] },
    },
    {
      name: 'Contract Garden',
      category: 'park',
      location: { type: 'Point', coordinates: [CENTRE.lng, CENTRE.lat + 0.004] },
    },
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const url = (qs) => `/api/properties/${propertyId}/neighborhood${qs}`;

describe('GET /api/properties/:id/neighborhood', () => {
  it('serves anonymous callers the full envelope (public read)', async () => {
    const response = await request(app).get(url(''));
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    const n = response.body.data.neighborhood;
    expect(n.property).toBe(propertyId);
    expect(n.radiusKm).toBe(3);
    expect(n.dataAvailable).toBe(true);
    expect(n.walkScore.total).toBeGreaterThan(0);
    expect(n.categories.transit[0].name).toBe('Contract Metro');
    expect(n.categories.transit[0].distanceMeter).toBeGreaterThan(200);
    expect(n.categories.transit[0].walkMinutes).toBeGreaterThan(0);
    expect(n.categories.park).toHaveLength(1);
  });

  it('honours radiusKm on the wire', async () => {
    const response = await request(app).get(url('?radiusKm=1'));
    expect(response.status).toBe(200);
    expect(response.body.data.neighborhood.radiusKm).toBe(1);
  });

  it('honours the category filter on the wire', async () => {
    const response = await request(app).get(url('?category=park'));
    expect(response.status).toBe(200);
    const cats = response.body.data.neighborhood.categories;
    expect(Object.keys(cats)).toEqual(['park']);
  });

  it('returns 400 GEO_INVALID for out-of-range and malformed radii', async () => {
    for (const qs of ['?radiusKm=11', '?radiusKm=0', '?radiusKm=abc']) {
      const response = await request(app).get(url(qs));
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('GEO_INVALID');
    }
  });

  it('returns 400 INVALID_ID for a malformed property id', async () => {
    const response = await request(app).get('/api/properties/not-an-id/neighborhood');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_ID');
  });

  it('returns 404 NOT_FOUND for an unknown property', async () => {
    const response = await request(app).get(
      `/api/properties/${new mongoose.Types.ObjectId()}/neighborhood`,
    );
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('does not shadow the plain property detail route', async () => {
    const response = await request(app).get(`/api/properties/${propertyId}`);
    expect(response.status).toBe(200);
    expect(response.body.data.property.title).toBe('Contract home');
  });
});
