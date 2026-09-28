import * as THREE from "three";

// Seconds and normalized phase boundaries. Assembly itself still uses the
// original model viewer's 5.5 critical damping; travel has its own pacing.
export const DOCUMENT_MOTION = {
  openingSeconds: 6.6,
  dismissSeconds: 1.45,
  dismissStagger: .12,
  restoreDelay: .65,
  restoreSeconds: 1.2,
  returnSeconds: 1.15,
  pageExtractRate: 5.5,
  centered: .18,
  projectionStart: .30,
  beamRise: .055,
  projectionPageStart: .42,
  developStart: .46,
  developed: .67,
  dollyStart: .48,
  transportStart: .68,
} as const;

const viewPoint = (point: THREE.Vector3, camera: THREE.PerspectiveCamera) =>
  point.clone().sub(camera.position).applyQuaternion(camera.quaternion.clone().invert());
const halfHeightAt = (depth: number, camera: THREE.PerspectiveCamera) =>
  depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / camera.zoom;
const framing = (camera: THREE.PerspectiveCamera) => {
  const center = viewPoint(new THREE.Vector3(), camera);
  const halfHeight = halfHeightAt(-center.z, camera);
  return { x: center.x / halfHeight, y: center.y / halfHeight, halfHeight };
};

/** Interpolate the archive's projected center, then recover the camera pose.
 * Independently lerping world position and lens made the model swing sideways. */
export function frameArchiveCamera(camera: THREE.PerspectiveCamera, from: THREE.PerspectiveCamera,
  to: THREE.PerspectiveCamera, amount: number) {
  const start = framing(from), end = framing(to);
  const halfHeight = THREE.MathUtils.lerp(start.halfHeight, end.halfHeight, amount);
  camera.fov = THREE.MathUtils.lerp(from.fov, to.fov, amount);
  camera.zoom = THREE.MathUtils.lerp(from.zoom, to.zoom, amount);
  camera.quaternion.slerpQuaternions(from.quaternion, to.quaternion, amount);
  camera.position.set(
    -THREE.MathUtils.lerp(start.x, end.x, amount) * halfHeight,
    -THREE.MathUtils.lerp(start.y, end.y, amount) * halfHeight,
    halfHeight / halfHeightAt(1, camera),
  ).applyQuaternion(camera.quaternion);
}

/** Keep extraction at one perceived speed while the camera also pulls back.
 * The stack stays a real 3D object, with exact substrate and navigator endpoints. */
export function frameSliceStack(stack: THREE.Group, camera: THREE.PerspectiveCamera,
  fromCamera: THREE.PerspectiveCamera, toCamera: THREE.PerspectiveCamera,
  from: THREE.Vector3, to: THREE.Vector3, fromScale: number, toScale: number, amount: number) {
  const start = viewPoint(from, fromCamera), end = viewPoint(to, toCamera);
  const startHalf = halfHeightAt(-start.z, fromCamera), endHalf = halfHeightAt(-end.z, toCamera);
  const depth = THREE.MathUtils.lerp(-start.z, -end.z, amount);
  const halfHeight = halfHeightAt(depth, camera);
  stack.position.set(
    THREE.MathUtils.lerp(start.x / startHalf, end.x / endHalf, amount) * halfHeight,
    THREE.MathUtils.lerp(start.y / startHalf, end.y / endHalf, amount) * halfHeight,
    -depth,
  ).applyQuaternion(camera.quaternion).add(camera.position);
  // Match ViewerCameraMotion's proportional zoom, without a mid-flight Z bulge.
  const projectedScale = Math.exp(THREE.MathUtils.lerp(
    Math.log(fromScale / startHalf), Math.log(toScale / endHalf), amount,
  ));
  stack.scale.setScalar(projectedScale * halfHeight);
}
