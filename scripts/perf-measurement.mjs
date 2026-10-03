// Run with PM_DEPS=/absolute/scratch/node_modules PM_OUT=/absolute/scratch/report.json node scripts/perf-measurement.mjs
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { cpus, totalmem, release, arch, platform } from 'node:os';
const require = createRequire(`${process.env.PM_DEPS}/package.json`);
const pw = require('playwright');
const html = await readFile(new URL('../docs/research/perf-measurement.html', import.meta.url));
const server = createServer((req, res) => {
  if (req.url.includes('isolated')) {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  }
  res.setHeader('Content-Type', 'text/html');
  res.end(html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let seed = 20261004;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const triple = a => {
  a = a.toSorted((x, y) => x - y);
  return [0.5, 0.95, 1].map(p => +a[Math.ceil(a.length * p) - 1].toFixed(3));
};
function summary(samples) {
  return Object.fromEntries(Object.entries({
    after: s => s.after - s.stamp,
    raf: s => s.raf - s.stamp,
    dispatch: s => s.handler - s.stamp,
    ready: s => s.domEnd - s.stamp,
    tail: s => s.after - s.raf,
    cost: s => s.domEnd - s.stamp + s.after - s.raf,
    dom: s => s.domEnd - s.domStart,
    worker: s => s.workerEnd - s.workerBegin,
  }).filter(([k]) => k !== 'worker' || samples[0]?.work).map(([k, f]) => [k, triple(samples.map(f))]));
}
async function trial(page, { animate = false, mode = 'click', work = 0, n = 320, idle = false } = {}) {
  await page.goto(`${base}?${animate ? 'animate' : ''}`);
  await page.evaluate(({ mode, work }) => { window.mode = mode; window.work = work; }, { mode, work });
  await page.mouse.move(50, 40);
  await sleep(100);
  await page.evaluate(() => { samples.length = 0; frames.length = 0; sequence = 0; });
  for (let i = 0; i < n + 10; i++) {
    await sleep(idle ? 150 + random() * 100 : 5 + random() * 40);
    if (mode === 'click') await page.mouse.click(50, 40);
    if (mode === 'keydown') await page.keyboard.press('ArrowRight');
    if (mode === 'pointerdown') await page.touchscreen.tap(50, 40);
    if (mode === 'pointermove') await page.mouse.move(50 + i % 2, 40);
    await page.waitForFunction(count => samples.length >= count, i + 1, { polling: 1 });
  }
  await sleep(100);
  const data = await page.evaluate(() => ({ samples, eventEntries, frames, origin: performance.timeOrigin }));
  data.samples = data.samples.slice(10);
  assert.equal(data.samples.length, n);
  const intervals = data.frames.slice(1).map((v, i) => v - data.frames[i]);
  return { n, summary: summary(data.samples), intervals: intervals.length ? triple(intervals) : null, ...data };
}
const report = { playwright: require('playwright/package.json').version, results: {}, timestamp: new Date().toISOString(), environment: { node: process.version, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0].model, cores: cpus().length, memory: totalmem() } };
try {
  for (const name of (process.env.PM_ENGINES ?? 'chromium,webkit,firefox').split(',')) {
    const headed = process.env.PM_HEADED === '1';
    const browser = await pw[name].launch({ headless: !headed });
    const context = await browser.newContext({ hasTouch: true, viewport: { width: 900, height: 600 } });
    const page = await context.newPage();
    const result = { version: browser.version(), headed, cases: {}, timers: {} };
    report.results[name] = result;
    try {
      for (const animate of [false, true]) {
        const key = `A-${animate ? 'animated' : 'idle'}`;
        result.cases[key] = await trial(page, { animate });
        console.log(name, key, result.cases[key].summary);
      }
      result.cases['A-long-idle'] = await trial(page, { idle: true, n: 60 });
      for (const work of [2, 5, 10, 14]) {
        const key = `C-${work}`;
        result.cases[key] = await trial(page, { work, n: 100 });
        console.log(name, key, result.cases[key].summary);
      }
      for (const mode of ['keydown', 'pointerdown', 'pointermove']) {
        const key = `D-${mode}`;
        result.cases[key] = await trial(page, { mode, n: 100, animate: true });
        console.log(name, key, result.cases[key].summary);
      }
      result.cases['D-pointermove-worker'] = await trial(page, { mode: 'pointermove', n: 100, work: 5, animate: true });
      for (const isolated of [false, true]) {
        await page.goto(`${base}?${isolated ? 'isolated' : ''}`);
        result.timers[isolated ? 'isolated' : 'plain'] = await page.evaluate(() => ({
          ...timerProbe(), supported: PerformanceObserver.supportedEntryTypes,
          APIs: {
            interactionId: 'PerformanceEventTiming' in window && 'interactionId' in PerformanceEventTiming.prototype,
            paintMixin: 'PerformanceEventTiming' in window && 'paintTime' in PerformanceEventTiming.prototype,
            memory: typeof performance.measureUserAgentSpecificMemory,
            measureL3: (() => { try { return performance.measure('probe', { start: 1, end: 2, detail: { ok: true } }).toJSON(); } catch(e) { return e.name; } })(),
          },
        }));
        result.timers[isolated ? 'isolated' : 'plain'].summary = triple(result.timers[isolated ? 'isolated' : 'plain'].deltas);
      }
      if (name === 'chromium') {
        const cdp = await context.newCDPSession(page);
        result.system = await (async () => {
          const bcdp = await browser.newBrowserCDPSession();
          return await bcdp.send('SystemInfo.getInfo');
        })();
        await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing,input,latencyInfo,benchmark,cc,viz,toplevel,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,disabled-by-default-latencyInfo', transferMode: 'ReturnAsStream' });
        result.cases.traceSync = await trial(page, { n: 30, animate: true });
        for (const work of [2, 5, 10, 14]) result.cases[`traceC-${work}`] = await trial(page, { n: 30, work });
        const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
        await cdp.send('Tracing.end');
        const { stream } = await complete;
        let trace = '';
        for (;;) {
          const chunk = await cdp.send('IO.read', { handle: stream });
          trace += chunk.data;
          if (chunk.eof) break;
        }
        await cdp.send('IO.close', { handle: stream });
        await writeFile(process.env.PM_OUT.replace('.json', '-trace.json'), trace);
        result.heap = await cdp.send('Runtime.getHeapUsage');
        await cdp.send('Performance.enable');
        result.metrics = await cdp.send('Performance.getMetrics');
      }
    } finally { await browser.close(); }
    await writeFile(process.env.PM_OUT, JSON.stringify(report));
  }
} finally {
  await writeFile(process.env.PM_OUT, JSON.stringify(report));
  server.close();
}
