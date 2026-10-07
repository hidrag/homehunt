import { getNeighborhood } from '../services/neighborhood.service.js';

/**
 * S12 — Neighborhood controller.
 *
 * GET /api/properties/:id/neighborhood (public, no auth — exact parity with
 * GET /api/properties/:id; docs/06 "Browse properties" is Yes/Yes/Yes).
 * Thin controller: all validation lives in the service (typed errors), all
 * envelope formatting happens here in the standard shape.
 */
class NeighborhoodController {
  /**
   * @route   GET /api/properties/:id/neighborhood
   * @desc    Nearby POIs + deterministic walkability score for a listing
   * @access  Public
   */
  getNeighborhood = async (req, res, next) => {
    try {
      const neighborhood = await getNeighborhood(req.params.id, {
        radiusKm: req.query.radiusKm,
        category: req.query.category,
      });

      return res.status(200).json({
        success: true,
        data: { neighborhood },
      });
    } catch (error) {
      // Typed validation/lookup errors (INVALID_ID, GEO_INVALID, NOT_FOUND)
      // map to their own envelopes; anything else keeps the global handler.
      if (error && error.status && error.code) {
        return res.status(error.status).json({
          success: false,
          error: { code: error.code, message: error.message },
        });
      }
      return next(error);
    }
  };
}

export default new NeighborhoodController();
