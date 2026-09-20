/**
 * Is there room to fly this route from here, and is a saved kilometre still
 * the kilometre it was? (F39.)
 */
import { describe, expect, it } from "vitest";
import {
  floorAtKm,
  NO_FLOOR,
  planFingerprint,
  resumeRun,
  roomAt,
  type AltitudeFloor,
} from "../../engine/src/expedition/resume.js";
import type { ExpeditionPlan } from "../../engine/src/expedition/runner.js";
import { loadExpedition, planFor } from "../../tools/expedition.ts";
import type { RunSave } from "../../engine/src/save/profile.js";

const expedition = loadExpedition("content/expeditions/sea-to-sky.yaml");
/** A floor that climbs 0 -> 4,000 m over four kilometres and comes back down. */
const floor: AltitudeFloor = { strideKm: 1, m: [0, 1000, 2000, 3000, 4000, 2000] };
const plan: ExpeditionPlan = planFor(expedition, floor);
const print = planFingerprint(plan);

const run = (over: Partial<RunSave> = {}): RunSave => ({
  expeditionId: "sea-to-sky",
  fingerprint: print,
  km: 1500,
  beats: ["wuhan"],
  arrived: false,
  ...over,
});

describe("the altitude floor, at runtime", () => {
  it("interpolates between samples and holds at the ends", () => {
    expect(floorAtKm(floor, 0)).toBe(0);
    expect(floorAtKm(floor, 2)).toBe(2000);
    expect(floorAtKm(floor, 2.5)).toBe(2500);
    expect(floorAtKm(floor, 4.25)).toBe(3500);
    expect(floorAtKm(floor, 99)).toBe(2000);
    expect(floorAtKm(floor, -5)).toBe(0);
  });

  it("says nothing at all when a route shipped without one", () => {
    expect(floorAtKm(NO_FLOOR, 12)).toBeNull();
    expect(roomAt(planFor(expedition), 12, 5000)).toBeNull();
  });

  it("answers how much room is left, and says when there is none", () => {
    expect(roomAt(plan, 4, 5500)).toEqual({ floorM: 4000, marginM: 1500, ok: true });
    const tooLow = roomAt(plan, 4, 3800)!;
    expect(tooLow.ok).toBe(false);
    expect(tooLow.marginM).toBe(-200);
  });
});

describe("a saved run against the route as it now stands", () => {
  it("resumes when the route has not moved", () => {
    expect(resumeRun(plan, run(), print)).toEqual({
      kind: "resume",
      km: 1500,
      beats: ["wuhan"],
      arrived: false,
    });
  });

  it("keeps the beats and drops the kilometre when it has", () => {
    const moved = resumeRun(plan, run({ fingerprint: "00000000" }), print);
    expect(moved).toEqual({ kind: "moved", beats: ["wuhan"] });
  });

  it("starts fresh with nothing saved, or a save for another route", () => {
    expect(resumeRun(plan, null, print)).toEqual({ kind: "start" });
    expect(resumeRun(plan, run({ expeditionId: "kunlun" }), print)).toEqual({ kind: "start" });
  });
});

describe("the fingerprint of a route", () => {
  it("moves when a waypoint moves", () => {
    const shifted = {
      ...expedition,
      route: expedition.route.map((p, i) => (i === 2 ? { ...p, lat: p.lat + 0.1 } : p)),
    };
    expect(planFingerprint(planFor(shifted))).not.toBe(print);
  });

  it("moves when a leg is flown at a different speed", () => {
    const faster = {
      ...expedition,
      route: expedition.route.map((p, i) => (i === 1 ? { ...p, speed: "cruise" as const } : p)),
    };
    expect(planFingerprint(planFor(faster))).not.toBe(print);
  });

  it("does not move when the floor beside it is recut", () => {
    // The floor is derived from the ground, not from what a kilometre means:
    // recutting it must not throw away everybody's progress.
    expect(planFingerprint(planFor(expedition, { strideKm: 1, m: [1, 2, 3] }))).toBe(print);
  });
});
