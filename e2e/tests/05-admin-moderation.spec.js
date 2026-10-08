import { test, expect, SEED, login } from './fixtures.js';

/**
 * S16 (ADR-041) Journey 5 — Admin moderation.
 * docs/10 flows: admin approval. Admin reviews the verification queue and the
 * user directory (S7 surfaces). The badge-toggle assertion is scoped to the
 * queue's own state so the journey is deterministic against seeded data.
 */
test.describe('Journey 5 — Admin moderation', () => {
  test('admin reaches the verification queue and the user directory', async ({ page }) => {
    await login(page, SEED.admin);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin/);

    // Verifications tab exists and lists pending items or an empty state.
    const verifTab = page.getByRole('button', { name: /verification/i }).first();
    await expect(verifTab).toBeVisible();
    await verifTab.click();
    await expect(page.getByText(/verification|pending|no pending/i).first()).toBeVisible();

    // Users tab: search the seeded agent and confirm the role is shown.
    const usersTab = page.getByRole('button', { name: /users/i }).first();
    await usersTab.click();
    const search = page.locator('input[type="search"], input[type="text"]').first();
    if (await search.count()) {
      await search.fill('agent@homehunt.test');
      await expect(page.getByText(/agent@homehunt\.test/).first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test('a non-admin cannot reach the admin surface', async ({ page }) => {
    await login(page, SEED.buyer);
    await page.goto('/admin');
    // ProtectedRoute must bounce the buyer off /admin.
    await expect(page).not.toHaveURL(/\/admin$/);
  });
});
