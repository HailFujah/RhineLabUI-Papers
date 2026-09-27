import assert from "node:assert/strict";
import { Euler, Quaternion, Vector3 } from "three";
import { pdfWindow, pdfSlicePosition } from "../src/pdf-layout.ts";

let checked = 0;
for (const count of [1, 10, 15, 50, 100, 1000]) {
  for (let page = 1; page <= count; page++) {
    const window = pdfWindow(page, count);
    assert.equal(window.length, Math.min(7, count));
    assert.ok(window.includes(page));
    assert.ok(window[0] >= 1 && window.at(-1) <= count);
    assert.equal(new Set(window).size, window.length);
    assert.ok(pdfWindow(page, count, 13).length <= 13);
    checked++;
  }
}
const rotation = new Quaternion().setFromEuler(new Euler(-.10, .42, -.04));
const positions = Array.from({ length: 7 }, (_, i) => {
  const p = pdfSlicePosition(i, 7);
  return new Vector3(p.x, p.y, p.z).applyQuaternion(rotation);
});
const lift = new Vector3(0, .48, 0).applyQuaternion(rotation);
for (let i = 1; i < positions.length; i++) {
  assert.ok(positions[i].x > positions[i - 1].x, "page order runs left to right");
  assert.ok(positions[i].z > positions[i - 1].z + lift.z, "front slide still occludes a lifted predecessor");
}
console.log(`${checked} bounded page windows and optical slide depth checks passed.`);
