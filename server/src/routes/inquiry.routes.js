import express from 'express';
import * as inquiryController from '../controllers/inquiry.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import { requireOwnership } from '../middlewares/ownership.middleware.js';
import Inquiry from '../models/Inquiry.js';

const router = express.Router();

// All inquiry routes require authentication
router.use(requireAuth);

router.post('/', inquiryController.createInquiry);
router.get('/', inquiryController.listInquiries);

// IMPORTANT: /agent must be declared BEFORE any /:id-based routes to avoid route collision
router.get('/agent', requireRole('agent', 'admin'), inquiryController.listAgentInquiries);

// S6 — Agents manage only the inquiries addressed to them (no admin bypass:
// "Manage own inquiries" per docs/06; cross-agent administration is S7)
router.patch(
  '/:id/status',
  requireRole('agent', 'admin'),
  requireOwnership(Inquiry, 'agent', { notFoundMessage: 'Inquiry not found' }),
  inquiryController.updateInquiryStatus,
);

export default router;
