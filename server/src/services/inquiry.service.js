import mongoose from 'mongoose';
import Inquiry from '../models/Inquiry.js';
import Property from '../models/Property.js';
import { notifyInquiryUpdate } from './notification.service.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates inquiry creation input
 */
const validateInquiryInput = ({ propertyId, name, email, phone, message }) => {
  if (!propertyId || typeof propertyId !== 'string') {
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'Property ID is required' };
  }

  if (!mongoose.Types.ObjectId.isValid(propertyId)) {
    throw { status: 400, code: 'INVALID_ID', message: 'Invalid property ID format' };
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'Name is required' };
  }

  if (name.trim().length > 120) {
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'Name cannot exceed 120 characters' };
  }

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'A valid email is required' };
  }

  if (email.trim().length > 254) {
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'Email cannot exceed 254 characters' };
  }

  if (phone !== undefined && phone !== null && phone !== '') {
    if (typeof phone !== 'string') {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Phone must be a string' };
    }
    if (phone.trim().length > 20) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Phone cannot exceed 20 characters' };
    }
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'Message is required' };
  }

  const trimmedMessage = message.trim();
  if (trimmedMessage.length < 10) {
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'Message must be at least 10 characters' };
  }
  if (trimmedMessage.length > 2000) {
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'Message cannot exceed 2000 characters' };
  }
};

/**
 * Create an inquiry from an authenticated buyer
 * Agent is derived server-side from the property
 */
export const createInquiry = async (buyerId, { propertyId, name, email, phone, message }) => {
  validateInquiryInput({ propertyId, name, email, phone, message });

  // Fetch property to get the agent — never trust client-supplied agent
  const property = await Property.findById(propertyId).select('agent title').lean();
  if (!property) {
    throw { status: 404, code: 'NOT_FOUND', message: 'Property not found' };
  }

  if (!property.agent) {
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'Property does not have an assigned agent' };
  }

  const inquiry = await Inquiry.create({
    property: propertyId,
    buyer: buyerId,
    agent: property.agent,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone ? phone.trim() : '',
    message: message.trim(),
    status: 'pending', // Always forced to pending
  });

  // S10 (ADR-030): in-app + email alert to the agent, fire-and-forget —
  // notification/email failures never affect the inquiry response.
  void notifyInquiryUpdate({
    agentId: property.agent,
    inquiryId: inquiry._id,
    propertyTitle: property.title,
    buyerName: name.trim(),
    buyerEmail: email.trim().toLowerCase(),
    message: message.trim(),
  });

  return inquiry.toObject();
};

/**
 * List inquiries for the authenticated buyer (paginated)
 */
export const listForBuyer = async (buyerId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const [inquiries, total] = await Promise.all([
    Inquiry.find({ buyer: buyerId })
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
      .lean(),
    Inquiry.countDocuments({ buyer: buyerId }),
  ]);

  return {
    inquiries,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
    },
  };
};

/**
 * List inquiries addressed to the given agent (agent inbox, S6)
 * @param {string} agentId
 * @param {number} page
 * @param {number} limit
 * @returns {Promise<Object>}
 */
export const listForAgent = async (agentId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const [inquiries, total] = await Promise.all([
    Inquiry.find({ agent: agentId })
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
      .lean(),
    Inquiry.countDocuments({ agent: agentId }),
  ]);

  return {
    inquiries,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
    },
  };
};

const AGENT_MANAGED_STATUSES = ['responded', 'closed'];

/**
 * Update the status of an inquiry managed by the given agent (S6).
 * Only forward transitions are allowed: `responded`, `closed`.
 * @param {Object} inquiry - Mongoose document (req.resource)
 * @param {string} status
 * @returns {Promise<Object>}
 */
export const updateInquiryStatus = async (inquiry, status) => {
  if (typeof status !== 'string' || !AGENT_MANAGED_STATUSES.includes(status)) {
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'Status must be one of: responded, closed' };
  }

  inquiry.status = status;
  await inquiry.save();

  return inquiry.toObject();
};
