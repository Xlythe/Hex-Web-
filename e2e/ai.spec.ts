import { expect, test } from '@playwright/test';

test('the AI replies using a dedicated worker', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('hexPlayer2ControlType', 'ai');
    localStorage.setItem('hexAiDifficulty', 'tree');
    Math.random = () => 0.25;
  });
  await page.goto('/');
  if (!await page.getByRole('button', { name: 'Cell R1C1 Empty' }).isVisible()) {
    await page.getByRole('button', { name: 'Play', exact: true }).click();
  }
  const worker = page.waitForEvent('worker');
  await page.getByRole('button', { name: 'Cell R1C1 Empty' }).click();
  await worker;
  await expect(page.getByRole('button', { name: /Cell R\d+C\d+ Player 2/ }).first()).toBeVisible();
});
