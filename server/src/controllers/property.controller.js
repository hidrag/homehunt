import mongoose from 'mongoose';
import propertyService from '../services/property.service.js';

const PROPERTY_TYPES = ["apartment", "house", "villa", "condo", "land"];
const LISTING_TYPES = ["sale", "rent"];
const SORT_OPTIONS = {
  newest: { createdAt: -1, _id: -1 },
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: -1 },
};

/**
 * Safely escape regex metacharacters in input string
 * @param {string} str
 * @returns {string}
 */
const escapeRegex = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

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
      const {
        search,
        city,
        propertyType,
        listingType,
        minPrice,
        maxPrice,
        bedrooms,
        sort,
      } = req.query;

      const filter = {};

      // 1. Keyword search (MongoDB $text)
      if (typeof search === "string" && search.trim().length > 0) {
        filter.$text = { $search: search.trim() };
      }

      // 2. City filter (case-insensitive, exact-match, regex-escaped)
      if (typeof city === "string" && city.trim().length > 0) {
        const escapedCity = escapeRegex(city.trim());
        filter["address.city"] = new RegExp(`^${escapedCity}$`, "i");
      }

      // 3. Property Type (whitelist)
      if (
        typeof propertyType === "string" &&
        PROPERTY_TYPES.includes(propertyType.trim())
      ) {
        filter.propertyType = propertyType.trim();
      }

      // 4. Listing Type (whitelist)
      if (
        typeof listingType === "string" &&
        LISTING_TYPES.includes(listingType.trim())
      ) {
        filter.listingType = listingType.trim();
      }

      // 5. Price range (minPrice, maxPrice)
      let parsedMinPrice;
      let parsedMaxPrice;

      if (minPrice !== undefined && minPrice !== null && minPrice !== "") {
        const min = Number(minPrice);
        if (!isNaN(min) && isFinite(min) && min >= 0) {
          parsedMinPrice = min;
        }
      }

      if (maxPrice !== undefined && maxPrice !== null && maxPrice !== "") {
        const max = Number(maxPrice);
        if (!isNaN(max) && isFinite(max) && max >= 0) {
          parsedMaxPrice = max;
        }
      }

      // If minPrice > maxPrice, invalidate both (Rule 17)
      if (
        parsedMinPrice !== undefined &&
        parsedMaxPrice !== undefined &&
        parsedMinPrice > parsedMaxPrice
      ) {
        parsedMinPrice = undefined;
        parsedMaxPrice = undefined;
      }

      if (parsedMinPrice !== undefined || parsedMaxPrice !== undefined) {
        filter.price = {};
        if (parsedMinPrice !== undefined) {
          filter.price.$gte = parsedMinPrice;
        }
        if (parsedMaxPrice !== undefined) {
          filter.price.$lte = parsedMaxPrice;
        }
      }

      // 6. Bedrooms filter (bedrooms >= N)
      if (bedrooms !== undefined && bedrooms !== null && bedrooms !== "") {
        const beds = Number(bedrooms);
        if (
          !isNaN(beds) &&
          isFinite(beds) &&
          Number.isInteger(beds) &&
          beds >= 0
        ) {
          filter.bedrooms = { $gte: beds };
        }
      }

      // 7. Sorting (whitelist with own-property check to prevent prototype-chain lookup)
      let sortOption = SORT_OPTIONS.newest;
      if (typeof sort === "string" && Object.hasOwn(SORT_OPTIONS, sort)) {
        sortOption = SORT_OPTIONS[sort];
      }

      // 8. Pagination
      let page = parseInt(req.query.page, 10);
      let limit = parseInt(req.query.limit, 10);

      if (isNaN(page) || page < 1) page = 1;
      if (isNaN(limit) || limit < 1) limit = 10;
      if (limit > 50) limit = 50;

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
