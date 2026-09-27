/** Bounded window: page order increases from screen left to screen right. */
export function pdfWindow(page: number, count: number, size = 7) {
  const length = Math.min(size, count);
  const first = Math.max(1, Math.min(count - length + 1, page - Math.floor(length / 2)));
  return Array.from({ length }, (_, i) => first + i);
}
export function pdfSlicePosition(index: number, count: number) {
  const offset = index - (count - 1) / 2;
  // At the navigator's 0.42 rad yaw, this depth keeps the right-hand slide
  // physically in front. A hovered slide lifts vertically without overtaking it.
  return { x: offset * 1.02, y: -offset * .46, z: offset * .62 };
}
