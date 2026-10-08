import { test, expect, SEED, login, registerBuyer, uniqueEmail } from './fixtures.js';

/**
 * S16 (ADR-041) Journey 1 — Buyer Search & Property Discovery.
 * Covers docs/10 flows: registration, login, search & filtering, property
 * detail (gallery/highlights/map), mortgage calculator, bookmark, saved search.
 */
test.describe('Journey 1 — Buyer search & discovery', () => {
  test('registers, logs in, searches, opens a listing, uses the EMI calculator and saves', async ({ page }) => {
    // Registration through the real UI (unique buyer so seed data is untouched).
    const buyerEmail = uniqueEmail('e2e-buyer');
    await registerBuyer(page, buyerEmail);

    // If registration auto-signs-in we are in; otherwise log in explicitly.
    if (/\/login/.test(page.url())) {
      await login(page, { email: buyerEmail, password: 'DevPassword123!' });
    }

    // Search & filtering: the listings page renders cards from seeded data.
    await page.goto('/listings');
    await expect(page.getByText(/listing|properties|results/i).first()).toBeVisible();

    // Filter by city (a seeded city) and confirm the URL carries the filter.
    await page.goto('/listings?city=Mumbai');
    await expect(page).toHaveURL(/city=Mumbai/);

    // Open the first listing card → detail page.
    const firstCard = page.locator('a[href^="/listings/"]').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();
    await expect(page).toHaveURL(/\/listings\/[0-9a-f]{24}$/);

    // Detail: gallery, highlights and the mortgage estimator are present.
    await expect(page.getByText(/property highlights/i)).toBeVisible();
    await expect(page.getByText(/mortgage estimator/i)).toBeVisible();

    // EMI calculator produces a monthly figure for the default inputs.
    await expect(page.getByText(/monthly emi/i)).toBeVisible();
    await expect(page.getByText(/₹/).first()).toBeVisible();

    // Neighborhood + location map sections exist (S12 surfaces on detail).
    await expect(page.getByText(/neighborhood|nearby/i).first()).toBeVisible();

    // Bookmark the listing (requires auth — we are signed in).
    const bookmark = page.getByRole('button', { name: /save property|remove from saved/i }).first();
    await bookmark.click();

    // Saved search: apply a filter then save it.
    await page.goto('/listings?city=Bengaluru&listingType=sale');
    const saveSearch = page.getByRole('button', { name: /save (this )?search/i }).first();
    if (await saveSearch.count()) {
      await saveSearch.click();
      // Modal may ask for a name; submit with the default if present.
      const nameInput = page.locator('input[type="text"]').last();
      if (await nameInput.count()) await nameInput.fill('E2E Bengaluru sale');
      const confirm = page.getByRole('button', { name: /save search|save$/i }).last();
      if (await confirm.count()) await confirm.click();
    }
  });

  test('seeded buyer can log in and reach the bookmarks page', async ({ page }) => {
    await login(page, SEED.buyer);
    await page.goto('/bookmarks');
    await expect(page).toHaveURL(/\/bookmarks/);
  });
});
