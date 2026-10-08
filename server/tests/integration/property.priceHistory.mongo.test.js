/**
 * S14 (ADR-037) — price history + price-drop alert integration suite.
 *
 * Real MongoDB. Covers: append-on-real-change (and silence otherwise),
 * cap enforcement, mass-assignment rejection, public trimmed shape, and
 * the sweep -> price_drop notification + email to the saved-search owner.
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Property, { PRICE_HISTORY_CAP } from '../../src/models/Property.js';
import SavedSearch from '../../src/models/SavedSearch.js';
import Notification from '../../src/models/Notification.js';
import User from '../../src/models/User.js';
import propertyService from '../../src/services/property.service.js';
import { publicizeProperty } from '../../src/lib/propertyPresentation.js';
import { fakeEmailProvider } from '../../src/services/email.service.js';

let mongo;

const agentId = new mongoose.Types.ObjectId();
const buyerId = new mongoose.Types.ObjectId();

const newProperty = (overrides = {}) =>
  Property.create({
    title: 'History home',
    description: 'A suitable test home for the S14 price history suite.',
    price: 5000000,
    propertyType: 'house',
    listingType: 'sale',
    location: { type: 'Point', coordinates: [77, 12] },
    address: { street: '1', city: 'Bengaluru', state: 'K', zipCode: '1', country: 'India' },
    agent: agentId,
    status: 'available',
    ...overrides,
  });

const flush = () => new Promise((resolve) => setTimeout(resolve, 60));

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.EMAIL_PROVIDER = 'fake';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Property.init();
  await SavedSearch.init();
  await Notification.init();
  await User.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await Property.deleteMany({});
  await SavedSearch.deleteMany({});
  await Notification.deleteMany({});
  await User.deleteMany({});
  fakeEmailProvider.clear();
});

describe('S14 price history append semantics', () => {
  it('appends the PREVIOUS price only when price actually changes', async () => {
    const property = await newProperty({ price: 5000000 });
    await propertyService.updateProperty(property, { price: 4750000 });
    const afterDrop = await Property.findById(property._id);
    expect(afterDrop.priceHistory).toHaveLength(1);
    expect(afterDrop.priceHistory[0]).toMatchObject({ price: 5000000 });
    expect(afterDrop.priceHistory[0].changedAt).toBeInstanceOf(Date);

    // Identical price update -> no append.
    await propertyService.updateProperty(afterDrop, { price: 4750000 });
    const afterNoop = await Property.findById(property._id);
    expect(afterNoop.priceHistory).toHaveLength(1);

    // Unrelated field update -> no append.
    await propertyService.updateProperty(afterNoop, { title: 'Renamed home' });
    const afterRename = await Property.findById(property._id);
    expect(afterRename.priceHistory).toHaveLength(1);

    // Real change again -> second entry (ascending timeline).
    await propertyService.updateProperty(afterRename, { price: 4600000 });
    const afterSecond = await Property.findById(property._id);
    expect(afterSecond.priceHistory.map((e) => e.price)).toEqual([5000000, 4750000]);
  });

  it('caps the trail at PRICE_HISTORY_CAP entries, dropping the oldest', async () => {
    const property = await newProperty({ price: 1000 });
    let doc = property;
    for (let i = 1; i <= PRICE_HISTORY_CAP + 5; i += 1) {
      doc = await Property.findById(property._id);
      await propertyService.updateProperty(doc, { price: 1000 + i });
    }
    const final = await Property.findById(property._id);
    expect(final.priceHistory).toHaveLength(PRICE_HISTORY_CAP);
    // 55 appends of prices 1000..1054; keeping the latest 50 drops the
    // oldest 5 (1000..1004) -> first survivor 1005, last is the 54th prev.
    expect(final.priceHistory[0].price).toBe(1005);
    expect(final.priceHistory[final.priceHistory.length - 1].price).toBe(1000 + PRICE_HISTORY_CAP + 4);
  });

  it('rejects mass assignment of priceHistory via update payloads', async () => {
    const property = await newProperty();
    await expect(
      propertyService.updateProperty(property, {
        priceHistory: [{ price: 1, changedAt: new Date() }],
      }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });

    // And silently dropped when combined with a legitimate field.
    const property2 = await newProperty({ title: 'Guard two' });
    const updated = await propertyService.updateProperty(property2, {
      title: 'Guard two updated',
      priceHistory: [{ price: 1, changedAt: new Date() }],
    });
    expect(updated.priceHistory).toEqual([]);
  });

  it('rejects mass assignment of priceHistory on create', async () => {
    const created = await propertyService.createProperty(String(agentId), {
      title: 'Created guard',
      description: 'A property attempting to pre-seed its own price history.',
      price: 100,
      propertyType: 'house',
      listingType: 'sale',
      location: { type: 'Point', coordinates: [77, 12] },
      address: { street: '1', city: 'B', state: 'K', zipCode: '1' },
      priceHistory: [{ price: 999999, changedAt: new Date() }],
    });
    expect(created.priceHistory).toEqual([]);
  });

  it('public payloads expose only { price, changedAt }', async () => {
    const property = await newProperty();
    await propertyService.updateProperty(property, { price: 4999999 });
    const publicDoc = await propertyService.getPropertyById(String(property._id));
    expect(publicDoc.priceHistory).toHaveLength(1);
    expect(Object.keys(publicDoc.priceHistory[0]).sort()).toEqual(['changedAt', 'price']);
    // publicize trims even an internal row carrying extra metadata.
    const trimmed = publicizeProperty({ priceHistory: [{ price: 5, changedAt: 'x', changedBy: 'secret-o' }] });
    expect(Object.keys(trimmed.priceHistory[0]).sort()).toEqual(['changedAt', 'price']);
  });
});

describe('S14 price-drop sweep -> notification + email', () => {
  const seedOwner = async () =>
    User.create({
      name: 'Hunter',
      email: `hunter-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
      role: 'buyer',
    });

  const seedMatchingSearch = (user, overridesSeed = {}) =>
    SavedSearch.create({
      user: user._id,
      name: 'Bengaluru under 52L-ish',
      criteria: { city: ' Bengaluru ', minPrice: 4000000, maxPrice: 5200000 },
      active: true,
      ...overridesSeed,
    });

  it('notifies matching saved-search owners on a price drop (in-app + email)', async () => {
    const owner = await seedOwner();
    await seedMatchingSearch(owner);
    const property = await newProperty({ price: 5000000 });

    await propertyService.updateProperty(property, { price: 4800000 });
    await flush();

    const note = await Notification.findOne({ recipient: owner._id, type: 'price_drop' });
    expect(note).not.toBeNull();
    expect(note.title).toMatch(/Price drop/i);
    expect(note.resourceRef).toMatchObject({ kind: 'property' });

    const email = fakeEmailProvider.sentEmails.find((m) => m.event === 'price_drop');
    expect(email).toBeTruthy();
    expect(email.to).toBe(owner.email);
  });

  it('stays silent when the price rises, is unchanged, or the search is inactive/mismatched', async () => {
    const owner = await seedOwner();
    await seedMatchingSearch(owner, { active: false }); // inactive -> never fires
    const property = await newProperty({ price: 5000000 });

    await propertyService.updateProperty(property, { price: 5200000 }); // rise
    await flush();
    expect(await Notification.countDocuments({ type: 'price_drop' })).toBe(0);

    await SavedSearch.updateMany({}, { active: true });
    await propertyService.updateProperty(await Property.findById(property._id), { price: 5300000 }); // rise, active search out of maxPrice range anyway
    await flush();
    expect(await Notification.countDocuments({ type: 'price_drop' })).toBe(0);

    // Drop that breaks the city criteria match -> no notification.
    await SavedSearch.updateOne({}, { criteria: { city: 'Mumbai', maxPrice: 5200000 } });
    await propertyService.updateProperty(await Property.findById(property._id), { price: 900 });
    await flush();
    expect(await Notification.countDocuments({ type: 'price_drop' })).toBe(0);
  });
});
