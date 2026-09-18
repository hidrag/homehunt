import mongoose from 'mongoose';
import * as bookmarkService from '../services/bookmark.service.js';

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

  console.error('[BOOKMARK_CONTROLLER_ERROR]', err);
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
};

/**
 * GET /api/bookmarks
 * List paginated bookmarks for the authenticated user
 */
export const listBookmarks = async (req, res) => {
  try {
    let page = parseInt(req.query.page, 10);
    let limit = parseInt(req.query.limit, 10);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;
    if (limit > 50) limit = 50;

    const result = await bookmarkService.listForUser(req.user.id, page, limit);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * POST /api/bookmarks
 * Add a bookmark for the authenticated user
 */
export const addBookmark = async (req, res) => {
  try {
    const { propertyId } = req.body;

    if (!propertyId || typeof propertyId !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Property ID is required',
        },
      });
    }

    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'Invalid property ID format',
        },
      });
    }

    const { bookmark, alreadyExists } = await bookmarkService.addBookmark(
      req.user.id,
      propertyId,
    );

    return res.status(alreadyExists ? 200 : 201).json({
      success: true,
      data: {
        bookmark,
        alreadyExists,
      },
    });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * DELETE /api/bookmarks/:propertyId
 * Remove a bookmark for the authenticated user
 */
export const removeBookmark = async (req, res) => {
  try {
    const { propertyId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'Invalid property ID format',
        },
      });
    }

    const result = await bookmarkService.removeBookmark(req.user.id, propertyId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * GET /api/bookmarks/ids
 * Get all bookmarked property IDs for the authenticated user
 */
export const getBookmarkIds = async (req, res) => {
  try {
    const ids = await bookmarkService.listPropertyIds(req.user.id);

    return res.status(200).json({
      success: true,
      data: { ids },
    });
  } catch (err) {
    return handleError(res, err);
  }
};
