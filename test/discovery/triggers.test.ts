/**
 * The discovery trigger, and the reason it asks a different question from the
 * one the plan wrote down. (Finding F37.)
 */
import { describe, expect, it } from "vitest";
import {
  TriggerField,
  entryFraction,
  triggerAt,
  type Trigger,
} from "../../engine/src/discovery/triggers.js";
import { DEFAULT_PACING, MODE_IAS_MS, groundGain } from "../../engine/src/sim/scale.js";
import { projectAlbers } from "../../engine/src/terrain/worldGrid.js";

const at = (id: string, eastM: number, northM: number, radiusM: number): Trigger =>
  ({ id, eastM, northM, radiusM });

describe("entering a catchment", () => {
  it("reports where along the path it happened, not merely that it did", () => {
    // A 1 km circle at (5000, 0); fly 0 -> 10,000 along y = 0. Entry at 4 km.
    expect(entryFraction(0, 0, 10_000, 0, 5000, 0, 1000)).toBeCloseTo(0.4, 6);
    // Starting inside is entering at once.
    expect(entryFraction(5000, 0, 10_000, 0, 5000, 0, 1000)).toBe(0);
    // A pass that stays outside never enters, however close it comes.
    expect(entryFraction(0, 1001, 10_000, 1001, 5000, 0, 1000)).toBeNull();
    // Nor does standing still outside one.
    expect(entryFraction(0, 5000, 0, 5000, 0, 0, 1000)).toBeNull();
  });

  it("orders several crossings by the order they were flown into", () => {
    const field = new TriggerField([
      at("far", 9000, 0, 500),
      at("near", 2000, 0, 500),
      at("middle", 5000, 0, 500),
    ]);
    field.moveTo(0, 0);
    expect(field.advance(12_000, 0)).toEqual(["near", "middle", "far"]);
  });
});

describe("what a point poll loses", () => {
  /**
   * Fly straight through a circle at 4 Hz, with the poll phase and the impact
   * parameter randomised, and count how often the crossing is reported.
   *
   * Seeded rather than random: a correctness claim that fails one run in
   * fifty is not a correctness claim.
   */
  function reported(radiusM: number, mode: "cruise" | "boost", swept: boolean): number {
    const step = (MODE_IAS_MS[mode] * groundGain(mode, DEFAULT_PACING)) / 4;
    let seed = 20260920;
    const rand = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const passes = 4000;
    let hits = 0;
    for (let p = 0; p < passes; p++) {
      const b = (rand() * 2 - 1) * radiusM;
      let x = -radiusM * 3 + rand() * step;
      let found = false;
      for (let i = 0; i < Math.ceil((radiusM * 6) / step) + 2 && !found; i++) {
        const next = x + step;
        found = swept
          ? entryFraction(x, b, next, b, 0, 0, radiusM) !== null
          : next * next + b * b <= radiusM * radiusM;
        x = next;
      }
      if (found) hits++;
    }
    return hits / passes;
  }

  it("flies straight through small catchments and never says so", () => {
    // The whole reason this module asks about the segment. At boost a 500 m
    // catchment is a discovery that does not happen three times in ten.
    expect(reported(500, "boost", false)).toBeLessThan(0.75);
    expect(reported(500, "cruise", false)).toBeLessThan(0.97);
    expect(reported(1000, "boost", false)).toBeLessThan(0.97);
  });

  it("and the swept segment reports every one of them", () => {
    for (const radius of [500, 1000, 2000, 5000]) {
      for (const mode of ["cruise", "boost"] as const) {
        expect(reported(radius, mode, true)).toBe(1);
      }
    }
  });
});

describe("the seen set", () => {
  it("fires a catchment once, however many times it is flown through", () => {
    const field = new TriggerField([at("a", 0, 0, 1000)]);
    field.moveTo(-5000, 0);
    expect(field.advance(5000, 0)).toEqual(["a"]);
    expect(field.advance(-5000, 0)).toEqual([]);
    expect([...field.seen]).toEqual(["a"]);
  });

  it("restores a profile, and keeps ids it does not recognise", () => {
    const field = new TriggerField([at("a", 0, 0, 1000)]);
    field.restore(["a", "from-another-build"]);
    field.moveTo(0, 0);
    expect(field.advance(1, 0)).toEqual([]);
    expect(field.seen.has("from-another-build")).toBe(true);
    field.forget();
    expect(field.seen.size).toBe(0);
  });
});

describe("a jump is not a flight", () => {
  it("does not hand over everything on the line between here and there", () => {
    const shanghai = projectAlbers(31.23, 121.47);
    const lhasa = projectAlbers(29.65, 91.1);
    // Ten catchments strung along the straight line between the two.
    const strung = Array.from({ length: 10 }, (_, i) => {
      const f = (i + 1) / 11;
      return at(
        `c${i}`,
        shanghai.eastM + (lhasa.eastM - shanghai.eastM) * f,
        shanghai.northM + (lhasa.northM - shanghai.northM) * f,
        20_000,
      );
    });

    const flown = new TriggerField(strung);
    flown.moveTo(shanghai.eastM, shanghai.northM);
    expect(flown.advance(lhasa.eastM, lhasa.northM)).toHaveLength(10);

    // The same call as a map jump collects nothing it did not land in.
    const jumped = new TriggerField(strung);
    jumped.moveTo(shanghai.eastM, shanghai.northM);
    expect(jumped.moveTo(lhasa.eastM, lhasa.northM)).toEqual([]);
  });

  it("still fires what the player lands inside", () => {
    const field = new TriggerField([at("here", 100_000, 200_000, 30_000)]);
    expect(field.moveTo(100_000, 200_000)).toEqual(["here"]);
  });
});

describe("the projection under a catchment", () => {
  it("keeps an authored radius within three per cent anywhere in China", () => {
    // Circles are projected as circles: the centre goes through Albers and the
    // radius stays in metres. Albers is equal-area and not conformal, so the
    // circle on the sphere comes back slightly out of round - measured worst
    // at Hainan, and still far inside the precision of a number an author
    // picked by feel.
    for (const [lat, lon] of [
      [29.33, 110.48],
      [42.68, 89.26],
      [50.25, 127.48],
      [18.5, 109.5],
    ] as const) {
      const centre = triggerAt("t", lat, lon, 15);
      let worst = 0;
      for (let bearing = 0; bearing < 360; bearing += 5) {
        const br = (bearing * Math.PI) / 180;
        const d = 15 / 6371;
        const la0 = (lat * Math.PI) / 180;
        const la = Math.asin(Math.sin(la0) * Math.cos(d) + Math.cos(la0) * Math.sin(d) * Math.cos(br));
        const lo =
          (lon * Math.PI) / 180 +
          Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la0), Math.cos(d) - Math.sin(la0) * Math.sin(la));
        const p = projectAlbers((la * 180) / Math.PI, (lo * 180) / Math.PI);
        const r = Math.hypot(p.eastM - centre.eastM, p.northM - centre.northM);
        worst = Math.max(worst, Math.abs(r - centre.radiusM) / centre.radiusM);
      }
      expect(worst).toBeLessThan(0.03);
    }
  });
});
