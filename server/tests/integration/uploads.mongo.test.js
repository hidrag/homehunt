/**
 * S13 — Media, documents & verification lifecycle (service/model level).
 *
 * Real MongoMemoryServer. Exercises media.service against actual Mongoose
 * documents: dual-shape image normalization, the document lifecycle, the
 * verification state machine, mass-assignment guards, and the fake upload
 * provider's byte round-trip. HTTP/auth/IDOR matrices live in
 * uploads.api.test.js; pure gates live in tests/unit/uploadSafety.test.js.
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Property from '../../src/models/Property.js';
import PropertyDocument from '../../src/models/PropertyDocument.js';
import User from '../../src/models/User.js';
import Notification from '../../src/models/Notification.js';
import * as media from '../../src/services/media.service.js';
import propertyService from '../../src/services/property.service.js';
import { publicizeProperty } from '../../src/lib/propertyPresentation.js';
import { fakeUploadProvider } from '../../src/services/upload/fake.provider.js';

let mongo;

const pad = (head, total = 32) => Buffer.concat([Buffer.from(head), Buffer.alloc(Math.max(0, total - head.length))]);
const JPEG = pad([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF = pad(Buffer.from('%PDF-1.7'));

const imageFile = (name = 'photo.jpg') => ({ buffer: JPEG, mimetype: 'image/jpeg', originalname: name });
const docFile = (name = 'deed.pdf') => ({ buffer: PDF, mimetype: 'application/pdf', originalname: name });

const agentId = new mongoose.Types.ObjectId();
const adminId = new mongoose.Types.ObjectId();

const newProperty = (overrides = {}) =>
  Property.create({
    title: 'S13 home',
    description: 'A suitable test home for the S13 media lifecycle suite.',
    price: 100,
    propertyType: 'house',
    listingType: 'sale',
    location: { type: 'Point', coordinates: [77, 12] },
    address: { street: '1', city: 'B', state: 'K', zipCode: '1', country: 'India' },
    agent: agentId,
    ...overrides,
  });

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_PROVIDER = 'fake';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Property.init();
  await PropertyDocument.init();
  await Notification.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await Property.deleteMany({});
  await PropertyDocument.deleteMany({});
  await fakeUploadProvider.uploads.clear();
});

describe('S13 images — dual shape + provider references', () => {
  it('normalizes legacy URL strings to objects with a stable imageId', async () => {
    const property = await newProperty({ images: ['https://a.com/1.jpg', 'https://a.com/2.jpg'] });
    expect(property.images).toHaveLength(2);
    for (const img of property.images) {
      expect(typeof img.url).toBe('string');
      expect(img.url).toMatch(/^https:\/\//);
      expect(typeof img.imageId).toBe('string');
      expect(img.imageId).toMatch(/^[0-9a-f]{12,32}$/);
    }
    expect(property.images[0].imageId).not.toBe(property.images[1].imageId);
  });

  it('public read surfaces still return plain URL strings in order (S3 contract)', async () => {
    const property = await newProperty({ images: ['https://a.com/1.jpg', 'https://a.com/2.jpg'] });
    const publicDoc = await propertyService.getPropertyById(String(property._id));
    expect(publicDoc.images).toEqual(['https://a.com/1.jpg', 'https://a.com/2.jpg']);
    expect(publicizeProperty({ images: [{ url: 'https://x/y.jpg' }, 'https://z/w.jpg'] }).images).toEqual([
      'https://x/y.jpg',
      'https://z/w.jpg',
    ]);
  });

  it('appends uploaded images, storing provider id and a real placeholder url', async () => {
    const property = await newProperty();
    const result = await media.addImages(property, [imageFile('a.jpg'), imageFile('b.jpg')]);
    expect(result.images).toHaveLength(2);
    for (const img of result.images) {
      expect(img.publicId).toMatch(/^fake\//);
      expect(img.url).toMatch(/^https:\/\//);
      expect(img.imageId).toMatch(/^[0-9a-f]{12,32}$/);
    }
    const reloaded = await Property.findById(property._id);
    expect(reloaded.images).toHaveLength(2);
  });

  it('removes an image by imageId and best-effort destroys the provider asset', async () => {
    const property = await newProperty();
    const { images } = await media.addImages(property, [imageFile()]);
    const { imageId, publicId } = images[0];
    expect(fakeUploadProvider.uploads.has(publicId)).toBe(true);

    const removed = await media.removeImage(property, imageId);
    expect(removed).toEqual({ deleted: true });
    const reloaded = await Property.findById(property._id);
    expect(reloaded.images).toHaveLength(0);
    expect(fakeUploadProvider.uploads.has(publicId)).toBe(false);
  });

  it('rejects an unknown or malformed image id', async () => {
    const property = await newProperty({ images: ['https://a.com/1.jpg'] });
    await expect(media.removeImage(property, 'not-a-valid-id!!')).rejects.toMatchObject({ status: 400 });
    await expect(media.removeImage(property, 'abcdef123456')).rejects.toMatchObject({ status: 404 });
  });

  it('enforces the 20-image per-property cap', async () => {
    const property = await newProperty();
    await media.addImages(property, Array.from({ length: 20 }, (_, i) => imageFile(`p${i}.jpg`)));
    await expect(media.addImages(property, [imageFile('overflow.jpg')])).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects empty uploads', async () => {
    const property = await newProperty();
    await expect(media.addImages(property, [])).rejects.toMatchObject({ status: 400 });
  });
});

describe('S13 documents — lifecycle + byte delivery', () => {
  it('stores document metadata (server-derived mime) and lists it', async () => {
    const property = await newProperty();
    const { documents } = await media.addDocuments(property, agentId, [docFile('title-deed.pdf')]);
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      fileName: 'title-deed.pdf',
      mimeType: 'application/pdf',
      kind: 'verification',
    });
    expect(documents[0].byteSize).toBe(PDF.length);
    expect(documents[0].id).toBeDefined();

    const row = await PropertyDocument.findOne({ property: property._id });
    expect(row.status).toBe('active');
    expect(row.provider).toBe('fake');
    expect(String(row.uploadedBy)).toBe(String(agentId));
  });

  it('delivers bytes through the provider seam (fake -> in-band stream)', async () => {
    const property = await newProperty();
    const { documents } = await media.addDocuments(property, agentId, [docFile()]);
    const delivery = await media.getDocumentDelivery(property, documents[0].id);
    expect(delivery.redirect).toBeUndefined();
    expect(delivery.stream.mimeType).toBe('application/pdf');
    expect(Buffer.compare(delivery.stream.Buffer, PDF)).toBe(0);
  });

  it('soft-deletes a document and refuses delivery afterwards', async () => {
    const property = await newProperty();
    const { documents } = await media.addDocuments(property, agentId, [docFile()]);
    await media.removeDocument(property, documents[0].id);

    const row = await PropertyDocument.findById(documents[0].id);
    expect(row.status).toBe('removed');
    await expect(media.getDocumentDelivery(property, documents[0].id)).rejects.toMatchObject({ status: 404 });
    const listed = await media.listDocuments(property);
    expect(listed.documents).toHaveLength(0);
  });

  it('scopes document lookups to the property (cross-property id is a 404)', async () => {
    const propertyA = await newProperty({ title: 'A' });
    const propertyB = await newProperty({ title: 'B' });
    const { documents } = await media.addDocuments(propertyA, agentId, [docFile()]);
    await expect(media.getDocumentDelivery(propertyB, documents[0].id)).rejects.toMatchObject({ status: 404 });
  });

  it('rejects a malformed document id with INVALID_ID', async () => {
    const property = await newProperty();
    await expect(media.getDocumentDelivery(property, 'nope')).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_ID',
    });
  });

  it('enforces the 10-active-document cap', async () => {
    const property = await newProperty();
    await media.addDocuments(property, agentId, Array.from({ length: 10 }, (_, i) => docFile(`d${i}.pdf`)));
    await expect(media.addDocuments(property, agentId, [docFile('extra.pdf')])).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('S13 verification state machine', () => {
  it('requires at least one active document to request verification', async () => {
    const property = await newProperty();
    await expect(media.requestVerification(property)).rejects.toMatchObject({ status: 400 });
    expect(property.verificationStatus).toBe('unverified');
  });

  it('transitions unverified -> pending once a document exists', async () => {
    const property = await newProperty();
    await media.addDocuments(property, agentId, [docFile()]);
    const result = await media.requestVerification(property);
    expect(result.verificationStatus).toBe('pending');
  });

  it('rejects a duplicate submission while already pending', async () => {
    const property = await newProperty();
    await media.addDocuments(property, agentId, [docFile()]);
    await media.requestVerification(property);
    await expect(media.requestVerification(property)).rejects.toMatchObject({ status: 409 });
  });

  it('admin approval sets verified + server-derived audit fields and notifies the agent', async () => {
    const property = await newProperty();
    await media.addDocuments(property, agentId, [docFile()]);
    await media.requestVerification(property);

    const decided = await media.decideVerification(property, adminId, { decision: 'approve' });
    expect(decided.verificationStatus).toBe('verified');
    expect(decided.verifiedAt).toBeInstanceOf(Date);
    expect(String(decided.verifiedBy)).toBe(String(adminId));
    expect(decided.rejectionReason).toBeNull();

    // notification is fire-and-forget; await a tick for the insert.
    await new Promise((r) => setTimeout(r, 25));
    const note = await Notification.findOne({ recipient: agentId, type: 'verification_update' });
    expect(note).not.toBeNull();
    expect(note.title).toMatch(/verified/i);
  });

  it('rejection requires a reason and records it', async () => {
    const property = await newProperty();
    await media.addDocuments(property, agentId, [docFile()]);
    await media.requestVerification(property);

    await expect(media.decideVerification(property, adminId, { decision: 'reject' })).rejects.toMatchObject({
      status: 400,
    });
    const decided = await media.decideVerification(property, adminId, { decision: 'reject', reason: 'Illegible deed' });
    expect(decided.verificationStatus).toBe('rejected');
    expect(decided.rejectionReason).toBe('Illegible deed');
    expect(decided.verifiedAt).toBeNull();
  });

  it('only decides from pending (unverified/verified are 409)', async () => {
    const property = await newProperty();
    await expect(media.decideVerification(property, adminId, { decision: 'approve' })).rejects.toMatchObject({
      status: 409,
    });
  });

  it('a rejected listing can resubmit; a verified listing resets to pending on resubmit', async () => {
    const property = await newProperty();
    await media.addDocuments(property, agentId, [docFile()]);
    await media.requestVerification(property);
    await media.decideVerification(property, adminId, { decision: 'reject', reason: 'Blurry scan' });

    const resubmitted = await media.requestVerification(property);
    expect(resubmitted.verificationStatus).toBe('pending');
    expect(resubmitted.rejectionReason).toBeNull();

    await media.decideVerification(property, adminId, { decision: 'approve' });
    expect(property.verificationStatus).toBe('verified');
    const again = await media.requestVerification(property);
    expect(again.verificationStatus).toBe('pending');
    expect(again.verifiedAt).toBeNull();
  });

  it('lists the pending queue with a document count and agent summary', async () => {
    const property = await newProperty();
    await media.addDocuments(property, agentId, [docFile(), docFile('two.pdf')]);
    await media.requestVerification(property);

    const { verifications, pagination } = await media.listPendingVerifications(1, 10);
    expect(pagination.total).toBe(1);
    expect(verifications[0].documentCount).toBe(2);
    expect(verifications[0].verificationStatus).toBe('pending');
  });

  it('an invalid decision value is rejected', async () => {
    const property = await newProperty();
    await media.addDocuments(property, agentId, [docFile()]);
    await media.requestVerification(property);
    await expect(media.decideVerification(property, adminId, { decision: 'maybe' })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('S13 mass-assignment guards', () => {
  it('ignores client-supplied verification fields on create', async () => {
    const created = await propertyService.createProperty(String(agentId), {
      title: 'Guarded',
      description: 'A property that attempts to self-verify on creation.',
      price: 100,
      propertyType: 'house',
      listingType: 'sale',
      location: { type: 'Point', coordinates: [77, 12] },
      address: { street: '1', city: 'B', state: 'K', zipCode: '1' },
      verificationStatus: 'verified',
      verifiedAt: new Date(),
      verifiedBy: adminId,
      rejectionReason: 'x',
    });
    expect(created.verificationStatus).toBe('unverified');
    expect(created.verifiedAt).toBeNull();
    expect(created.verifiedBy).toBeNull();
  });

  it('ignores client-supplied verification fields on update', async () => {
    const property = await newProperty();
    const updated = await propertyService.updateProperty(property, {
      title: 'Updated title',
      verificationStatus: 'verified',
      verifiedBy: adminId,
    });
    expect(updated.title).toBe('Updated title');
    expect(updated.verificationStatus).toBe('unverified');
  });

  it('normalizes a valid virtual tour url and rejects an unlisted host on create', async () => {
    const base = {
      title: 'Tour',
      description: 'A property carrying a virtual tour link for validation.',
      price: 100,
      propertyType: 'house',
      listingType: 'sale',
      location: { type: 'Point', coordinates: [77, 12] },
      address: { street: '1', city: 'B', state: 'K', zipCode: '1' },
    };
    const created = await propertyService.createProperty(String(agentId), {
      ...base,
      virtualTourUrl: 'https://youtu.be/dQw4w9WgXcQ',
    });
    expect(created.virtualTourUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');

    // Explicit null clears the tour (docs/05 contract).
    const cleared = await propertyService.updateProperty(
      await Property.findById(created._id),
      { virtualTourUrl: null },
    );
    expect(cleared.virtualTourUrl).toBeNull();

    await expect(
      propertyService.createProperty(String(agentId), { ...base, virtualTourUrl: 'https://evil.tld/tour' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });
});
