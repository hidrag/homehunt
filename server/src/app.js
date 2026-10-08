import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import propertyRoutes from './routes/property.routes.js';
import authRoutes from "./routes/auth.routes.js";
import bookmarkRoutes from "./routes/bookmark.routes.js";
import inquiryRoutes from "./routes/inquiry.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import visitRoutes from './routes/visit.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import savedSearchRoutes from './routes/savedSearch.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import notificationRoutes from './routes/notification.routes.js';

const app = express();

// S16 (ADR-042) — proxy awareness. Behind the production nginx, every
// request arrives from the proxy IP; without trust-proxy the global limiter
// would key all users together (and express-rate-limit v8 would reject the
// X-Forwarded-For header outright). Hops are env-tunable (1 = single proxy).
let trustProxy = 1;
if (process.env.TRUST_PROXY !== undefined) {
  const parsed = Number(process.env.TRUST_PROXY);
  if (!Number.isNaN(parsed) && parsed >= 0) trustProxy = parsed;
}
app.set('trust proxy', trustProxy);

// Security Middlewares
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));

// Probes FIRST so they stay exempt from the global limiter (ADR-042):
// orchestrators and load balancers must never be 429'd into marking a
// healthy node down.
// Liveness — process is up; no dependency checks (Docker HEALTHCHECK).
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString()
    }
  });
});
// Readiness — can serve traffic: MongoDB connection is the only hard
// dependency (503 otherwise, so compose/CI gate on it).
app.get('/api/ready', (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  if (!ready) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'NOT_READY',
        message: 'Service is not ready to accept traffic.',
      },
    });
  }
  return res.status(200).json({
    success: true,
    data: { status: 'ready', timestamp: new Date().toISOString() },
  });
});

// Rate limiting (S16, ADR-042): sizing is a deployment concern — env-tunable
// so production, E2E and staging differ by config, never by code branch.
// Defaults: 300 requests / 15 min per IP (a real browse session plus SPA
// fan-out blows the old 100). The auth limiter (10/15, ADR-016) is separate
// and unchanged.
function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
const limiter = rateLimit({
  windowMs: intFromEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  max: intFromEnv('RATE_LIMIT_MAX', 300)
});
app.use(limiter);

// Parse JSON bodies
app.use(express.json());

// API Routes
app.use("/api/auth", authRoutes);
app.use('/api/properties', propertyRoutes);
app.use("/api/bookmarks", bookmarkRoutes);
app.use("/api/inquiries", inquiryRoutes);
app.use("/api/admin", adminRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/saved-searches', savedSearchRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found'
    }
  });
});

// Global Error Handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred'
    }
  });
});

export default app;
