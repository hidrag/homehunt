import express from 'express';
import propertyController from '../controllers/property.controller.js';
import neighborhoodController from '../controllers/neighborhood.controller.js';
import * as analyticsController from '../controllers/analytics.controller.js';
import * as mediaController from '../controllers/media.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import { requireOwnership } from '../middlewares/ownership.middleware.js';
import { requireMediaAccess } from '../middlewares/mediaAccess.middleware.js';
import Property from '../models/Property.js';

const router = express.Router();

router.get('/', propertyController.getProperties);

// IMPORTANT: /mine must be declared BEFORE /:id to avoid route collision
router.get('/mine', requireAuth, requireRole('agent', 'admin'), propertyController.getMyProperties);

// S12 — Neighborhood context (public read, parity with GET /:id). Declared
// before the generic /:id handler per the route-ordering convention above.
router.get('/:id/neighborhood', neighborhoodController.getNeighborhood);

// S14 (ADR-038) — comparison matrix (public, parity with GET /:id). The
// literal /compare segment MUST be declared before any /:id pattern, same
// ordering rule as /mine and /:id/neighborhood above.
router.get('/compare', analyticsController.compare);

// S13 — Media & verification document surface (ADR-036). Access gate
// requires auth; non-owner/non-admin receive 404, never 403. Declared
// before the generic /:id handlers so the literal segments win.
router.get(
  '/:id/images',
  requireAuth,
  requireMediaAccess(),
  mediaController.getImages,
);
router.post(
  '/:id/images',
  requireAuth,
  requireRole('agent', 'admin'),
  requireMediaAccess(),
  mediaController.addImagesRoute,
);
router.delete(
  '/:id/images/:imageId',
  requireAuth,
  requireRole('agent', 'admin'),
  requireMediaAccess(),
  mediaController.deleteImage,
);
router.get(
  '/:id/documents',
  requireAuth,
  requireMediaAccess(),
  mediaController.listDocuments,
);
router.post(
  '/:id/documents',
  requireAuth,
  requireRole('agent', 'admin'),
  requireMediaAccess(),
  mediaController.addDocumentsRoute,
);
router.get(
  '/:id/documents/:documentId/content',
  requireAuth,
  requireMediaAccess(),
  mediaController.getDocumentContent,
);
router.delete(
  '/:id/documents/:documentId',
  requireAuth,
  requireRole('agent', 'admin'),
  requireMediaAccess(),
  mediaController.deleteDocument,
);
// Agent submits for verification (owner or admin; requires >= 1 document).
router.post(
  '/:id/request-verification',
  requireAuth,
  requireRole('agent', 'admin'),
  requireMediaAccess(),
  mediaController.requestVerification,
);

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
