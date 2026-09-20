/**
 * Flying an authored expedition (F38).
 *
 * Reads `content/expeditions/sea-to-sky.yaml` through the same `planFor` the
 * bundle is cut with, so what is tested here is the route the app is handed
 * rather than a hand-written copy of it. No ground: this is the part of the
 * runner that is about where the aircraft is, not what is under it.
 */
import { describe, expect, it } from "vitest";
import {
  cappedPacing,
  ExpeditionRun,
  pacingHolds,
  type ExpeditionPlan,
} from "../../engine/src/expedition/runner.js";
import { pathFrom, type PathPoint } from "../../engine/src/expedition/path.js";
import { loadExpedition, planFor } from "../../tools/expedition.ts";
import { DEFAULT_PACING } from "../../engine/src/sim/scale.js";

const plan: ExpeditionPlan = planFor(loadExpedition("content/expeditions/sea-to-sky.yaml"));
const path = pathFrom(plan.points);

function pointAtKm(atKm: number): PathPoint {
  const m = Math.max(0, Math.min(atKm * 1000, path.cumM[path.cumM.length - 1]!));
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

/** Fly the line itself, a kilometre at a time, collecting what plays. */
function flyTheLine(run: ExpeditionRun, fromKm: number, toKm: number): string[] {
  const heard: string[] = [];
  for (let km = fromKm; km < toKm; km += 1) {
    const p = pointAtKm(km);
    heard.push(...run.advance(p.eastM, p.northM).beats);
  }
  const end = pointAtKm(toKm);
  heard.push(...run.advance(end.eastM, end.northM).beats);
  return heard;
}

describe("the plan a route is flown from", () => {
  it("makes every waypoint after the start a beat, in route order", () => {
    expect(plan.beats.map((b) => b.id)).toEqual(["wuhan", "chongqing", "chengdu", "lhasa"]);
    expect(plan.beats.map((b) => Math.round(b.km))).toEqual([679, 1427, 1692, 2931]);
    expect(plan.beats.map((b) => b.km)).toEqual([...plan.beats.map((b) => b.km)].sort((a, b) => a - b));
  });

  it("carries the legs the content gate flew, approach and all", () => {
    expect(plan.legs.map((l) => l.mode)).toEqual(["low", "low", "cruise", "cruise", "approach"]);
    expect(plan.legs[plan.legs.length - 1]!.endKm).toBeCloseTo(path.lengthKm, 6);
  });
});

describe("flying it", () => {
  it("fires each beat once, in the order they were flown", () => {
    const run = new ExpeditionRun(plan);
    const start = pointAtKm(0);
    expect(run.moveTo(start.eastM, start.northM).beats).toEqual([]);

    const heard = flyTheLine(run, 1, path.lengthKm);
    expect(heard).toEqual(["wuhan", "chongqing", "chengdu", "lhasa"]);
    expect(run.arrived).toBe(true);

    // Fly the last stretch again: nothing repeats.
    expect(flyTheLine(run, 2900, path.lengthKm)).toEqual([]);
  });

  it("follows the leg the kilometre is on", () => {
    const run = new ExpeditionRun(plan);
    const start = pointAtKm(0);
    run.moveTo(start.eastM, start.northM);
    const modeAt = (km: number) => {
      const p = pointAtKm(km);
      return run.advance(p.eastM, p.northM).mode;
    };
    expect(modeAt(100)).toBe("low");
    expect(modeAt(1000)).toBe("low");
    expect(modeAt(1500)).toBe("cruise");
    expect(modeAt(2800)).toBe("cruise");
    expect(modeAt(2900)).toBe("approach");
  });

  it("goes round a beat rather than playing it over the wrong ground", () => {
    const run = new ExpeditionRun(plan);
    const start = pointAtKm(600);
    run.moveTo(start.eastM, start.northM);
    expect(run.fired.has("wuhan")).toBe(false);

    // Leave the route before Wuhan and fly past it 85 km to the side, which
    // is outside the corridor and well inside what the aeroplane can turn in.
    const heardAway: string[] = [];
    for (let km = 600; km <= 760; km += 5) {
      const p = pointAtKm(km);
      const state = run.advance(p.eastM + 60_000, p.northM + 60_000);
      heardAway.push(...state.beats);
      expect(state.onRoute).toBe(false);
    }
    expect(heardAway).toEqual([]);
    // Progress stops where the route was left, rather than tracking a flight
    // that is no longer on it.
    expect(run.snapshot().km).toBeCloseTo(600, 0);

    // Rejoin the line beyond Wuhan. The beat is marked heard and not played:
    // it is narration about a city the player went round, and playing it
    // eighty kilometres the far side is the desync it exists to avoid.
    const back = pointAtKm(760);
    const rejoin = run.advance(back.eastM, back.northM);
    expect(rejoin.beats).toEqual([]);
    expect(rejoin.skipped).toEqual(["wuhan"]);
    expect(rejoin.onRoute).toBe(true);
    expect(rejoin.km).toBeCloseTo(760, 0);

    // And the rest of the route narrates normally.
    expect(flyTheLine(run, 761, 1500)).toEqual(["chongqing"]);
  });

  it("marks a jump's beats heard instead of playing them", () => {
    const run = new ExpeditionRun(plan);
    const lhasa = pointAtKm(path.lengthKm);
    const state = run.moveTo(lhasa.eastM, lhasa.northM);
    expect(state.beats).toEqual([]);
    expect(state.skipped).toEqual(["wuhan", "chongqing", "chengdu", "lhasa"]);
    expect(state.arrived).toBe(true);
    expect([...run.fired].sort()).toEqual(["chengdu", "chongqing", "lhasa", "wuhan"]);
  });

  it("resumes where it was, without replaying", () => {
    const run = new ExpeditionRun(plan);
    const start = pointAtKm(0);
    run.moveTo(start.eastM, start.northM);
    flyTheLine(run, 1, 1500);
    const saved = run.snapshot();
    expect(saved.beats).toEqual(["wuhan", "chongqing"]);
    expect(saved.km).toBeCloseTo(1500, 0);

    const resumed = new ExpeditionRun(plan);
    resumed.restore(saved);
    const here = pointAtKm(saved.km);
    expect(resumed.moveTo(here.eastM, here.northM).beats).toEqual([]);
    expect(flyTheLine(resumed, saved.km + 1, 1800)).toEqual(["chengdu"]);
  });
});

describe("the pacing an expedition is flown at", () => {
  it("is the one its route was checked at, and slower is allowed", () => {
    expect(plan.cruiseKmPerMin).toBe(DEFAULT_PACING.cruiseKmPerMin);
    expect(pacingHolds(plan, { cruiseKmPerMin: 80 })).toBe(true);
    expect(pacingHolds(plan, { cruiseKmPerMin: 130 })).toBe(true);
    // 190 is one of the three the free-flight toggle offers, and it puts this
    // route into the Nyainqentanglha - see the numbers in the route suite.
    expect(pacingHolds(plan, { cruiseKmPerMin: 190 })).toBe(false);
  });

  it("caps a faster request rather than refusing to fly", () => {
    expect(cappedPacing(plan, { cruiseKmPerMin: 190 }).cruiseKmPerMin).toBe(130);
    expect(cappedPacing(plan, { cruiseKmPerMin: 80 }).cruiseKmPerMin).toBe(80);
  });
});
