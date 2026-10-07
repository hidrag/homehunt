import express from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import * as controller from '../controllers/savedSearch.controller.js';

const router = express.Router();

// Saved searches are buyer-only in S10 (ADR-029); agents/admins get 403.
router.use(requireAuth);
router.use(requireRole('buyer'));

router.post('/', controller.create);
router.get('/', controller.mine);
router.get('/:id', controller.one);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);
router.post('/:id/run', controller.run);

export default router;