import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Puts items into localStorage before the app's first load (not on reloads). */
async function seed(page: Page, items: Record<string, unknown>) {
  await page.addInitScript((entries) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, JSON.stringify(v));
  }, items);
}

async function loadExamples(page: Page) {
  await page.goto('/');
  await page.locator('.tt-empty').getByRole('button', { name: 'Load examples' }).click();
  await expect(page.locator('.card')).toHaveCount(11);
}

async function advance(page: Page, name: string) {
  const card = page.locator('.card', { hasText: name });
  await card.hover();
  await card.locator('[data-act="advance"]').click();
}

async function menu(page: Page, item: string) {
  await page.locator('#btn-menu').click();
  await page.locator('#menu').getByRole('button', { name: item }).click();
}

async function scope(page: Page, item: string | RegExp) {
  await page.locator('#btn-scope').click();
  await page.locator('#scope-menu').getByRole('button', { name: item }).click();
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => { throw e; });
});

test('narrows example courses down to a final timetable', async ({ page }) => {
  await loadExamples(page);
  await expect(page.locator('.stat.bad b')).toHaveText('2');
  await advance(page, 'Machine Learning');
  await page.locator('[data-view="final"]').click();
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.event').first()).toContainText('Machine Learning');
  await expect(page.locator('.stat').nth(1)).toContainText('8');
});

test('semesters keep their own courses and the overview counts only Final ones', async ({ page }) => {
  await loadExamples(page);
  await advance(page, 'Machine Learning');

  await scope(page, 'New semester…');
  const dlg = page.locator('#dlg-semester');
  await dlg.locator('[name=name]').fill('Exchange term');
  await dlg.locator('[name=carry]').check();
  await dlg.getByRole('button', { name: 'Create semester' }).click();
  await expect(page.locator('#btn-scope')).toContainText('Exchange term');
  // Ideas and shortlist came along; the course already in Final stayed behind.
  await expect(page.locator('.card')).toHaveCount(10);
  await expect(page.locator('.card', { hasText: 'Machine Learning' })).toHaveCount(0);

  await advance(page, 'Algorithms & Data Structures II');

  // The requirements count this semester's plan plus Final courses from elsewhere.
  await expect(page.locator('#reqs .others').first()).toContainText('+8 CP from another semester');

  await scope(page, 'Study overview');
  await expect(page.locator('.ov-hero b')).toHaveText('15');
  await expect(page.locator('.sem-card[data-sem]')).toHaveCount(2);
  await expect(page.locator('.transcript tr[data-edit]')).toHaveCount(2);
  const theory = page.locator('#overview .rq-row', { hasText: 'Theorie' });
  await expect(theory.locator('.rq-num b')).toHaveText('7');
});

test('moves a course to another semester from the editor', async ({ page }) => {
  await loadExamples(page);
  await scope(page, 'New semester…');
  await page.locator('#dlg-semester [name=name]').fill('Later');
  await page.locator('#dlg-semester').getByRole('button', { name: 'Create semester' }).click();
  await expect(page.locator('#btn-scope')).toContainText('Later');
  // Undated semesters sort last, so the examples' semester is the previous one.
  await page.keyboard.press('[');
  await page.locator('.card', { hasText: 'Japanese I' }).click();
  const ed = page.locator('#dlg-editor');
  await ed.locator('select[name=semester]').selectOption({ label: 'Later' });
  await ed.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.card')).toHaveCount(10);
  await page.locator('.toast').getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('#btn-scope')).toContainText('Later');
  await expect(page.locator('.card')).toHaveCount(1);
});

test('keeps data across reloads and migrates version 1 data', async ({ page }) => {
  await seed(page, { 'uniplan:v1': [{ id: 'old', name: 'Legacy course', credits: 5, stage: 2, sessions: [{ day: 1, start: '10:00', end: '12:00' }] }] });
  await page.goto('/');
  await expect(page.locator('#btn-scope')).toContainText(/WiSe|SoSe/);
  await expect(page.locator('[data-view="final"] .n')).toHaveText('1');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('uniplan:v2')!));
  expect(stored.version).toBe(2);
  expect(stored.semesters[0].courses[0].id).toBe('old');

  await page.locator('[data-view="final"]').click();
  await page.reload();
  await expect(page.locator('.card', { hasText: 'Legacy course' })).toBeVisible();
});

test('exports a backup and restores it', async ({ page }) => {
  await loadExamples(page);
  const download = page.waitForEvent('download');
  await menu(page, 'Export backup (.json)');
  const file = await (await download).path();
  const backup = JSON.parse(readFileSync(file, 'utf8'));
  expect(backup).toMatchObject({ app: 'uniplan', version: 2 });
  expect(backup.semesters[0].courses).toHaveLength(12);

  await menu(page, 'Delete all courses in');
  await page.locator('#dlg-choice').getByRole('button', { name: 'Delete all' }).click();
  await expect(page.locator('.card')).toHaveCount(0);

  await page.locator('#import-file').setInputFiles(file);
  await expect(page.locator('.card')).toHaveCount(11);
});

test('edits the degree requirements', async ({ page }) => {
  await page.goto('/');
  await menu(page, 'Degree requirements…');
  const dlg = page.locator('#dlg-program');
  await dlg.locator('[name=preset]').selectOption('bachelor-180');
  await dlg.getByRole('button', { name: 'Use preset' }).click();
  await dlg.getByRole('button', { name: 'Add group' }).click();
  await dlg.locator('.pg-head [name=label]').fill('Electives');
  await dlg.locator('.pa [name=label]').fill('Anything goes');
  await dlg.locator('.pa [name=min]').fill('12');
  await dlg.getByRole('button', { name: 'Save' }).click();

  await scope(page, 'Study overview');
  await expect(page.locator('.ov-hero')).toContainText('/ 180 credits');
  await expect(page.locator('#overview .rq-row.g')).toContainText('Electives');

  await page.locator('#btn-scope').click();
  await page.locator('#scope-menu .scope-item').nth(1).click();
  await page.locator('#btn-add').click();
  await expect(page.locator('#dlg-editor select[name=area] option', { hasText: 'Anything goes' })).toHaveCount(1);
});

test('undoes and redoes changes', async ({ page }) => {
  await loadExamples(page);
  const card = page.locator('.card', { hasText: 'Computer Vision' });
  await card.hover();
  await card.locator('[data-act="drop"]').click();
  await expect(page.locator('.card')).toHaveCount(10);
  await page.locator('body').press('ControlOrMeta+z');
  await expect(page.locator('.card')).toHaveCount(11);
  await page.locator('body').press('ControlOrMeta+Shift+z');
  await expect(page.locator('.card')).toHaveCount(10);
});

test('exports the final timetable over the lecture period', async ({ page }) => {
  await loadExamples(page);
  await advance(page, 'Machine Learning');
  await scope(page, /^Edit /);
  const dlg = page.locator('#dlg-semester');
  await dlg.locator('[name=start]').fill('2026-10-19');
  await dlg.locator('[name=end]').fill('2027-02-12');
  await dlg.getByRole('button', { name: 'Save' }).click();

  const download = page.waitForEvent('download');
  await menu(page, 'to calendar (.ics)');
  const ics = readFileSync(await (await download).path(), 'utf8');
  expect(ics).toContain('RRULE:FREQ=WEEKLY;UNTIL=20270212T235959');
  expect(ics).toContain('DTSTART:20261019T101500');
  expect(ics).toContain('SUMMARY:Machine Learning (Lecture)');
});
