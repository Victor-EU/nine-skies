/**
 * A head turned toward a point (D93): the lens as a figure passes, or
 * whatever is coming. The layer calls this after the figure has moved
 * itself and its matrices are fresh. The head turns on its own pivot, as
 * far as it can and as far as the pose's weight asks, so a glance is a
 * turn that eases in and out, not a snap.
 */
import { Vector3 } from "three";
import type { Head } from "./figure.js";
import { smooth } from "./motion.js";

const local = new Vector3();

/** Turn `head` toward `target` (world units), by `weight` from 0 (at rest) to 1 (as far as it goes). */
export function turnHead(head: Head, target: Vector3, weight: number): void {
  const parent = head.pivot.parent;
  if (!parent) return;
  parent.worldToLocal(local.copy(target)).sub(head.pivot.position);
  const yaw = Math.atan2(local.x, local.z);
  const pitch = Math.atan2(local.y, Math.hypot(local.x, local.z));
  // Past its reach behind it, a head lets go rather than whip round the other way.
  const w = weight * smooth((Math.PI - Math.abs(yaw)) / (Math.PI - head.maxYawRad));
  head.pivot.rotation.set(-clamp(pitch, head.maxPitchRad) * w, clamp(yaw, head.maxYawRad) * w, 0);
}

/** Every head back to rest. */
export function restHeads(heads: readonly Head[]): void {
  for (const h of heads) h.pivot.rotation.set(0, 0, 0);
}

function clamp(x: number, m: number): number {
  return Math.max(-m, Math.min(m, x));
}
