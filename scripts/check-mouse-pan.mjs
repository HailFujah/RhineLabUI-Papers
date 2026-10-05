import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const output = resolve("verification/fixtures/mouse-pan");
await mkdir(output, { recursive: true });
try {
  for (const library of ["papers", "archives"]) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${process.env.REVIEW_URL || "http://127.0.0.1:5205"}/?scene=archive&library=${library}`);
    await page.waitForFunction(() => window.rhine?.stats().ready && !document.querySelector("#loading") && window.rhine.stats().extraction >= .399, null, { timeout: 60000 });
    await page.waitForTimeout(2400);
    const stats = () => page.evaluate(() => window.rhine.stats());
    await page.mouse.move(1000, 340);
    await page.mouse.down();
    const start = await stats(), projection = start.dragProjection;
    assert.ok(start.holdingArchive, `Canvas drag started: ${JSON.stringify({ mode: start.mode, canBrowse: start.canBrowse, ready: start.ready })}`);
    for (const [dx, dy] of [[-130, 0], [-130, -70], [40, -40], [0, 0]]) {
      await page.mouse.move(1000 + dx, 340 + dy, { steps: 5 });
      await page.waitForTimeout(100);
      const state = await stats();
      assert.equal(state.dragMapping, "free", `Mouse can turn without releasing the button: ${JSON.stringify({ library, dx, dy, holding: state.holdingArchive, track: state.dragTrack, mode: state.mode })}`);
      const lane = (state.columnCamera - start.columnCamera) / 5.2;
      const row = -(state.rail - start.rail) / .62;
      assert.ok(Math.abs(lane * projection.lane.x + row * projection.row.x - dx) < 3, "Plane follows pointer X");
      assert.ok(Math.abs(lane * projection.lane.y + row * projection.row.y - dy) < 3, "Plane follows pointer Y");
    }
    await page.waitForTimeout(150);
    await page.mouse.up();
    assert.equal((await stats()).mode, "archive", "Out-and-back drag cannot become a click");
    await page.waitForTimeout(1500);
    await page.mouse.move(1000, 340); await page.mouse.down();
    const batch = await page.evaluate(async () => {
      const canvas = document.querySelector("#three-scene canvas"), before = window.rhine.stats();
      let updates = 0;
      const observer = new MutationObserver(records => { updates += records.length; });
      observer.observe(document.querySelector("#column-name"), { attributes: true, attributeFilter: ["title"] });
      for (let i = 1; i <= 24; i++) canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, pointerType: "mouse", buttons: 1, clientX: 1000 - i * 7, clientY: 340 - i * 2 }));
      const immediate = window.rhine.stats().selected;
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      observer.disconnect();
      return { updates, immediate, original: before.selected, after: window.rhine.stats().selected };
    });
    assert.equal(batch.immediate, batch.original, "Input events defer expensive selection work to rendering");
    assert.equal(batch.updates, 1, "Only the final visible cell is selected for an input burst");
    assert.notEqual(batch.after, batch.original);
    await page.waitForTimeout(150); await page.mouse.up();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${output}/${library}.png` });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ library, freePan: true, batchedSelections: batch.updates, errors }));
    await context.close();
  }
} finally { await browser.close(); }
