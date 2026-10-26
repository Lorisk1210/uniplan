import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { examplePlan } from './examples';

// The desktop app has to be built first: npm run build && npm run build -w @uniplan/desktop
const appDir = path.resolve(__dirname, '../apps/desktop');
test.skip(!existsSync(path.join(appDir, 'renderer/index.html')), 'desktop app not built');

const launch = (dataDir: string) => electron.launch({ args: ['.'], cwd: appDir, env: { ...process.env, UNIPLAN_DATA_DIR: dataDir } });

/**
 * The window, once the page listens for menu commands and updater states. `#btn-scope` is in the static
 * HTML, so it can show before that; `data-shell` is set in the same step that adds the listeners.
 */
async function ready(app: ElectronApplication) {
  const page = await app.firstWindow();
  await expect(page.locator('html')).toHaveAttribute('data-shell', 'desktop');
  return page;
}

test('saves to a file in the data folder and loads it again', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'uniplan-'));
  writeFileSync(path.join(dataDir, 'uniplan.json'), JSON.stringify(examplePlan()));
  let app = await launch(dataDir);
  let page = await app.firstWindow();
  await expect(page.locator('html')).toHaveAttribute('data-shell', 'desktop');
  await expect(page.locator('.card')).toHaveCount(11);
  await page.locator('.card', { hasText: 'Japanese I' }).click();
  await page.locator('#dlg-editor [name=name]').fill('Japanese II');
  await page.locator('#dlg-editor').getByRole('button', { name: 'Save' }).click();
  await app.close();

  const saved = JSON.parse(readFileSync(path.join(dataDir, 'uniplan.json'), 'utf8'));
  expect(saved.semesters[0].courses).toHaveLength(12);
  expect(saved.semesters[0].courses.map((c: { name: string }) => c.name)).toContain('Japanese II');

  app = await launch(dataDir);
  page = await app.firstWindow();
  await expect(page.locator('.card', { hasText: 'Japanese II' })).toBeVisible();
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

test('imports a backup picked in the native open dialog', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'uniplan-'));
  const backup = path.join(dataDir, 'backup.json');
  writeFileSync(backup, JSON.stringify({ app: 'uniplan', version: 2, semesters: [{ name: 'SoSe 2026', courses: [{ name: 'From the backup', stage: 2 }] }] }));
  const app = await launch(dataDir);
  const page = await ready(app);
  await app.evaluate(({ dialog, BrowserWindow }, file) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog;
    BrowserWindow.getAllWindows()[0].webContents.send('menu', 'import');
  }, backup);
  await expect(page.locator('#btn-scope')).toContainText('SoSe 2026');
  await page.locator('[data-view="final"]').click();
  await expect(page.locator('.card', { hasText: 'From the backup' })).toBeVisible();
  await app.close();
});

test('menu commands reach the page', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'uniplan-'));
  const app = await launch(dataDir);
  const page = await ready(app);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('menu', 'overview'));
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'overview');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('menu', 'new-semester'));
  await expect(page.locator('#dlg-semester')).toBeVisible();
  await app.close();
});

test('checking for updates by hand says when the app can’t update itself', async () => {
  const app = await launch(mkdtempSync(path.join(tmpdir(), 'uniplan-')));
  const page = await ready(app);
  const version = await app.evaluate(({ app }) => app.getVersion());
  await page.locator('#btn-menu').click();
  const item = page.locator('[data-menu="updates"]');
  await expect(item).toContainText(version);
  await item.click();
  // `electron .` isn't the installed app, so there's nothing to update.
  await expect(page.locator('.toast')).toContainText('can’t update itself');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('menu', 'check-updates'));
  await expect(page.locator('.toast')).toHaveCount(2);
  await app.close();
});

test('the update button follows the updater', async () => {
  const app = await launch(mkdtempSync(path.join(tmpdir(), 'uniplan-')));
  const page = await ready(app);
  const btn = page.locator('#btn-update');
  await expect(btn).toBeHidden();
  const send = (state: object) => app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0].webContents.send('update:state', s), state);
  await send({ status: 'available', version: '9.9.9' });
  await expect(btn).toHaveText('Update to 9.9.9');
  await expect(btn).toBeEnabled();
  await send({ status: 'downloading', version: '9.9.9', percent: 40 });
  await expect(btn).toHaveText('Downloading 40%');
  await expect(btn).toBeDisabled();
  await send({ status: 'ready', version: '9.9.9' });
  await expect(btn).toHaveText('Restart to update');
  await send({ status: 'latest' });
  await expect(btn).toBeHidden();
  await app.close();
});
