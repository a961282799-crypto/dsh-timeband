import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const builtin = JSON.parse(readFileSync('calendars/2026.json', 'utf8'));
// Synthetic test data, never published as an official holiday forecast.
const future = { year: 2027, papers: [builtin.source], days: [
  { name: 'Fixture holiday', date: '2027-01-04', isOffDay: true }, { name: 'Fixture holiday', date: '2027-01-05', isOffDay: true },
] };
const updateUrl = 'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/2027.json';
async function openSettings(page: Page) {
  await page.locator('.dtb-chip').click();
  if (await page.locator('.dtb-details').getAttribute('open') === null) await page.locator('summary').click();
}

test('real rc.2 host updates at the 30-day boundary and refreshes the next-year holiday timeline', async ({ page }) => {
  let requests = 0;
  await page.route(updateUrl, route => { requests++; return route.fulfill({ json: future }); });
  await page.clock.install({ time: new Date('2026-12-01T23:59:59+08:00') });
  await page.goto('/host'); await openSettings(page);
  expect(requests).toBe(0);
  await expect(page.locator('.dtb-calendar-meta, .dtb-calendar-actions, input[type="file"]')).toHaveCount(0);
  await expect(page.getByText('日历覆盖：', { exact: false })).toHaveCount(0);
  await page.clock.runFor(1000);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('dsh-timeband/calendar/v1') ?? '{}').years)).toEqual([2026, 2027]);
  expect(requests).toBe(1);
  await expect(page.locator('.dtb-calendar-notice')).toHaveCount(0);
  await page.clock.setSystemTime(new Date('2027-01-04T10:00:00+08:00')); await page.clock.runFor(1000);
  await expect(page.locator('.dtb-status strong')).toHaveText('谷时段');
  await expect(page.locator('.dtb-day-kind')).toContainText('公共假期 · 全天谷时段');
  await expect(page.locator('.dtb-segment.dtb-peak, .dtb-segment.dtb-unknown')).toHaveCount(0);
  await expect(page.locator('.dtb-root .dtb-segment, .dtb-card .dtb-segment')).toHaveCount(2);
  await expect(page.locator('.dtb-date')).toContainText('01/06 09:00');
  await expect(page.locator('[data-slot-error]')).toHaveCount(0);
});

test('automatic data persists after reload and synchronized windows do not redownload it', async ({ page, context }) => {
  let requests = 0;
  await context.route(updateUrl, route => { requests++; return route.fulfill({ json: future }); });
  await page.clock.install({ time: new Date('2027-01-04T10:00:00+08:00') });
  await page.goto('/host'); await openSettings(page);
  await expect(page.locator('.dtb-status strong')).toHaveText('谷时段');
  await page.reload(); await openSettings(page);
  await expect(page.locator('.dtb-status strong')).toHaveText('谷时段');
  const second = await context.newPage();
  await second.clock.install({ time: new Date('2027-01-04T10:00:00+08:00') });
  await second.goto('/host'); await openSettings(second);
  await expect(second.locator('.dtb-status strong')).toHaveText('谷时段');
  expect(requests).toBe(1);
  await second.close();
});

test('unpublished data checks once daily, even when the user reloads the plugin', async ({ page }) => {
  let requests = 0;
  await page.route(updateUrl, route => { requests++; return route.fulfill({ status: 404, body: '' }); });
  await page.clock.install({ time: new Date('2026-12-02T10:00:00+08:00') });
  await page.goto('/host'); await openSettings(page);
  await expect(page.locator('.dtb-calendar-notice')).toContainText('每天自动检查');
  expect(requests).toBe(1);
  await page.reload(); await openSettings(page);
  await expect(page.locator('.dtb-calendar-notice')).toContainText('每天自动检查');
  expect(requests).toBe(1);
  await page.clock.fastForward(24 * 3600_000);
  await expect.poll(() => requests).toBe(2);
  await expect(page.locator('.dtb-status strong')).toHaveText('峰时段');
});

test('an empty next-year placeholder is pending and never claims known peak hours', async ({ page }) => {
  await page.route(updateUrl, route => route.fulfill({ json: { year: 2027, papers: [], days: [] } }));
  await page.clock.install({ time: new Date('2027-01-04T10:00:00+08:00') });
  await page.goto('/host'); await openSettings(page);
  await expect(page.locator('.dtb-calendar-notice')).toContainText('尚未发布');
  await expect(page.locator('.dtb-status strong')).toHaveText('待核实');
  await expect(page.locator('.dtb-next strong')).toHaveText('—');
  expect(await page.evaluate(() => localStorage.getItem('dsh-timeband/calendar/v1'))).toBeNull();
});

test('offline failure keeps the valid calendar and reconnect downloads without user controls', async ({ page }) => {
  let offline = true;
  await page.route(updateUrl, route => offline ? route.abort('internetdisconnected') : route.fulfill({ json: future }));
  await page.clock.install({ time: new Date('2026-12-02T10:00:00+08:00') });
  await page.goto('/host'); await openSettings(page);
  await expect(page.locator('.dtb-calendar-notice')).toContainText('保留已有数据');
  await expect(page.locator('.dtb-status strong')).toHaveText('峰时段');
  offline = false; await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.dtb-calendar-notice')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('dsh-timeband/calendar/v1') ?? '{}').years)).toEqual([2026, 2027]);
});

test('invalid downloads and storage errors never replace a working calendar', async ({ page }) => {
  let payload = { ...future, papers: ['javascript:alert(1)'] };
  await page.route(updateUrl, route => route.fulfill({ json: payload }));
  await page.clock.install({ time: new Date('2026-12-02T10:00:00+08:00') });
  await page.goto('/host'); await openSettings(page);
  await expect(page.locator('.dtb-calendar-notice')).toContainText('保留已有数据');
  expect(await page.evaluate(() => localStorage.getItem('dsh-timeband/calendar/v1'))).toBeNull();
  payload = future;
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('quota'); }; window.dispatchEvent(new Event('online')); });
  await expect(page.locator('.dtb-calendar-notice')).toContainText('无法保存');
  await expect(page.locator('.dtb-status strong')).toHaveText('峰时段');
  expect(await page.evaluate(() => localStorage.getItem('dsh-timeband/calendar/v1'))).toBeNull();
});

test('both languages and small windows show concise status with no manual calendar section', async ({ page }) => {
  await page.route(updateUrl, route => route.fulfill({ status: 404, body: '' }));
  await page.clock.install({ time: new Date('2026-12-02T10:00:00+08:00') });
  await page.goto('/?live'); await openSettings(page);
  await expect(page.getByText('规则与提醒', { exact: true })).toBeVisible();
  await expect(page.locator('.dtb-calendar-notice')).toContainText('每天自动检查');
  await expect(page.getByRole('button', { name: /导入日历|恢复内置/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '获取新日历' })).toHaveCount(0);
  await page.getByRole('dialog').screenshot({ path: 'artifacts/auto-calendar-settings.png' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '中文 / English' }).click(); await openSettings(page);
  await expect(page.getByText('Rules and reminders', { exact: true })).toBeVisible();
  await expect(page.locator('.dtb-calendar-notice')).toContainText('Checking daily');
  await page.setViewportSize({ width: 320, height: 480 });
  const card = page.getByRole('dialog');
  expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole('link', { name: 'Holiday notice source' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('link', { name: 'Holiday notice source' })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'artifacts/auto-calendar-narrow-dark.png' });
});
