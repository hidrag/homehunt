/**
 * S12 - Deterministic POI seed (ADR-033).
 *
 * Generates the internal `pois` dataset WITHOUT any runtime external
 * dependency: names are derived from the seeded properties' own addresses
 * and laid out on a FIXED offset table, so two consecutive runs produce
 * byte-identical data. Overpass/OSM may be used OFFLINE by a developer to
 * enrich this dataset; nothing here (and nothing in src/) ever calls a POI
 * API (locked decision 1).
 *
 * Runs inside the properties seed chain AFTER properties are inserted: it
 * reads the persisted listings from the DB so POIs always cluster around
 * the real seeded ("13 seeded cities") listing coordinates by construction.
 *
 * ISOLATED_CITIES listings are deliberately left with ZERO POIs within the
 * maximum query radius (10 km) - that is the rural/empty-state fixture for
 * automated and manual QA (locked decision: one isolated coordinate must
 * exist).
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

import Poi from '../../src/models/Poi.js';
import Property from '../../src/models/Property.js';

// Seeded listings in these cities stay POI-free (isolated demo locale).
export const ISOLATED_CITIES = ['goa'];

// Per-category name suffixes, chosen by per-category occurrence index.
export const NAME_SUFFIXES = {
  transit: ['Metro Station', 'Bus Stand'],
  school: ['Public School', 'International School'],
  grocery: ['Super Market', 'Grocery Store'],
  healthcare: ['Community Hospital', 'Medical Centre'],
  park: ['City Park', 'Garden & Jogging Track'],
};

// 8 POIs per non-isolated listing: category density ordered like the
// ADR-034 score weights (transit and school appear twice, park once).
export const POI_CATEGORY_CYCLE = [
  'transit',
  'school',
  'grocery',
  'healthcare',
  'park',
  'transit',
  'school',
  'grocery',
];

// Fixed east/north offset table in metres - deterministic layout ring.
const OFFSETS_M = [
  [250, 150],
  [-400, -250],
  [600, -350],
  [-150, 550],
  [750, 300],
  [-650, 450],
  [300, -800],
  [-850, -600],
];

const METRES_PER_DEGREE_LAT = 111320;

/**
 * Pure generator: POI documents for one property location. No I/O and no
 * shared state - byte-deterministic for identical input.
 * @param {{ address: { street?: string, city?: string }, location: { coordinates: [number, number] } }} property
 * @returns {Array<Object>} Poi-ready documents
 */
export const generatePoisForProperty = (property) => {
  const [lng, lat] = property.location.coordinates;
  const locality = (property.address?.street || property.address?.city || 'Central').trim();
  const city = (property.address?.city || '').toLowerCase().trim();
  const cosLat = Math.max(0.01, Math.cos((lat * Math.PI) / 180));

  const occurrence = {};
  return POI_CATEGORY_CYCLE.map((category, i) => {
    const n = occurrence[category] || 0;
    occurrence[category] = n + 1;
    const suffixes = NAME_SUFFIXES[category];
    const suffix = suffixes[n % suffixes.length];
    const [east, north] = OFFSETS_M[i % OFFSETS_M.length];
    const dLat = north / METRES_PER_DEGREE_LAT;
    const dLng = east / (METRES_PER_DEGREE_LAT * cosLat);
    return {
      name: `${locality} ${suffix}`,
      category,
      location: {
        type: 'Point',
        coordinates: [
          Math.round((lng + dLng) * 1e6) / 1e6,
          Math.round((lat + dLat) * 1e6) / 1e6,
        ],
      },
      address: `${locality}, ${property.address?.city || 'India'}`,
      city,
    };
  });
};

/**
 * Clear + regenerate the whole pois collection from the persisted seeded
 * properties. Safe to re-run (idempotent): deletes then bulk-inserts.
 */
export const seedPois = async () => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed development POIs in production environment.');
  }

  await Poi.init();

  const properties = await Property.find({})
    .select('title address location')
    .sort({ _id: 1 })
    .lean();

  if (properties.length === 0) {
    console.warn('No properties found - skipping POI seed (seed properties first).');
    return 0;
  }

  const cores = properties.filter(
    (p) => !ISOLATED_CITIES.includes((p.address?.city || '').toLowerCase().trim()),
  );

  const docs = cores.flatMap((property) => generatePoisForProperty(property));

  // Deterministic dedupe on the identity triple (rings of very close
  // listings could otherwise produce duplicate-feeling markers).
  const seen = new Set();
  const unique = docs.filter((doc) => {
    const key = `${doc.name}|${doc.category}|${doc.location.coordinates.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await Poi.deleteMany({});
  await Poi.insertMany(unique);
  console.log(
    `Successfully seeded ${unique.length} deterministic POIs around ${cores.length} listing cores (${ISOLATED_CITIES.join('/')} listings intentionally POI-free).`,
  );
  return unique.length;
};

export default seedPois;

// Standalone CLI replays only the POI layer against the current DB.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const DB_URI = process.env.MONGODB_URI;
  if (!DB_URI) {
    console.error('MONGODB_URI is not defined in environment variables. Cannot seed POIs.');
    process.exit(1);
  }
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(DB_URI);
    const count = await seedPois();
    console.log(`POI seeding complete (${count} documents).`);
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error seeding POIs:', error);
    process.exit(1);
  }
}
