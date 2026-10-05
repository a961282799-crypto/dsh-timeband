import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

// Run against `npm run preview`. Each sample gets a fresh, isolated Chrome process.
// This measures the real rc.2 renderer fixture, not the installed Electron app.
const [clientPath = 'dist/client.js', label = 'candidate'] = process.argv.slice(2);
const client = await readFile(clientPath, 'utf8');
const samples = [];
for (let run = 0; run < 3; run++) {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.route('**/client.js', route => route.fulfill({ contentType: 'text/javascript', body: client }));
    await page.addInitScript(() => {
      const Audio = window.AudioContext;
      window.resourceAudio = [];
      window.AudioContext = class extends Audio {
        constructor(...args) { super(...args); window.resourceAudio.push(this); }
      };
      window.Notification = class {
        static permission = 'granted';
        static async requestPermission() { return 'granted'; }
        close() {}
      };
    });
    await page.goto('http://127.0.0.1:4173/host');
    await page.locator('.dtb-chip').waitFor();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const measure = async scenario => {
      // Let native popover events and React passive cleanup finish before GC.
      await new Promise(resolve => setTimeout(resolve, 1000));
      await cdp.send('HeapProfiler.collectGarbage');
      await new Promise(resolve => setTimeout(resolve, 100));
      await cdp.send('HeapProfiler.collectGarbage');
      const heap = await cdp.send('Runtime.getHeapUsage');
      const dom = await cdp.send('Memory.getDOMCounters');
      const ui = await page.evaluate(() => ({
        pluginElements: document.querySelectorAll('.dtb-root, .dtb-root *, .dtb-card, .dtb-card *, .dtb-reminder-banner, .dtb-reminder-banner *').length,
        audioStates: window.resourceAudio.map(ctx => ctx.state),
      }));
      const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]));
      const before = await metrics();
      await new Promise(resolve => setTimeout(resolve, 5000));
      const after = await metrics();
      samples.push({ run: run + 1, scenario, jsHeapBytes: heap.usedSize, embedderHeapBytes: heap.embedderHeapUsedSize,
        nodes: dom.nodes, listeners: dom.jsEventListeners, ...ui,
        taskMsPerSecond: (after.TaskDuration - before.TaskDuration) * 1000 / (after.Timestamp - before.Timestamp) });
      console.log(JSON.stringify(samples.at(-1)));
    };
    await measure('initial-closed');
    await page.locator('.dtb-chip').click();
    await page.locator('.dtb-details summary').click();
    await page.getByRole('switch').check();
    await page.getByRole('button', { name: '测试提醒', exact: true }).click();
    await new Promise(resolve => setTimeout(resolve, 1500));
    await page.getByRole('button', { name: '关闭提醒', exact: true }).click();
    await page.keyboard.press('Escape');
    await measure('after-tone-closed');
    await page.locator('.dtb-chip').click();
    if (await page.locator('.dtb-details').getAttribute('open') === null) await page.locator('.dtb-details summary').click();
    await page.getByRole('switch').uncheck();
    await page.keyboard.press('Escape');
    await measure('reminders-disabled');
    await page.evaluate(() => window.timebandHost.unload());
    await measure('unloaded');
  } finally { await browser.close(); }
}
await mkdir('artifacts/performance', { recursive: true });
await writeFile(`artifacts/performance/${label}.json`, JSON.stringify({ label, clientPath, environment: 'Chrome, real rc.2 renderer fixture, development React; 1 second settling then two forced GCs before heap sampling; 3 fresh processes', samples }, null, 2));
