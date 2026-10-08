import { test, expect, SEED, login } from './fixtures.js';

/**
 * S16 (ADR-041) Journey 3 — Visit Scheduling.
 * docs/10 flows: visit scheduling. Buyer requests a visit; the agent confirms
 * it and the buyer sees the confirmed state (REST + notification surfaces).
 */
test.describe('Journey 3 — Visit scheduling', () => {
  test('buyer requests a visit and the agent confirms it', async ({ browser }) => {
    const buyerCtx = await browser.newContext();
    const agentCtx = await browser.newContext();
    const buyer = await buyerCtx.newPage();
    const agent = await agentCtx.newPage();

    try {
      await login(buyer, SEED.buyer);
      await login(agent, SEED.agent);

      // Buyer opens a listing and requests a visit.
      await buyer.goto('/listings');
      await buyer.locator('a[href^="/listings/"]').first().click();
      await expect(buyer).toHaveURL(/\/listings\/[0-9a-f]{24}$/);

      const scheduleBtn = buyer.getByRole('button', { name: /schedule (a )?visit|request visit|book (a )?visit/i }).first();
      await expect(scheduleBtn).toBeVisible();
      await scheduleBtn.click();

      // Fill the visit form (date/time inputs) and submit.
      const dateInput = buyer.locator('input[type="date"]').first();
      await dateInput.waitFor({ state: 'visible' });
      const tomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await dateInput.fill(tomorrow);
      const timeInput = buyer.locator('input[type="time"]').first();
      if (await timeInput.count()) await timeInput.fill('11:00');
      await buyer.getByRole('button', { name: /request|schedule|submit|confirm/i }).last().click();

      // Buyer's visits page shows the pending request.
      await buyer.goto('/visits');
      await expect(buyer.getByText(/pending|requested|visit/i).first()).toBeVisible({ timeout: 15_000 });

      // Agent dashboard → visits tab shows the request; confirm it.
      await agent.goto('/agent');
      const visitsTab = agent.getByRole('button', { name: /visits/i }).first();
      if (await visitsTab.count()) await visitsTab.click();
      const confirmBtn = agent.getByRole('button', { name: /confirm/i }).first();
      await expect(confirmBtn).toBeVisible({ timeout: 15_000 });
      await confirmBtn.click();
      // A confirm dialog may guard the action.
      const dialogConfirm = agent.getByRole('button', { name: /^confirm$|yes|ok/i }).last();
      if (await dialogConfirm.count()) await dialogConfirm.click();

      // Buyer reloads and sees the confirmed state.
      await buyer.goto('/visits');
      await expect(buyer.getByText(/confirmed/i).first()).toBeVisible({ timeout: 15_000 });
    } finally {
      await buyerCtx.close();
      await agentCtx.close();
    }
  });
});
