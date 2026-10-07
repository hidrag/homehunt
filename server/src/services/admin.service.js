import mongoose from 'mongoose';
import User from '../models/User.js';
import Property from '../models/Property.js';
import Inquiry from '../models/Inquiry.js';
import { hashPassword, isValidPasswordLength } from '../utils/password.js';
import { AUTH_CONSTANTS } from '../config/auth.js';
import { publicizeProperty } from '../lib/propertyPresentation.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Provisioning may only create elevated accounts; buyers self-register publicly.
const PROVISIONABLE_ROLES = ['agent', 'admin'];
// Role changes may target any valid platform role.
const ASSIGNABLE_ROLES = ['buyer', 'agent', 'admin'];

const RECENT_LIMIT = 5;

// Role changes that can remove an administrator are serialized in this
// process so the last-admin check and write cannot interleave. The API is
// intentionally single-process today; a distributed lock would be a new
// infrastructure decision outside S7.
let roleMutationTail = Promise.resolve();

const withRoleMutationLock = async (operation) => {
  const previous = roleMutationTail;
  let release;
  roleMutationTail = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
};

const throwValidationError = (message) => {
  throw { status: 400, code: 'VALIDATION_ERROR', message };
};

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Platform overview counts for the admin dashboard (S7).
 * Lightweight by design: a small fixed set of count queries plus the
 * five newest documents in each stream. No trends, exports, or caching.
 */
export const getStats = async () => {
  const [
    usersTotal,
    buyerCount,
    agentCount,
    adminCount,
    propertiesTotal,
    availableCount,
    underOfferCount,
    soldCount,
    rentedCount,
    saleCount,
    rentCount,
    inquiriesTotal,
    pendingCount,
    respondedCount,
    closedCount,
    recentProperties,
    recentInquiries,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ role: 'buyer' }),
    User.countDocuments({ role: 'agent' }),
    User.countDocuments({ role: 'admin' }),
    Property.countDocuments({}),
    Property.countDocuments({ status: 'available' }),
    Property.countDocuments({ status: 'under_offer' }),
    Property.countDocuments({ status: 'sold' }),
    Property.countDocuments({ status: 'rented' }),
    Property.countDocuments({ listingType: 'sale' }),
    Property.countDocuments({ listingType: 'rent' }),
    Inquiry.countDocuments({}),
    Inquiry.countDocuments({ status: 'pending' }),
    Inquiry.countDocuments({ status: 'responded' }),
    Inquiry.countDocuments({ status: 'closed' }),
    Property.find({})
      .select('title price propertyType listingType status createdAt')
      .sort({ createdAt: -1, _id: -1 })
      .limit(RECENT_LIMIT)
      .lean(),
    Inquiry.find({})
      .select('name email status createdAt property')
      .sort({ createdAt: -1, _id: -1 })
      .limit(RECENT_LIMIT)
      .populate({ path: 'property', select: { title: 1 } })
      .lean(),
  ]);

  return {
    users: {
      total: usersTotal,
      byRole: { buyer: buyerCount, agent: agentCount, admin: adminCount },
    },
    properties: {
      total: propertiesTotal,
      byStatus: {
        available: availableCount,
        under_offer: underOfferCount,
        sold: soldCount,
        rented: rentedCount,
      },
      byListingType: { sale: saleCount, rent: rentCount },
    },
    inquiries: {
      total: inquiriesTotal,
      byStatus: { pending: pendingCount, responded: respondedCount, closed: closedCount },
    },
    recentProperties,
    recentInquiries,
  };
};

/**
 * Paginated user directory for admin management.
 * Only whitelisted query values reach the database; responses use the
 * safe serialization (passwordHash can never be selected here).
 */
export const listUsers = async ({ page = 1, limit = 10, role, search } = {}) => {
  const filter = {};

  if (typeof role === 'string' && ASSIGNABLE_ROLES.includes(role.trim())) {
    filter.role = role.trim();
  }

  if (typeof search === 'string' && search.trim().length > 0) {
    const escaped = escapeRegex(search.trim());
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('name email role createdAt updatedAt')
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return {
    users: users.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })),
    pagination: { total, page, pages: Math.ceil(total / limit), limit },
  };
};

/**
 * Controlled provisioning of agent/admin accounts (ADR-021).
 * Whitelist sanitization: only name/email/password/role are ever read;
 * _id, passwordHash, timestamps and unknown fields cannot be injected.
 */
export const provisionUser = async (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throwValidationError('A user payload is required');
  }

  const { name, email, password, role } = input;

  if (!name || typeof name !== 'string' || !name.trim()) {
    throwValidationError('Name is required');
  }
  if (name.trim().length > AUTH_CONSTANTS.NAME_MAX_LENGTH) {
    throwValidationError(`Name cannot exceed ${AUTH_CONSTANTS.NAME_MAX_LENGTH} characters`);
  }
  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    throwValidationError('A valid email is required');
  }
  if (email.trim().length > 254) {
    throwValidationError('Email cannot exceed 254 characters');
  }
  if (!isValidPasswordLength(password)) {
    throwValidationError(
      `Password must be between ${AUTH_CONSTANTS.PASSWORD_MIN_LENGTH} and ${AUTH_CONSTANTS.PASSWORD_MAX_LENGTH} characters`,
    );
  }
  if (typeof role !== 'string' || !PROVISIONABLE_ROLES.includes(role)) {
    throwValidationError('Role must be one of: agent, admin');
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw { status: 409, code: 'EMAIL_TAKEN', message: 'Email is already registered' };
  }

  const passwordHash = await hashPassword(password);

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role,
  });

  return user.toSafeObject();
};

