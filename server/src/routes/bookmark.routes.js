import express from 'express';
import * as bookmarkController from '../controllers/bookmark.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = express.Router();

// All bookmark routes require authentication
router.use(requireAuth);

// IMPORTANT: /ids must be declared BEFORE /:propertyId to avoid route collision
router.get('/ids', bookmarkController.getBookmarkIds);

router.get('/', bookmarkController.listBookmarks);
router.post('/', bookmarkController.addBookmark);
router.delete('/:propertyId', bookmarkController.removeBookmark);

export default router;
