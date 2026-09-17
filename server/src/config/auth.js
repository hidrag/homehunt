/**
 * Authentication configuration and validation
 * Locked by ADR-012..ADR-016
 */

export const getAuthConfig = () => {
  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;

  if (!accessSecret || !refreshSecret) {
    throw new Error('FATAL: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be defined in environment variables.');
  }

  if (accessSecret === refreshSecret) {
    throw new Error('FATAL: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct.');
  }

  return {
    accessSecret,
    refreshSecret,
    algorithm: 'HS256',
    issuer: 'homehunt',
    accessExpiresIn: '15m',
    refreshExpiresIn: '7d',
    cookieAccessName: 'hh_access',
    cookieRefreshName: 'hh_refresh',
    accessMaxAgeMs: 15 * 60 * 1000, // 900 seconds
    refreshMaxAgeMs: 7 * 24 * 60 * 60 * 1000, // 604800 seconds
  };
};

export const AUTH_CONSTANTS = {
  ALGORITHM: 'HS256',
  ISSUER: 'homehunt',
  COOKIE_ACCESS: 'hh_access',
  COOKIE_REFRESH: 'hh_refresh',
  ACCESS_MAX_AGE_MS: 15 * 60 * 1000, // 900 seconds
  REFRESH_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000, // 604800 seconds
  ACCESS_EXPIRES_IN: '15m',
  REFRESH_EXPIRES_IN: '7d',
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 72,
  NAME_MAX_LENGTH: 120,
  BCRYPT_SALT_ROUNDS: 10,
};
