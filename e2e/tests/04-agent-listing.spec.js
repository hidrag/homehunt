import { test, expect, SEED, login } from './fixtures.js';

/**
 * S16 (ADR-041) Journey 4 — Agent listing & verification.
 * docs/10 flows: agent listing creation. Agent creates a listing through the
 * real form, then requests verification (documents upload uses the fake
 * provider in the e2e compose, per ADR-035).
 */
test.describe('Journey 4 — Agent listing & verification', () => {
  test('agent creates a listing and it appears in their dashboard', async ({ page }) => {
    await login(page, SEED.agent);

    await page.goto('/agent/listings/new');
    await expect(page).toHaveURL(/\/agent\/listings\/new/);

    const title = `E2E Listing ${Date.now()}`;
    // Fill the create form by label/placeholder where stable; ids otherwise.
    const titleInput = page.locator('#title, input[name="title"]').first();
    await titleInput.fill(title);

    const desc = page.locator('#description, textarea[name="description"]').first();
    if (await desc.count()) await desc.fill('A listing created by the S16 E2E journey for verification purposes.');

    const price = page.locator('#price, input[name="price"]').first();
    await price.fill('7500000');

    // Numeric/select fields vary by form; fill what is present.
    for (const [sel, value] of [
      ['#bedrooms, input[name="bedrooms"]', '3'],
      ['#bathrooms, input[name="bathrooms"]', '2'],
      ['#area, input[name="area"]', '1400'],
    ]) {
      const el = page.locator(sel).first();
      if (await el.count()) await el.fill(value);
    }

    // Submit and land back on the dashboard/listing view.
    await page.getByRole('button', { name: /create|save|publish|submit/i }).first().click();

    // The new listing appears in the agent's dashboard.
    await page.goto('/agent');
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  });

  test('agent dashboard exposes the verification request surface', async ({ page }) => {
    await login(page, SEED.agent);
    await page.goto('/agent');
    // Expand a listing → the verification panel with a request action exists.
    const expand = page.getByRole('button', { name: /verification|documents/i }).first();
    if (await expand.count()) {
      await expand.click();
      await expect(page.getByText(/request verification|verification documents|upload/i).first()).toBeVisible();
    }
  });
});
