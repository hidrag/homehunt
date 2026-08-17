import mongoose from 'mongoose';
import propertyService from '../services/property.service.js';

class PropertyController {
  /**
   * @route   GET /api/properties
   * @desc    Get paginated properties
   * @access  Public
   */
  getProperties = async (req, res, next) => {
    try {
      let page = parseInt(req.query.page, 10);
      let limit = parseInt(req.query.limit, 10);

      if (isNaN(page) || page < 1) page = 1;
      if (isNaN(limit) || limit < 1) limit = 10;
      if (limit > 50) limit = 50;

      const result = await propertyService.getProperties(page, limit);

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
            code: 'INVALID_ID',
            message: 'Invalid property ID format',
          },
        });
      }

      const property = await propertyService.getPropertyById(id);

      if (!property) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Property not found',
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
}

export default new PropertyController();
