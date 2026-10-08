/**
 * S14 (ADR-037) — market analytics integration suite (real Mongo).
 *
 * Aggregation accuracy against hand-computed fixtures, min-sample floor,
 * case-insensitive exact city matching, listingType slicing, and the
 * revision-counter cache invalidation.
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Property from '../../src/models/Property.js';
import {
  getMarketAnalytics,
  parseMarketQuery,
  computeMarketStats,
  MIN_SAMPLE,
  __resetAnalyticsCache,
} from '../../src/services/analytics.service.js';
import propertyService from '../../src/services/property.service.js';

let mongo;

const agentId = new mongoose.Types.ObjectId();

const row = (city, price, extra = {}) => ({
  title: `Analytics home ${price}`,
  description: 'A suitable test home for the S14 analytics aggregation suite.',
  price,
  propertyType: 'house',
  listingType: 'sale',
  location: { type: 'Point', coordinates: [77, 12] },
  address: { street: '1', city, state: 'K', zipCode: '1', country: 'India' },
  agent: agentId,
  status: 'available',
  area: 1000,
  ...extra,
});

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Property.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await Property.deleteMany({});
  __resetAnalyticsCache();
});

describe('S14 parseMarketQuery', () => {
  it('requires a city and whitelists listingType', () => {
    expect(parseMarketQuery({}).ok).toBe(false);
    expect(parseMarketQuery({ city: 'x'.repeat(101) }).ok).toBe(false);
    expect(parseMarketQuery({ city: 'Bengaluru' })).toEqual({ ok: true, city: 'Bengaluru', listingType: null });
    expect(parseMarketQuery({ city: 'Bengaluru', listingType: 'bogus' }).ok).toBe(false);
    expect(parseMarketQuery({ city: 'Bengaluru', listingType: 'rent' })).toEqual({ ok: true, city: 'Bengaluru', listingType: 'rent' });
  });
});

describe('S14 computeMarketStats (pure)', () => {
  it('floors below MIN_SAMPLE listings', () => {
    expect(computeMarketStats([])).toEqual({ dataAvailable: false, stats: null });
    expect(computeMarketStats([{ price: 1, area: 100 }, { price: 2, area: 100 }]).dataAvailable).toBe(false);
  });

  it('computes exact avg/median/min/max/psf over fixtures', () => {
    const rows = [
      { price: 100, area: 100 }, // psf 1
      { price: 300, area: 200 }, // psf 1.5
      { price: 200, area: 0 }, // excluded from psf
      { price: 400, area: 100 }, // psf 4
    ];
    const { dataAvailable, stats } = computeMarketStats(rows);
    expect(dataAvailable).toBe(true);
    expect(stats).toMatchObject({ count: 4, avgPrice: 250, medianPrice: 250, minPrice: 100, maxPrice: 400 });
    // psf mean of 1, 1.5, 4 = 2.166 -> rounds to 2
    expect(stats.avgPricePerSqft).toBe(2);
  });

  it('even-count median averages the middle pair', () => {
    const { stats } = computeMarketStats([
      { price: 10, area: 0 }, { price: 20, area: 0 }, { price: 30, area: 0 }, { price: 40, area: 0 },
    ]);
    expect(stats.medianPrice).toBe(25);
  });
});

describe('S14 getMarketAnalytics (real Mongo + cache)', () => {
  it('aggregates available listings only, case-insensitively, per city', async () => {
    await Property.insertMany([
      row('Bengaluru', 100),
      row('bengaluru', 300), // case-insensitive same bucket
      row('Bengaluru', 200),
      row('Mumbai', 999), // other city excluded
      row('Bengaluru', 888, { status: 'sold' }), // non-available excluded
    ]);

    const result = await getMarketAnalytics({ city: 'BENGALURU', listingType: null });
    expect(result.dataAvailable).toBe(true);
    expect(result.stats).toMatchObject({ count: 3, avgPrice: 200, medianPrice: 200, minPrice: 100, maxPrice: 300 });
    expect(result.city).toBe('BENGALURU'); // echo of the requested city
  });

  it('slice by listingType', async () => {
    await Property.insertMany([
      row('Pune', 100), row('Pune', 200), row('Pune', 250),
      row('Pune', 300, { listingType: 'rent' }),
    ]);
    const sale = await getMarketAnalytics({ city: 'Pune', listingType: 'sale' });
    expect(sale.stats.count).toBe(3);
    const rent = await getMarketAnalytics({ city: 'Pune', listingType: 'rent' });
    expect(rent.dataAvailable).toBe(false); // 1 < MIN_SAMPLE
    expect(rent.minSample).toBe(MIN_SAMPLE);
  });

  it('regex-shaped city text is treated as literal (no query fragment)', async () => {
    await Property.insertMany([row('Bengaluru', 100), row('Bengaluru', 200), row('Bengaluru', 300)]);
    const result = await getMarketAnalytics({ city: '.*', listingType: null });
    expect(result.dataAvailable).toBe(false);
    expect(result.stats).toBeNull();
  });

  it('serves the cached value and invalidates when a property is created', async () => {
    await Property.insertMany([row('Hyderabad', 100), row('Hyderabad', 200), row('Hyderabad', 300)]);
    const first = await getMarketAnalytics({ city: 'Hyderabad', listingType: null });
    expect(first.stats.count).toBe(3);

    // Second call within TTL returns the cached snapshot (stale by design).
    await Property.create(row('Hyderabad', 400));
    const stale = await getMarketAnalytics({ city: 'Hyderabad', listingType: null });
    expect(stale.stats.count).toBe(3);

    // The create funnel bumps the revision -> next call refetches.
    await propertyService.createProperty(String(agentId), {
      title: 'Fresh fourth',
      description: 'A fourth Hyderabad home created through the real service funnel.',
      price: 500,
      propertyType: 'house',
      listingType: 'sale',
      location: { type: 'Point', coordinates: [78, 17] },
      address: { street: '9', city: 'Hyderabad', state: 'TS', zipCode: '5' },
      area: 1000,
    });
    const fresh = await getMarketAnalytics({ city: 'Hyderabad', listingType: null });
    // 3 seeded + 1 direct create + 1 funnel create = 5
    expect(fresh.stats.count).toBe(5);
  });
});
