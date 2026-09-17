import * as authService from '../services/auth.service.js';
import { setAuthCookies, clearAuthCookies, getCookie } from '../utils/cookies.js';
import { AUTH_CONSTANTS } from '../config/auth.js';

/**
 * Handles error formatting matching HomeHunt standard error envelope
 * @param {import('express').Response} res
 * @param {any} err
 */
const handleAuthError = (res, err) => {
  if (err && err.status && err.code) {
    return res.status(err.status).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    });
  }

  console.error('[AUTH_CONTROLLER_ERROR]', err);
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected authentication error occurred',
    },
  });
};

/**
 * POST /api/auth/register
 */
export const register = async (req, res) => {
  try {
    const { user, accessToken, refreshToken } = await authService.register(req.body);
    setAuthCookies(res, accessToken, refreshToken);

    return res.status(200).json({
      success: true,
      data: {
        user,
      },
    });
  } catch (err) {
    return handleAuthError(res, err);
  }
};

/**
 * POST /api/auth/login
 */
export const login = async (req, res) => {
  try {
    const { user, accessToken, refreshToken } = await authService.login(req.body);
    setAuthCookies(res, accessToken, refreshToken);

    return res.status(200).json({
      success: true,
      data: {
        user,
      },
    });
  } catch (err) {
    return handleAuthError(res, err);
  }
};

/**
 * POST /api/auth/refresh
 */
export const refresh = async (req, res) => {
  try {
    const refreshTokenString = getCookie(req, AUTH_CONSTANTS.COOKIE_REFRESH);
    const { user, accessToken, refreshToken } = await authService.refresh(refreshTokenString);
    setAuthCookies(res, accessToken, refreshToken);

    return res.status(200).json({
      success: true,
      data: {
        user,
      },
    });
  } catch (err) {
    // If refresh token is reused or invalid, clear all auth cookies from client
    clearAuthCookies(res);
    return handleAuthError(res, err);
  }
};

/**
 * POST /api/auth/logout
 */
export const logout = async (req, res) => {
  try {
    const refreshTokenString = getCookie(req, AUTH_CONSTANTS.COOKIE_REFRESH);
    await authService.logout(refreshTokenString);
    clearAuthCookies(res);

    return res.status(200).json({
      success: true,
      data: {},
    });
  } catch (err) {
    clearAuthCookies(res);
    return handleAuthError(res, err);
  }
};

/**
 * GET /api/auth/me
 */
export const me = async (req, res) => {
  try {
    const user = await authService.getMe(req.user.id);

    return res.status(200).json({
      success: true,
      data: {
        user,
      },
    });
  } catch (err) {
    return handleAuthError(res, err);
  }
};
