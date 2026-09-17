import { AUTH_CONSTANTS } from '../config/auth.js';

/**
 * Returns cookie options for access token
 * @returns {Object}
 */
export const getAccessCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_CONSTANTS.ACCESS_MAX_AGE_MS,
  };
};

/**
 * Returns cookie options for refresh token
 * @returns {Object}
 */
export const getRefreshCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_CONSTANTS.REFRESH_MAX_AGE_MS,
  };
};

/**
 * Sets both authentication cookies on the response
 * @param {import('express').Response} res
 * @param {string} accessToken
 * @param {string} refreshToken
 */
export const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie(AUTH_CONSTANTS.COOKIE_ACCESS, accessToken, getAccessCookieOptions());
  res.cookie(AUTH_CONSTANTS.COOKIE_REFRESH, refreshToken, getRefreshCookieOptions());
};

/**
 * Clears both authentication cookies from the client
 * @param {import('express').Response} res
 */
export const clearAuthCookies = (res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const clearOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };
  res.clearCookie(AUTH_CONSTANTS.COOKIE_ACCESS, clearOptions);
  res.clearCookie(AUTH_CONSTANTS.COOKIE_REFRESH, clearOptions);
};

/**
 * Parses raw Cookie header string into key-value map
 * @param {string} cookieHeader
 * @returns {Record<string, string>}
 */
export const parseCookies = (cookieHeader) => {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return {};
  }
  return cookieHeader.split(';').reduce((acc, pair) => {
    const [key, ...rest] = pair.trim().split('=');
    if (key) {
      acc[key.trim()] = decodeURIComponent(rest.join('=') || '');
    }
    return acc;
  }, {});
};

/**
 * Retrieves a cookie by name from the request (from req.cookies or parsing req.headers.cookie)
 * @param {import('express').Request} req
 * @param {string} name
 * @returns {string|null}
 */
export const getCookie = (req, name) => {
  if (req.cookies && req.cookies[name]) {
    return req.cookies[name];
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[name] || null;
};
