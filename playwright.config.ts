import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}',
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixelRatio: 0.001,
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'phone-portrait',
      use: {
        ...devices['Pixel 7'],
        channel: 'chrome',
        deviceScaleFactor: 1,
        viewport: { width: 412, height: 915 },
      },
    },
    {
      name: 'phone-landscape',
      use: {
        ...devices['Pixel 7 landscape'],
        channel: 'chrome',
        deviceScaleFactor: 1,
        viewport: { width: 915, height: 412 },
      },
    },
  ],
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
