import { expect, test } from '@playwright/test';

test('player records opens from the wheel and offers sign-in for achievements', async ({ page }) => {
  await page.goto('/');
  const account = page.locator('.hex-wheel-account');
  await account.focus();
  await account.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Player records' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Standings' })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Achievements' }).click();
  await expect(dialog.getByText('Sign in to see your achievements.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
