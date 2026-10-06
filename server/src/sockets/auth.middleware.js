import { verifyAccessToken } from '../utils/tokens.js';
import { AUTH_CONSTANTS } from '../config/auth.js';
import { parseCookies } from '../utils/cookies.js';

/**
 * Socket.io handshake authentication middleware.
 * Parses the hh_access cookie from the handshake headers, verifies the JWT
 * using the same access-token verifier as requireAuth, and populates
 * socket.user = { id, role }. Unauthenticated sockets are rejected at the
 * handshake — no unauthenticated connection ever attaches.
 */
export const socketAuth = (socket, next) => {
  try {
    const cookies = parseCookies(socket.handshake.headers?.cookie || '');
    const token = cookies[AUTH_CONSTANTS.COOKIE_ACCESS];

    if (!token) {
      return next(new Error('AUTH_UNAUTHORIZED'));
    }

    const decoded = verifyAccessToken(token);
    socket.user = {
      id: decoded.sub,
      role: decoded.role,
    };
    next();
  } catch {
    next(new Error('AUTH_UNAUTHORIZED'));
  }
};