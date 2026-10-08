import { defineConfig, devices } from '@playwright/test';

/**
 * S16 (ADR-041) — Playwright config for the HomeHunt E2E suite.
 *
 * Target is the CONTAINERIZED production simulation (docker-compose.e2e.yml):
 * nginx serves the built SPA and proxies /api + /socket.io to the real server,
 * so proxying, websockets, SPA fallback, cache headers and the service worker
 * are all genuinely exercised (a vite-preview target would skip exactly what
 * S16 ships).
 *
 * Rate limiting is raised via the compose env knobs (RATE_LIMIT_MAX) — no
 * test-only code branches exist in the app.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:4173';

export default defineConfig({
  testDir: './tests',
  // Socket journeys share seeded data; keep execution serial for determinism.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // Deterministic stack (seeded data, ADR-033): flake budget goes to isolation
  // bugs, not retry masks.
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
