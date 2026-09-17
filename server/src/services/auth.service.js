import mongoose from 'mongoose';
import User from '../models/User.js';
import Session from '../models/Session.js';
import {
  hashPassword,
  comparePassword,
  DUMMY_PASSWORD_HASH,
  isValidPasswordLength,
} from '../utils/password.js';
import {
  hashToken,
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens.js';
import { AUTH_CONSTANTS } from '../config/auth.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates registration input payload
 * @param {Object} input
 */
const validateRegisterInput = ({ name, email, password }) => {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'Name is required' };
  }
  if (name.trim().length > AUTH_CONSTANTS.NAME_MAX_LENGTH) {
    throw {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: `Name cannot exceed ${AUTH_CONSTANTS.NAME_MAX_LENGTH} characters`,
    };
  }
  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'A valid email is required' };
  }
  if (!isValidPasswordLength(password)) {
    throw {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: `Password must be between ${AUTH_CONSTANTS.PASSWORD_MIN_LENGTH} and ${AUTH_CONSTANTS.PASSWORD_MAX_LENGTH} characters`,
    };
  }
};

/**
 * Validates login input payload
 * @param {Object} input
 */
const validateLoginInput = ({ email, password }) => {
  if (!email || typeof email !== 'string' || !email.trim()) {
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'Email is required' };
  }
  if (!password || typeof password !== 'string') {
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'Password is required' };
  }
};

/**
 * Public user registration — always creates role: 'buyer'
 */
export const register = async ({ name, email, password }) => {
  validateRegisterInput({ name, email, password });

  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw { status: 409, code: 'EMAIL_TAKEN', message: 'Email is already registered' };
  }

  const passwordHash = await hashPassword(password);

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role: 'buyer', // Role is strictly buyer for public registration
  });

  // Create initial refresh token session & family
  const sessionId = new mongoose.Types.ObjectId();
  const familyId = new mongoose.Types.ObjectId().toString();
  const expiresAt = new Date(Date.now() + AUTH_CONSTANTS.REFRESH_MAX_AGE_MS);

  const refreshToken = createRefreshToken(user, sessionId);
  const tokenHash = hashToken(refreshToken);

  await Session.create({
    _id: sessionId,
    userId: user._id,
    tokenHash,
    familyId,
    expiresAt,
    revokedAt: null,
  });

  const accessToken = createAccessToken(user);

  return {
    user: user.toSafeObject(),
    accessToken,
    refreshToken,
  };
};

/**
 * User login with timing-parity verification
 */
