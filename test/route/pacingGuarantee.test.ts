/**
 * What the route gate's guarantee is a guarantee *about* (F38).
 *
 * D17 and D19 make a route something an autopilot has to fly before it counts
 * as data, and every number that comes out of that - Expedition 1 clears the
 * ground by 333 m, and gets down onto Lhasa - was measured at one cruise
 * pacing, the shipped default, which nobody wrote down anywhere. The runtime
 * offers the player three, and one of them flies this route into a mountain.
 *
 * So these are the numbers behind `pacingHolds`: not a rule about pacing in
 * general, but the measured shape of this route's two guarantees as the
 * pacing moves.
 */
import { describe, expect, it } from "vitest";
import { hasGround, sea } from "./fixture.ts";
import { loadCorridor } from "../../tools/corridor.ts";
import { loadExpedition, planFor, projectedWaypoints } from "../../tools/expedition.ts";
import { validateRoute } from "../../engine/src/sim/route.js";
import { pacingHolds } from "../../engine/src/expedition/runner.js";
import { pathFrom } from "../../engine/src/expedition/path.js";
import { EXPEDITION_RULES } from "../../content/schema.ts";
import { CRUISE_CANDIDATES, DEFAULT_PACING } from "../../engine/src/sim/scale.js";

const plan = planFor(loadExpedition("content/expeditions/sea-to-sky.yaml"));

const check = (cruiseKmPerMin: number) =>
  validateRoute(sea().route, sea().ground, {
    pacing: { cruiseKmPerMin },
    startAltitudeM: sea().expedition.start_altitude_m,
    arrivalM: sea().expedition.arrival!.altitude_m,
    clearanceM: EXPEDITION_RULES.defaultClearanceM,
  });

describe.skipIf(!hasGround)("the pacing Expedition 1 was checked at", () => {
  it("is the shipped default, and the bundle says so out loud", () => {
    expect(plan.cruiseKmPerMin).toBe(DEFAULT_PACING.cruiseKmPerMin);
    const authored = check(plan.cruiseKmPerMin);
    expect(authored.clears).toBe(true);
    expect(authored.worstClearanceM).toBeCloseTo(333, -1);
    expect(authored.arrives).toBe(true);
    expect(authored.lowestArrivalM).toBeCloseTo(251, -1);
  });

  it("holds all the way down, and fails upwards at the arrival first", () => {
    for (const slower of [60, 73, 80, 100]) {
      const c = check(slower);
      expect(c.clears).toBe(true);
      expect(c.arrives).toBe(true);
    }

    // 160 still clears the ground - by thirteen metres - and can no longer
    // get down onto Lhasa: 592 m above a destination authored at 300.
    const rushed = check(160);
    expect(rushed.clears).toBe(true);
    expect(rushed.worstClearanceM).toBeCloseTo(13, -1);
    expect(rushed.arrives).toBe(false);
    expect(rushed.lowestArrivalM).toBeCloseTo(592, -1);

    // 190 is on the free-flight toggle, and it is F17's crash again: the
    // Nyainqentanglha, three hundred kilometres short of Lhasa.
    const fastest = check(190);
    expect(fastest.clears).toBe(false);
    expect(fastest.contact!.km).toBeCloseTo(2359, -2);
    // Where it first touches, and how far in it is at the worst - two
    // different numbers, and the deeper one is not the one it arrives at.
    expect(fastest.contact!.shortfallM).toBeCloseTo(-57, -1);
    expect(fastest.worstClearanceM).toBeCloseTo(-210, -1);
  });

  it("is what the runner refuses to be flown faster than", () => {
    for (const candidate of CRUISE_CANDIDATES)
      expect(pacingHolds(plan, { cruiseKmPerMin: candidate })).toBe(
        check(candidate).clears && check(candidate).arrives,
      );
  });
});

const corridor = loadCorridor("dist-world/sea-to-sky");

describe.skipIf(!corridor)("what a route-indexed number is about", () => {
  /**
   * The measurement behind `crossTrackM` being reported beside every number
   * the runner quotes: a kilometre off the line, the ground underneath is
   * already outside the margin the route keeps for itself.
   */
  it("is the line, and a kilometre off it the ground is a different mountain", () => {
    const points = projectedWaypoints(loadExpedition("content/expeditions/sea-to-sky.yaml"));
    const path = pathFrom(points);
    const past = (offM: number): number => {
      let n = 0;
      let over = 0;
      for (let km = 0; km <= path.lengthKm; km += 2) {
        const here = at(km);
        const ahead = at(Math.min(path.lengthKm, km + 1));
        const len = Math.hypot(ahead.eastM - here.eastM, ahead.northM - here.northM) || 1;
        const nx = -(ahead.northM - here.northM) / len;
        const ny = (ahead.eastM - here.eastM) / len;
        const onLine = corridor!.groundAt(here.eastM, here.northM);
        for (const side of [1, -1]) {
          const x = here.eastM + side * nx * offM;
          const y = here.northM + side * ny * offM;
          if (!corridor!.covers(x, y)) continue;
          n++;
          if (Math.abs(corridor!.groundAt(x, y) - onLine) > EXPEDITION_RULES.defaultClearanceM)
            over++;
        }
      }
      return (100 * over) / n;
    };

    function at(km: number): { eastM: number; northM: number } {
      const m = Math.max(0, Math.min(km * 1000, path.cumM[path.cumM.length - 1]!));
      for (let i = 0; i + 1 < path.points.length; i++) {
        const a = path.cumM[i]!;
        const b = path.cumM[i + 1]!;
        if (m <= b || i + 2 === path.points.length) {
          const t = (m - a) / (b - a);
          return {
            eastM: path.points[i]!.eastM + t * (path.points[i + 1]!.eastM - path.points[i]!.eastM),
            northM: path.points[i]!.northM + t * (path.points[i + 1]!.northM - path.points[i]!.northM),
          };
        }
      }
      return path.points[0]!;
    }

    // Per cent of stations where the ground a given distance off the line
    // differs from the route's own profile by more than the 300 m the route
    // is required to keep between itself and the terrain.
    expect(past(1_000)).toBeCloseTo(4, 0);
    expect(past(5_000)).toBeCloseTo(23, 0);
    expect(past(25_000)).toBeCloseTo(35, 0);
  });
});
