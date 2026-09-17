import { getCookie } from '../utils/cookies.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { AUTH_CONSTANTS } from '../config/auth.js';

/**
 * Authentication middleware enforcing valid access token in hh_access cookie
 */
export const requireAuth = (req, res, next) => {
  const token = getCookie(req, AUTH_CONSTANTS.COOKIE_ACCESS);

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      id: decoded.sub,
      role: decoded.role,
    };
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token',
      },
    });
  }
};

/**
 * Reusable role-based authorization middleware
 * @param  {...string} roles
 */
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !req.user.role) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      },
    });
  }

  next();
};
