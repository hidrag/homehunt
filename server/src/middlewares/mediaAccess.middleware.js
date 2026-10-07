import mongoose from 'mongoose';
import Property from '../models/Property.js';

/**
 * S13 (ADR-036) — Access gate for the property media/document surface.
 *
 * Differs from requireOwnership deliberately: verification documents are
 * sensitive records, so existence itself is access-controlled. An
 * authenticated user who is neither the owning agent nor an admin receives
 * 404 NOT_FOUND — never 403 — so probing cannot distinguish "not yours"
 * from "does not exist" (the ADR-030 enumeration-guard principle, applied
 * to media). Unauthenticated callers still get 401 from requireAuth
 * upstream; buyer-role callers reach this gate and also receive 404.
 *
 * Loads the property as req.resource for the controller/service chain.
 */
export const requireMediaAccess = () => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      }

      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ID', message: 'Invalid ID format' },
        });
      }

      const resource = await Property.findById(id);
      if (!resource) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Property not found' },
        });
      }

      const ownerId = resource.agent;
      const isOwner = Boolean(ownerId) && ownerId.toString() === req.user.id;
      const isAdmin = req.user.role === 'admin';

      if (!isOwner && !isAdmin) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Property not found' },
        });
      }

      req.resource = resource;
      return next();
    } catch (err) {
      return next(err);
    }
  };
};

export default requireMediaAccess;
