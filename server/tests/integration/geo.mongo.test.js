/**
 * S11 — Geospatial accuracy suite on real MongoDB (ADR-031).
 *
 * Verifies the $geoWithin operators actually served by the shipped
 * { location: '2dsphere' } index: radius inclusion/exclusion at km
 * distances, bounding-box accuracy, geo+scalar conjunctions, sort and
 * pagination integrity alongside geo predicates, and index utilization
 * via explain() (IXSCAN on the 2dsphere, never COLLSCAN).
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../../src/models/User.js';
import Property from '../../src/models/Property.js';
import propertyService from '../../src/services/property.service.js';
import { buildPropertyFilter } from '../../src/lib/propertyFilters.js';

let mongo;

// Bengaluru centroid reference used by the fixtures.
const CENTRE = { lat: 12.9716, lng: 77.5946 };
const BASE = {
  title: 'Geo home',
  description: 'A suitable test home for geospatial search tests.',
  price: 100,
  propertyType: 'house',
  listingType: 'sale',
  address: { street: '1', city: 'Bengaluru', state: 'K', zipCode: '1', country: 'India' },
};

// ~1.113 km per 0.01 latitude degrees; longitude factor cos(lat) ≈ 0.9746 here.

const propertyAt = (agent, dLat, dLng, overrides = {}) => ({
  ...BASE,
  ...overrides,
  location: { type: 'Point', coordinates: [CENTRE.lng + dLng, CENTRE.lat + dLat] },
  agent,
});

const runFilter = async (query, sort = { createdAt: -1, _id: -1 }, page = 1, limit = 50) => {
  const filter = buildPropertyFilter(query);
  return propertyService.getProperties(filter, sort, page, limit);
};

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
  await Property.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Property.deleteMany({});
});

describe('S11 geo queries on real MongoDB', () => {
  let agent;

  beforeEach(async () => {
    agent = await User.create({ name: 'Agent', email: 'a@test.local', passwordHash: 'x', role: 'agent' });
    // ~0.5 km north, ~5.5 km north, ~22 km east, far away (Delhi)
    await Property.create(propertyAt(agent._id, 0.005, 0, { title: 'NearN' }));
    await Property.create(propertyAt(agent._id, 0.05, 0, { title: 'MidN' }));
    await Property.create(propertyAt(agent._id, 0, 0.2, { title: 'FarE' }));
    await Property.create({ ...BASE, title: 'DelhiD', agent: agent._id, location: { type: 'Point', coordinates: [77.2090, 28.6139] } });
  });

  it('radius 5 km includes ~0.5 km, excludes ~5.5 km', async () => {
    const result = await runFilter({ lat: CENTRE.lat, lng: CENTRE.lng, radiusKm: 5 });
    const titles = result.properties.map((p) => p.title).sort();
    expect(titles).toEqual(['NearN']);
  });

  it('radius 10 km includes the ~5.5 km listing but not ~22 km or Delhi', async () => {
    const result = await runFilter({ lat: CENTRE.lat, lng: CENTRE.lng, radiusKm: 10 });
    const titles = result.properties.map((p) => p.title).sort();
    expect(titles).toEqual(['MidN', 'NearN']);
  });

  it('bounding box (URL lat-first order) selects the viewport members only', async () => {
    // Box around Bengaluru cluster only: lat [12.9, 13.1], lng [77.5, 77.85] → NearN, MidN, FarE
    const result = await runFilter({ bounds: '12.9,77.5,13.1,77.85' });
    const titles = result.properties.map((p) => p.title).sort();
    expect(titles).toEqual(['FarE', 'MidN', 'NearN']);
  });

  it('radius AND bounds intersect (both must contain the point)', async () => {
    // Radius 30 km covers FarE; box excludes it → intersection drops FarE.
    const result = await runFilter({
      lat: CENTRE.lat, lng: CENTRE.lng, radiusKm: 30,
      bounds: '12.9,77.5,13.1,77.7',
    });
    const titles = result.properties.map((p) => p.title).sort();
    expect(titles).toEqual(['MidN', 'NearN']);
  });

  it('composes geo with price, bedrooms and $text without drift', async () => {
    await Property.create(propertyAt(agent._id, 0.005, 0, { title: 'Villa near', price: 900, bedrooms: 4 }));
    const geoPlusPrice = await runFilter({ lat: CENTRE.lat, lng: CENTRE.lng, radiusKm: 5, maxPrice: 500 });
    expect(geoPlusPrice.properties.map((p) => p.title)).toEqual(['NearN']);

    const geoPlusText = await runFilter({ lat: CENTRE.lat, lng: CENTRE.lng, radiusKm: 5, search: 'villa' });
    expect(geoPlusText.properties.map((p) => p.title)).toEqual(['Villa near']);

    const geoPlusBeds = await runFilter({ lat: CENTRE.lat, lng: CENTRE.lng, radiusKm: 5, bedrooms: 4 });
    expect(geoPlusBeds.properties.map((p) => p.title)).toEqual(['Villa near']);
  });

  it('geo + price_asc sort and pagination remain deterministic', async () => {
    await Property.create(propertyAt(agent._id, 0.005, 0.001, { title: 'CheapNear', price: 10 }));
    const result = await propertyService.getProperties(
      buildPropertyFilter({ lat: CENTRE.lat, lng: CENTRE.lng, radiusKm: 2 }),
      { price: 1, _id: 1 },
      1,
      10,
    );
    expect(result.properties.map((p) => p.price)).toEqual([10, 100]);
    expect(result.pagination.total).toBe(2);
  });

  it('2dsphere index serves BOTH radius and bounds queries (IXSCAN, no COLLSCAN)', async () => {
    // ADR-031 amendment: bounds now emits a closed GeoJSON Polygon
    // ($geometry), which — unlike legacy $box — is index-accelerated.
    const centerSphere = Property.find(
      buildPropertyFilter({ lat: CENTRE.lat, lng: CENTRE.lng, radiusKm: 10 }),
    ).explain();
    const box = Property.find(buildPropertyFilter({ bounds: '12.9,77.5,13.1,77.7' })).explain();
    const csExplain = await centerSphere;
    const boxExplain = await box;

    const winning = (expl) => JSON.stringify(
      (expl.queryPlanner || {}).winningPlan || (expl.queryPlanner || {}),
    );
    for (const plan of [winning(csExplain), winning(boxExplain)]) {
      expect(plan).toContain('2dsphere');
      expect(plan).toContain('IXSCAN');
      expect(plan).not.toContain('COLLSCAN');
    }

    // Bounds accuracy spot-check at the amended operator shape.
    const boxResult = await runFilter({ bounds: '12.9,77.5,13.1,77.85' });
    expect(boxResult.properties.map((p) => p.title).sort())
      .toEqual(['FarE', 'MidN', 'NearN']);
  });

  it('saved geo criteria execute identically through the same builder', async () => {
    // Mirrors savedSearch.run / matching sweep: criteria typed fields → builder.
    const criteria = { lat: CENTRE.lat, lng: CENTRE.lng, radiusKm: 5 };
    const result = await runFilter(criteria);
    expect(result.properties.map((p) => p.title)).toEqual(['NearN']);
  });
});
