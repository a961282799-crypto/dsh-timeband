import { test, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

declare global {
  interface Window {
    __reminderNotices: { title: string; body: string; tag: string; closed: boolean }[];
    __reminderInstances: { onerror: ((event: Event) => unknown) | null }[];
    __reminderRequests: number;
    __reminderPermission: string;
  }
}
async function stub(context: BrowserContext, permission = 'granted', result = 'granted', failDelivery = false) {
  await context.addInitScript(({ permission, result, failDelivery }) => {
    window.__reminderNotices = []; window.__reminderInstances = []; window.__reminderRequests = 0; window.__reminderPermission = permission;
    class TestNotification {
      static get permission() { return window.__reminderPermission; }
      static async requestPermission() { window.__reminderRequests++; window.__reminderPermission = result; return result; }
      onclose: ((event: Event) => unknown) | null = null;
      onerror: ((event: Event) => unknown) | null = null;
      onclick: ((event: Event) => unknown) | null = null;
      notice: Window['__reminderNotices'][number];
      constructor(title: string, options: NotificationOptions) {
        if (failDelivery) throw new Error('controlled notification failure');
        this.notice = { title, body: options.body ?? '', tag: options.tag ?? '', closed: false };
        window.__reminderNotices.push(this.notice); window.__reminderInstances.push(this);
      }
      close() { this.notice.closed = true; this.onclose?.(new Event('close')); }
    }
    Object.defineProperty(window, 'Notification', { configurable: true, value: permission === 'unsupported' ? undefined : TestNotification });
  }, { permission, result, failDelivery });
}
async function open(page: Page, english = false) {
  await page.locator('.dtb-chip').click();
  if (await page.locator('.dtb-details').getAttribute('open') === null) await page.getByText(english ? 'Rules, calendar and reminders' : '规则、日历与提醒', { exact: true }).click();
}
const toggle = (page: Page) => page.getByRole('switch');
const count = (page: Page) => page.evaluate(() => window.__reminderNotices.length);
async function freezeClock(page: Page, time: Date) {
  // Pause before loading the plugin so page-load duration cannot consume the
  // remaining millisecond in a boundary test, particularly on busy CI workers.
  await page.clock.install({ time: new Date(time.getTime() - 60_000) });
  await page.clock.pauseAt(time);
}

test('reminders default off, toggle by keyboard, persist, and remain readable in English and narrow dark views', async ({ page, context }) => {
  await stub(context);
  await freezeClock(page, new Date('2026-09-30T08:40:00+08:00')); await page.goto('/?live'); await open(page);
  await expect(toggle(page)).not.toBeChecked(); expect(await page.evaluate(() => window.__reminderRequests)).toBe(0);
  await expect(page.getByRole('button', { name: '测试提醒', exact: true })).toHaveCount(0);
  await toggle(page).focus(); await page.keyboard.press('Space'); await expect(toggle(page)).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('dsh-timeband/reminders/v1'))).toBe('true');
  await page.reload(); await open(page); await expect(toggle(page)).toBeChecked(); expect(await count(page)).toBe(0);
  await page.getByRole('dialog').screenshot({ path: 'artifacts/reminders-card.png' });
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '中文 / English' }).click(); await open(page, true);
  await expect(toggle(page)).toHaveAccessibleName('Remind 5 minutes before peak');
  await page.setViewportSize({ width: 320, height: 480 }); await page.emulateMedia({ colorScheme: 'dark' });
  await toggle(page).scrollIntoViewIfNeeded(); await expect(toggle(page)).toBeVisible();
  expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/reminders-narrow-dark.png' });
  await page.getByRole('button', { name: 'Send test notification', exact: true }).click();
  await expect.poll(() => count(page)).toBe(1); expect(await page.evaluate(() => window.__reminderNotices[0]?.title)).toContain('Test reminder');
  expect(await page.evaluate(() => localStorage.getItem('dsh-timeband/reminder-sent/v1'))).toBeNull();
  await toggle(page).uncheck(); expect(await page.evaluate(() => localStorage.getItem('dsh-timeband/reminders/v1'))).toBeNull();
});

