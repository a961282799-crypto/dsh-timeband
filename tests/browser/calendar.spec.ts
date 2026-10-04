import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const builtin = JSON.parse(readFileSync('calendars/2026.json', 'utf8'));
// Controlled test fixture, not a claim about the official 2027 holiday dates.
const future = { ...builtin, years: [2027], holidays: [['2027-01-04', '2027-01-05']] };
const file = (data: unknown) => ({ name: 'calendar.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
async function openCalendar(page: import('@playwright/test').Page) {
  await page.locator('.dtb-chip').click();
  if (await page.locator('.dtb-details').getAttribute('open') === null) await page.getByText('规则、日历与提醒', { exact: true }).click();
}

test('import updates both tracks, persists after reload, syncs across windows and restores', async ({ page, context }) => {
  await page.goto('/?now=2027-01-04T10:00:00%2B08:00');
  await openCalendar(page);
  await expect(page.locator('.dtb-status strong')).toHaveText('待核实');
  await page.getByLabel('导入日历', { exact: true }).setInputFiles(file(future));
  await expect(page.getByRole('status')).toHaveText('日历已导入并保存，时间轴已更新。');
  await expect(page.locator('.dtb-status strong')).toHaveText('谷时段');
  await expect(page.locator('.dtb-date')).toContainText('01/06 09:00');
  await expect(page.locator('.dtb-segment.dtb-peak, .dtb-segment.dtb-unknown')).toHaveCount(0);
  await expect(page.locator('.dtb-root .dtb-segment, .dtb-card .dtb-segment')).toHaveCount(2);
  await expect(page.locator('.dtb-calendar-meta')).toContainText('2027 · 本地导入');
  await page.reload(); await openCalendar(page);
  await expect(page.locator('.dtb-status strong')).toHaveText('谷时段');
  const second = await context.newPage();
  await second.goto('/?now=2027-01-04T10:00:00%2B08:00'); await openCalendar(second);
  await expect(second.locator('.dtb-status strong')).toHaveText('谷时段');
  await page.getByRole('button', { name: '恢复内置', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('已恢复内置日历。');
  await expect(page.locator('.dtb-status strong')).toHaveText('待核实');
  await expect(second.locator('.dtb-status strong')).toHaveText('待核实');
  await second.close();
  await page.keyboard.press('Escape');
  await page.getByLabel('预览场景').selectOption('2026-10-01T10:30:00+08:00');
  await openCalendar(page);
  await expect(page.locator('.dtb-status strong')).toHaveText('谷时段');
  await page.getByRole('dialog').screenshot({ path: 'artifacts/calendar-controls.png' });
});

test('invalid files and failed persistence keep the valid calendar intact', async ({ page }) => {
  await page.goto('/?now=2027-01-04T10:00:00%2B08:00'); await openCalendar(page);
  await page.getByLabel('导入日历', { exact: true }).setInputFiles(file(future));
  await expect(page.locator('.dtb-status strong')).toHaveText('谷时段');
  for (const invalid of [{ ...future, source: 'javascript:alert(1)' }, { ...future, holidays: [['2027-02-30', '2027-03-01']] }]) {
    await page.getByLabel('导入日历', { exact: true }).setInputFiles(file(invalid));
    await expect(page.getByRole('status')).toContainText('原日历保持不变');
    await expect(page.locator('.dtb-status strong')).toHaveText('谷时段');
  }
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('quota'); }; });
  await page.getByLabel('导入日历', { exact: true }).setInputFiles(file(builtin));
  await expect(page.getByRole('status')).toContainText('无法保存日历');
  await expect(page.locator('.dtb-status strong')).toHaveText('谷时段');
});

test('expiry and corrupt-storage notices are readable in both languages and small windows', async ({ page }) => {
  await page.goto('/?now=2026-12-01T10:00:00%2B08:00'); await page.locator('.dtb-chip').click();
  await expect(page.locator('.dtb-calendar-notice')).toHaveCount(0);
  await page.goto('/?now=2026-12-02T10:00:00%2B08:00'); await openCalendar(page);
  await expect(page.locator('.dtb-calendar-notice')).toContainText('2026-12-31');
  await page.getByRole('dialog').screenshot({ path: 'artifacts/calendar-expiry.png' });
  await page.evaluate(() => localStorage.setItem('dsh-timeband/calendar/v1', '{invalid'));
  await page.reload(); await openCalendar(page);
  await expect(page.getByRole('status')).toContainText('当前使用内置日历');
  await page.getByRole('button', { name: '恢复内置', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('已恢复内置日历。');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '中文 / English' }).click();
  await page.locator('.dtb-chip').click();
  if (await page.locator('.dtb-details').getAttribute('open') === null) await page.getByText('Rules, calendar and reminders', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Import calendar', exact: true })).toBeVisible();
  await expect(page.locator('.dtb-calendar-notice')).toContainText('Calendar expires soon');
  await page.setViewportSize({ width: 320, height: 480 });
  const card = page.getByRole('dialog');
  expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole('link', { name: 'Holiday notice source' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('link', { name: 'Holiday notice source' })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'artifacts/calendar-narrow-dark.png' });
});
