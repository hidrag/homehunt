import * as inquiryService from '../services/inquiry.service.js';

/**
 * Handles error formatting matching HomeHunt standard error envelope
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

  console.error('[INQUIRY_CONTROLLER_ERROR]', err);
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
};

/**
 * POST /api/inquiries
 * Create an inquiry from the authenticated buyer
 */
export const createInquiry = async (req, res) => {
  try {
    const { propertyId, name, email, phone, message } = req.body;

    const inquiry = await inquiryService.createInquiry(req.user.id, {
      propertyId,
      name,
      email,
      phone,
      message,
    });

    return res.status(201).json({
      success: true,
      data: { inquiry },
    });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * GET /api/inquiries
 * List inquiries for the authenticated buyer (paginated)
 */
export const listInquiries = async (req, res) => {
  try {
    let page = parseInt(req.query.page, 10);
    let limit = parseInt(req.query.limit, 10);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;
    if (limit > 50) limit = 50;

    const result = await inquiryService.listForBuyer(req.user.id, page, limit);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return handleError(res, err);
  }
};
