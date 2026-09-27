import mongoose from 'mongoose';

/**
 * Resource ownership authorization middleware.
 * Implements the `requireOwnership(resource, ownerField)` convention from
 * docs/03-architecture.md: loads the target document by `req.params.id`,
 * verifies that `resource[ownerField]` matches the authenticated user
 * (`req.user.id`), and forwards the loaded document as `req.resource`.
 *
 * Options:
 * - allowAdmin: admins bypass the ownership comparison (used where the
 *   docs/06-auth-rbac.md permission baseline grants admins
 *   "Edit any property" / "Moderate listings").
 * - notFoundMessage: response wording tailored to the resource.
 *
 * Expects `requireAuth` to have run earlier in the chain.
 * Responses: 400 INVALID_ID, 403 FORBIDDEN, 404 NOT_FOUND.
 *
 * @param {import('mongoose').Model} Model
 * @param {string} ownerField
 * @param {{ allowAdmin?: boolean, notFoundMessage?: string }} [options]
 */
export const requireOwnership = (
  Model,
  ownerField,
  { allowAdmin = false, notFoundMessage = 'Resource not found' } = {},
) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }

      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ID',
            message: 'Invalid ID format',
          },
        });
      }

      const resource = await Model.findById(id);

      if (!resource) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: notFoundMessage,
          },
        });
      }

      const ownerId = resource[ownerField];
      const isOwner = Boolean(ownerId) && ownerId.toString() === req.user.id;
      const isAdminOverride = allowAdmin && req.user.role === 'admin';

      if (!isOwner && !isAdminOverride) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient permissions',
          },
        });
      }

      req.resource = resource;
      return next();
    } catch (err) {
      return next(err);
    }
  };
};
