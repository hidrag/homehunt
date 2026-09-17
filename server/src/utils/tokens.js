import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getAuthConfig, AUTH_CONSTANTS } from '../config/auth.js';

/**
 * Computes SHA-256 hash of a raw token string for secure database storage
 * @param {string} token
 * @returns {string} Hex encoded hash
 */
export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Creates a signed HS256 JWT access token (15 min lifetime)
 * @param {Object} user - User document or safe object
 * @returns {string} Signed JWT
 */
export const createAccessToken = (user) => {
  const { accessSecret, algorithm, issuer, accessExpiresIn } = getAuthConfig();

  return jwt.sign(
    {
      sub: user.id || user._id.toString(),
      role: user.role,
    },
    accessSecret,
    {
      algorithm,
      issuer,
      expiresIn: accessExpiresIn,
    }
  );
};

/**
 * Creates a signed HS256 JWT refresh token (7 days lifetime)
 * @param {Object} user - User document or safe object
 * @param {string|mongoose.Types.ObjectId} sessionId - Session ID (maps to jti and sid)
 * @returns {string} Signed JWT
 */
export const createRefreshToken = (user, sessionId) => {
  const { refreshSecret, algorithm, issuer, refreshExpiresIn } = getAuthConfig();
  const sid = sessionId.toString();

  return jwt.sign(
    {
      sub: user.id || user._id.toString(),
      jti: sid,
      sid: sid,
    },
    refreshSecret,
    {
      algorithm,
      issuer,
      expiresIn: refreshExpiresIn,
    }
  );
};

/**
 * Verifies access token using JWT_ACCESS_SECRET with HS256 and issuer whitelist
 * @param {string} token
 * @returns {Object} Decoded payload
 */
export const verifyAccessToken = (token) => {
  const { accessSecret } = getAuthConfig();
  return jwt.verify(token, accessSecret, {
    algorithms: [AUTH_CONSTANTS.ALGORITHM],
    issuer: AUTH_CONSTANTS.ISSUER,
  });
};

/**
 * Verifies refresh token using JWT_REFRESH_SECRET with HS256 and issuer whitelist
 * @param {string} token
 * @returns {Object} Decoded payload
 */
export const verifyRefreshToken = (token) => {
  const { refreshSecret } = getAuthConfig();
  return jwt.verify(token, refreshSecret, {
    algorithms: [AUTH_CONSTANTS.ALGORITHM],
    issuer: AUTH_CONSTANTS.ISSUER,
  });
};
