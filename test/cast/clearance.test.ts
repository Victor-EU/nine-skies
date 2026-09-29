/**
 * A companion kept out of the rock (F137): drawn nearer and smaller about
 * the eye where the ground would cut it or stand before it, which leaves
 * its picture where it was, and not at all where even that will not do.
 */
import { describe, expect, it } from "vitest";
import { Box3, Vector3 } from "three";
import { clearAt, clearRatio, NEAREST, type GroundAt } from "../../engine/src/cast/clearance.js";

const eye = new Vector3(0, 100, 0);
/** A figure 20 wide and 10 tall, 200 ahead (+z) and 40 below the eye. */
const body = (): Box3 => new Box3(new Vector3(-10, 55, 195), new Vector3(10, 65, 205));
const flat: GroundAt = () => 0;

/** Where a point of the box lands on the screen: its direction from the eye. */
function direction(p: Vector3): Vector3 {
  return p.clone().sub(eye).normalize();
}

describe("a companion kept out of the rock", () => {
  it("is left where its motion put it in the clear, and while the ground has not arrived", () => {
    expect(clearRatio(eye, body(), flat, 1)).toBe(1);
    expect(clearRatio(eye, body(), () => null, 1)).toBe(1);
  });

  it("is drawn nearer where a wall stands through it, and is clear of the wall there", () => {
    const wall: GroundAt = (x, z) => (z > 150 && x > 0 ? 500 : 0);
    const k = clearRatio(eye, body(), wall, 1);
    expect(k).toBeGreaterThan(NEAREST);
    expect(k).toBeLessThan(150 / 205);
    expect(clearAt(k, eye, body(), wall, 1)).toBe(true);
  });

  it("is drawn nearer where a ridge stands between it and the eye, so it passes in front", () => {
    const ridge: GroundAt = (_x, z) => (z > 120 && z < 140 ? 90 : 0);
    expect(clearAt(1, eye, body(), ridge, 1)).toBe(false);
    const k = clearRatio(eye, body(), ridge, 1);
    expect(k).toBeGreaterThan(NEAREST);
    // Its far edge stands short of the ridge.
    expect(k * (205 - eye.z)).toBeLessThan(120);
  });

  it("keeps its picture: every point on the same line from the eye", () => {
    const b = body();
    const k = 0.4;
    for (const p of [b.min, b.max, new Vector3(b.min.x, b.max.y, b.min.z)]) {
      const scaled = p.clone().sub(eye).multiplyScalar(k).add(eye);
      expect(direction(scaled).distanceTo(direction(p))).toBeLessThan(1e-12);
    }
  });

  it("is not drawn where not even the nearest will do", () => {
    const under: GroundAt = () => 150; // the eye itself below the ground
    expect(clearRatio(eye, body(), under, 1)).toBe(0);
  });
});
