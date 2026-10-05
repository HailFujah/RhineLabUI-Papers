import type { DragAxis } from "./archive-drag.ts";

type WheelInput = Pick<WheelEvent, "deltaX" | "deltaY" | "deltaMode" | "ctrlKey" | "shiftKey">;

/** One accumulator per active axis; changing direction or library starts fresh. */
export class ArchiveWheel {
  private total = 0;
  private time = -Infinity;
  private key = "";

  reset() { this.total = 0; this.time = -Infinity; this.key = ""; }

  move(event: WheelInput, papers: boolean, pageSize: number, time: number) {
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    if (event.ctrlKey || (!papers && horizontal)) { this.reset(); return null; }
    const raw = horizontal ? event.deltaX : event.deltaY;
    if (!Number.isFinite(raw) || raw === 0) return null;
    const axis: DragAxis = papers && !event.shiftKey ? "lane" : "row";
    const key = `${papers}:${axis}`;
    const delta = Math.max(-300, Math.min(300, raw * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? pageSize : 1)));
    if (key !== this.key || time - this.time > 180 || Math.sign(delta) !== Math.sign(this.total)) this.total = 0;
    this.key = key; this.time = time; this.total += delta;
    const direction = Math.sign(this.total);
    const steps = Math.min(3, Math.floor(Math.abs(this.total) / 100));
    this.total -= direction * steps * 100;
    return { axis, direction, steps };
  }
}
