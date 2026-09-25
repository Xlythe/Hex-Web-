import { expect, test, type Page } from '@playwright/test';

test.skip(process.env.VITE_USE_REAL_API !== 'true', 'Requires the deployed real API');

// Run with VITE_USE_REAL_API=true. The test uses unique accounts and talks to
// the deployed mirror rather than the in-browser mock.
const setup = async (page: Page, nickname: string) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Settings' }).click();
  const profiles = page.getByRole('button', { name: /Player Profiles/ });
  if ((await profiles.getAttribute('aria-expanded')) !== 'true') await profiles.click();
  await page.locator('input[name="player2ControlType"][value="online"]').check();
  await page.getByRole('button', { name: 'Apply Settings' }).click();
  await page.getByRole('button', { name: 'Sign Up' }).click();
  await page.getByLabel(/Nickname/).fill(nickname);
  await page.getByLabel(/^Password/).fill('live test password 2026');
  await page.getByLabel(/Email/).fill(`${nickname.toLowerCase()}@example.com`);
  await page.getByRole('dialog').getByRole('button', { name: 'Sign Up', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open user profile menu' })).toBeVisible({ timeout: 20_000 });
};

test('two real clients can join, start, move, and chat', async ({ browser }) => {
  test.setTimeout(120_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const suffix = Date.now().toString(36);
  const hostName = `Host${suffix}`;
  await setup(host, hostName);
  await setup(guest, `Guest${suffix}`);

  await host.getByRole('button', { name: 'Create Game' }).click();
  await host.getByTestId('submit-create-game-button').click();
  await expect(host.getByRole('button', { name: 'Open Chat' })).toBeVisible({ timeout: 20_000 });
  await guest.getByRole('button', { name: 'Browse Games' }).click();
  await expect(guest.getByRole('heading', { name: 'Game Lobby' })).toBeVisible();
  await guest.getByRole('button', { name: `Join game hosted by ${hostName}` }).click();
  await expect(guest.getByRole('button', { name: 'Ready Up' })).toBeVisible({ timeout: 20_000 });
  await expect(host.getByRole('button', { name: 'Ready Up' })).toBeVisible({ timeout: 30_000 });
  await host.getByRole('button', { name: 'Ready Up' }).click();
  await guest.getByRole('button', { name: 'Ready Up' }).click();
  await expect(host.getByRole('button', { name: 'Cell R1C1 Empty' })).toBeVisible({ timeout: 30_000 });
  await expect(guest.getByRole('button', { name: 'Cell R1C1 Empty' })).toBeVisible({ timeout: 30_000 });
  await host.getByRole('button', { name: 'Cell R1C1 Empty' }).click();
  await expect(guest.getByRole('button', { name: /Cell R1C1 Player 1/ })).toBeVisible({ timeout: 30_000 });
  await guest.getByRole('button', { name: 'Open Chat' }).click();
  await guest.getByPlaceholder(/message/i).fill('hello from guest');
  await guest.getByRole('button', { name: /Send/ }).click();
  await host.getByRole('button', { name: 'Open Chat' }).click();
  await expect(host.getByText('hello from guest')).toBeVisible({ timeout: 30_000 });
  await hostContext.close();
  await guestContext.close();
});
