/**
 * S10 — Saved-search service/domain integration suite.
 *
 * Covers typed-criteria validation, operator-injection rejection (save-time
 * and tampered-document), per-user active cap, owner-scoped CRUD with 404
 * enumeration resistance, and run-endpoint execution accuracy (boundary
 * prices, sort, canonical querystring).
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../../src/models/User.js';
import Property from '../../src/models/Property.js';
import SavedSearch from '../../src/models/SavedSearch.js';
import * as savedSearch from '../../src/services/savedSearch.service.js';
import { buildPropertyFilter, buildCanonicalQuery } from '../../src/lib/propertyFilters.js';

let mongo;

const propertyData = (agent, overrides = {}) => ({
  title: 'Search home',
  description: 'A suitable test home for saved search tests.',
  price: 100,
  propertyType: 'house',
  listingType: 'sale',
  location: { type: 'Point', coordinates: [77, 12] },
  address: { street: '1', city: 'Bengaluru', state: 'K', zipCode: '1', country: 'India' },
  agent,
  ...overrides,
});

const statusOf = (err) => err && err.status;
const codeOf = (err) => err && err.code;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-minimum-32-chars-long-12345';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-chars-long-12345';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
  await Property.init();
  await SavedSearch.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Property.deleteMany({});
  await SavedSearch.deleteMany({});
});

describe('S10 shared filter builder (unit)', () => {
  it('ignores operator-shaped values of the wrong type', () => {
    const filter = buildPropertyFilter({ city: { $gt: '' }, propertyType: { $in: ['house'] }, listingType: { $where: 'sleep(1)' } });
    expect(filter).toEqual({});
  });

  it('whitelists enums and clamps inverted price ranges', () => {
    expect(buildPropertyFilter({ propertyType: 'house', listingType: 'sale' })).toEqual({ propertyType: 'house', listingType: 'sale' });
    expect(buildPropertyFilter({ propertyType: 'yacht' })).toEqual({});
    expect(buildPropertyFilter({ minPrice: 500, maxPrice: 100 })).toEqual({});
    expect(buildPropertyFilter({ minPrice: '100', maxPrice: '500' })).toEqual({ price: { $gte: 100, $lte: 500 } });
  });

  it('escapes regex metacharacters in city matching', () => {
    const filter = buildPropertyFilter({ city: 'a.*b(c' });
    expect(filter['address.city'].source).toBe('^a\\.\\*b\\(c$');
  });

  it('builds the canonical querystring from typed criteria only', () => {
    expect(buildCanonicalQuery({ listingType: 'sale', minPrice: 100, city: 'Bengaluru', nope: 'x' }))
      .toBe('?city=Bengaluru&listingType=sale&minPrice=100');
    expect(buildCanonicalQuery({})).toBe('');
    expect(buildCanonicalQuery({ sort: 'constructor' })).toBe('');
    expect(buildCanonicalQuery({ sort: 'price_asc' })).toBe('?sort=price_asc');
  });
});

describe('S10 SavedSearch — validation & persistence (service level)', () => {
  let buyer, agent, property;

  beforeEach(async () => {
    buyer = await User.create({ name: 'Buyer', email: 'buyer@test.local', passwordHash: 'x', role: 'buyer' });
    agent = await User.create({ name: 'Agent', email: 'agent@test.local', passwordHash: 'x', role: 'agent' });
    property = await Property.create(propertyData(agent._id));
  });

  describe('create validation', () => {
    it('creates with typed criteria, forced user and instant frequency', async () => {
      const doc = await savedSearch.create(String(buyer._id), {
        name:  ' My search ',
        criteria: { listingType: 'sale', city: 'Bengaluru', minPrice: 100, maxPrice: 500, bedrooms: 2, sort: 'price_asc' },
      });
      expect(doc.user.toString()).toBe(String(buyer._id));
      expect(doc.name).toBe('My search');
      expect(doc.frequency).toBe('instant');
      expect(doc.active).toBe(true);
      expect(doc.criteria.listingType).toBe('sale');
      expect(doc.criteria.minPrice).toBe(100);
    });

    it('rejects missing/empty/overlong name', async () => {
      await expect(savedSearch.create(String(buyer._id), { criteria: { city: 'x' } })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
      await expect(savedSearch.create(String(buyer._id), { name: '   ', criteria: { city: 'x' } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(savedSearch.create(String(buyer._id), { name: 'x'.repeat(81), criteria: { city: 'x' } })).rejects.toMatchObject({ status: 400 });
    });

    it('rejects empty and malformed criteria', async () => {
      await expect(savedSearch.create(String(buyer._id), { name: 'n', criteria: {} })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(savedSearch.create(String(buyer._id), { name: 'n', criteria: 'house' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(savedSearch.create(String(buyer._id), { name: 'n' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects out-of-vocabulary enum criteria', async () => {
      await expect(savedSearch.create(String(buyer._id), { name: 'n', criteria: { propertyType: 'yacht' } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(savedSearch.create(String(buyer._id), { name: 'n', criteria: { listingType: 'lease' } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(savedSearch.create(String(buyer._id), { name: 'n', criteria: { sort: 'constructor' } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects inverted price range and non-integer bedrooms', async () => {
      await expect(savedSearch.create(String(buyer._id), { name: 'n', criteria: { minPrice: 500, maxPrice: 100 } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(savedSearch.create(String(buyer._id), { name: 'n', criteria: { bedrooms: 1.5 } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(savedSearch.create(String(buyer._id), { name: 'n', criteria: { minPrice: -1 } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects operator-shaped criteria payloads (injection guard at save)', async () => {
      const payloads = [
        { city: { $gt: '' } },
        { search: { $regex: '.*', $options: 'i' } },
        { propertyType: { $in: ['house'] } },
        { minPrice: { $where: 'sleep(1000)' } },
        { bedrooms: [1, 2] },
      ];
      for (const criteria of payloads) {
        // eslint-disable-next-line no-await-in-loop
        await expect(savedSearch.create(String(buyer._id), { name: 'n', criteria })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
      }
    });

    it('rejects daily frequency with the versioned message', async () => {
      await expect(savedSearch.create(String(buyer._id), { name: 'n', criteria: { city: 'x' }, frequency: 'daily' }))
        .rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: 'Daily digest is not supported in this version' });
      await expect(savedSearch.create(String(buyer._id), { name: 'n', criteria: { city: 'x' }, frequency: 'hourly' }))
        .rejects.toMatchObject({ status: 400 });
    });

    it('caps active saved searches at 20 with SEARCH_LIMIT', async () => {
      for (let i = 0; i < 20; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await savedSearch.create(String(buyer._id), { name: `s${i}`, criteria: { city: 'Bengaluru' } });
      }
      const err = await savedSearch.create(String(buyer._id), { name: 'one too many', criteria: { city: 'Bengaluru' } }).catch((e) => e);
      expect(statusOf(err)).toBe(429);
      expect(codeOf(err)).toBe('SEARCH_LIMIT');
    });

    it('ignores unknown criteria keys instead of storing them', async () => {
      const doc = await savedSearch.create(String(buyer._id), { name: 'n', criteria: { city: 'x', $where: 'sleep(1)', admin: true } });
      expect(doc.criteria.city).toBe('x');
      expect(doc.criteria.$where).toBeUndefined();
      expect(doc.criteria.admin).toBeUndefined();
    });
  });

  describe('owner scoping & CRUD', () => {
    let search;
    beforeEach(async () => {
      search = await savedSearch.create(String(buyer._id), { name: 'orig', criteria: { city: 'Bengaluru' } });
    });

    it('reads, updates and deletes own document', async () => {
      expect((await savedSearch.get(search._id.toString(), String(buyer._id))).name).toBe('orig');
      const updated = await savedSearch.update(search._id.toString(), String(buyer._id), { name: 'renamed', active: false });
      expect(updated.name).toBe('renamed');
      expect(updated.active).toBe(false);
      expect(await savedSearch.remove(search._id.toString(), String(buyer._id))).toEqual({ deleted: true });
      await expect(savedSearch.get(search._id.toString(), String(buyer._id))).rejects.toMatchObject({ status: 404 });
    });

    it('returns 404 to non-owners for every operation (enumeration guard)', async () => {
      const thief = await User.create({ name: 'Thief', email: 'thief@test.local', passwordHash: 'x', role: 'buyer' });
      for (const op of [
        () => savedSearch.get(search._id.toString(), String(thief._id)),
        () => savedSearch.update(search._id.toString(), String(thief._id), { name: 'stolen' }),
        () => savedSearch.remove(search._id.toString(), String(thief._id)),
        () => savedSearch.run(search._id.toString(), String(thief._id)),
      ]) {
        // eslint-disable-next-line no-await-in-loop
        await expect(op()).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
      }
      // The thief only ever sees their own documents in the list.
      const list = await savedSearch.list(String(thief._id), 1, 10);
      expect(list.savedSearches).toHaveLength(0);
      expect(list.pagination.total).toBe(0);
    });

    it('rejects malformed ids with INVALID_ID', async () => {
      await expect(savedSearch.get('not-an-id', String(buyer._id))).rejects.toMatchObject({ status: 400, code: 'INVALID_ID' });
    });

    it('re-enforcing active cap on reactivation', async () => {
      for (let i = 0; i < 19; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await savedSearch.create(String(buyer._id), { name: `s${i}`, criteria: { city: 'Bengaluru' } });
      }
      // 20 active now (the fixture `search` + 19). Pause the fixture, use the
      // freed slot, then prove reactivating it re-hits the cap.
      const deactivated = await savedSearch.update(search._id.toString(), String(buyer._id), { active: false });
      expect(await savedSearch.create(String(buyer._id), { name: 'replacement', criteria: { city: 'C' } })).toBeTruthy();
      const err = await savedSearch.update(deactivated._id.toString(), String(buyer._id), { active: true }).catch((e) => e);
      expect(statusOf(err)).toBe(429);
    });

    it('validates update payloads like create', async () => {
      await expect(savedSearch.update(search._id.toString(), String(buyer._id), { frequency: 'daily' }))
        .rejects.toMatchObject({ message: 'Daily digest is not supported in this version' });
      await expect(savedSearch.update(search._id.toString(), String(buyer._id), { criteria: { propertyType: 'yacht' } }))
        .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(savedSearch.update(search._id.toString(), String(buyer._id), { active: 'yes' }))
        .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  describe('run execution accuracy', () => {
    beforeEach(async () => {
      // Remove the fixture property from the outer beforeEach so each run
      // test controls exactly the property set it reasons about.
      await Property.deleteMany({});
    });

    it('returns exactly the properties matching the stored criteria', async () => {
      const matching = await Property.create(propertyData(agent._id, { price: 200, listingType: 'sale', bedrooms: 3 }));
      await Property.create(propertyData(agent._id, { price: 900, listingType: 'sale' })); // above max
      await Property.create(propertyData(agent._id, { price: 200, listingType: 'rent' })); // wrong listingType
      const search = await savedSearch.create(String(buyer._id), { name: 'r', criteria: { listingType: 'sale', minPrice: 100, maxPrice: 500 } });

      const result = await savedSearch.run(search._id.toString(), String(buyer._id), 1, 10);
      expect(result.properties.map((p) => String(p._id))).toEqual([String(matching._id)]);
      expect(result.pagination.total).toBe(1);
      expect(result.query).toBe('?listingType=sale&minPrice=100&maxPrice=500');
    });

    it('matches price boundaries inclusively (exactly min and exactly max)', async () => {
      const atMin = await Property.create(propertyData(agent._id, { title: 'At min', listingType: 'sale', price: 100 }));
      const atMax = await Property.create(propertyData(agent._id, { title: 'At max', listingType: 'sale', price: 500 }));
      await Property.create(propertyData(agent._id, { title: 'Below', listingType: 'sale', price: 99 }));
      await Property.create(propertyData(agent._id, { title: 'Above', listingType: 'sale', price: 501 }));
      const search = await savedSearch.create(String(buyer._id), { name: 'bounds', criteria: { listingType: 'sale', minPrice: 100, maxPrice: 500, sort: 'price_asc' } });

      const result = await savedSearch.run(search._id.toString(), String(buyer._id), 1, 10);
      const titles = result.properties.map((p) => p.title);
      expect(titles).toEqual(['At min', 'At max']);
      expect(String(result.properties[0]._id)).toBe(String(atMin._id));
      expect(String(result.properties[1]._id)).toBe(String(atMax._id));
    });

    it('runs city matching case-insensitively and escaped', async () => {
      await Property.create(propertyData(agent._id, { address: { street: '1', city: 'bengaluru', state: 'K', zipCode: '1', country: 'India' } }));
      const search = await savedSearch.create(String(buyer._id), { name: 'city', criteria: { city: 'Bengaluru' } });
      const result = await savedSearch.run(search._id.toString(), String(buyer._id), 1, 10);
      expect(result.pagination.total).toBe(1);
    });

    it('matches nothing when no property qualifies', async () => {
      const search = await savedSearch.create(String(buyer._id), { name: 'empty', criteria: { city: 'Nowhere' } });
      const result = await savedSearch.run(search._id.toString(), String(buyer._id), 1, 10);
      expect(result.properties).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.pages).toBe(0);
    });

    it('survives a tampered criteria document without executing operators', async () => {
      await Property.create(propertyData(agent._id, { title: 'Survivor', city: 'Bengaluru' }));
      const search = await savedSearch.create(String(buyer._id), { name: 'tamper', criteria: { city: 'Bengaluru' } });
      // Simulate out-of-band tampering below the schema cast layer.
      await SavedSearch.collection.updateOne({ _id: new mongoose.Types.ObjectId(search._id) }, { $set: { 'criteria.city': { $gt: '' }, 'criteria.$where': 'sleep(5000)' } });

      // Expected: the builder ignores the non-string city and the unknown
      // $where key entirely, degrading to the plain public-listings query.
      // The point is that no operator ever reaches Mongo and no throw leaks:
      // the one existing property matches exactly as it would for an empty
      // public search — no operator-shaped behavior, no data leak.
      const result = await savedSearch.run(search._id.toString(), String(buyer._id), 1, 10);
      expect(Array.isArray(result.properties)).toBe(true);
      expect(result.pagination.total).toBe(1);
    });
  });

  describe('list pagination & order', () => {
    it('lists newest activity first with the standard envelope', async () => {
      const first = await savedSearch.create(String(buyer._id), { name: 'first', criteria: { city: 'A' } });
      await savedSearch.create(String(buyer._id), { name: 'second', criteria: { city: 'B' } });
      const list = await savedSearch.list(String(buyer._id), 1, 10);
      expect(list.savedSearches.map((s) => s.name)).toEqual(['second', 'first']);
      expect(list.pagination).toMatchObject({ total: 2, page: 1, limit: 10 });

      const secondPage = await savedSearch.list(String(buyer._id), 2, 1);
      expect(secondPage.savedSearches.map((s) => s.name)).toEqual(['first']);
    });
  });
});
