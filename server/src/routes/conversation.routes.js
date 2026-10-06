import express from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import * as controller from '../controllers/conversation.controller.js';

const router = express.Router();

// All conversation routes require authentication; frontend guards are UX only.
router.use(requireAuth);

// Buyer opens (or reuses) a property-bound thread. Agents/admins are rejected.
router.post('/', requireRole('buyer'), controller.open);

// Role-scoped inbox: buyers see their threads, agents see theirs.
router.get('/', requireRole('buyer', 'agent'), controller.mine);

// Header badge hydration (ADR-017 pattern).
router.get('/unread-count', requireRole('buyer', 'agent'), controller.unread);

// Participant-only thread operations (404 for non-participants).
router.get('/:id/messages', requireRole('buyer', 'agent'), controller.messages);
router.post('/:id/messages', requireRole('buyer', 'agent'), controller.send);
router.post('/:id/read', requireRole('buyer', 'agent'), controller.read);

export default router;