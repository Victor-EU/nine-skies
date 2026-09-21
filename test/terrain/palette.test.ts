/**
 * The elevation ramp, which until now could only be executed by a GPU (F45).
 *
 * `palette.ts` states one rule - the ramp is never duplicated - and it was the
 * one rule it could not enforce, because reading it meant compiling GLSL. The
 * map went and wrote a second ramp (F42); nothing could compare them; and the
 * ramp itself had never been run by anything that could assert about it.
 *
 * The stops are data now and the shader is generated from them, so these are
 * tests of the thing the GPU runs rather than of a copy of it.
 */
import { describe, expect, it } from "vitest";
import { Color } from "three";
import {
  ELEVATION_RAMP_GLSL,
  ELEVATION_STOPS,
  elevationRampSrgb,
} from "../../engine/src/terrain/palette.js";
import { deltaE } from "../../engine/src/gfx/perceptual.js";

const srgb = (rgb: [number, number, number]) => new Color().setRGB(...rgb, "srgb");

describe("the stops", () => {
  it("rise, and hold at both ends", () => {
    for (let i = 1; i < ELEVATION_STOPS.length; i++) {
      expect(ELEVATION_STOPS[i]!.m).toBeGreaterThan(ELEVATION_STOPS[i - 1]!.m);
    }
    const lowest = ELEVATION_STOPS[0]!;
    const highest = ELEVATION_STOPS[ELEVATION_STOPS.length - 1]!;
    expect(elevationRampSrgb(lowest.m - 500)).toEqual([...lowest.srgb]);
    expect(elevationRampSrgb(highest.m + 3000)).toEqual([...highest.srgb]);
  });

  it("puts the snow line at 5,400 m, which is a fact and not a taste", () => {
    const snowLine = ELEVATION_STOPS.find((s) => s.name === "alpine");
    expect(snowLine?.m).toBe(5400);
    // Permanent snow on the plateau starts around there. The first draft used
    // 3,800, which painted the whole plateau as an ice sheet.
    expect(elevationRampSrgb(3800)[0]).toBeLessThan(0.7);
  });

  it("is continuous: no step anywhere along it", () => {
    let worst = { m: 0, dE: 0 };
    for (let m = -400; m <= 7000; m += 1) {
      const d = deltaE(srgb(elevationRampSrgb(m - 1)), srgb(elevationRampSrgb(m)));
      if (d > worst.dE) worst = { m, dE: d };
    }
    // A metre of climb is never a visible change anywhere on the ramp.
    expect(worst.dE).toBeLessThan(0.3);
  });

  it("paints a depression as a salt pan, which it did not before", () => {
    // The shader read `mix(saltPan, plain, clamp(m / -160.0, 0.0, 1.0))`,
    // which is the two ends the wrong way round: the floor of the depression
    // came out plain green and the shoreline came out salt pan, with a
    // 40.6 dE step between the shoreline and the sea-level cell beside it.
    const ayding = elevationRampSrgb(-154);
    const seaLevel = elevationRampSrgb(0);
    const saltPan = ELEVATION_STOPS[0]!.srgb;
    expect(deltaE(srgb(ayding), srgb([...saltPan] as [number, number, number]))).toBeLessThan(4);
    expect(deltaE(srgb(elevationRampSrgb(-1)), srgb(seaLevel))).toBeLessThan(0.3);
    // The old arrangement, for the record: the two colours it put at each end.
    const oldAtShore = saltPan;
    expect(deltaE(srgb([...oldAtShore] as [number, number, number]), srgb(seaLevel))).toBeCloseTo(40.6, 1);
  });
});

describe("the generated shader", () => {
  it("is GLSL, and carries the stops' own names into it", () => {
    expect(ELEVATION_RAMP_GLSL).toContain("vec3 elevationRampSrgb(float m)");
    expect(ELEVATION_RAMP_GLSL).toContain("vec3 elevationColor(float m)");
    for (const stop of ELEVATION_STOPS) {
      expect(ELEVATION_RAMP_GLSL).toContain(`vec3 ${stop.name} = vec3(`);
    }
  });

  it("branches once per stop, in order, and returns the ends outside them", () => {
    const branches = [...ELEVATION_RAMP_GLSL.matchAll(/if \(m <=? (-?[\d.]+)\)/g)].map((b) =>
      Number(b[1]),
    );
    expect(branches).toEqual(ELEVATION_STOPS.map((s) => s.m));
    expect(ELEVATION_RAMP_GLSL).toContain(`return ${ELEVATION_STOPS[0]!.name};`);
    expect(ELEVATION_RAMP_GLSL.trimEnd()).toContain(
      `return ${ELEVATION_STOPS[ELEVATION_STOPS.length - 1]!.name};`,
    );
  });

  it("interpolates over the same spans the TypeScript does", () => {
    // Every mix is (m - lo) / (hi - lo), written out. Re-read them from the
    // generated source and check the arithmetic against the stops, because a
    // wrong span here is a ramp that is subtly the wrong shape everywhere.
    const mixes = [...ELEVATION_RAMP_GLSL.matchAll(/mix\((\w+), (\w+), (.+)\);/g)];
    expect(mixes).toHaveLength(ELEVATION_STOPS.length - 1);
    mixes.forEach((mix, i) => {
      const lo = ELEVATION_STOPS[i]!;
      const hi = ELEVATION_STOPS[i + 1]!;
      expect(mix[1]).toBe(lo.name);
      expect(mix[2]).toBe(hi.name);
      expect(mix[3]).toContain(`/ ${(hi.m - lo.m).toFixed(1)}`);
    });
  });

  it("writes no literal a stop does not have", () => {
    for (const stop of ELEVATION_STOPS) {
      const vec = `vec3(${stop.srgb.map((c) => c.toFixed(2)).join(", ")})`;
      expect(ELEVATION_RAMP_GLSL).toContain(vec);
    }
    // Eight stops, eight vec3 literals - nothing hand-added beside them.
    expect([...ELEVATION_RAMP_GLSL.matchAll(/vec3\(\d/g)]).toHaveLength(ELEVATION_STOPS.length);
  });
});
