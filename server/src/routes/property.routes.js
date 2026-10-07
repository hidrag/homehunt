import express from 'express';
import propertyController from '../controllers/property.controller.js';
import neighborhoodController from '../controllers/neighborhood.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import { requireOwnership } from '../middlewares/ownership.middleware.js';
import Property from '../models/Property.js';

const router = express.Router();

router.get('/', propertyController.getProperties);

// IMPORTANT: /mine must be declared BEFORE /:id to avoid route collision
router.get('/mine', requireAuth, requireRole('agent', 'admin'), propertyController.getMyProperties);

// S12 — Neighborhood context (public read, parity with GET /:id). Declared
// before the generic /:id handler per the route-ordering convention above.
router.get('/:id/neighborhood', neighborhoodController.getNeighborhood);

router.get('/:id', propertyController.getPropertyById);

// S6 — Agent/Admin listing management (ownership enforced server-side)
router.post('/', requireAuth, requireRole('agent', 'admin'), propertyController.createProperty);

router.patch(
  '/:id',
  requireAuth,
  requireRole('agent', 'admin'),
  requireOwnership(Property, 'agent', { allowAdmin: true, notFoundMessage: 'Property not found' }),
  propertyController.updateProperty,
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('agent', 'admin'),
  requireOwnership(Property, 'agent', { allowAdmin: true, notFoundMessage: 'Property not found' }),
  propertyController.deleteProperty,
);

export default router;
