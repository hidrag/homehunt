import bcrypt from 'bcrypt';
import { AUTH_CONSTANTS } from '../config/auth.js';

// Precomputed cost-10 bcrypt hash used to guarantee timing parity on non-existent users
export const DUMMY_PASSWORD_HASH = '$2b$10$Zd4g0RtKOPB/C.iKZmf89.sGwMhm2hrfP2z4fvDj0p6496at6qlla';

/**
 * Validates password meets the length constraints (8-72 chars)
 * @param {string} password
 * @returns {boolean}
 */
export const isValidPasswordLength = (password) => {
  if (typeof password !== 'string') return false;
  return (
    password.length >= AUTH_CONSTANTS.PASSWORD_MIN_LENGTH &&
    password.length <= AUTH_CONSTANTS.PASSWORD_MAX_LENGTH
  );
};

/**
 * Hashes a plaintext password using bcrypt with cost 10
 * @param {string} password
 * @returns {Promise<string>}
 */
export const hashPassword = async (password) => {
  return bcrypt.hash(password, AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS);
};

/**
 * Compares plaintext password against a bcrypt hash
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};
