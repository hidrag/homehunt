/**
 * S12 — Neighborhood service on real MongoDB (ADR-033/ADR-034).
 *
 * Verifies the shipped single-query spatial model end-to-end at the service
 * layer: $geoWithin $centerSphere radius inclusion/exclusion, IXSCAN index
 * utilization on the pois 2dsphere, honest Haversine distances, per-category
 * ordering + top-10 caps, the zero-POI (rural) null-score contract, category
 * whitelist filtering, and the strict radius validation matrix. HTTP
 * envelopes live in neighborhood.api.test.js.
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../../src/models/User.js';
import Property from '../../src/models/Property.js';
import Poi from '../../src/models/Poi.js';
import {
  getNeighborhood,
  parseRadiusKm,
  parseCategories,
  DEFAULT_RADIUS_KM,
  TOP_N_PER_CATEGORY,
} from '../../src/services/neighborhood.service.js';

let mongo;

// Bengaluru centroid (same reference as the S11 geo suite).
const CENTRE = { lat: 12.9716, lng: 77.5946 };

const AGENT_ID = new mongoose.Types.ObjectId('64b000000000000000000001');

const makeProperty = async (overrides = {}) =>
  Property.create({
    title: 'Neighborhood home',
    description: 'A suitable test home for neighborhood context tests.',
    price: 100,
    propertyType: 'house',
    listingType: 'sale',
    location: { type: 'Point', coordinates: [CENTRE.lng, CENTRE.lat] },
    address: { street: '1', city: 'Bengaluru', state: 'K', zipCode: '1', country: 'India' },
    agent: AGENT_ID,
    ...overrides,
  });

const poiAt = (category, dLat, dLng, name) => ({
  name: name || `${category} spot`,
  category,
  location: { type: 'Point', coordinates: [CENTRE.lng + dLng, CENTRE.lat + dLat] },
});

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
  await Property.init();
  await Poi.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Property.deleteMany({});
  await Poi.deleteMany({});
});

describe('neighborhood.service.getNeighborhood on real MongoDB', () => {
  it('includes POIs within the radius and excludes those beyond it', async () => {
    const property = await makeProperty();
    // ~0.55 km north, ~2.2 km north, ~5.5 km north
    await Poi.insertMany([
      poiAt('park', 0.005, 0, 'Near Park'),
      poiAt('grocery', 0.02, 0, 'Mid Grocery'),
      poiAt('transit', 0.05, 0, 'Far Transit'),
    ]);

    const result = await getNeighborhood(String(property._id), { radiusKm: 3 });
    const names = [
      ...result.categories.park.map((p) => p.name),
      ...result.categories.grocery.map((p) => p.name),
      ...result.categories.transit.map((p) => p.name),
    ];
    expect(names.sort()).toEqual(['Mid Grocery', 'Near Park']);
    expect(result.dataAvailable).toBe(true);
  });

  it('reports Haversine distance metres and ceil walk minutes per POI', async () => {
    const property = await makeProperty();
    await Poi.create(poiAt('park', 0.005, 0, 'Near Park')); // ~556 m due north

    const result = await getNeighborhood(String(property._id), {});
    const park = result.categories.park[0];
    expect(park.distanceMeter).toBeGreaterThan(500);
    expect(park.distanceMeter).toBeLessThan(600);
    expect(park.walkMinutes).toBe(Math.ceil(park.distanceMeter / 80));
    expect(park.location.type).toBe('Point');
  });

  it('defaults to a 3 km radius when radiusKm is absent', async () => {
    const property = await makeProperty();
    await Poi.insertMany([poiAt('grocery', 0.02, 0, 'Mid Grocery')]); // ~2.2 km
    const result = await getNeighborhood(String(property._id), {});
    expect(result.radiusKm).toBe(DEFAULT_RADIUS_KM);
    expect(result.categories.grocery).toHaveLength(1);
  });

  it('groups by category, sorted by distance ASC, capped at 10 per category', async () => {
    const property = await makeProperty();
    const twelve = Array.from({ length: 12 }, (_, i) =>
      poiAt('transit', 0.001 * (i + 1), 0, `T${String(i).padStart(2, '0')}`),
    );
    await Poi.insertMany(twelve); // ~111 m .. ~1.33 km north, all inside 3 km

    const result = await getNeighborhood(String(property._id), {});
    expect(result.categories.transit).toHaveLength(TOP_N_PER_CATEGORY);
    const distances = result.categories.transit.map((p) => p.distanceMeter);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    expect(result.categories.transit[0].name).toBe('T00');
    expect(result.categories.transit[9].name).toBe('T09');
  });

  it('returns dataAvailable:false with null score and empty arrays when no POIs are in range', async () => {
    // Rural fixture: standalone property, all POIs ~770 km away.
    const property = await makeProperty({
      title: 'Goan retreat',
      location: { type: 'Point', coordinates: [73.7842, 15.5908] },
    });
    await Poi.insertMany([
      poiAt('park', 0, 0, 'Bengaluru Park'),
      poiAt('transit', 0.05, 0, 'Bengaluru Metro'),
    ]);

    const result = await getNeighborhood(String(property._id), { radiusKm: 10 });
    expect(result.dataAvailable).toBe(false);
    expect(result.walkScore).toBeNull();
    for (const category of ['transit', 'school', 'grocery', 'healthcare', 'park']) {
      expect(result.categories[category]).toEqual([]);
    }
  });

  it('computes the deterministic walk score with published weights and breakdown', async () => {
    const property = await makeProperty();
    // 5 transit + 5 school POIs all under 400 m -> those categories saturate.
    const dense = [
      ...Array.from({ length: 5 }, (_, i) => poiAt('transit', -(0.001 + i * 0.0005), 0)),
      ...Array.from({ length: 5 }, (_, i) => poiAt('school', 0.001 + i * 0.0005, 0)),
    ];
    await Poi.insertMany(dense);

    const result = await getNeighborhood(String(property._id), {});
    expect(result.walkScore.total).toBe(50); // 0.30*100 + 0.20*100
    expect(result.walkScore.categories.transit).toBe(1);
    expect(result.walkScore.categories.school).toBe(1);
    expect(result.walkScore.categories.park).toBe(0);
    expect(result.walkScore.weights.transit).toBe(0.3);
  });

  it('filters to whitelisted categories while scoring ALL in-range POIs', async () => {
    const property = await makeProperty();
    await Poi.insertMany([
      poiAt('transit', 0.003, 0, 'Metro'),
      poiAt('park', 0.004, 0, 'Garden'),
    ]);

    const result = await getNeighborhood(String(property._id), { category: ['park'] });
    expect(Object.keys(result.categories)).toEqual(['park']);
    expect(result.categories.park[0].name).toBe('Garden');
    // Score still sees the transit POI (score describes the area, not the filter).
    expect(result.walkScore.categories.transit).toBeGreaterThan(0);
  });

  it('ignores unknown or object-shaped category values entirely (whitelist posture)', async () => {
    const property = await makeProperty();
    await Poi.create(poiAt('park', 0.003, 0, 'Garden'));

    const result = await getNeighborhood(String(property._id), {
      category: ['volcano', { where: 'sleep(5000)' }],
    });
    expect(Object.keys(result.categories).sort()).toEqual(
      ['grocery', 'healthcare', 'park', 'school', 'transit'].sort(),
    );
    expect(result.categories.park).toHaveLength(1);
  });

  it('rejects malformed radius values with 400 GEO_INVALID before any query', async () => {
    const property = await makeProperty();
    const bad = ['0', '-5', '10.001', 'abc', 'NaN', Infinity, { gt: 0 }, [1]];
    for (const value of bad) {
      await expect(
        getNeighborhood(String(property._id), { radiusKm: value }),
      ).rejects.toMatchObject({ status: 400, code: 'GEO_INVALID' });
    }
  });

  it('rejects malformed property ids with 400 INVALID_ID and unknown ids with 404', async () => {
    await expect(getNeighborhood('not-an-objectid', {})).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_ID',
    });
    await expect(
      getNeighborhood(new mongoose.Types.ObjectId().toString(), {}),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('serves the POI sweep through the 2dsphere index (IXSCAN, never COLLSCAN)', async () => {
    await makeProperty();
    await Poi.create(poiAt('park', 0.005, 0));

    // The exact operator shape the service runs (radius 3 km):
    const expl = await Poi.find({
      location: { $geoWithin: { $centerSphere: [[CENTRE.lng, CENTRE.lat], 3 / 6378.1] } },
    }).explain();
    const winning = JSON.stringify(
      (expl.queryPlanner || {}).winningPlan || expl.queryPlanner || {},
    );
    expect(winning).toContain('2dsphere');
    expect(winning).toContain('IXSCAN');
    expect(winning).not.toContain('COLLSCAN');
  });

  it('param helpers honour the locked contract', () => {
    expect(parseRadiusKm(undefined)).toBe(3);
    expect(parseRadiusKm('5')).toBe(5);
    expect(() => parseRadiusKm('11')).toThrow();
    expect(parseCategories('park')).toEqual(['park']);
    expect(parseCategories(['park', 'park', 'bogus'])).toEqual(['park']);
    expect(parseCategories('bogus')).toBeNull();
    expect(parseCategories(undefined)).toBeNull();
  });
});
