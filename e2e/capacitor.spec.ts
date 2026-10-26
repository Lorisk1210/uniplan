import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { examplePlan } from './examples';

// Runs the web build the way the Android app does: Capacitor's real native-bridge.js, with a small
// stand-in for the native side that answers the plugin calls the app makes.
const bridge = readFileSync(path.resolve(__dirname, '../node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js'), 'utf8');

function fakeNative() {
  const w = window as unknown as Record<string, any>;
  w.__calls = [];
  w.__files = {};
  w.__listeners = {};
  const methods = (...names: string[]) => names.map((name) => ({ name, rtype: 'promise' }));
  w.Capacitor = {
    PluginHeaders: [
      { name: 'Preferences', methods: methods('get', 'set', 'remove', 'keys', 'clear') },
      { name: 'Filesystem', methods: methods('writeFile') },
      { name: 'Share', methods: methods('share', 'canShare') },
      { name: 'SystemBars', methods: methods('setStyle', 'show', 'hide') },
      { name: 'App', methods: [...methods('minimizeApp', 'removeAllListeners'), { name: 'addListener', rtype: 'callback' }] },
    ],
  };
  w.androidBridge = {
    postMessage(json: string) {
      const c = JSON.parse(json);
      if (!c.pluginId || c.pluginId === 'Console' || c.callbackId === '-1') return;
      w.__calls.push(`${c.pluginId}.${c.methodName}`);
      const o = c.options;
      // Listeners get called later, when the test "presses" a hardware button.
      if (c.methodName === 'addListener') { w.__listeners[`${c.pluginId}.${o.eventName}`] = c.callbackId; return; }
      let data: unknown = {};
      // "Device" storage that outlives page reloads, like the app's preferences store.
      if (c.pluginId === 'Preferences' && c.methodName === 'get') data = { value: localStorage.getItem(`device:${o.key}`) };
      if (c.pluginId === 'Preferences' && c.methodName === 'set') localStorage.setItem(`device:${o.key}`, o.value);
      if (c.pluginId === 'Filesystem') { w.__files[o.path] = o.data; data = { uri: `file:///data/cache/${o.path}` }; }
      if (c.pluginId === 'SystemBars') w.__barStyle = o.style;
      setTimeout(() => w.Capacitor.fromNative({ callbackId: c.callbackId, pluginId: c.pluginId, methodName: c.methodName, success: true, data }), 0);
    },
  };
}

const pressBack = (page: Page) => page.evaluate(() => {
  const w = window as any;
  w.Capacitor.fromNative({ callbackId: w.__listeners['App.backButton'], pluginId: 'App', methodName: 'addListener', success: true, data: { canGoBack: false } });
});

async function open(page: Page) {
  page.on('pageerror', (e) => { throw e; });
  await page.addInitScript(fakeNative);
  await page.addInitScript(bridge);
  await page.goto('/');
}

test('stores data in the native preferences store', async ({ page }) => {
  await open(page);
  await expect(page.locator('html')).toHaveAttribute('data-shell', 'mobile');
  await expect(page.locator('html')).toHaveAttribute('data-os', 'android');
  // Put the examples on the "device", then change a course in the app.
  await page.evaluate((plan) => localStorage.setItem('device:uniplan:data', plan), JSON.stringify(examplePlan()));
  await page.reload();
  await page.locator('#tabbar').getByRole('button', { name: 'Courses' }).click();
  await expect(page.locator('.card')).toHaveCount(11);
  await page.locator('.card', { hasText: 'Japanese I' }).click();
  await page.locator('#dlg-editor [name=name]').fill('Japanese II');
  await page.locator('#dlg-editor').getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('device:uniplan:data'))).toContain('Japanese II');
  // Nothing went to web storage.
  expect(await page.evaluate(() => localStorage.getItem('uniplan:v2'))).toBeNull();

  await page.reload();
  await page.locator('#tabbar').getByRole('button', { name: 'Courses' }).click();
  await expect(page.locator('.card', { hasText: 'Japanese II' })).toBeVisible();
});

test('exports through the share sheet and follows the theme with the status bar', async ({ page }) => {
  await open(page);
  await page.locator('#btn-menu').click();
  await expect(page.locator('#menu')).not.toContainText('Print');
  await page.locator('#menu').getByRole('button', { name: 'Export backup' }).click();
  await expect(page.locator('.toast')).toContainText('Exported');
  const files = await page.evaluate(() => (window as any).__files);
  const [name] = Object.keys(files);
  expect(name).toMatch(/^uniplan-backup-\d{4}-\d{2}-\d{2}\.json$/);
  expect(JSON.parse(files[name])).toMatchObject({ app: 'uniplan', version: 2 });
  expect(await page.evaluate(() => (window as any).__calls)).toContain('Share.share');

  await page.locator('#btn-menu').click();
  await page.locator('[data-theme-set="dark"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__barStyle)).toBe('DARK');
});

test('the Android back button closes what is on top, then sends the app to the background', async ({ page }) => {
  await open(page);
  await page.locator('#btn-add').click();
  await expect(page.locator('#dlg-editor')).toBeVisible();
  await pressBack(page);
  await expect(page.locator('#dlg-editor')).toBeHidden();

  await page.locator('#tabbar').getByRole('button', { name: 'Study' }).click();
  await pressBack(page);
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'semester');

  await pressBack(page);
  await expect.poll(() => page.evaluate(() => (window as any).__calls)).toContain('App.minimizeApp');
});
