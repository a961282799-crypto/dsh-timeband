import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { RELEASE_API, RELEASES_URL } from '../../src/plugin-updates.ts';
import packageInfo from '../../package.json' with { type: 'json' };

const currentVersion = packageInfo.version;
const version = '1.3.5'; // Simulated release, not a published artifact.
const fixture = { tag_name: `v${version}`, draft: false, prerelease: false, html_url: `${RELEASES_URL}/tag/v${version}`,
  assets: [{ name: `dsh-timeband-${version}.tgz`, state: 'uploaded', browser_download_url: `${RELEASES_URL}/download/v${version}/dsh-timeband-${version}.tgz` }],
};
async function manager(page: Page, mode = 'success') {
  await page.addInitScript(mode => {
    const state = { calls: [] as string[], waiting: 0, cancelled: 0 };
    Object.assign(window, { __updateFixture: state, timebandUpdateManager: {
      async installBundle(spec: string) {
        state.calls.push(spec);
        if (mode === 'lost' || mode === 'unknown') return { ok: false, error: 'offline' };
        if (mode === 'incompatible') return { ok: true, value: { application: 'failed', error: { code: 'incompatible-version' } } };
        return { ok: true, value: { application: 'restart-required', bundle: 'dsh-timeband' } };
      },
      async waitForInstall() { state.waiting++; return { ok: true, value: mode === 'unknown' ? null : { application: 'restart-required', bundle: 'dsh-timeband' } }; },
      async cancelInstall() { state.cancelled++; },
    } });
  }, mode);
}
async function settings(page: Page) {
  await page.locator('.dtb-chip').click();
  if (await page.locator('.dtb-details').getAttribute('open') === null) await page.locator('summary').click();
}
async function check(page: Page) {
  await settings(page);
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
}
const installs = (page: Page) => page.evaluate(() => (window as unknown as { __updateFixture: { calls: string[] } }).__updateFixture.calls);

test('rc.2 checks only on click, offers updates inside settings and uses the native restart result', async ({ page }) => {
  let requests = 0;
  await page.route(RELEASE_API, route => { requests++; return route.fulfill({ json: fixture }); });
  await manager(page); await page.goto('/host');
  await expect(page.locator('.dtb-chip')).toBeVisible(); expect(requests).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); expect(requests).toBe(0);
  await check(page);
  await expect(page.locator('.dtb-details .dtb-update-notice')).toContainText(`v${version}`);
  expect(requests).toBe(1); expect(await installs(page)).toEqual([]);
  await page.screenshot({ path: 'artifacts/plugin-update-available.png' });
  await page.reload(); await settings(page);
  await expect(page.locator('.dtb-update-notice')).toHaveCount(0); expect(requests).toBe(1);
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  await page.getByRole('button', { name: '更新', exact: true }).click();
  await expect(page.locator('.dtb-update-notice')).toContainText('新版已安装');
  expect(await installs(page)).toEqual([fixture.assets[0]!.browser_download_url]);
  await expect(page.getByRole('button', { name: '更新', exact: true })).toBeDisabled();
  await expect(page.locator('[data-slot-error]')).toHaveCount(0);
});

test('unmanaged hosts offer the built GitHub download and release notes after a manual check', async ({ page }) => {
  await page.route(RELEASE_API, route => route.fulfill({ json: fixture }));
  await page.goto('/host'); await check(page);
  await expect(page.getByRole('link', { name: '下载新版' })).toHaveAttribute('href', fixture.assets[0]!.browser_download_url);
  await expect(page.getByRole('link', { name: '更新说明' })).toHaveAttribute('href', fixture.html_url);
  await expect(page.getByRole('button', { name: '更新', exact: true })).toHaveCount(0);
});

test('unconfirmed native outcomes cannot report success or submit a second install', async ({ page }) => {
  await page.route(RELEASE_API, route => route.fulfill({ json: fixture })); await manager(page, 'unknown');
  await page.goto('/host'); await check(page); await page.getByRole('button', { name: '更新', exact: true }).click();
  await expect(page.locator('.dtb-update-notice')).toContainText('更新结果尚未确认');
  await expect(page.locator('.dtb-update-notice')).not.toContainText('新版已安装');
  await expect(page.getByRole('button', { name: '更新', exact: true })).toBeDisabled(); expect((await installs(page)).length).toBe(1);
});

test('transport recovery and host compatibility rejection display different truthful outcomes', async ({ page }) => {
  await page.route(RELEASE_API, route => route.fulfill({ json: fixture })); await manager(page, 'lost');
  await page.goto('/host'); await check(page); await page.getByRole('button', { name: '更新', exact: true }).click();
  await expect(page.locator('.dtb-update-notice')).toContainText('新版已安装');
  const other = await page.context().newPage(); await other.route(RELEASE_API, route => route.fulfill({ json: fixture })); await manager(other, 'incompatible');
  await other.goto('/host'); await check(other); await other.getByRole('button', { name: '更新', exact: true }).click();
  await expect(other.locator('.dtb-update-notice')).toContainText('不兼容'); await expect(other.locator('.dtb-update-notice')).not.toContainText('新版已安装');
  await other.close();
});

test('manual retry handles offline, prereleases and current versions; English dark settings fit a narrow window', async ({ page }) => {
  let response: 'offline' | 'prerelease' | 'current' | 'stable' = 'offline';
  await page.route(RELEASE_API, route => response === 'offline' ? route.abort('internetdisconnected') : route.fulfill({ json: {
    ...fixture, ...(response === 'current' ? { tag_name: `v${currentVersion}`, html_url: `${RELEASES_URL}/tag/v${currentVersion}`, assets: [{ name: `dsh-timeband-${currentVersion}.tgz`, state: 'uploaded', browser_download_url: `${RELEASES_URL}/download/v${currentVersion}/dsh-timeband-${currentVersion}.tgz` }] } : {}),
    prerelease: response === 'prerelease',
  } }));
  await page.goto('/'); await check(page);
  await expect(page.getByText('暂时无法检查新版', { exact: false })).toBeVisible();
  response = 'prerelease'; await page.getByRole('button', { name: '检查更新', exact: true }).click(); await expect(page.locator('.dtb-update-notice')).toHaveCount(0);
  response = 'current'; await page.getByRole('button', { name: '检查更新', exact: true }).click(); await expect(page.getByText('暂无需要安装的新版。')).toBeVisible();
  response = 'stable'; await page.getByRole('button', { name: '检查更新', exact: true }).click(); await expect(page.locator('.dtb-update-notice')).toContainText(`v${version}`);
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '中文 / English' }).click(); await settings(page);
  await page.setViewportSize({ width: 320, height: 480 }); await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.getByRole('link', { name: 'Download update' })).toBeVisible();
  const card = page.getByRole('dialog'); expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Check for updates', exact: true }).scrollIntoViewIfNeeded(); await expect(page.getByRole('button', { name: 'Check for updates', exact: true })).toBeVisible();
});
