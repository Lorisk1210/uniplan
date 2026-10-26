import { expect, test } from '@playwright/test';
import { examplePlan } from './examples';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => { throw e; });
  // Only before the first load, so reloads keep what the test changed.
  await page.addInitScript((plan) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('uniplan:v2', plan);
  }, JSON.stringify(examplePlan()));
  await page.goto('/');
});

test('shows one section at a time, picked from the tab bar', async ({ page }) => {
  const tabs = page.locator('#tabbar');
  await expect(tabs).toBeVisible();
  await expect(page.locator('.timetable')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();

  await tabs.getByRole('button', { name: 'Courses' }).click();
  await expect(page.locator('.card').first()).toBeVisible();
  await expect(page.locator('.timetable')).toBeHidden();

  await tabs.getByRole('button', { name: 'Credits' }).click();
  await expect(page.locator('#reqs .reqs')).toBeVisible();
  await expect(page.locator('.timetable')).toBeHidden();

  await tabs.getByRole('button', { name: 'Study' }).click();
  await expect(page.locator('.ov-hero')).toBeVisible();
  await expect(page.locator('.waves')).toBeHidden();
});

test('the timetable shows one day, chosen from the day strip', async ({ page }) => {
  await page.locator('#tabbar').getByRole('button', { name: 'Week' }).click();
  await page.locator('.ds-day[data-day="4"]').click();
  await expect(page.locator('.tt-col')).toHaveCount(1);
  await expect(page.locator('.tt-col')).toHaveAttribute('data-day', '4');
  await expect(page.locator('.tt-col .event', { hasText: 'Data Visualization' })).toBeVisible();
});

test('dialogs fill the screen', async ({ page }) => {
  await page.locator('#btn-add').click();
  const vp = page.viewportSize()!;
  // Polls until the opening animation has settled.
  await expect.poll(async () => page.locator('#dlg-editor').boundingBox()).toEqual({ x: 0, y: 0, width: vp.width, height: vp.height });
});
