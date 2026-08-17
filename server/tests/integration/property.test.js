import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import Property from '../../src/models/Property.js';

describe('Property API Integration Tests', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/properties', () => {
    // 1. GET /api/properties returns 200.
    // 2. List response has documented structure.
    it('1 & 2. should return 200 and documented list response structure', async () => {
      const mockProperties = [
        { _id: '1', title: 'Luxury Villa', price: 68000000 },
        { _id: '2', title: 'Sea Facing Apartment', price: 45000000 }
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockProperties)
      };

      jest.spyOn(Property, 'find').mockReturnValue(mockQuery);
      jest.spyOn(Property, 'countDocuments').mockResolvedValue(2);

      const response = await request(app).get('/api/properties');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('properties');
      expect(response.body.data).toHaveProperty('pagination');
      expect(response.body.data.properties).toHaveLength(2);
      expect(response.body.data.pagination).toEqual({
        total: 2,
        page: 1,
        pages: 1,
        limit: 10
      });
      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    // 3. Default pagination works.
    it('3. should use default pagination (page=1, limit=10)', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      };

      jest.spyOn(Property, 'find').mockReturnValue(mockQuery);
      jest.spyOn(Property, 'countDocuments').mockResolvedValue(0);

      const response = await request(app).get('/api/properties');

      expect(response.status).toBe(200);
      expect(mockQuery.skip).toHaveBeenCalledWith(0);
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(10);
    });

    // 4. Custom page works.
    it('4. should handle custom page parameter', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      };

      jest.spyOn(Property, 'find').mockReturnValue(mockQuery);
      jest.spyOn(Property, 'countDocuments').mockResolvedValue(30);

      const response = await request(app).get('/api/properties?page=3');

      expect(response.status).toBe(200);
      expect(mockQuery.skip).toHaveBeenCalledWith(20); // (3 - 1) * 10
      expect(response.body.data.pagination.page).toBe(3);
    });

    // 5. Custom limit works.
    it('5. should handle custom limit parameter', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      };

      jest.spyOn(Property, 'find').mockReturnValue(mockQuery);
      jest.spyOn(Property, 'countDocuments').mockResolvedValue(50);

      const response = await request(app).get('/api/properties?limit=25');

      expect(response.status).toBe(200);
      expect(mockQuery.limit).toHaveBeenCalledWith(25);
      expect(response.body.data.pagination.limit).toBe(25);
    });

    // 6. Limit > 50 is handled according to the API contract (clamped to 50).
    it('6. should clamp limit to maximum of 50 if limit > 50', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      };

      jest.spyOn(Property, 'find').mockReturnValue(mockQuery);
      jest.spyOn(Property, 'countDocuments').mockResolvedValue(100);

      const response = await request(app).get('/api/properties?limit=100');

      expect(response.status).toBe(200);
      expect(mockQuery.limit).toHaveBeenCalledWith(50);
      expect(response.body.data.pagination.limit).toBe(50);
    });

    // 7. Invalid pagination input is handled according to the API contract.
    it('7. should fallback to defaults when invalid pagination inputs are provided', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      };

      jest.spyOn(Property, 'find').mockReturnValue(mockQuery);
      jest.spyOn(Property, 'countDocuments').mockResolvedValue(20);

      const response = await request(app).get('/api/properties?page=-5&limit=invalid');

      expect(response.status).toBe(200);
      expect(mockQuery.skip).toHaveBeenCalledWith(0); // fallback page 1
      expect(mockQuery.limit).toHaveBeenCalledWith(10); // fallback limit 10
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(10);
    });
  });

  describe('GET /api/properties/:id', () => {
    // 8. GET /api/properties/:id returns a valid property.
    it('8. should return 200 and the property when valid and found', async () => {
      const validObjectId = new mongoose.Types.ObjectId().toString();
      const mockProperty = {
        _id: validObjectId,
        title: 'Assagao Villa',
        price: 55000000,
        propertyType: 'villa',
        agent: '64b000000000000000000001'
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockProperty)
      };

      jest.spyOn(Property, 'findById').mockReturnValue(mockQuery);

      const response = await request(app).get(`/api/properties/${validObjectId}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          property: mockProperty
        }
      });
      expect(Property.findById).toHaveBeenCalledWith(validObjectId);
      expect(mockQuery.select).toHaveBeenCalledWith('-__v');
    });

    // 9. Invalid ObjectId returns 400.
    it('9. should return 400 with INVALID_ID code for malformed ObjectId', async () => {
      const response = await request(app).get('/api/properties/not-a-valid-object-id');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'Invalid property ID format'
        }
      });
    });

    // 10. Valid but nonexistent ID returns 404.
    it('10. should return 404 with NOT_FOUND code when property does not exist', async () => {
      const validNonExistentId = new mongoose.Types.ObjectId().toString();

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null)
      };

      jest.spyOn(Property, 'findById').mockReturnValue(mockQuery);

      const response = await request(app).get(`/api/properties/${validNonExistentId}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Property not found'
        }
      });
    });
  });
});
