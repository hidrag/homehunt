import rateLimit from 'express-rate-limit';

/**
 * Dedicated rate limiter for sensitive authentication endpoints (register, login, refresh)
 * 10 requests per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skip: () => process.env.NODE_ENV === 'test' && process.env.ENABLE_AUTH_RATE_LIMIT !== 'true',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many authentication attempts, please try again later.',
      },
    });
  },
});
