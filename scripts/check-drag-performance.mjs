import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const output = resolve("verification/fixtures/drag-performance");
await mkdir(output, { recursive: true });
const report = [];
try {
  for (let round = 0; round < 3; round++) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    await page.goto(`${process.env.REVIEW_URL || "http://127.0.0.1:5205"}/?scene=archive&library=archives`);
    await page.waitForFunction(() => window.rhine?.stats().ready, null, { timeout: 60000 });
    await page.waitForTimeout(2400);
    await page.mouse.move(1000, 340);
    await page.mouse.down();
    const sample = await page.evaluate(async () => {
      if (!window.rhine.stats().holdingArchive) throw Error("Drag did not capture the canvas");
      let selections = 0;
      // The selection HUD writes this attribute exactly once per selection.
      const observer = new MutationObserver(records => { selections += records.length; });
      observer.observe(document.querySelector("#column-name"), { attributes: true, attributeFilter: ["title"] });
      const canvas = document.querySelector("#three-scene canvas"), projection = window.rhine.stats().dragProjection;
      const input = [], frames = [];
      let previous = performance.now();
      for (let frame = 0; frame < 72; frame++) {
        await new Promise(requestAnimationFrame);
        const now = performance.now(); frames.push(now - previous); previous = now;
        const start = performance.now();
        for (let event = 1; event <= 8; event++) {
          const row = Math.sin((frame + event / 8) * Math.PI / 12) * 9;
          canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, pointerType: "mouse", buttons: 1, clientX: 1000 + projection.row.x * row, clientY: 340 + projection.row.y * row }));
        }
        input.push(performance.now() - start);
      }
      await new Promise(requestAnimationFrame);
      observer.disconnect();
      if (!selections) throw Error("Benchmark did not move through any cells");
      const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)];
      return { events: 576, frames: 72, selections, inputMedianMs: percentile(input, .5), inputP95Ms: percentile(input, .95), frameMedianMs: percentile(frames, .5), frameP95Ms: percentile(frames, .95) };
    });
    report.push(sample);
    await page.mouse.up();
    await context.close();
    console.log(JSON.stringify({ round, ...sample }));
  }
  await writeFile(`${output}/${process.env.REVIEW_LABEL || "current"}.json`, JSON.stringify(report, null, 2));
} finally { await browser.close(); }
