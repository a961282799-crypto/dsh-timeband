import { test, expect } from '@playwright/test';

test('countdown uses days/hours/minutes with smaller seconds, or seconds alone', async ({ page }) => {
  for (const [now, main, seconds] of [
    ['2026-10-01T10:29:34+08:00', '6天22小时30分钟', '26秒'],
    ['2026-09-30T10:29:34+08:00', '1小时30分钟', '26秒'],
    ['2026-09-30T11:29:34+08:00', '30分钟', '26秒'],
    ['2026-09-30T11:59:34+08:00', '26秒', ''],
  ]) {
    await page.goto(`/?now=${encodeURIComponent(now!)}`);
    await page.locator('.dtb-chip').click();
    for (const scope of ['.dtb-chip-count', '.dtb-next']) {
      await expect(page.locator(`${scope} .dtb-count-main`)).toHaveText(main!);
      const small = page.locator(`${scope} .dtb-count-seconds`);
      if (seconds) {
        await expect(small).toHaveText(seconds);
        const mainSize = await page.locator(`${scope} .dtb-count-main`).evaluate(el => parseFloat(getComputedStyle(el).fontSize));
        const secondsSize = await small.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
        expect(secondsSize).toBeLessThan(mainSize);
      } else await expect(small).toHaveCount(0);
    }
    const sidebar = await page.locator('.preview-sidebar').boundingBox();
    const chip = await page.locator('.dtb-chip').boundingBox();
    expect(chip!.x + chip!.width).toBeLessThanOrEqual(sidebar!.x + sidebar!.width);
    expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
});

test('avatar-right placement, popover, keyboard dismissal, theme, viewport, locale and unload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?now=2026-09-30T10:30:00%2B08:00');
  const chip = page.locator('.dtb-chip');
  await expect(chip).toContainText('峰时段');
  await expect(chip).toContainText('1小时30分钟');
  const avatar = await page.getByRole('button', { name: '预览账户' }).boundingBox();
  const badge = await chip.boundingBox();
  expect(badge!.x).toBeGreaterThan(avatar!.x + avatar!.width - 1);
  expect(Math.abs(badge!.y - avatar!.y)).toBeLessThan(4);
  await chip.click();
  const card = page.getByRole('dialog');
  await expect(card).toBeVisible();
  await expect(card).toContainText('1小时30分钟0秒');
  const track = await page.locator('.dtb-card .dtb-track').boundingBox();
  const morningPeak = await page.locator('.dtb-card .dtb-segment').nth(1).boundingBox();
  expect(Math.abs(morningPeak!.x - track!.x - track!.width * 9 / 24)).toBeLessThan(1);
  await expect(page.getByRole('button', { name: '关闭时间轴' })).toBeFocused();
  await page.screenshot({ path: 'artifacts/preview-light.png' });
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(chip).toBeFocused();
  await chip.click();
  await page.locator('h1').click();
  await expect(card).toBeHidden();
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: '收起 / 展开侧栏' }).click();
  await expect(page.locator('.dtb-root')).toHaveAttribute('data-wide', 'false');
  await chip.click();
  await expect(card).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '中文 / English' }).click();
  await chip.click();
  await expect(card).toContainText('Today’s schedule');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'artifacts/preview-dark.png' });
  await page.setViewportSize({ width: 390, height: 620 });
  // Browser resize and ResizeObserver delivery settle asynchronously on CI.
  // Check the resulting position, rather than a rectangle from the old viewport.
  await expect.poll(async () => {
    const box = await card.boundingBox();
    return box!.y + box!.height;
  }).toBeLessThanOrEqual(620);
  const bounds = await card.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(620);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '卸载 / 挂载插件' }).click();
  await expect(page.locator('.dtb-root')).toHaveCount(0);
  await expect(page.locator('style[data-plugin="dsh-timeband"]')).toHaveCount(0);
  await page.getByRole('button', { name: '卸载 / 挂载插件' }).click();
  await expect(chip).toBeVisible();
  // An unrelated footer action restores the native layout rather than being moved.
  await page.setViewportSize({ width: 1100, height: 780 });
  await page.getByRole('button', { name: '收起 / 展开侧栏' }).click();
  await page.locator('.preview-actions').evaluate(element => { const action = document.createElement('button'); action.textContent = 'Other plugin'; element.append(action); });
  const accountAfter = await page.getByRole('button', { name: '预览账户' }).boundingBox();
  const chipAfter = await chip.boundingBox();
  expect(chipAfter!.y).toBeLessThan(accountAfter!.y);
  expect(errors).toEqual([]);
});

test('holiday and unknown-year presentation does not show a false peak countdown', async ({ page }) => {
  await page.goto('/?now=2026-10-01T10:30:00%2B08:00');
  await page.locator('.dtb-chip').click();
  await expect(page.getByRole('dialog')).toContainText('公共假期 · 全天谷时段');
  await expect(page.getByRole('dialog')).toContainText('6天22小时30分钟0秒');
  await expect(page.locator('.dtb-card .dtb-segment')).toHaveCount(1);
  for (const selector of ['.dtb-root .dtb-segment', '.dtb-card .dtb-segment']) {
    const segment = page.locator(selector);
    await expect(segment).toHaveCount(1);
    await expect(segment).toHaveClass(/dtb-offpeak/);
    await expect(segment).toHaveCSS('background-color', 'rgb(51, 132, 104)');
    expect(await segment.evaluate(element => element.getBoundingClientRect().width === element.parentElement!.getBoundingClientRect().width)).toBe(true);
  }
  await expect(page.locator('.dtb-segment.dtb-peak')).toHaveCount(0);
  await page.getByRole('dialog').screenshot({ path: 'artifacts/preview-holiday.png' });
  await page.keyboard.press('Escape');
  await page.getByLabel('预览场景').selectOption('2027-01-04T10:30:00+08:00');
  await page.locator('.dtb-chip').click();
  await expect(page.getByRole('dialog')).toContainText('缺少本年度假期数据');
  await expect(page.locator('.dtb-next strong')).toHaveText('—');
  await page.keyboard.press('Escape');
  await page.getByLabel('预览场景').selectOption('2026-10-10T10:30:00+08:00');
  await page.locator('.dtb-chip').click();
  await expect(page.getByRole('dialog')).toContainText('周末 · 全天谷时段');
  await expect(page.locator('.dtb-root .dtb-segment, .dtb-card .dtb-segment')).toHaveCount(2);
  await expect(page.locator('.dtb-segment.dtb-peak')).toHaveCount(0);
  // Changing the preview date must refresh both timelines, without stale peak blocks.
  await page.keyboard.press('Escape');
  await page.getByLabel('预览场景').selectOption('2026-09-30T10:30:00+08:00');
  await expect(page.locator('.dtb-root .dtb-segment.dtb-peak')).toHaveCount(2);
  await page.getByLabel('预览场景').selectOption('2026-10-01T10:30:00+08:00');
  await page.locator('.dtb-chip').click();
  await expect(page.locator('.dtb-segment.dtb-peak')).toHaveCount(0);
  await expect(page.locator('.dtb-root .dtb-segment, .dtb-card .dtb-segment')).toHaveCount(2);
});
