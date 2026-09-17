import express from 'express';
import * as authController from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { authLimiter } from '../middlewares/rateLimit.middleware.js';

const router = express.Router();

// Sensitive authentication endpoints protected with auth-specific rate limiter
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/refresh', authLimiter, authController.refresh);

// Logout (idempotent, standard global rate limiter)
router.post('/logout', authController.logout);

// Current user profile (requires valid access token)
router.get('/me', requireAuth, authController.me);

export default router;
