import express from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import * as controller from '../controllers/notification.controller.js';

const router = express.Router();

// Notifications are personal inboxes for any authenticated role (ADR-030).
// Every operation is recipient-scoped server-side; misses are 404.
router.use(requireAuth);

router.get('/', controller.list);
router.get('/unread-count', controller.unread);
router.patch('/read-all', controller.readAll);
router.patch('/:id/read', controller.read);
router.delete('/:id', controller.remove);

export default router;