/**
 * Change a user's role with server-side lockout protections (ADR-021):
 * - demoting the last remaining admin is rejected,
 * - self-role-change is rejected (no self-demotion / self-escalation).
 */
export const changeUserRole = async (actorId, targetId, role) => {
  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    throw { status: 400, code: 'INVALID_ID', message: 'Invalid user ID format' };
  }

  if (typeof role !== 'string' || !ASSIGNABLE_ROLES.includes(role)) {
    throwValidationError('Role must be one of: buyer, agent, admin');
  }

  return withRoleMutationLock(async () => {
    const target = await User.findById(targetId);
    if (!target) {
      throw { status: 404, code: 'NOT_FOUND', message: 'User not found' };
    }

    if (target.role === 'admin' && role !== 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        throw {
          status: 403,
          code: 'FORBIDDEN',
          message: 'The last remaining admin cannot be demoted',
        };
      }
    }

    if (target._id.toString() === String(actorId)) {
      throw {
        status: 403,
        code: 'FORBIDDEN',
        message: 'You cannot change your own role',
      };
    }

    target.role = role;
    await target.save();

    return target.toSafeObject();
  });
};

const PROPERTY_STATUSES = ['available', 'under_offer', 'sold', 'rented'];
const LISTING_TYPES = ['sale', 'rent'];
const PROPERTY_TYPES = ['apartment', 'house', 'villa', 'condo', 'land'];
const INQUIRY_STATUSES = ['pending', 'responded', 'closed'];

/**
 * Cross-listing moderation view: every listing, every agent, all statuses.
 * Read-only by design — mutations reuse the S6 ownership-override routes.
 */
export const listProperties = async ({
  page = 1,
  limit = 10,
  search,
  city,
  status,
  listingType,
  propertyType,
  agent,
} = {}) => {
  const filter = {};

  if (typeof search === 'string' && search.trim().length > 0) {
    filter.$text = { $search: search.trim() };
  }

  if (typeof city === 'string' && city.trim().length > 0) {
    filter['address.city'] = new RegExp(`^${escapeRegex(city.trim())}$`, 'i');
  }

  if (typeof status === 'string' && PROPERTY_STATUSES.includes(status.trim())) {
    filter.status = status.trim();
  }

  if (typeof listingType === 'string' && LISTING_TYPES.includes(listingType.trim())) {
    filter.listingType = listingType.trim();
  }

  if (typeof propertyType === 'string' && PROPERTY_TYPES.includes(propertyType.trim())) {
    filter.propertyType = propertyType.trim();
  }

  if (typeof agent === 'string' && mongoose.Types.ObjectId.isValid(agent)) {
    filter.agent = agent;
  }

  const skip = (page - 1) * limit;

  const [properties, total] = await Promise.all([
    Property.find(filter)
      .select('-__v')
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'agent',
        select: { name: 1, email: 1, role: 1 },
      })
      .lean(),
    Property.countDocuments(filter),
  ]);

  return {
    properties: properties.map((property) => ({
      ...publicizeProperty(property),
      agent: property.agent
        ? {
            id: property.agent._id.toString(),
            name: property.agent.name,
            email: property.agent.email,
            role: property.agent.role,
          }
        : null,
    })),
    pagination: { total, page, pages: Math.ceil(total / limit), limit },
  };
};

/**
 * Cross-agent inquiry administration view.
 * Missing property/user documents resolve to null (deleted resources).
 */
export const listInquiries = async ({ page = 1, limit = 10, status } = {}) => {
  const filter = {};

  if (typeof status === 'string' && INQUIRY_STATUSES.includes(status.trim())) {
    filter.status = status.trim();
  }

  const skip = (page - 1) * limit;

  const [inquiries, total] = await Promise.all([
    Inquiry.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'property',
        select: {
          title: 1,
          price: 1,
          images: 1,
          'address.city': 1,
          'address.state': 1,
          listingType: 1,
        },
      })
      .populate({ path: 'buyer', select: { name: 1, email: 1 } })
      .populate({ path: 'agent', select: { name: 1, email: 1 } })
      .lean(),
    Inquiry.countDocuments(filter),
  ]);

  const toSafeUser = (user) =>
    user
      ? { id: user._id.toString(), name: user.name, email: user.email }
      : null;

  return {
    inquiries: inquiries.map((inquiry) => ({
      ...inquiry,
      buyer: toSafeUser(inquiry.buyer),
      agent: toSafeUser(inquiry.agent),
    })),
    pagination: { total, page, pages: Math.ceil(total / limit), limit },
  };
};
