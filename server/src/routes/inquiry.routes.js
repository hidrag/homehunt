import express from 'express';
import * as inquiryController from '../controllers/inquiry.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = express.Router();

// All inquiry routes require authentication
router.use(requireAuth);

router.post('/', inquiryController.createInquiry);
router.get('/', inquiryController.listInquiries);

export default router;