export const login = async ({ email, password }) => {
  validateLoginInput({ email, password });

  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

  if (!user) {
    // Perform dummy bcrypt comparison to prevent user enumeration via timing
    await comparePassword(password, DUMMY_PASSWORD_HASH);
    throw { status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' };
  }

  const isMatch = await comparePassword(password, user.passwordHash);
  if (!isMatch) {
    throw { status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' };
  }

  // Create new session & new family on login
  const sessionId = new mongoose.Types.ObjectId();
  const familyId = new mongoose.Types.ObjectId().toString();
  const expiresAt = new Date(Date.now() + AUTH_CONSTANTS.REFRESH_MAX_AGE_MS);

  const refreshToken = createRefreshToken(user, sessionId);
  const tokenHash = hashToken(refreshToken);

  await Session.create({
    _id: sessionId,
    userId: user._id,
    tokenHash,
    familyId,
    expiresAt,
    revokedAt: null,
  });

  const accessToken = createAccessToken(user);

  return {
    user: user.toSafeObject(),
    accessToken,
    refreshToken,
  };
};

/**
 * Refresh token rotation with strict reuse detection and family revocation
 */
export const refresh = async (refreshTokenString) => {
  if (!refreshTokenString) {
    throw { status: 401, code: 'INVALID_REFRESH', message: 'Refresh token is required' };
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshTokenString);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw { status: 401, code: 'REFRESH_EXPIRED', message: 'Refresh token has expired' };
    }
    throw { status: 401, code: 'INVALID_REFRESH', message: 'Invalid refresh token' };
  }

  if (!decoded.jti || !mongoose.isValidObjectId(decoded.jti)) {
    throw { status: 401, code: 'INVALID_REFRESH', message: 'Invalid refresh token' };
  }

  const presentedHash = hashToken(refreshTokenString);
  const session = await Session.findById(decoded.jti);

  if (!session) {
    throw { status: 401, code: 'INVALID_REFRESH', message: 'Invalid refresh token' };
  }

  if (session.tokenHash !== presentedHash) {
    throw { status: 401, code: 'INVALID_REFRESH', message: 'Invalid refresh token' };
  }

  // REUSE DETECTION: If token was already revoked, revoke the entire family!
  if (session.revokedAt) {
    await Session.updateMany(
      { familyId: session.familyId, revokedAt: null },
      { revokedAt: new Date() }
    );
    // Log only safe metadata (userId, familyId, timestamp)
    console.warn(
      `[AUTH] Refresh token reuse detected for userId: ${session.userId}, familyId: ${session.familyId} at ${new Date().toISOString()}`
    );
    throw {
      status: 401,
      code: 'REFRESH_TOKEN_REUSED',
      message: 'Refresh token reuse detected. All sessions in family revoked.',
    };
  }

  // Check TTL expiration
  if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
    throw { status: 401, code: 'REFRESH_EXPIRED', message: 'Refresh token has expired' };
  }

  // Atomically claim and revoke presented session
  const claimedSession = await Session.findOneAndUpdate(
    { _id: session._id, revokedAt: null, tokenHash: presentedHash },
    { revokedAt: new Date() },
    { returnDocument: 'before' }
  );

  if (!claimedSession) {
    // Concurrent rotation or race condition: treat as reuse
    await Session.updateMany(
      { familyId: session.familyId, revokedAt: null },
      { revokedAt: new Date() }
    );
    throw {
      status: 401,
      code: 'REFRESH_TOKEN_REUSED',
      message: 'Refresh token reuse detected.',
    };
  }

  const user = await User.findById(session.userId);
  if (!user) {
    throw { status: 401, code: 'UNAUTHORIZED', message: 'User not found' };
  }

  // Issue successor session in the same family
  const newSessionId = new mongoose.Types.ObjectId();
  const newRefreshToken = createRefreshToken(user, newSessionId);
  const newTokenHash = hashToken(newRefreshToken);
  const newExpiresAt = new Date(Date.now() + AUTH_CONSTANTS.REFRESH_MAX_AGE_MS);

  await Session.create({
    _id: newSessionId,
    userId: user._id,
    tokenHash: newTokenHash,
    familyId: session.familyId,
    expiresAt: newExpiresAt,
    revokedAt: null,
  });

  const newAccessToken = createAccessToken(user);

  return {
    user: user.toSafeObject(),
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
};

/**
 * Safe, idempotent logout
 */
export const logout = async (refreshTokenString) => {
  if (refreshTokenString) {
    try {
      const decoded = verifyRefreshToken(refreshTokenString);
      if (decoded?.jti && mongoose.isValidObjectId(decoded.jti)) {
        await Session.updateOne(
          { _id: decoded.jti, revokedAt: null },
          { revokedAt: new Date() }
        );
      }
    } catch {
      // Silently ignore token verification errors on logout
    }
  }

  return { success: true };
};

/**
 * Fetch current authenticated user representation
 */
export const getMe = async (userId) => {
  if (!userId || !mongoose.isValidObjectId(userId)) {
    throw { status: 401, code: 'UNAUTHORIZED', message: 'Authentication required' };
  }

  const user = await User.findById(userId);
  if (!user) {
    throw { status: 401, code: 'UNAUTHORIZED', message: 'User not found' };
  }

  return user.toSafeObject();
};
