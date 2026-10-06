import express from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import { requireOwnership } from '../middlewares/ownership.middleware.js';
import Inquiry from '../models/Inquiry.js';
import * as visitController from '../controllers/visit.controller.js';
import * as conversationController from '../controllers/conversation.controller.js';

const router = express.Router();

// Every admin route independently enforces authentication and the admin role.
// Frontend route guards are UX only — this gate is the security boundary.
router.use(requireAuth, requireRole('admin'));

router.get('/stats', adminController.getStats);
router.get('/visits', visitController.adminList);
router.patch('/visits/:id/status', visitController.adminStatus);

// Cross-marketplace conversation audit (read-only; admins are not
// participants and never join Socket.io rooms — S9 locked decision)
router.get('/conversations', conversationController.adminList);
router.get('/conversations/:id/messages', conversationController.adminMessages);

// User management (controlled provisioning + role changes per ADR-021)
router.get('/users', adminController.listUsers);
router.post('/users', adminController.provisionUser);
router.patch('/users/:id/role', adminController.changeUserRole);

// Cross-listing moderation (read-only; mutations reuse the S6
// PATCH/DELETE /api/properties/:id admin-override routes)
router.get('/properties', adminController.listProperties);

// Cross-agent inquiry administration (explicit admin route; the S6 agent
// inbox route remains strictly agent-scoped and unchanged)
router.get('/inquiries', adminController.listInquiries);
router.patch(
  '/inquiries/:id/status',
  requireOwnership(Inquiry, 'agent', { allowAdmin: true, notFoundMessage: 'Inquiry not found' }),
  adminController.updateInquiryStatus,
);

export default router;
