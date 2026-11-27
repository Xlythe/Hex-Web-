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

test('a played win highlights only the minimum chain and exports the same finish', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('hexGameLastBoardSize', '3');
    localStorage.setItem('hexPlayer2ControlType', 'human');
  });
  await page.goto('/');
  if (!await page.getByRole('button', { name: 'Cell R1C1 Empty' }).isVisible())
    await page.getByRole('button', { name: 'Play', exact: true }).click();
  // A3, A1, C1, B1, C2, A2, B3. C1 belongs to Red but is outside the shortest chain.
  for (const cell of ['R3C1', 'R1C1', 'R1C3', 'R1C2', 'R2C3', 'R2C1', 'R3C2'])
    await page.getByRole('button', { name: 'Cell ' + cell + ' Empty' }).click();
  for (const cell of ['R3C1', 'R3C2', 'R2C3'])
    await expect(page.getByRole('button', { name: 'Cell ' + cell + ' Player 1 Piece' })).toHaveCSS('opacity', '1');
  await expect(page.getByRole('button', { name: 'Cell R1C3 Player 1 Piece' })).toHaveCSS('opacity', '0.7');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export replay' }).click();
  const file = await download;
  const replay = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(replay.result).toEqual({ winner: 1, reason: 'connection' });
  expect(replay.moveList.moveList).toHaveLength(7);
});
