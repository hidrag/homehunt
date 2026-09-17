import { jest } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express from 'express';
import app from '../../src/app.js';
import User from '../../src/models/User.js';
import Session from '../../src/models/Session.js';
import { requireAuth, requireRole } from '../../src/middlewares/auth.middleware.js';
import { AUTH_CONSTANTS } from '../../src/config/auth.js';

describe('Real MongoDB Integration Tests — Authentication & RBAC (S4.1)', () => {
  let mongoServer;

  jest.setTimeout(60000);

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test_access_secret_super_secure_32_characters_long';
    process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_super_secure_32_characters_long';
    process.env.NODE_ENV = 'test';

    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    await User.init();
    await Session.init();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Session.deleteMany({});
  });

  // Helper to extract cookie value from Set-Cookie header array
  const extractCookie = (res, cookieName) => {
    const cookies = res.headers['set-cookie'];
    if (!cookies) return null;
    const cookieString = cookies.find((c) => c.startsWith(`${cookieName}=`));
    if (!cookieString) return null;
    return cookieString.split(';')[0].split('=')[1];
  };

  describe('User & Session Database Schemas and Indexes', () => {
    it('verifies User indexes: unique email and role index', async () => {
      const indexes = await User.collection.indexes();
      const emailIdx = indexes.find((i) => i.key && i.key.email === 1);
      const roleIdx = indexes.find((i) => i.key && i.key.role === 1);

      expect(emailIdx).toBeDefined();
      expect(emailIdx.unique).toBe(true);
      expect(roleIdx).toBeDefined();
    });

    it('verifies Session indexes: userId, unique tokenHash, familyId, expiresAt TTL', async () => {
      const indexes = await Session.collection.indexes();
      const userIdx = indexes.find((i) => i.key && i.key.userId === 1);
      const hashIdx = indexes.find((i) => i.key && i.key.tokenHash === 1);
      const familyIdx = indexes.find((i) => i.key && i.key.familyId === 1);
      const ttlIdx = indexes.find((i) => i.key && i.key.expiresAt === 1);

      expect(userIdx).toBeDefined();
      expect(hashIdx).toBeDefined();
      expect(hashIdx.unique).toBe(true);
      expect(familyIdx).toBeDefined();
      expect(ttlIdx).toBeDefined();
      expect(ttlIdx.expireAfterSeconds).toBe(0);
    });
  });

  describe('POST /api/auth/register', () => {
    it('successfully registers a user with role=buyer and sets HTTP-only cookies', async () => {
      const payload = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'ValidPassword123!',
      };

      const res = await request(app).post('/api/auth/register').send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toEqual({
        id: expect.any(String),
        name: 'Jane Doe',
        email: 'jane@example.com',
        role: 'buyer',
      });
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.accessToken).toBeUndefined();
      expect(res.body.data.refreshToken).toBeUndefined();

      // Verify Set-Cookie headers
      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      const accessCookie = setCookie.find((c) => c.startsWith(`${AUTH_CONSTANTS.COOKIE_ACCESS}=`));
      const refreshCookie = setCookie.find((c) => c.startsWith(`${AUTH_CONSTANTS.COOKIE_REFRESH}=`));

      expect(accessCookie).toContain('HttpOnly');
      expect(accessCookie).toContain('Path=/');
      expect(accessCookie).toContain('SameSite=Lax');
      expect(refreshCookie).toContain('HttpOnly');

      // Verify database state: user stored with passwordHash, Session created
      const dbUser = await User.findOne({ email: 'jane@example.com' }).select('+passwordHash');
      expect(dbUser).toBeDefined();
      expect(dbUser.passwordHash).toBeDefined();
      expect(dbUser.passwordHash).not.toBe('ValidPassword123!');
      expect(dbUser.role).toBe('buyer');

      const dbSession = await Session.findOne({ userId: dbUser._id });
      expect(dbSession).toBeDefined();
      expect(dbSession.revokedAt).toBeNull();
      expect(dbSession.familyId).toBeDefined();
      expect(dbSession.tokenHash).toHaveLength(64); // SHA-256 hex string
    });

    it('rejects duplicate email with 409 EMAIL_TAKEN', async () => {
      await request(app).post('/api/auth/register').send({
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'Password123!',
      });

      const res = await request(app).post('/api/auth/register').send({
        name: 'Jane Clone',
        email: 'JANE@example.com', // case insensitive
        password: 'Password123!',
      });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });

    it('ignores client-submitted role or passwordHash and enforces buyer role', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Hacker',
        email: 'hacker@example.com',
        password: 'Password123!',
        role: 'admin',
        passwordHash: 'injected_hash',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('buyer');

      const dbUser = await User.findOne({ email: 'hacker@example.com' });
      expect(dbUser.role).toBe('buyer');
    });

    it('validates required fields and password length', async () => {
      // Missing name
      let res = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'Password123!',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');

      // Invalid email
      res = await request(app).post('/api/auth/register').send({
        name: 'Test',
        email: 'not-an-email',
        password: 'Password123!',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');

      // Password too short (< 8)
      res = await request(app).post('/api/auth/register').send({
        name: 'Test',
        email: 'test@example.com',
        password: 'short',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');

      // Password too long (> 72)
      res = await request(app).post('/api/auth/register').send({
        name: 'Test',
        email: 'test@example.com',
        password: 'A'.repeat(73),
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/register').send({
        name: 'Test User',
        email: 'user@example.com',
        password: 'CorrectPassword123!',
      });
    });

    it('logs in successfully with valid credentials and sets cookies', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'user@example.com',
        password: 'CorrectPassword123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('user@example.com');
      expect(res.body.data.user.passwordHash).toBeUndefined();

      const accessCookie = extractCookie(res, AUTH_CONSTANTS.COOKIE_ACCESS);
      const refreshCookie = extractCookie(res, AUTH_CONSTANTS.COOKIE_REFRESH);
      expect(accessCookie).toBeDefined();
      expect(refreshCookie).toBeDefined();
    });

    it('returns 401 INVALID_CREDENTIALS for wrong password', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'user@example.com',
        password: 'WrongPassword!',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('returns indistinguishable 401 INVALID_CREDENTIALS for unknown email (enumeration parity)', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'SomePassword123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    it('validates input presence with 400 VALIDATION_ERROR', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: '',
        password: '',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/refresh (Rotation, Reuse Detection & Family Revocation)', () => {
    it('rotates refresh token, revokes presented session, and creates successor session', async () => {
      // 1. Login to get initial cookies
      const registerRes = await request(app).post('/api/auth/register').send({
        name: 'Refresh Tester',
        email: 'refresh@example.com',
        password: 'Password123!',
      });

      const initialRefreshCookie = extractCookie(registerRes, AUTH_CONSTANTS.COOKIE_REFRESH);
      expect(initialRefreshCookie).toBeDefined();

      const initialSessionCount = await Session.countDocuments({});
      expect(initialSessionCount).toBe(1);

      // 2. Refresh with valid token
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_REFRESH}=${initialRefreshCookie}`]);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.success).toBe(true);

      const rotatedAccessCookie = extractCookie(refreshRes, AUTH_CONSTANTS.COOKIE_ACCESS);
      const rotatedRefreshCookie = extractCookie(refreshRes, AUTH_CONSTANTS.COOKIE_REFRESH);
      expect(rotatedAccessCookie).toBeDefined();
      expect(rotatedRefreshCookie).toBeDefined();
      expect(rotatedRefreshCookie).not.toBe(initialRefreshCookie);

      // Verify database: 2 sessions exist (original revoked, successor active)
      const allSessions = await Session.find({}).sort({ createdAt: 1 });
      expect(allSessions).toHaveLength(2);

      const [firstSession, secondSession] = allSessions;
      expect(firstSession.revokedAt).not.toBeNull();
      expect(secondSession.revokedAt).toBeNull();
      expect(secondSession.familyId).toBe(firstSession.familyId); // Same family
    });

    it('REUSE DETECTION: presenting an already-revoked refresh token revokes entire family', async () => {
      // 1. Register & get initial token
      const regRes = await request(app).post('/api/auth/register').send({
        name: 'Reuse Tester',
        email: 'reuse@example.com',
        password: 'Password123!',
      });
      const token1 = extractCookie(regRes, AUTH_CONSTANTS.COOKIE_REFRESH);

      // 2. Legitimate refresh: token1 -> token2
      const refRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_REFRESH}=${token1}`]);
      expect(refRes.status).toBe(200);
      const token2 = extractCookie(refRes, AUTH_CONSTANTS.COOKIE_REFRESH);

      // Verify token2 is active
      const activeSessionsBefore = await Session.find({ revokedAt: null });
      expect(activeSessionsBefore).toHaveLength(1);

      // 3. REPLAY ATTACK: Replay token1 again!
      const replayRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_REFRESH}=${token1}`]);

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.success).toBe(false);
      expect(replayRes.body.error.code).toBe('REFRESH_TOKEN_REUSED');

      // Verify Set-Cookie cleared both cookies
      const setCookie = replayRes.headers['set-cookie'];
      expect(setCookie.some((c) => c.includes(`${AUTH_CONSTANTS.COOKIE_ACCESS}=;`))).toBe(true);
      expect(setCookie.some((c) => c.includes(`${AUTH_CONSTANTS.COOKIE_REFRESH}=;`))).toBe(true);

      // Verify entire family is now revoked in database!
      const activeSessionsAfter = await Session.find({ revokedAt: null });
      expect(activeSessionsAfter).toHaveLength(0);

      // 4. token2 is now also revoked!
      const token2Res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_REFRESH}=${token2}`]);
      expect(token2Res.status).toBe(401);
      expect(token2Res.body.error.code).toBe('REFRESH_TOKEN_REUSED');
    });

    it('rejects invalid or missing refresh token with 401 INVALID_REFRESH', async () => {
      // Missing cookie
      let res = await request(app).post('/api/auth/refresh');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_REFRESH');

      // Invalid token string
      res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_REFRESH}=invalid_jwt_string`]);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_REFRESH');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('revokes the acting session, clears cookies, and is safe & idempotent', async () => {
      const regRes = await request(app).post('/api/auth/register').send({
        name: 'Logout User',
        email: 'logout@example.com',
        password: 'Password123!',
      });
      const refreshCookie = extractCookie(regRes, AUTH_CONSTANTS.COOKIE_REFRESH);

      // 1. Authenticated logout
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_REFRESH}=${refreshCookie}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Cookies cleared
      const setCookie = res.headers['set-cookie'];
      expect(setCookie.some((c) => c.includes(`${AUTH_CONSTANTS.COOKIE_ACCESS}=;`))).toBe(true);
      expect(setCookie.some((c) => c.includes(`${AUTH_CONSTANTS.COOKIE_REFRESH}=;`))).toBe(true);

      // Session in DB marked revoked
      const session = await Session.findOne({});
      expect(session.revokedAt).not.toBeNull();

      // 2. Repeat logout with no cookies (idempotent)
      const repeatRes = await request(app).post('/api/auth/logout');
      expect(repeatRes.status).toBe(200);
      expect(repeatRes.body.success).toBe(true);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 200 with safe user representation when valid access cookie provided', async () => {
      const regRes = await request(app).post('/api/auth/register').send({
        name: 'Me User',
        email: 'me@example.com',
        password: 'Password123!',
      });
      const accessCookie = extractCookie(regRes, AUTH_CONSTANTS.COOKIE_ACCESS);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${accessCookie}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toEqual({
        id: expect.any(String),
        name: 'Me User',
        email: 'me@example.com',
        role: 'buyer',
      });
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('returns 401 UNAUTHORIZED when access cookie is missing or invalid', async () => {
      // Missing
      let res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');

      // Invalid
      res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=invalid.access.token`]);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Role Authorization Middleware (requireRole)', () => {
    let testApp;

    beforeAll(() => {
      testApp = express();
      testApp.use(express.json());

      testApp.get('/admin-only', requireAuth, requireRole('admin'), (req, res) => {
        res.status(200).json({ success: true, message: 'Welcome admin' });
      });

      testApp.get('/agent-or-admin', requireAuth, requireRole('agent', 'admin'), (req, res) => {
        res.status(200).json({ success: true, message: 'Welcome agent/admin' });
      });
    });

    it('forbids buyer from accessing admin-only endpoint (403 FORBIDDEN)', async () => {
      const regRes = await request(app).post('/api/auth/register').send({
        name: 'Buyer User',
        email: 'buyer@example.com',
        password: 'Password123!',
      });
      const accessCookie = extractCookie(regRes, AUTH_CONSTANTS.COOKIE_ACCESS);

      const res = await request(testApp)
        .get('/admin-only')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${accessCookie}`]);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows admin to access admin-only endpoint', async () => {
      // Create admin user in DB directly
      const admin = await User.create({
        name: 'Admin User',
        email: 'admin@homehunt.test',
        passwordHash: 'dummy',
        role: 'admin',
      });

      // Login as admin
      const loginRes = await request(app).post('/api/auth/login').send({
        email: 'admin@homehunt.test',
        password: 'WrongPassword', // will fail, let's create a session via service directly
      });

      // Let's create an admin token directly using the token utility
      const { createAccessToken } = await import('../../src/utils/tokens.js');
      const adminToken = createAccessToken(admin);

      const res = await request(testApp)
        .get('/admin-only')
        .set('Cookie', [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${adminToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Welcome admin');
    });
  });
});
