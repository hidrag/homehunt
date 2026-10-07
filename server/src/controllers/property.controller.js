import mongoose from 'mongoose';
import propertyService from '../services/property.service.js';
import { buildPropertyFilter, resolveSort, clampPagination } from '../lib/propertyFilters.js';

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

  console.error('[PROPERTY_CONTROLLER_ERROR]', err);
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
};

class PropertyController {
  /**
   * @route   GET /api/properties
   * @desc    Get paginated properties with search, filtering, and sorting
   * @access  Public
   */
  getProperties = async (req, res, next) => {
    try {
      const filter = buildPropertyFilter(req.query);
      const sortOption = resolveSort(req.query.sort);
      const { page, limit } = clampPagination(req.query.page, req.query.limit);

      const result = await propertyService.getProperties(
        filter,
        sortOption,
        page,
        limit,
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * @route   GET /api/properties/:id
   * @desc    Get single property by ID
   * @access  Public
   */
  getPropertyById = async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_ID",
            message: "Invalid property ID format",
          },
        });
      }

      const property = await propertyService.getPropertyById(id);

      if (!property) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Property not found",
          },
        });
      }

      res.status(200).json({
        success: true,
        data: { property },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * @route   POST /api/properties
   * @desc    Create a property owned by the authenticated agent/admin
   * @access  Private (agent, admin)
   */
  createProperty = async (req, res) => {
    try {
      const property = await propertyService.createProperty(req.user.id, req.body || {});

      return res.status(201).json({
        success: true,
        data: { property },
      });
    } catch (error) {
      return handleError(res, error);
    }
  };

  /**
   * @route   GET /api/properties/mine
   * @desc    List the authenticated agent's own listings (agent dashboard, S6)
   * @access  Private (agent, admin)
   */
  getMyProperties = async (req, res) => {
    try {
      let page = parseInt(req.query.page, 10);
      let limit = parseInt(req.query.limit, 10);

      if (isNaN(page) || page < 1) page = 1;
      if (isNaN(limit) || limit < 1) limit = 10;
      if (limit > 50) limit = 50;

      const result = await propertyService.getPropertiesForAgent(req.user.id, page, limit);

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  };

  /**
   * @route   PATCH /api/properties/:id
   * @desc    Update a listing (ownership enforced by requireOwnership middleware)
   * @access  Private (owning agent, admin)
   */
  updateProperty = async (req, res) => {
    try {
      const property = await propertyService.updateProperty(req.resource, req.body || {});

      return res.status(200).json({
        success: true,
        data: { property },
      });
    } catch (error) {
      return handleError(res, error);
    }
  };

  /**
   * @route   DELETE /api/properties/:id
   * @desc    Delete a listing and remove its bookmark references
   * @access  Private (owning agent, admin)
   */
  deleteProperty = async (req, res) => {
    try {
      const result = await propertyService.deleteProperty(req.resource);

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  };
}

export default new PropertyController();
