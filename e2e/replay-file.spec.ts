import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('import, export, reopen and play an Android replay', async ({ page }) => {
  const source = resolve('testdata/android-game.rhex');
  await page.goto('/');
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await page.getByLabel('Import replay').setInputFiles(source);
  const replay = page.getByRole('button', { name: /Replay game from/ });
  await expect(replay).toContainText('Alice Wins');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export replay' }).click();
  const path = await (await download).path();
  expect(await readFile(path!, 'utf8')).toBe(await readFile(source, 'utf8'));
  await page.reload();
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await replay.click();
  await expect(page.getByRole('button', { name: /Stop Replay/ }).first()).toBeVisible();
});
