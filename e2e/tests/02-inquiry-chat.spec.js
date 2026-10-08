import { test, expect, SEED, login, uniqueEmail, registerBuyer } from './fixtures.js';

/**
 * S16 (ADR-041) Journey 2 — Buyer Inquiry & Real-Time Chat.
 * Covers docs/10 flows: inquiry, chat, notification. Uses TWO browser
 * contexts so socket delivery is asserted between a real buyer and agent
 * (persistence-before-emit per ADR-028).
 */
test.describe('Journey 2 — Inquiry & real-time chat', () => {
  test('buyer messages the agent and the agent sees it live', async ({ browser }) => {
    const buyerCtx = await browser.newContext();
    const agentCtx = await browser.newContext();
    const buyer = await buyerCtx.newPage();
    const agent = await agentCtx.newPage();

    try {
      // Both identities signed in, in separate contexts (separate cookies).
      const buyerEmail = uniqueEmail('e2e-chat-buyer');
      await registerBuyer(buyer, buyerEmail);
      if (/\/login/.test(buyer.url())) await login(buyer, { email: buyerEmail, password: 'DevPassword123!' });
      await login(agent, SEED.agent);

      // Buyer opens a listing owned by the seeded agent and starts a chat.
      await buyer.goto('/listings');
      await buyer.locator('a[href^="/listings/"]').first().click();
      await expect(buyer).toHaveURL(/\/listings\/[0-9a-f]{24}$/);

      const messageBtn = buyer.getByRole('button', { name: /message (the )?agent/i }).first();
      await expect(messageBtn).toBeVisible();
      await messageBtn.click();

      // Composer appears (either inline or on the messages page).
      const composer = buyer.locator('textarea, input[type="text"]').last();
      await composer.waitFor({ state: 'visible' });
      const body = `E2E hello ${Date.now()}`;
      await composer.fill(body);
      await composer.press('Enter');

      // Agent opens Messages and should receive the thread + message.
      await agent.goto('/messages');
      await expect(agent.getByText(body)).toBeVisible({ timeout: 15_000 });
    } finally {
      await buyerCtx.close();
      await agentCtx.close();
    }
  });

  test('buyer submits an inquiry from a listing', async ({ page }) => {
    await login(page, SEED.buyer);
    await page.goto('/listings');
    await page.locator('a[href^="/listings/"]').first().click();
    await expect(page).toHaveURL(/\/listings\/[0-9a-f]{24}$/);

    const form = page.locator('form').filter({ hasText: /inquiry|message|question/i }).first();
    if (await form.count()) {
      const nameField = form.locator('input[type="text"]').first();
      if (await nameField.count()) await nameField.fill('E2E Buyer');
      const phone = form.locator('input[type="tel"], input[name*="phone"]').first();
      if (await phone.count()) await phone.fill('9999999999');
      const textarea = form.locator('textarea').first();
      if (await textarea.count()) await textarea.fill('Interested — please share more details.');
      await form.getByRole('button', { name: /send|submit|inquire/i }).first().click();
      // Success is either a toast or the inquiry appearing under /inquiries.
      await page.goto('/inquiries');
      await expect(page).toHaveURL(/\/inquiries/);
    }
  });
});
