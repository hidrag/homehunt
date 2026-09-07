import { jest } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app.js';
import Property from '../../src/models/Property.js';

describe('Real MongoDB Integration Tests — Search, Filters & Sorting', () => {
  let mongoServer;

  // Set timeout for MongoDB memory server startup and index builds
  jest.setTimeout(60000);

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Initialize indexes (including $text and 2dsphere)
    await Property.init();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Property.deleteMany({});
  });

  it('verifies that the compound $text index exists and covers title, description, address.city', async () => {
    const indexes = await Property.collection.indexes();
    const textIndex = indexes.find((idx) => idx.weights && idx.weights.title);

    expect(textIndex).toBeDefined();
    expect(textIndex.weights).toHaveProperty('title');
    expect(textIndex.weights).toHaveProperty('description');
    expect(textIndex.weights).toHaveProperty(['address.city']);
  });

  describe('Real MongoDB Query Execution', () => {
    const agentId = new mongoose.Types.ObjectId();

    const sampleProperties = [
      {
        title: 'Luxury Villa with Sea View',
        description: 'A spacious sea-facing luxury retreat with private pool',
        price: 35000000,
        propertyType: 'villa',
        listingType: 'sale',
        status: 'available',
        location: { type: 'Point', coordinates: [72.8258, 18.975] },
        address: { street: 'Marine Drive', city: 'Mumbai', state: 'Maharashtra', zipCode: '400020' },
        agent: agentId,
        bedrooms: 4,
        bathrooms: 4,
        area: 4200,
      },
      {
        title: 'Modern Luxury Apartment',
        description: 'Affordable luxury apartment near downtown business park',
        price: 12000000,
        propertyType: 'apartment',
        listingType: 'sale',
        status: 'available',
        location: { type: 'Point', coordinates: [72.83, 19.01] },
        address: { street: 'Worli Sea Face', city: 'Mumbai', state: 'Maharashtra', zipCode: '400030' },
        agent: agentId,
        bedrooms: 3,
        bathrooms: 3,
        area: 1600,
      },
      {
        title: 'Sea Breeze Luxury Apartment',
        description: 'Stunning luxury home with panoramic ocean view',
        price: 12000000,
        propertyType: 'apartment',
        listingType: 'sale',
        status: 'available',
        location: { type: 'Point', coordinates: [72.84, 19.02] },
        address: { street: 'Bandra West', city: 'Mumbai', state: 'Maharashtra', zipCode: '400050' },
        agent: agentId,
        bedrooms: 3,
        bathrooms: 3,
        area: 1750,
      },
      {
        title: 'High-rise Luxury Penthouse Apartment',
        description: 'Elite luxury penthouse apartment on top floor',
        price: 18000000,
        propertyType: 'apartment',
        listingType: 'sale',
        status: 'available',
        location: { type: 'Point', coordinates: [72.85, 19.03] },
        address: { street: 'Prabhadevi', city: 'Mumbai', state: 'Maharashtra', zipCode: '400025' },
        agent: agentId,
        bedrooms: 3,
        bathrooms: 4,
        area: 2400,
      },
      {
        title: 'Compact Cozy Condo',
        description: 'Comfortable living in central location',
        price: 8500000,
        propertyType: 'condo',
        listingType: 'sale',
        status: 'available',
        location: { type: 'Point', coordinates: [72.86, 19.04] },
        address: { street: 'Andheri East', city: 'Mumbai', state: 'Maharashtra', zipCode: '400069' },
        agent: agentId,
        bedrooms: 2,
        bathrooms: 2,
        area: 950,
      },
      {
        title: 'Budget Rental Apartment',
        description: 'Convenient rental near university',
        price: 35000,
        propertyType: 'apartment',
        listingType: 'rent',
        status: 'available',
        location: { type: 'Point', coordinates: [73.8567, 18.5204] },
        address: { street: 'Kothrud', city: 'Pune', state: 'Maharashtra', zipCode: '411038' },
        agent: agentId,
        bedrooms: 2,
        bathrooms: 1,
        area: 750,
      },
    ];

    beforeEach(async () => {
      await Property.insertMany(sampleProperties);
    });

    it('executes a combined S2 query (text search + city + price + bedrooms + sort + pagination)', async () => {
      // Query parameters:
      // search=luxury (matches docs with 'luxury' in title/desc)
      // city=Mumbai
      // propertyType=apartment
      // listingType=sale
      // minPrice=10000000, maxPrice=20000000
      // bedrooms=3
      // sort=price_asc
      // page=1, limit=10
      const response = await request(app).get(
        '/api/properties?search=luxury&city=Mumbai&propertyType=apartment&listingType=sale&minPrice=10000000&maxPrice=20000000&bedrooms=3&sort=price_asc&page=1&limit=10'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.pagination.total).toBe(3);
      expect(response.body.data.properties).toHaveLength(3);

      const returnedTitles = response.body.data.properties.map((p) => p.title);
      // Both 12M properties should come before the 18M penthouse property
      expect(returnedTitles).toContain('Modern Luxury Apartment');
      expect(returnedTitles).toContain('Sea Breeze Luxury Apartment');
      expect(returnedTitles[2]).toBe('High-rise Luxury Penthouse Apartment');

      // Verify excluded properties are not present
      expect(returnedTitles).not.toContain('Luxury Villa with Sea View'); // villa, not apartment
      expect(returnedTitles).not.toContain('Compact Cozy Condo'); // condo, price 8.5M, 2 beds
      expect(returnedTitles).not.toContain('Budget Rental Apartment'); // Pune, rent, price 35k
    });

    it('executes deterministic pagination with secondary _id sort on tied values', async () => {
      // Modern Luxury Apartment and Sea Breeze Luxury Apartment both have price = 12000000
      // High-rise Luxury Penthouse Apartment has price = 18000000
      // We test pagination with limit=1 across the 12000000-tied properties

      const page1Res = await request(app).get(
        '/api/properties?city=Mumbai&propertyType=apartment&minPrice=10000000&maxPrice=15000000&sort=price_asc&page=1&limit=1'
      );
      const page2Res = await request(app).get(
        '/api/properties?city=Mumbai&propertyType=apartment&minPrice=10000000&maxPrice=15000000&sort=price_asc&page=2&limit=1'
      );

      expect(page1Res.status).toBe(200);
      expect(page2Res.status).toBe(200);

      const item1 = page1Res.body.data.properties[0];
      const item2 = page2Res.body.data.properties[0];

      expect(item1).toBeDefined();
      expect(item2).toBeDefined();
      expect(item1._id).not.toBe(item2._id);

      // Verify secondary sort is deterministic (item1._id < item2._id because price_asc uses _id: 1)
      expect(item1.price).toBe(12000000);
      expect(item2.price).toBe(12000000);
      expect(String(item1._id) < String(item2._id)).toBe(true);

      // Rerunning page 1 must produce the exact same document deterministically
      const page1Rerun = await request(app).get(
        '/api/properties?city=Mumbai&propertyType=apartment&minPrice=10000000&maxPrice=15000000&sort=price_asc&page=1&limit=1'
      );
      expect(page1Rerun.body.data.properties[0]._id).toBe(item1._id);
    });

    it('verifies prototype properties (e.g. constructor, toString) fall back to newest sort without error', async () => {
      const response = await request(app).get('/api/properties?sort=constructor');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.properties.length).toBeGreaterThan(0);

      const responseToString = await request(app).get('/api/properties?sort=toString');
      expect(responseToString.status).toBe(200);
      expect(responseToString.body.success).toBe(true);
      expect(responseToString.body.data.properties.length).toBeGreaterThan(0);
    });
  });
});
