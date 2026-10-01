import * as adminService from '../services/admin.service.js';
import { updateInquiryStatus as updateInquiryStatusService } from '../services/inquiry.service.js';

/**
 * Handles error formatting matching the HomeHunt standard error envelope
 */
const handleError = (res, err) => {
  if (err && err.status && err.code) {
    return res.status(err.status).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    });
  }

  console.error('[ADMIN_CONTROLLER_ERROR]', err);
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
};

/**
 * Standard pagination parsing (project convention: page >= 1, 1 <= limit <= 50)
 */
const parsePagination = (query) => {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 10;
  if (limit > 50) limit = 50;

  return { page, limit };
};

/**
 * GET /api/admin/stats
 * Lightweight platform overview (admin only)
 */
export const getStats = async (req, res) => {
  try {
    const stats = await adminService.getStats();

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * GET /api/admin/users
 * Paginated user directory with role filter and name/email search
 */
export const listUsers = async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);

    const result = await adminService.listUsers({
      page,
      limit,
      role: req.query.role,
      search: req.query.search,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * POST /api/admin/users
 * Controlled provisioning of agent/admin accounts (ADR-021)
 */
export const provisionUser = async (req, res) => {
  try {
    const user = await adminService.provisionUser(req.body || {});

    return res.status(201).json({
      success: true,
      data: { user },
    });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * PATCH /api/admin/users/:id/role
 * Role change with self-demotion and last-admin protections (ADR-021)
 */
export const changeUserRole = async (req, res) => {
  try {
    const user = await adminService.changeUserRole(
      req.user.id,
      req.params.id,
      req.body?.role,
    );

    return res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * GET /api/admin/properties
 * Cross-listing moderation view (read-only)
 */
export const listProperties = async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);

    const result = await adminService.listProperties({
      page,
      limit,
      search: req.query.search,
      city: req.query.city,
      status: req.query.status,
      listingType: req.query.listingType,
      propertyType: req.query.propertyType,
      agent: req.query.agent,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * GET /api/admin/inquiries
 * Cross-agent inquiry administration view
 */
export const listInquiries = async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);

    const result = await adminService.listInquiries({
      page,
      limit,
      status: req.query.status,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * PATCH /api/admin/inquiries/:id/status
 * Cross-agent inquiry status transition — reuses the S6 agent transition
 * semantics (responded/closed) via the shared inquiry service.
 */
export const updateInquiryStatus = async (req, res) => {
  try {
    const inquiry = await updateInquiryStatusService(req.resource, req.body?.status);

    return res.status(200).json({
      success: true,
      data: { inquiry },
    });
  } catch (err) {
    return handleError(res, err);
  }
};
