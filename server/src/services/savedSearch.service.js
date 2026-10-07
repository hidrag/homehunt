/**
 * Saved-search service (S10, ADR-029).
 *
 * Criteria are stored as TYPED, whitelisted sub-fields — never Mongo query
 * fragments. Every value is re-validated at save time; the Mongo filter is
 * rebuilt from the typed fields at every execution through the shared
 * `lib/propertyFilters.js` builder, so an out-of-band tampered document
 * still cannot yield an operator-shaped query.
 */
import mongoose from 'mongoose';
import SavedSearch from '../models/SavedSearch.js';
import propertyService from './property.service.js';
import {
  buildPropertyFilter,
  resolveSort,
  buildCanonicalQuery,
  PROPERTY_TYPES,
  LISTING_TYPES,
  SORT_OPTIONS,
} from '../lib/propertyFilters.js';

const fail = (status, code, message) => { throw { status, code, message }; };

const MAX_ACTIVE_PER_USER = 20;

const validateName = (value) => {
  if (typeof value !== 'string' || !value.trim()) fail(400, 'VALIDATION_ERROR', 'Name is required');
  const trimmed = value.trim();
  if (trimmed.length > 80) fail(400, 'VALIDATION_ERROR', 'Name cannot exceed 80 characters');
  return trimmed;
};

const validateFrequency = (value) => {
  if (value === 'daily') fail(400, 'VALIDATION_ERROR', 'Daily digest is not supported in this version');
  if (value !== 'instant') fail(400, 'VALIDATION_ERROR', "Frequency must be 'instant'");
  return value;
};

/**
 * Whitelist + type validation for raw criteria input. Unknown keys are
 * silently ignored (never stored). Operator-shaped values (objects/arrays)
 * fail the per-key type checks — this is the injection guard.
 */
const validateCriteria = (raw) => {
  if (raw === undefined || raw === null) fail(400, 'VALIDATION_ERROR', 'Criteria is required');
  if (typeof raw !== 'object' || Array.isArray(raw)) fail(400, 'VALIDATION_ERROR', 'Criteria must be an object');

  const criteria = {};

  const optionalString = (key, max) => {
    const value = raw[key];
    if (value === undefined || value === null || value === '') return;
    if (typeof value !== 'string') fail(400, 'VALIDATION_ERROR', `${key} must be a string`);
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed.length > max) fail(400, 'VALIDATION_ERROR', `${key} cannot exceed ${max} characters`);
    criteria[key] = trimmed;
  };

  optionalString('search', 100);
  optionalString('city', 100);

  if (raw.propertyType !== undefined && raw.propertyType !== null && raw.propertyType !== '') {
    if (typeof raw.propertyType !== 'string' || !PROPERTY_TYPES.includes(raw.propertyType.trim())) {
      fail(400, 'VALIDATION_ERROR', `propertyType must be one of: ${PROPERTY_TYPES.join(', ')}`);
    }
    criteria.propertyType = raw.propertyType.trim();
  }

  if (raw.listingType !== undefined && raw.listingType !== null && raw.listingType !== '') {
    if (typeof raw.listingType !== 'string' || !LISTING_TYPES.includes(raw.listingType.trim())) {
      fail(400, 'VALIDATION_ERROR', `listingType must be one of: ${LISTING_TYPES.join(', ')}`);
    }
    criteria.listingType = raw.listingType.trim();
  }

  const optionalNumber = (key, { integer = false } = {}) => {
    const value = raw[key];
    if (value === undefined || value === null || value === '') return undefined;
    const num = typeof value === 'string' ? Number(value) : value;
    if (typeof num !== 'number' || !Number.isFinite(num) || num < 0 || (integer && !Number.isInteger(num))) {
      fail(400, 'VALIDATION_ERROR', `${key} must be ${integer ? 'a non-negative integer' : 'a non-negative number'}`);
    }
    criteria[key] = num;
    return num;
  };

  const min = optionalNumber('minPrice');
  const max = optionalNumber('maxPrice');
  if (min !== undefined && max !== undefined && min > max) {
    fail(400, 'VALIDATION_ERROR', 'minPrice cannot exceed maxPrice');
  }
  optionalNumber('bedrooms', { integer: true });

  if (raw.sort !== undefined && raw.sort !== null && raw.sort !== '') {
    if (typeof raw.sort !== 'string' || !Object.hasOwn(SORT_OPTIONS, raw.sort.trim())) {
      fail(400, 'VALIDATION_ERROR', `sort must be one of: ${Object.keys(SORT_OPTIONS).join(', ')}`);
    }
    criteria.sort = raw.sort.trim();
  }

  if (Object.keys(criteria).length === 0) {
    fail(400, 'VALIDATION_ERROR', 'At least one search criterion is required');
  }
  return criteria;
};

const requireOwned = async (id, userId) => {
  if (!mongoose.isValidObjectId(id)) fail(400, 'INVALID_ID', 'Invalid saved search id');
  const doc = await SavedSearch.findOne({ _id: id, user: userId });
  if (!doc) fail(404, 'NOT_FOUND', 'Saved search not found');
  return doc;
};

const assertActiveCap = async (userId) => {
  const active = await SavedSearch.countDocuments({ user: userId, active: true });
  if (active >= MAX_ACTIVE_PER_USER) fail(429, 'SEARCH_LIMIT', `You can have at most ${MAX_ACTIVE_PER_USER} active saved searches`);
};

export const create = async (userId, input = {}) => {
  const name = validateName(input.name);
  const criteria = validateCriteria(input.criteria);
  const frequency = input.frequency === undefined || input.frequency === null ? 'instant' : validateFrequency(input.frequency);
  await assertActiveCap(userId);
  const doc = await SavedSearch.create({ user: userId, name, criteria, frequency });
  return doc.toObject();
};

export const list = async (userId, page = 1, limit = 10) => {
  const filter = { user: userId };
  const [savedSearches, total] = await Promise.all([
    SavedSearch.find(filter).sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    SavedSearch.countDocuments(filter),
  ]);
  return { savedSearches, pagination: { total, page, pages: Math.ceil(total / limit), limit } };
};

export const get = async (id, userId) => (await requireOwned(id, userId)).toObject();

export const update = async (id, userId, input = {}) => {
  const doc = await requireOwned(id, userId);
  if (input.name !== undefined) doc.name = validateName(input.name);
  if (input.criteria !== undefined) doc.criteria = validateCriteria(input.criteria);
  if (input.frequency !== undefined && input.frequency !== null) doc.frequency = validateFrequency(input.frequency);
  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean') fail(400, 'VALIDATION_ERROR', 'active must be a boolean');
    if (input.active && !doc.active) await assertActiveCap(userId);
    doc.active = input.active;
  }
  await doc.save();
  return doc.toObject();
};

export const remove = async (id, userId) => {
  const doc = await requireOwned(id, userId);
  await doc.deleteOne();
  return { deleted: true };
};

/**
 * Execute stored criteria through the shared builder against live listings.
 * Returns the standard properties envelope plus the canonical /listings
 * querystring for deep-linking (ADR-029).
 */
export const run = async (id, userId, page = 1, limit = 10) => {
  const doc = await requireOwned(id, userId);
  const criteria = doc.criteria || {};
  const filter = buildPropertyFilter(criteria);
  const sort = resolveSort(criteria.sort);
  const result = await propertyService.getProperties(filter, sort, page, limit);
  return { ...result, query: buildCanonicalQuery(criteria) };
};