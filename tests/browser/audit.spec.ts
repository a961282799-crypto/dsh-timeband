import { test, expect } from '@playwright/test';

test('clicking the same trigger again closes the native popover', async ({ page }) => {
  await page.goto('/?now=2026-09-30T10:30:00%2B08:00');
  await page.locator('.dtb-chip').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('.dtb-chip').click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('.dtb-chip')).toHaveAttribute('aria-expanded', 'false');
});

test('long holiday countdown fits narrow sidebar and small window in both languages', async ({ page }) => {
  for (const english of [false, true]) {
    await page.setViewportSize({ width: 320, height: 480 });
    await page.goto(`/?now=2026-02-13T18:00:01%2B08:00${english ? '&en' : ''}`);
    for (const width of [210, 200, 180]) {
      await page.locator('.preview-sidebar').evaluate((el, width) => { (el as HTMLElement).style.width = `${width}px`; }, width);
      const sidebar = await page.locator('.preview-sidebar').boundingBox();
      const chip = await page.locator('.dtb-chip').boundingBox();
      expect(chip!.x + chip!.width).toBeLessThanOrEqual(sidebar!.x + sidebar!.width);
      expect(await page.locator('.dtb-chip').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await page.locator('.dtb-chip').click();
    const card = page.getByRole('dialog');
    await expect(card).toBeVisible();
    expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const rect = await card.boundingBox();
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(320);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(480);
  }
});

test('real plugin clock changes period and countdown while the popover stays open', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-30T11:58:59+08:00') });
  await page.clock.pauseAt(new Date('2026-09-30T11:59:59+08:00'));
  await page.goto('/?live');
  await page.locator('.dtb-chip').click();
  await expect(page.locator('.dtb-next strong')).toHaveText('1秒');
  await page.clock.runFor(1000);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.dtb-status strong')).toHaveText('谷时段');
  await expect(page.locator('.dtb-next strong')).toHaveText('2小时0分钟0秒');
  await page.clock.runFor(1000);
  await expect(page.locator('.dtb-next strong')).toHaveText('1小时59分钟59秒');
});

test('midnight into a public holiday refreshes both tracks without a reload', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-30T23:58:59+08:00') });
  await page.clock.pauseAt(new Date('2026-09-30T23:59:59+08:00'));
  await page.goto('/?live');
  await page.locator('.dtb-chip').click();
  await expect(page.locator('.dtb-card .dtb-segment.dtb-peak')).toHaveCount(2);
  await page.clock.runFor(1000);
  await expect(page.locator('.dtb-day-kind')).toContainText('2026-10-01');
  await expect(page.locator('.dtb-segment.dtb-peak')).toHaveCount(0);
  await expect(page.locator('.dtb-root .dtb-segment, .dtb-card .dtb-segment')).toHaveCount(2);
});
