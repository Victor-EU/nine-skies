/**
 * The floor a route ships, and what "resume at the last beat" costs (F39).
 *
 * The bundle the app flies is committed, like the capture stations are, so
 * these check the committed artefact against the authored route rather than
 * against a copy of its numbers. The floor itself needs ground and is checked
 * where ground is; the staleness check needs neither.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hasGround, sea } from "./fixture.ts";
import { loadExpedition, planFor } from "../../tools/expedition.ts";
import { planFingerprint } from "../../engine/src/expedition/resume.js";
import { altitudeFloorM, flyRoute } from "../../engine/src/sim/route.js";
import { EXPEDITION_RULES } from "../../content/schema.ts";
import {
  BUNDLE_VERSION,
  type ExpeditionBundle,
} from "../../engine/src/expedition/runner.js";
import { AUTOSAVE_INTERVAL_S } from "../../engine/src/save/autosave.js";

const bundle = JSON.parse(
  readFileSync("app/public/expeditions.json", "utf8"),
) as ExpeditionBundle;
const shipped = bundle.expeditions.find((p) => p.id === "sea-to-sky")!;
const expedition = loadExpedition("content/expeditions/sea-to-sky.yaml");

describe("the bundle the app flies", () => {
  it("is the route as authored today, not as it was when someone last cut it", () => {
    expect(bundle.version).toBe(BUNDLE_VERSION);
    // The fingerprint covers everything that decides what a kilometre means,
    // so this fails if a waypoint or a leg speed has moved since the cut.
    expect(planFingerprint(shipped)).toBe(planFingerprint(planFor(expedition)));
  });

  it("carries the card catchments too, because free flight meets those", () => {
    expect(bundle.cards.map((c) => c.id).sort()).toEqual([
      "ayding-lake",
      "qinghai-tibet-plateau",
      "wulingyuan",
    ]);
  });

  it("samples its floor at the resolution its ground has, and no coarser", () => {
    expect(shipped.floor.strideKm).toBe(1);
    expect(shipped.floor.m).toHaveLength(2932);
    expect(Math.max(...shipped.floor.m)).toBeCloseTo(5858, -1);
    // The whole point of the table: it is the route's own demand, and it is
    // higher than the start altitude for most of the way.
    expect(shipped.floor.m[0]!).toBeLessThan(expedition.start_altitude_m);
    expect(shipped.floor.m[2000]!).toBeGreaterThan(expedition.start_altitude_m);
  });
});

describe.skipIf(!hasGround)("the shipped floor against the one the gate computes", () => {
  it("is the same number at every kilometre it is asked about", () => {
    const options = {
      startAltitudeM: expedition.start_altitude_m,
      clearanceM: EXPEDITION_RULES.defaultClearanceM,
      arrivalM: expedition.arrival!.altitude_m,
    };
    // Ten samples rather than 2,932: each one flies the rest of the route,
    // which is the reason the table is shipped at all.
    for (const km of [0, 300, 900, 1500, 2000, 2400, 2700, 2850, 2900, 2931]) {
      const truth = altitudeFloorM(sea().route, sea().ground, km, options);
      const table = shipped.floor.m[Math.min(shipped.floor.m.length - 1, Math.round(km))]!;
      expect(Number.isFinite(truth)).toBe(true);
      expect(table).toBeCloseTo(truth, -1);
    }
  });
});

describe.skipIf(!hasGround)("what a resume costs, measured on the route", () => {
  it("is up to 13.5 minutes at the last beat, against a quarter of one", () => {
    const flight = flyRoute(sea().route, sea().ground, {
      startAltitudeM: expedition.start_altitude_m,
      track: true,
    });
    const minuteAt = (km: number) =>
      flight.track[Math.min(flight.track.length - 1, Math.round(km))]!.seconds / 60;

    const gaps: number[] = [];
    let previous = 0;
    for (const beat of shipped.beats) {
      gaps.push(minuteAt(beat.km) - previous);
      previous = minuteAt(beat.km);
    }
    expect(gaps.map((g) => +g.toFixed(1))).toEqual([13.5, 13.4, 1.6, 8.2]);
    expect(Math.max(...gaps)).toBeGreaterThan(flight.minutes / 3);

    // The autosave costs the same fifteen seconds wherever it happens, which
    // is 54 times less than the worst beat gap on this route.
    expect((Math.max(...gaps) * 60) / AUTOSAVE_INTERVAL_S).toBeCloseTo(54, -1);
  });
});
