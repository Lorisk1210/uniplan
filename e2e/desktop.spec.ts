import { _electron as electron, expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// The desktop app has to be built first: npm run build && npm run build -w @uniplan/desktop
const appDir = path.resolve(__dirname, '../apps/desktop');
test.skip(!existsSync(path.join(appDir, 'renderer/index.html')), 'desktop app not built');

const launch = (dataDir: string) => electron.launch({ args: ['.'], cwd: appDir, env: { ...process.env, UNIPLAN_DATA_DIR: dataDir } });

test('saves to a file in the data folder and loads it again', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'uniplan-'));
  let app = await launch(dataDir);
  let page = await app.firstWindow();
  await expect(page.locator('html')).toHaveAttribute('data-shell', 'desktop');
  await page.locator('.tt-empty').getByRole('button', { name: 'Load examples' }).click();
  await expect(page.locator('.card')).toHaveCount(11);
  await app.close();

  const saved = JSON.parse(readFileSync(path.join(dataDir, 'uniplan.json'), 'utf8'));
  expect(saved.semesters[0].courses).toHaveLength(12);

  app = await launch(dataDir);
  page = await app.firstWindow();
  await expect(page.locator('.card')).toHaveCount(11);
  expect(readdirSync(path.join(dataDir, 'backups'))).toHaveLength(1);
  await app.close();
});

test('sets unreadable data aside instead of overwriting it', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'uniplan-'));
  writeFileSync(path.join(dataDir, 'uniplan.json'), '{ not json');
  const app = await launch(dataDir);
  const page = await app.firstWindow();
  await expect(page.locator('.toast')).toContainText('couldn’t be read');
  expect(readdirSync(dataDir).some((f) => f.startsWith('uniplan.unreadable-'))).toBe(true);
  await app.close();
});

test('menu commands reach the page', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'uniplan-'));
  const app = await launch(dataDir);
  const page = await app.firstWindow();
  await expect(page.locator('#btn-scope')).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('menu', 'overview'));
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'overview');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('menu', 'new-semester'));
  await expect(page.locator('#dlg-semester')).toBeVisible();
  await app.close();
});
