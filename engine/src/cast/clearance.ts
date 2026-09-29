/**
 * A companion kept out of the rock (F137).
 *
 * A companion is placed in the camera's frame (D92): so far ahead, so far
 * to the side, so far up. In a winding gorge at six times relief a point
 * two kilometres straight ahead is as often in a wall as over the river,
 * and a figure a kilometre long is wider than the gorge: the White Dragon
 * swam through the rock of the Three Gorges, cut off by the walls, or
 * hidden behind them for seconds at a time. Lifting it (F111) is no cure
 * there, where the walls stand kilometres over it.
 *
 * So a figure the rock would cut is drawn nearer: moved toward the eye
 * along its own sight lines and shrunk by the same ratio. That is a scaling
 * about the eye, which leaves its picture where it was and as large; only
 * its depth changes, so it passes in front of the wall rather than through
 * it. The ratio is the largest at which its bounds stand clear of the
 * ground under them and no ground rises between the eye and them. If none
 * down to `NEAREST` is, it is not drawn.
 */
import { Vector3, type Box3 } from "three";

/** The drawn ground's height at a world position, world units, or null where none has arrived. */
export type GroundAt = (x: number, z: number) => number | null;

/** The nearest a figure is drawn, as a share of where its motion put it. */
export const NEAREST = 0.08;
/** Halvings between the nearest clear ratio and the first that is not. */
const HALVINGS = 6;
/** Samples of the ground along each sight line, and a side under the body. */
const ALONG = 24;
const ACROSS = 3;

const corner = new Vector3();
const at = new Vector3();

/**
 * The share of its distance a figure is drawn at, 1 where nothing is in
 * the way: `box` is its bounds in the world, `eye` the camera's, and
 * `margin` the air kept under it, world units, at its full size.
 */
export function clearRatio(eye: Vector3, box: Box3, groundAt: GroundAt, margin: number): number {
  if (clearAt(1, eye, box, groundAt, margin)) return 1;
  if (!clearAt(NEAREST, eye, box, groundAt, margin)) return 0;
  let lo = NEAREST;
  let hi = 1;
  for (let i = 0; i < HALVINGS; i++) {
    const mid = Math.sqrt(lo * hi);
    if (clearAt(mid, eye, box, groundAt, margin)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Whether the bounds, scaled by `k` about the eye, are clear of the ground and in sight of the eye. */
export function clearAt(k: number, eye: Vector3, box: Box3, groundAt: GroundAt, margin: number): boolean {
  const { min, max } = box;
  const bottom = eye.y + k * (min.y - eye.y);
  // Under it: the ground stands below its lowest point, all across it.
  for (let i = 0; i < ACROSS; i++) {
    const x = eye.x + k * (min.x + ((max.x - min.x) * i) / (ACROSS - 1) - eye.x);
    for (let j = 0; j < ACROSS; j++) {
      const z = eye.z + k * (min.z + ((max.z - min.z) * j) / (ACROSS - 1) - eye.z);
      const g = groundAt(x, z);
      if (g !== null && g + k * margin > bottom) return false;
    }
  }
  // Before it: no ground over the lines from the eye to its lower corners and its middle.
  for (let c = 0; c < 5; c++) {
    if (c < 4) corner.set(c & 1 ? max.x : min.x, min.y, c & 2 ? max.z : min.z);
    else box.getCenter(corner);
    for (let s = 1; s <= ALONG; s++) {
      at.copy(corner).sub(eye).multiplyScalar((k * s) / ALONG).add(eye);
      const g = groundAt(at.x, at.z);
      if (g !== null && g > at.y) return false;
    }
  }
  return true;
}
