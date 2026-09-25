import { expect, Page, test } from '@playwright/test';

const screenshot = async (page: Page, name: string) => {
  await page.addStyleTag({
    content: `
      html, body { overflow-anchor: none !important; }
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        scroll-behavior: auto !important;
      }
    `,
  });
  await page.evaluate(() => {
    // Reset after disabling animations and scroll anchoring, which can move a
    // short landscape viewport when a dialog or waiting room replaces content.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    document.scrollingElement?.scrollTo(0, 0);
    window.scrollTo(0, 0);
    document.getElementById('root')?.scrollTo(0, 0);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  if ((page.viewportSize()?.height ?? Infinity) <= 500) {
    await expect.poll(() => page.evaluate(() =>
      document.getElementById('root')?.scrollTop ?? -1,
    )).toBe(0);
    await expect.poll(() => page.locator('.hex-game-card').evaluate(card =>
      Math.round(card.getBoundingClientRect().top),
    )).toBeGreaterThanOrEqual(0);
  }
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  await expect(page).toHaveScreenshot(`${name}.png`);
};

const scrollDialogToBottom = async (page: Page) => {
  await page.getByRole('dialog').locator('.overflow-y-auto').first().evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
};

const openSettings = async (page: Page) => {
  await page.getByRole('button', { name: 'Open Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Game Settings' })).toBeVisible();
};

const configureOnlinePlay = async (page: Page) => {
  await openSettings(page);
  const profilesSection = page.getByRole('button', { name: /Player Profiles/ });
  if ((await profilesSection.getAttribute('aria-expanded')) !== 'true') {
    await profilesSection.click();
  }
  await page.locator('input[name="player2ControlType"][value="online"]').check();
  await page.getByRole('button', { name: 'Apply Settings' }).click();
  await expect(
    page.getByRole('heading', { name: 'Online Play Requires Login' }),
  ).toBeVisible();
};

const createAccount = async (page: Page) => {
  await page.getByRole('button', { name: 'Sign Up' }).click();
  await page.getByLabel(/Nickname/).fill('VisualTester');
  await page.getByLabel(/^Password/).fill('correct horse battery staple');
  await page.getByLabel(/Email/).fill('visual@example.com');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Sign Up', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Open user profile menu' }),
  ).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    Date.now = () => Date.UTC(2026, 0, 15, 12, 0, 0);
    Math.random = () => 0.25;
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hex' })).toBeVisible();
});

test('local game page', async ({ page }) => {
  await screenshot(page, 'local-game');
});

test('help page', async ({ page }) => {
  await page.getByRole('button', { name: 'Open Help' }).click();
  await expect(page.getByRole('heading', { name: 'Game Rules & Help' })).toBeVisible();
  await screenshot(page, 'help');
  await scrollDialogToBottom(page);
  await screenshot(page, 'help-bottom');
});

test('settings page', async ({ page }) => {
  await openSettings(page);
  await screenshot(page, 'settings');
  await scrollDialogToBottom(page);
  await screenshot(page, 'settings-bottom');
});

test('new-game confirmation page', async ({ page }) => {
  await page.getByRole('button', { name: 'Cell R1C1 Empty', exact: true }).click();
  await page.getByRole('button', { name: 'Reset current game' }).click();
  await expect(page.getByRole('heading', { name: 'Reset Game?' })).toBeVisible();
  await screenshot(page, 'new-game-confirmation');
});

test('online login-required, login, and signup pages', async ({ page }) => {
  await configureOnlinePlay(page);
  await screenshot(page, 'online-login-required');

  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
  await screenshot(page, 'login');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Sign Up' }).click();
  await expect(
    page.getByRole('heading', { name: 'Sign Up for Online Play' }),
  ).toBeVisible();
  await screenshot(page, 'signup');
});

test('profile and online lobby pages', async ({ page }) => {
  await configureOnlinePlay(page);
  await createAccount(page);

  await page.getByRole('button', { name: 'Open user profile menu' }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your Profile' })).toBeVisible();
  await screenshot(page, 'profile');
  await page.getByRole('button', { name: 'Close profile' }).click();

  await page.getByRole('button', { name: 'Browse Games' }).click();
  await expect(page.getByRole('heading', { name: 'Game Lobby' })).toBeVisible();
  await screenshot(page, 'online-lobby');
});

test('create-game and waiting-room pages', async ({ page }) => {
  await configureOnlinePlay(page);
  await createAccount(page);

  await page.getByRole('button', { name: 'Create Game' }).click();
  await expect(page.getByRole('heading', { name: 'Create Online Game' })).toBeVisible();
  await screenshot(page, 'create-online-game');

  await page.getByTestId('submit-create-game-button').click();
  await expect(page.getByText(/Waiting Room: Game created/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Chat' })).toHaveCount(1);
  await screenshot(page, 'waiting-room');
});

test('online game and chat pages', async ({ page }) => {
  await configureOnlinePlay(page);
  await createAccount(page);
  await page.getByRole('button', { name: 'Create Game' }).click();
  await page.getByTestId('submit-create-game-button').click();

  await expect(page.getByRole('button', { name: 'Open Chat' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('button', { name: 'Open Chat' })).toHaveCount(1);
  await screenshot(page, 'online-game');

  await page.getByRole('button', { name: 'Open Chat' }).click();
  await expect(page.getByRole('heading', { name: 'Game Chat' })).toBeVisible();
  await screenshot(page, 'game-chat');
});
