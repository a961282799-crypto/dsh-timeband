import { test, expect } from '@playwright/test';

test('closed details release their DOM and reopen with settings preserved', async ({ page }) => {
  await page.goto('/host');
  await expect(page.locator('.dtb-chip')).toBeVisible();
  await expect(page.locator('.dtb-card > *')).toHaveCount(0);
  await expect(page.locator('.dtb-reminder-banner')).toHaveCount(0);
  await page.locator('.dtb-chip').click();
  await page.locator('.dtb-details summary').click();
  for (let repeat = 0; repeat < 5; repeat++) {
    await expect(page.locator('.dtb-details')).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('.dtb-card > *')).toHaveCount(0);
    await expect(page.locator('.dtb-card')).toHaveCount(1);
    await page.locator('.dtb-chip').click();
  }
  await expect(page.getByRole('switch')).toBeVisible();
  await page.evaluate(() => window.timebandHost!.unload());
  await expect(page.locator('.dtb-card, .dtb-root')).toHaveCount(0);
});

test('seconds change independently while the timeline cursor updates at the next minute', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-30T10:30:09+08:00') });
  await page.clock.pauseAt(new Date('2026-09-30T10:30:10+08:00'));
  await page.goto('/host');
  await expect(page.locator('.dtb-chip-count')).toHaveText('1小时29分钟50秒');
  const cursor = page.locator('.dtb-track-small .dtb-cursor');
  const original = await cursor.getAttribute('style');
  await page.clock.runFor(5000);
  await expect(page.locator('.dtb-chip-count')).toHaveText('1小时29分钟45秒');
  await expect(cursor).toHaveAttribute('style', original!);
  await page.locator('.dtb-chip').click();
  await expect(page.locator('.dtb-next strong')).toHaveText('1小时29分钟45秒');
  await page.clock.runFor(45_000);
  await expect(cursor).not.toHaveAttribute('style', original!);
  await expect(page.locator('.dtb-next strong')).toHaveText('1小时29分钟0秒');
});
