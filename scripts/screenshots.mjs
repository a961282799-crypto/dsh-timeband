import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Run npm run preview first. Capture real plugin output in a labeled demo shell.
const browser = await chromium.launch({ channel: 'chrome' });
await mkdir('docs/images', { recursive: true });
try {
  for (const scene of [
    { file: 'peak-light', now: '2026-09-30T10:29:34+08:00', theme: 'light', title: '当前时段，一眼就懂。', copy: '峰谷状态与下一次切换，\n就在头像旁。', label: '01 / 工作日 · 峰时段' },
    { file: 'offpeak-light', now: '2026-09-30T13:29:34+08:00', theme: 'light', title: '留意下一次切换。', copy: '不足一小时，只显示分钟与秒。\n秒数用更小字号，主次清楚。', label: '02 / 午间 · 谷时段' },
    { file: 'holiday-light', now: '2026-10-01T10:29:34+08:00', theme: 'light', title: '放假的一天，全是绿色。', copy: '节假日全天谷时段。\n等待跨越多天，也能清楚显示。', label: '03 / 国庆假期 · 全天谷时段' },
    { file: 'peak-dark', now: '2026-09-30T11:59:34+08:00', theme: 'dark', title: '深色，也一样清晰。', copy: '适配浅色与深色界面。\n不足一分钟，只显示秒数。', label: '04 / 深色模式 · 最后 26 秒' },
  ]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2, colorScheme: scene.theme });
    await page.goto(`http://127.0.0.1:4173/?now=${encodeURIComponent(scene.now)}`);
    await page.locator('.dtb-chip').waitFor();
    await page.addStyleTag({ content: '.preview-main{margin-left:240px;padding:170px 44px 40px;max-width:760px}.preview-main h1{font-size:36px;letter-spacing:-.04em;line-height:1.45;margin:20px 0}.preview-main p{white-space:pre-line;font-size:16px}.preview-controls{display:none}.preview-note{margin-top:64px;font-size:12px!important}.preview-marker{font-size:10px}' });
    await page.locator('.preview-kicker').evaluate((el, label) => { el.textContent = `DSH TIMEBAND · ${label}`; }, scene.label);
    await page.locator('.preview-main h1').evaluate((el, title) => { el.textContent = title; }, scene.title);
    await page.locator('.preview-main p').first().evaluate((el, copy) => { el.textContent = copy; }, scene.copy);
    await page.locator('.preview-note').evaluate(el => { el.textContent = '插件真实构建产物 · 模拟宿主布局\n示例日期与时间固定，仅用于界面展示。'; });
    await page.locator('.dtb-chip').click();
    await page.getByRole('dialog').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `docs/images/${scene.file}.png` });
    console.log(`Saved docs/images/${scene.file}.png`);
    await page.close();
  }
} finally { await browser.close(); }
