import { test as base, expect } from '@playwright/test';

/**
 * S16 (ADR-041) — shared fixtures for the HomeHunt E2E journeys.
 *
 * Seeded identities come from server/scripts/seed/users.js (the single source
 * of truth, DEV_PASSWORD 'DevPassword123!'). Buyers that must not collide with
 * seed data register through the real UI with a per-run unique .test email.
 */
export const SEED = {
  agent: { email: 'agent@homehunt.test', password: 'DevPassword123!' },
  admin: { email: 'admin@homehunt.test', password: 'DevPassword123!' },
  buyer: { email: 'buyer@homehunt.test', password: 'DevPassword123!' },
};

export const uniqueEmail = (prefix) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@homehunt.test`;

/** Sign in through the real login form (ids: #email, #password). */
export async function login(page, { email, password }) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

/** Register a brand-new buyer through the real form. */
export async function registerBuyer(page, email, password = 'DevPassword123!') {
  await page.goto('/register');
  await page.fill('#name', 'E2E Buyer');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.fill('#confirmPassword', password);
  await page.getByRole('button', { name: /create account|register|sign up/i }).click();
  await expect(page).not.toHaveURL(/\/register$/);
}

export const test = base.extend({});
export { expect };
