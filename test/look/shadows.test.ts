/**
 * The shadow map's fit (design v2, "A sun ... shadows on the ground"): the
 * square of ground it covers, and the matrix that finds a world point in it.
 */
import { describe, expect, it } from "vitest";
import { Vector3, Vector4 } from "three";
import { SunShadow } from "../../engine/src/look/shadows.js";
import { shadowSizeWorld } from "../../engine/src/look/look.js";

const fitAt = (sunDirection: Vector3, eye = new Vector3(1000, 400, 2000)) => {
  const shadow = new SunShadow(1024);
  shadow.fit({
    eye,
    forward: new Vector3(0, 0, 1),
    sunDirection: sunDirection.normalize(),
    sizeWorld: 8000,
    yLo: -100,
    yHi: 4000,
  });
  return shadow;
};

const into = (shadow: SunShadow, p: Vector3): Vector3 => {
  const v = new Vector4(p.x, p.y, p.z, 1).applyMatrix4(shadow.matrix);
  return new Vector3(v.x / v.w, v.y / v.w, v.z / v.w);
};

describe("the shadow map", () => {
  it("covers the ground ahead of the camera, in 0..1, at any sun", () => {
    for (const sun of [new Vector3(0.3, 0.9, 0.2), new Vector3(-0.9, 0.1, 0.1), new Vector3(0, 1, 0)]) {
      const shadow = fitAt(sun.clone());
      for (const [x, y, z] of [
        [1000, 0, 2000],
        [1000, 3000, 5000],
        [-2000, 500, 4000],
        [4000, 100, 3000],
      ]) {
        const s = into(shadow, new Vector3(x, y, z));
        expect(s.x).toBeGreaterThan(0);
        expect(s.x).toBeLessThan(1);
        expect(s.y).toBeGreaterThan(0);
        expect(s.y).toBeLessThan(1);
        expect(s.z).toBeGreaterThan(0);
        expect(s.z).toBeLessThan(1);
      }
    }
  });

  it("puts the ground nearer the sun at a smaller depth", () => {
    const shadow = fitAt(new Vector3(0, 0.7, -0.7));
    const high = into(shadow, new Vector3(1000, 3000, 3000));
    const low = into(shadow, new Vector3(1000, 0, 3000));
    expect(high.z).toBeLessThan(low.z);
  });

  it("knows its own texel, in the world and in depth", () => {
    const shadow = fitAt(new Vector3(0.3, 0.9, 0.2));
    expect(shadow.texelWorld).toBeCloseTo(8000 / 1024, 6);
    expect(shadow.texelUv).toBeCloseTo(1 / 1024, 9);
    expect(shadow.depthTexel).toBeGreaterThan(0);
    expect(shadow.depthTexel).toBeLessThan(0.01);
  });

  it("grows with the camera's height and stops at both ends", () => {
    expect(shadowSizeWorld(0)).toBe(4000);
    expect(shadowSizeWorld(200)).toBeGreaterThan(shadowSizeWorld(100));
    expect(shadowSizeWorld(10_000)).toBe(16_000);
  });
});
