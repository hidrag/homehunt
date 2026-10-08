import { test, expect } from './fixtures.js';

/**
 * S16 (ADR-041) Journey 6 — PWA & offline verification.
 * Retires the S15 docs/10 note: the SW/manifest are now verified in situ
 * against the built client served by nginx (not a dev server).
 */
test.describe('Journey 6 — PWA & offline', () => {
  test('serves a service worker (no-cache), a valid manifest and an offline fallback', async ({ page, context, request }) => {
    // The built bundle must expose the SW + manifest at the root.
    const sw = await request.get('/sw.js');
    expect(sw.status()).toBe(200);
    // sw.js must never be cached (ADR-042): a pinned SW breaks every deploy.
    expect(sw.headers()['cache-control'] || '').toMatch(/no-cache|no-store/);

    const manifest = await request.get('/manifest.webmanifest');
    expect(manifest.status()).toBe(200);
    const m = await manifest.json();
    expect(m.name).toMatch(/HomeHunt/);
    expect(m.display).toBe('standalone');
    expect(Array.isArray(m.icons) && m.icons.length).toBeTruthy();

    // Hashed assets are immutable (cache split proof).
    const html = await (await request.get('/')).text();
    const asset = html.match(/\/assets\/[A-Za-z0-9_-]+\.js/);
    if (asset) {
      const assetRes = await request.get(asset[0]);
      expect(assetRes.headers()['cache-control'] || '').toMatch(/immutable/);
    }

    // Service worker registers in the browser.
    await page.goto('/');
    const registered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return Boolean(reg);
    });
    expect(registered).toBe(true);

    // Offline: the shell answers a navigation and the app renders (banner or
    // offline page) instead of a browser network-error screen.
    await context.setOffline(true);
    await page.goto('/offline').catch(() => {});
    await expect(page.locator('body')).toContainText(/offline|you.?re offline/i, { timeout: 10_000 });
    await context.setOffline(false);
  });
});
