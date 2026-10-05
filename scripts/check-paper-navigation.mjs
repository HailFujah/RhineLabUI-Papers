import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const output = resolve("verification/fixtures/paper-navigation");
await mkdir(output, { recursive: true });
const report = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 }, hasTouch: mobile, isMobile: mobile });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${process.env.REVIEW_URL || "http://127.0.0.1:5204"}/?scene=archive`);
    await page.waitForFunction(() => window.rhine?.stats().ready && document.querySelector("#stage").dataset.library === "papers", null, { timeout: 60000 });
    const stats = () => page.evaluate(() => window.rhine.stats());
    const settle = () => page.waitForTimeout(2400);
    await settle();
    const origin = await stats();
    await page.keyboard.press("ArrowDown");
    let state = await stats();
    assert.equal(state.selectedCell.lane, origin.selectedCell.lane);
    assert.equal(state.selectedCell.row, origin.selectedCell.row + 1);
    const remembered = state.selected;
    await page.keyboard.press("ArrowRight");
    assert.equal((await stats()).selectedCell.lane, origin.selectedCell.lane + 1);
    await page.keyboard.press("ArrowLeft");
    assert.equal((await stats()).selected, remembered);
    await settle();
    const canvas = page.locator("#three-scene canvas");
    const rect = await canvas.boundingBox();
    const x = rect.x + rect.width * .62, y = rect.y + rect.height * .32;
    await page.mouse.move(x, y);
    state = await stats();
    await page.mouse.wheel(110, 0);
    await page.waitForTimeout(100);
    assert.equal((await stats()).selectedCell.lane, state.selectedCell.lane + 1);
    await page.keyboard.down("Shift");
    await page.mouse.wheel(0, 100);
    await page.keyboard.up("Shift");
    await page.waitForTimeout(100);
    assert.equal((await stats()).selectedCell.lane, state.selectedCell.lane + 2);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    assert.equal((await stats()).selected, remembered);
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(100);
    assert.equal((await stats()).selectedCell.row, state.selectedCell.row + 1);
    assert.equal((await stats()).selectedCell.lane, state.selectedCell.lane);
    await settle();
    const cdp = mobile ? await context.newCDPSession(page) : null;
    const drag = async (dx, dy) => {
      if (!mobile) {
        // Mouse panning follows the oblique plane; touch retains screen axes.
        const projection = (await stats()).dragProjection;
        const lane = -dx / Math.max(80, Math.hypot(projection.lane.x, projection.lane.y));
        const row = -dy / Math.max(64, Math.hypot(projection.row.x, projection.row.y));
        dx = lane * projection.lane.x + row * projection.row.x;
        dy = lane * projection.lane.y + row * projection.row.y;
      }
      if (mobile) await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
      else { await page.mouse.move(x, y); await page.mouse.down(); }
      for (let i = 1; i <= 8; i++) {
        const point = { x: x + dx * i / 8, y: y + dy * i / 8 };
        if (mobile) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...point, id: 1 }] });
        else await page.mouse.move(point.x, point.y);
        await page.waitForTimeout(35);
      }
      // Pause before releasing so this case tests selection without a fling.
      await page.waitForTimeout(150);
      if (mobile) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      else await page.mouse.up();
      await settle();
    };
    state = await stats();
    const firstMemory = state.selected;
    await drag(-Math.max(80, Math.hypot(state.dragProjection.lane.x, state.dragProjection.lane.y)) * .8, 5);
    let after = await stats();
    assert.equal(after.selectedCell.lane, state.selectedCell.lane + 1, "Horizontal dragging changes category");
    const nextCategory = after;
    await drag(4, -Math.max(64, Math.hypot(after.dragProjection.row.x, after.dragProjection.row.y)) * .8);
    after = await stats();
    assert.equal(after.selectedCell.row, nextCategory.selectedCell.row + 1, "Vertical dragging selects the next paper");
    assert.equal(after.selectedCell.lane, nextCategory.selectedCell.lane, "Vertical dragging keeps the category");
    await page.keyboard.press("ArrowLeft");
    assert.equal((await stats()).selected, firstMemory, "Horizontal drag preserves category memory");
    await page.keyboard.press("ArrowRight");
    assert.equal((await stats()).selected, after.selected, "Each category remembers its paper independently");
    await page.keyboard.press("ArrowLeft");
    await settle();
    const previous = await page.locator('[data-action="column-prev"]').boundingBox();
    const next = await page.locator('[data-action="column-next"]').boundingBox();
    assert.equal(previous.y, next.y);
    assert.ok(next.x >= previous.x + previous.width);
    const paperPrevious = await page.locator('[data-action="prev"]').boundingBox();
    const paperNext = await page.locator('[data-action="next"]').boundingBox();
    assert.equal(paperPrevious.x, paperNext.x);
    assert.ok(paperNext.y >= paperPrevious.y + paperPrevious.height);
    if (mobile) {
      const papers = await page.locator(".archive-navigation").boundingBox();
      assert.ok(papers.y + papers.height <= previous.y, "Paper buttons sit above category buttons on phones");
    }
    await page.screenshot({ path: `${output}/${mobile ? "mobile" : "desktop"}.png` });
    assert.deepEqual(errors, []);
    report.push({ mobile, selected: (await stats()).selected, passed: true });
    console.log(JSON.stringify(report.at(-1)));
    await context.close();
  }
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
} finally { await browser.close(); }
