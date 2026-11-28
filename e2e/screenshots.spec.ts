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

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    Date.now = () => Date.UTC(2026, 0, 15, 12, 0, 0);
    Math.random = () => 0.25;
  });
  await page.goto('/');
  if (testInfo.project.name === 'phone-landscape') {
    if (testInfo.title.includes('wheel') || testInfo.title.includes('landscape main menu')) return;
    await page.getByRole('button', { name: 'Play', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Hex' })).toBeAttached();
});

test('local game page', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'phone-landscape') {
    for (const name of ['Exit', 'Restart current game', 'Undo last move']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 });
    }
  }
  await screenshot(page, 'local-game');
});

test('Android inspired wheel opens its menu destinations', async ({ page }) => {
  await page.locator('.hex-wheel-help').click();
  await expect(page.getByRole('heading', { name: 'Game Rules & Help' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: /close/i }).first().click();
  await page.locator('.hex-wheel-settings').click();
  await expect(page.getByRole('heading', { name: 'Game Settings' })).toBeVisible();
});

test('wheel follows a swipe and its labels rotate with it', async ({ page }) => {
  const wheel = page.locator('.hex-wheel');
  const bounds = await wheel.boundingBox();
  expect(bounds).not.toBeNull();
  const centerX = bounds!.x + bounds!.width / 2;
  const centerY = bounds!.y + bounds!.height / 2;
  const radius = bounds!.width * .39;
  const art = wheel.locator('svg');
  const before = await art.evaluate(element => getComputedStyle(element).transform);
  await page.mouse.move(centerX - radius, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX, centerY - radius, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => art.evaluate(element => getComputedStyle(element).transform)).not.toBe(before);
  await expect(page.locator('.hex-wheel-replay')).toHaveAttribute('transform', 'rotate(180)');
  await page.locator('.hex-wheel-help').click();
  await expect(page.getByRole('heading', { name: 'Game Rules & Help' })).toBeVisible();
});

test('wheel tolerates finger jitter and shows feedback on the pressed sector', async ({ page }) => {
  const sector = page.locator('.hex-wheel-help');
  const icon = sector.locator('image');
  const bounds = (await icon.boundingBox())!;
  const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 4, y - 3);
  await expect(sector.locator('.wheel-wedge')).toHaveCSS('fill', 'rgb(219, 222, 221)');
  await expect(page.locator('.hex-wheel-art')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await screenshot(page, 'pressed-wheel');
  await page.mouse.up();
  await expect(page.getByRole('heading', { name: 'Game Rules & Help' })).toBeVisible();
});

test('touchscreen wheel opens a section after a small finger movement', async ({ page, context, isMobile }) => {
  test.skip(!isMobile);
  const icon = page.locator('.hex-wheel-help image');
  await icon.scrollIntoViewIfNeeded();
  const box = (await icon.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const input = await context.newCDPSession(page);
  await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 4, y: y + 2 }] });
  await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('heading', { name: 'Game Rules & Help' })).toBeVisible();
});

test('wheel crossing the hub has no half-turn or accidental click', async ({ page }) => {
  const wheel = page.locator('.hex-wheel');
  const box = (await wheel.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2, radius = box.width * .32;
  await page.mouse.move(x - radius, y);
  await page.mouse.down();
  await page.mouse.move(x + radius, y);
  await page.mouse.up();
  await expect(wheel.locator('svg')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('wheel flick carries farther than a paused drag and snaps to a sector', async ({ page }) => {
  const wheel = page.locator('.hex-wheel');
  const box = (await wheel.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2, r = box.width * .3;
  const angle = () => wheel.locator('svg').evaluate(el => Number(el.style.transform.match(/rotate\(([-.\d]+)deg\)/)?.[1]));
  for (const pause of [true, false]) {
    const before = await angle();
    await page.mouse.move(x - r, y);
    await page.mouse.down();
    await page.mouse.move(x, y - r, { steps: 8 });
    if (pause) await page.waitForTimeout(120);
    await page.mouse.up();
    const destination = await angle();
    expect(destination % 60).toBe(0);
    if (pause) expect(Math.abs(destination - before - 90)).toBeLessThanOrEqual(30.01);
    else expect(destination - before).toBeGreaterThan(120);
    await expect.poll(() => wheel.locator('svg').evaluate(el => el.getAnimations().length)).toBe(0);
  }
});

test('board actions undo, confirm restart and resume after exit', async ({ page }) => {
  const cell = page.getByRole('button', { name: /^Cell R1C1 / });
  const undo = page.getByRole('button', { name: 'Undo last move' });
  const restart = page.getByRole('button', { name: 'Restart current game' });
  const exit = page.getByRole('button', { name: 'Exit', exact: true });
  await cell.click();
  await exit.click();
  await expect(cell).toBeHidden();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(cell).toHaveAccessibleName(/Piece/);
  await undo.click();
  await expect(cell).toHaveAccessibleName(/Empty/);
  await cell.click();
  await restart.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset Game' }).click();
  await expect(cell).toHaveAccessibleName(/Empty/);
});

test('fullscreen stays in the top right corner in both modes', async ({ page }) => {
  for (const name of ['Enter Fullscreen', 'Exit Fullscreen']) {
    const toggle = page.getByRole('button', { name });
    const bounds = (await toggle.boundingBox())!;
    const card = (await page.locator('.hex-game-card').boundingBox())!;
    expect(bounds.y - card.y).toBeLessThanOrEqual(12);
    expect(card.x + card.width - bounds.x - bounds.width).toBeLessThanOrEqual(12);
    await toggle.click();
  }
  await expect(page.getByRole('button', { name: 'Enter Fullscreen' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Restart current game' }).click();
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

test('landscape main menu matches the Android composition', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-landscape');
  await screenshot(page, 'main-menu');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cell R1C1 Empty' })).toBeVisible();
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
  await expect(page.locator('.hex-wheel')).toBeVisible();
});