test('the built controller sends one localized notification at the exact lead time and follows the afternoon peak', async ({ page, context }) => {
  await stub(context, 'default');
  await freezeClock(page, new Date('2026-09-30T08:54:59+08:00')); await page.goto('/?live'); await open(page);
  await toggle(page).check(); await expect(toggle(page)).toBeChecked(); expect(await page.evaluate(() => window.__reminderRequests)).toBe(1);
  await page.clock.runFor(999); expect(await count(page)).toBe(0);
  await page.clock.runFor(1); await expect.poll(() => count(page)).toBe(1);
  expect(await page.evaluate(() => window.__reminderNotices[0]?.body)).toBe('北京时间 09:00 开始峰时段。');
  await page.clock.runFor(60_000); expect(await count(page)).toBe(1);
  await page.clock.fastForward('04:54:00');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '中文 / English' }).click();
  await page.clock.runFor(5 * 60_000); await expect.poll(() => count(page)).toBe(2);
  expect(await page.evaluate(() => window.__reminderNotices[1]?.body)).toBe('Peak hours start at 14:00 (Beijing time).');
});

test('real browser locks prevent duplicates across windows; preferences sync and reload does not replay an alert', async ({ page, context }) => {
  await stub(context);
  const time = new Date('2026-09-30T08:54:59+08:00');
  await freezeClock(page, time); await page.goto('/?live'); await open(page);
  const second = await context.newPage(); await freezeClock(second, time); await second.goto('/?live'); await open(second);
  await toggle(page).check(); await expect(toggle(second)).toBeChecked();
  await Promise.all([page.clock.runFor(1000), second.clock.runFor(1000)]);
  await expect.poll(async () => (await count(page)) + (await count(second))).toBe(1);
  await page.reload(); await open(page); await expect(toggle(page)).toBeChecked(); expect(await count(page)).toBe(0);
  await toggle(page).uncheck(); await expect(toggle(second)).not.toBeChecked(); await second.close();
});

for (const [name, permission, result, message] of [
  ['permission denied', 'default', 'denied', '未获得通知授权'],
  ['unsupported environment', 'unsupported', 'granted', '当前环境不支持系统通知'],
] as const) test(`${name} leaves the switch off and explains the outcome`, async ({ page, context }) => {
  await stub(context, permission, result); await page.goto('/?now=2026-10-01T10:30:00%2B08:00'); await open(page);
  await toggle(page).click(); await expect(toggle(page)).not.toBeChecked(); await expect(page.locator('.dtb-reminder-feedback')).toContainText(message);
  expect(await page.evaluate(() => localStorage.getItem('dsh-timeband/reminders/v1'))).toBeNull(); expect(await count(page)).toBe(0);
});

test('failed persistence and asynchronous notification errors stop the reminder cleanly', async ({ page, context }) => {
  await stub(context);
  await freezeClock(page, new Date('2026-09-30T08:55:00+08:00')); await page.goto('/?live'); await open(page);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('controlled quota failure'); }; });
  await toggle(page).click(); await expect(toggle(page)).not.toBeChecked(); await expect(page.locator('.dtb-reminder-feedback')).toContainText('提醒设置无法保存');
  expect(await count(page)).toBe(0);
  await page.reload(); await open(page); await toggle(page).check(); await expect.poll(() => count(page)).toBe(1);
  await page.evaluate(() => window.__reminderInstances[0]?.onerror?.(new Event('error')));
  await expect(toggle(page)).not.toBeChecked(); await expect(page.locator('.dtb-reminder-feedback')).toContainText('提醒发送失败');
  expect(await page.evaluate(() => localStorage.getItem('dsh-timeband/reminder-sent/v1'))).toBeNull();
  await page.clock.runFor(1000); expect(await count(page)).toBe(1);
});

test('unloading cancels an armed deadline and closes notifications already delivered', async ({ page, context }) => {
  await stub(context);
  await freezeClock(page, new Date('2026-09-30T08:54:59+08:00')); await page.goto('/?live'); await open(page); await toggle(page).check();
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '卸载 / 挂载插件' }).click();
  await page.clock.runFor(1000); expect(await count(page)).toBe(0);
  await page.getByRole('button', { name: '卸载 / 挂载插件' }).click(); await expect.poll(() => count(page)).toBe(1);
  await page.getByRole('button', { name: '卸载 / 挂载插件' }).click();
  expect(await page.evaluate(() => window.__reminderNotices[0]?.closed)).toBe(true);
});
