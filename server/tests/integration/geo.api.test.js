/**
 * S11 — HTTP-level geospatial contract suite (ADR-031).
 *
 * GET /api/properties with radius/bounds parameters: standard envelopes on
 * success, 400 GEO_INVALID envelopes on malformed geo input, and proof the
 * filter handed to the service layer carries the locked $geoWithin operator
 * shapes (service/mongo accuracy is covered by geo.mongo.test.js).
 */
import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../../src/app.js';
import Property from '../../src/models/Property.js';

let mongo;
let findSpy;
let lastFilter;

const mockFind = () => {
  const mockQuery = {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([]),
  };
  findSpy = jest.spyOn(Property, 'find').mockImplementation((filter) => {
    lastFilter = filter;
    return mockQuery;
  });
  jest.spyOn(Property, 'countDocuments').mockResolvedValue(0);
};

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
  jest.restoreAllMocks();
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(() => {
  jest.restoreAllMocks();
  lastFilter = undefined;
  mockFind();
});

const get = (query) => {
  const qs = new URLSearchParams(query).toString();
  return request(app).get(`/api/properties${qs ? `?${qs}` : ''}`);
};

describe('GET /api/properties — geo parameters', () => {
  it('valid radius returns the standard envelope and passes $centerSphere downstream', async () => {
    const response = await get({ lat: '12.9716', lng: '77.5946', radiusKm: '5' });
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({ properties: [], pagination: { total: 0 } });
    expect(lastFilter.location.$geoWithin.$centerSphere).toEqual([
      [77.5946, 12.9716],
      5 / 6378.1,
    ]);
  });

  it('valid bounds passes a closed $geometry Polygon in [lng, lat] order', async () => {
    const response = await get({ bounds: '12.9,77.5,13.1,77.7' });
    expect(response.status).toBe(200);
    expect(lastFilter.location.$geoWithin.$geometry).toEqual({
      type: 'Polygon',
      coordinates: [[
        [77.5, 12.9],
        [77.7, 12.9],
        [77.7, 13.1],
        [77.5, 13.1],
        [77.5, 12.9],
      ]],
    });
  });

  it('geo composes with the S2 vocabulary in one filter', async () => {
    const response = await get({
      lat: '12.97', lng: '77.59', radiusKm: '10', city: 'Bengaluru', maxPrice: '5000000',
    });
    expect(response.status).toBe(200);
    expect(lastFilter['address.city'] instanceof RegExp).toBe(true);
    expect(lastFilter.price.$lte).toBe(5000000);
    expect(lastFilter.location.$geoWithin.$centerSphere[1]).toBe(10 / 6378.1);
  });

  const invalidCases = [
    ['lat out of range', { lat: '91', lng: '0', radiusKm: '5' }],
    ['lng out of range', { lat: '0', lng: '-181', radiusKm: '5' }],
    ['lat not a number', { lat: 'abc', lng: '0', radiusKm: '5' }],
    ['lat Infinity', { lat: 'Infinity', lng: '0', radiusKm: '5' }],
    ['radius missing with coords', { lat: '12.9', lng: '77.5' }],
    ['radius zero', { lat: '12.9', lng: '77.5', radiusKm: '0' }],
    ['radius over 100', { lat: '12.9', lng: '77.5', radiusKm: '101' }],
    ['bounds short', { bounds: '12.9,77.5,13.1' }],
    ['bounds long', { bounds: '1,2,3,4,5' }],
    ['bounds non-numeric', { bounds: 'a,2,3,4' }],
    ['bounds inverted lat', { bounds: '13.1,77.5,12.9,77.7' }],
    ['bounds antimeridian cross', { bounds: '12.9,170,13.1,-170' }],
  ];

  it.each(invalidCases)('rejects %s with 400 GEO_INVALID envelope', async (_name, query) => {
    const response = await get(query);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'GEO_INVALID', message: expect.any(String) },
    });
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('unknown query keys remain ignored (no 400, no injection)', async () => {
    const response = await get({ $where: 'sleep(1)', bogus: 'x' });
    expect(response.status).toBe(200);
    expect(lastFilter).toEqual({});
  });

  it('geo errors bypass the generic 500 handler (typed error path)', async () => {
    const response = await get({ radiusKm: '5' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('GEO_INVALID');
  });
});
