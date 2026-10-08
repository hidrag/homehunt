import express from 'express';
import * as analyticsController from '../controllers/analytics.controller.js';

const router = express.Router();

// S14 — public market discovery aggregates (ADR-037). No auth: the payload
// is computed from public listings only and exposes no user data; the
// per-IP limiter in app.js fronts it, and the service-side TTL cache bounds
// aggregation cost.
router.get('/market', analyticsController.market);

export default router;
