/**
 * S13 — Media & verification HTTP contract suite (own app instance,
 * rate-budgeted: the app-wide limiter allows 100 requests per module
 * instance per 15 minutes).
 *
 * Covers: authentication gates, the 404-not-403 IDOR rule for documents
 * and document content, multipart uploads via supertest .attach(),
 * oversize (413) and invalid-type (400) rejection, ownership-scoped image
 * listing, and the admin verification moderation flow.
 *
 * Service-level semantics live in uploads.mongo.test.js; pure gates live in
 * tests/unit/uploadSafety.test.js.
 */
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../../src/app.js';
import User from '../../src/models/User.js';
import Property from '../../src/models/Property.js';
import PropertyDocument from '../../src/models/PropertyDocument.js';
import { AUTH_CONSTANTS } from '../../src/config/auth.js';
import { createAccessToken } from '../../src/utils/tokens.js';
import { fakeUploadProvider } from '../../src/services/upload/fake.provider.js';

let mongo;

const pad = (head, total = 32) => Buffer.concat([Buffer.from(head), Buffer.alloc(Math.max(0, total - head.length))]);
const JPEG = pad([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PDF = pad(Buffer.from('%PDF-1.7'));
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

const cookie = (token) => [`${AUTH_CONSTANTS.COOKIE_ACCESS}=${token}`];

const propertyData = (agent) => ({
  title: 'S13 API home',
  description: 'A suitable test home for the S13 HTTP contract suite.',
  price: 100,
  propertyType: 'house',
  listingType: 'sale',
  location: { type: 'Point', coordinates: [77, 12] },
  address: { street: '1', city: 'B', state: 'K', zipCode: '1', country: 'India' },
  agent,
});

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_PROVIDER = 'fake';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-minimum-32-chars-long-12345';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-chars-long-12345';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
  await Property.init();
  await PropertyDocument.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe('S13 Media & verification — HTTP API', () => {
  let agent, otherAgent, buyer, admin;
  let agentCookie, otherAgentCookie, buyerCookie, adminCookie;
  let property, otherProperty;
  let documentId;

  const makeUser = async (role, tag) => {
    const user = await User.create({
      name: `S13 ${tag}`,
      email: `s13-${tag}-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
      role,
    });
    return { user, token: createAccessToken(user) };
  };

  beforeEach(async () => {
    await User.deleteMany({});
    await Property.deleteMany({});
    await PropertyDocument.deleteMany({});
    fakeUploadProvider.uploads.clear();

    const a = await makeUser('agent', 'owner');
    const o = await makeUser('agent', 'other');
    const b = await makeUser('buyer', 'buyer');
    const m = await makeUser('admin', 'admin');
    agent = a.user; agentCookie = cookie(a.token);
    otherAgent = o.user; otherAgentCookie = cookie(o.token);
    buyer = b.user; buyerCookie = cookie(b.token);
    admin = m.user; adminCookie = cookie(m.token);

    property = await Property.create(propertyData(agent._id));
    otherProperty = await Property.create({ ...propertyData(otherAgent._id), title: 'Other home' });

    // Seed one document directly so the content/IDOR tests have a target.
    const upload = await request(app)
      .post(`/api/properties/${property._id}/documents`)
      .set('Cookie', agentCookie)
      .attach('files', PDF, 'deed.pdf');
    documentId = upload.body?.data?.documents?.[0]?.id;
  });

  // --- authentication gate (3 requests) ---
  it('requires authentication for every media endpoint', async () => {
    expect((await request(app).get(`/api/properties/${property._id}/images`)).status).toBe(401);
    expect((await request(app).get(`/api/properties/${property._id}/documents`)).status).toBe(401);
    expect((await request(app).post(`/api/properties/${property._id}/documents`)).status).toBe(401);
  });

  // --- images: upload / list / IDOR / delete (6 requests) ---
  it('lets the owning agent upload, list and delete images', async () => {
    const upload = await request(app)
      .post(`/api/properties/${property._id}/images`)
      .set('Cookie', agentCookie)
      .attach('files', JPEG, 'a.jpg')
      .attach('files', JPEG, 'b.jpg');
    expect(upload.status).toBe(201);
    expect(upload.body.data.images).toHaveLength(2);
    const { imageId } = upload.body.data.images[0];
    expect(imageId).toMatch(/^[0-9a-f]{12,32}$/);

    const list = await request(app).get(`/api/properties/${property._id}/images`).set('Cookie', agentCookie);
    expect(list.status).toBe(200);
    expect(list.body.data.images).toHaveLength(2);

    const del = await request(app)
      .delete(`/api/properties/${property._id}/images/${imageId}`)
      .set('Cookie', agentCookie);
    expect(del.status).toBe(200);

    const list2 = await request(app).get(`/api/properties/${property._id}/images`).set('Cookie', agentCookie);
    expect(list2.body.data.images).toHaveLength(1);
  });

  it('hides another agent\'s and a buyer\'s images behind 404', async () => {
    const other = await request(app).get(`/api/properties/${property._id}/images`).set('Cookie', otherAgentCookie);
    expect(other.status).toBe(404);
    const asBuyer = await request(app).get(`/api/properties/${property._id}/images`).set('Cookie', buyerCookie);
    expect(asBuyer.status).toBe(404);
    const asAdmin = await request(app).get(`/api/properties/${property._id}/images`).set('Cookie', adminCookie);
    expect(asAdmin.status).toBe(200);
  });

  it('rejects an invalid image id format on delete', async () => {
    const res = await request(app)
      .delete(`/api/properties/${property._id}/images/not-valid!!`)
      .set('Cookie', agentCookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // --- documents: IDOR 404 + content delivery (5 requests) ---
  it('returns 404 for another agent and a buyer on document metadata + content', async () => {
    for (const [c] of [[otherAgentCookie], [buyerCookie]]) {
      expect((await request(app).get(`/api/properties/${property._id}/documents`).set('Cookie', c)).status).toBe(404);
      expect(
        (await request(app).get(`/api/properties/${property._id}/documents/${documentId}/content`).set('Cookie', c)).status,
      ).toBe(404);
    }
    // admin is allowed to read
    expect((await request(app).get(`/api/properties/${property._id}/documents`).set('Cookie', adminCookie)).status).toBe(200);
  });

  it('streams the document bytes to the owner with attachment disposition', async () => {
    const res = await request(app)
      .get(`/api/properties/${property._id}/documents/${documentId}/content`)
      .set('Cookie', agentCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });

  // --- upload safety at the HTTP boundary (3 requests) ---
  it('rejects an SVG (mismatched/unsupported type) with 400', async () => {
    const res = await request(app)
      .post(`/api/properties/${property._id}/documents`)
      .set('Cookie', agentCookie)
      .attach('files', SVG, { filename: 'evil.svg', contentType: 'image/svg+xml' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('rejects an oversize document with 413 FILE_TOO_LARGE', async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1024, 0);
    PDF.copy(big, 0);
    const res = await request(app)
      .post(`/api/properties/${property._id}/documents`)
      .set('Cookie', agentCookie)
      .attach('files', big, 'big.pdf');
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('rejects a JPEG whose declared type is spoofed as a PDF', async () => {
    const res = await request(app)
      .post(`/api/properties/${property._id}/documents`)
      .set('Cookie', agentCookie)
      .attach('files', JPEG, { filename: 'spoof.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  // --- request-verification (3 requests) ---
  it('agent submits for verification; a listing without documents cannot', async () => {
    const noDocs = await request(app)
      .post(`/api/properties/${otherProperty._id}/request-verification`)
      .set('Cookie', otherAgentCookie);
    expect(noDocs.status).toBe(400);

    const ok = await request(app)
      .post(`/api/properties/${property._id}/request-verification`)
      .set('Cookie', agentCookie);
    expect(ok.status).toBe(200);
    expect(ok.body.data.property.verificationStatus).toBe('pending');

    const dup = await request(app)
      .post(`/api/properties/${property._id}/request-verification`)
      .set('Cookie', agentCookie);
    expect(dup.status).toBe(409);
  });

  it('a buyer cannot submit a property for verification (role gate)', async () => {
    const res = await request(app)
      .post(`/api/properties/${property._id}/request-verification`)
      .set('Cookie', buyerCookie);
    expect(res.status).toBe(403);
  });

  // --- admin moderation (5 requests) ---
  it('drives the admin verification queue and approval end-to-end', async () => {
    await request(app).post(`/api/properties/${property._id}/request-verification`).set('Cookie', agentCookie);

    const queue = await request(app).get('/api/admin/verifications').set('Cookie', adminCookie);
    expect(queue.status).toBe(200);
    expect(queue.body.data.verifications.some((v) => String(v._id) === String(property._id))).toBe(true);
    const entry = queue.body.data.verifications.find((v) => String(v._id) === String(property._id));
    expect(entry.documentCount).toBe(1);

    const approve = await request(app)
      .patch(`/api/admin/properties/${property._id}/verification`)
      .set('Cookie', adminCookie)
      .send({ decision: 'approve' });
    expect(approve.status).toBe(200);
    expect(approve.body.data.property.verificationStatus).toBe('verified');

    const queueAfter = await request(app).get('/api/admin/verifications').set('Cookie', adminCookie);
    expect(queueAfter.body.data.verifications.some((v) => String(v._id) === String(property._id))).toBe(false);
  });

  it('rejects a decision without a reason and blocks non-admins', async () => {
    await request(app).post(`/api/properties/${property._id}/request-verification`).set('Cookie', agentCookie);

    const noReason = await request(app)
      .patch(`/api/admin/properties/${property._id}/verification`)
      .set('Cookie', adminCookie)
      .send({ decision: 'reject' });
    expect(noReason.status).toBe(400);

    const asAgent = await request(app)
      .patch(`/api/admin/properties/${property._id}/verification`)
      .set('Cookie', agentCookie)
      .send({ decision: 'approve' });
    expect(asAgent.status).toBe(403);
  });
});
