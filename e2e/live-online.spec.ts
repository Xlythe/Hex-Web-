import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

test.skip(!process.env.HEX_TEST_SITE && process.env.VITE_USE_REAL_API !== 'true', 'Requires the deployed real API');

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
  await page.getByLabel(/^Password/).fill(randomUUID());
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
  const moveStarted = Date.now();
  await host.getByRole('button', { name: 'Cell R1C1 Empty' }).click();
  await expect(guest.getByRole('button', { name: /Cell R1C1 Player 1/ })).toBeVisible({ timeout: 5_000 });
  expect(Date.now() - moveStarted).toBeLessThan(5_000);
  await guest.getByRole('button', { name: 'Open Chat' }).click();
  await guest.getByPlaceholder(/message/i).fill('hello from guest');
  const chatStarted = Date.now();
  await guest.getByRole('button', { name: /Send/ }).click();
  await host.getByRole('button', { name: 'Open Chat' }).click();
  await expect(host.getByText('hello from guest')).toBeVisible({ timeout: 5_000 });
  expect(Date.now() - chatStarted).toBeLessThan(5_000);
  await host.getByRole('button', { name: 'Minimize Chat' }).click();
  await host.getByRole('button', { name: 'Forfeit Game', exact: true }).click();
  await host.getByRole('dialog').getByRole('button', { name: /Forfeit/ }).click();
  await hostContext.close();
  await guestContext.close();
});

test('Android joins a browser room and exchanges moves and chat', async ({ page }) => {
  test.skip(!process.env.HEX_ANDROID_SERIAL, 'Requires a device with the Hex instrumentation APK');
  test.setTimeout(120_000);
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const name = 'Web' + Date.now().toString(36);
  await setup(page, name);
  await page.getByRole('button', { name: 'Create Game' }).click();
  await page.getByTestId('submit-create-game-button').click();
  await expect(page.getByRole('button', { name: 'Open Chat' })).toBeVisible();
  const device = promisify(execFile)(process.env.ADB || 'adb', ['-s', process.env.HEX_ANDROID_SERIAL!,
    'shell', 'am', 'instrument', '-w', '-e', 'hexHost', name, '-e', 'class',
    'com.xlythe.hex.LiveMirrorInstrumentedTest#playWithBrowserHost',
    'com.sam.hex.test/androidx.test.runner.AndroidJUnitRunner'], { timeout: 100_000 });
  await Promise.all([
    device.then(result => expect(result.stdout).toContain('OK (1 test)')),
    (async () => {
      await page.getByRole('button', { name: 'Ready Up' }).click({ timeout: 35_000 });
      await page.getByRole('button', { name: 'Cell R1C1 Empty' }).click();
      await expect(page.getByRole('button', { name: /Cell R1C2 Player 2/ })).toBeVisible();
      await page.getByRole('button', { name: 'Open Chat' }).click();
      await expect(page.getByText('Hello from Android')).toBeVisible();
      await page.getByPlaceholder(/message/i).fill('Hello from browser');
      await page.getByRole('button', { name: /Send/ }).click();
    })(),
  ]);
});
