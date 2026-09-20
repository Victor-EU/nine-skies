/**
 * Fly every authored expedition over the built world and report what is
 * wrong with it (D17, D19).
 *
 * This is the half of content validation a parser cannot do. `validate.ts`
 * checks that a route is well-formed: waypoints in China, legs long enough to
 * be legs, every leg with a speed. None of that notices that Expedition 1
 * flies into a ridge west of Chengdu (F17) or that it cannot be arrived at
 * from any altitude until thirty-one kilometres out (F21). Those are
 * properties of the route *and the ground*, so the check needs the ground.
 *
 * It needs a built corridor, which CI does not have. That is why the result
 * distinguishes "checked and fine" from "not checked": a gate that silently
 * passes when it cannot run is worse than no gate, because it is the same
 * green tick.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { validateRoute, type RouteCheck } from "../engine/src/sim/route.ts";
import { EXPEDITION_RULES, type Expedition } from "../content/schema.ts";
import { loadCorridor, type Corridor } from "./corridor.ts";
import { flyable } from "./expedition.ts";

export interface RouteReport {
  readonly expedition: string;
  /** Null when this expedition had no world to fly over, which is not a pass. */
  readonly check: RouteCheck | null;
  /** True when the file authored an arrival, so the numbers are a claim. */
  readonly authored: boolean;
  readonly corridor: string | null;
  readonly skipReason: string | null;
}

/**
 * What to fly each expedition with.
 *
 * An expedition with no `arrival:` is flown without one, and the check
 * reports the height it reaches instead of failing. That is not leniency: a
 * route has not broken a promise it never made, and the measured number is
 * exactly what an author needs before they can write one down. What the gate
 * does about the gap is print NO ARRIVAL AUTHORED next to it, every run,
 * until somebody decides. Expedition 1 is that case today - F21 priced its
 * three endings and choosing between them is a writing decision.
 */
interface FlyOptions {
  readonly clearanceM: number;
  readonly arrivalM?: number;
  readonly startAltitudeM: number;
}

function optionsFor(e: Expedition): FlyOptions {
  const a = e.arrival;
  const clearanceM = a?.clearance_m ?? EXPEDITION_RULES.defaultClearanceM;
  return {
    clearanceM,
    startAltitudeM: e.start_altitude_m,
    ...(a ? { arrivalM: a.altitude_m } : {}),
  };
}

/**
 * Which built world an expedition can be flown over.
 *
 * Its own corridor first, then the full country, because phase 0 builds one
 * corridor per expedition and phase 2 builds `china` and serves all nine from
 * it. Checked in that order rather than the other way round so that a
 * corridor rebuilt for the route being edited is the one the check reads.
 */
const CORRIDOR_FALLBACK = "china";

function corridorNamesFor(e: Expedition): string[] {
  return [e.id, CORRIDOR_FALLBACK];
}

export function checkRoutes(
  expeditions: readonly Expedition[],
  worldRoot: string,
): readonly RouteReport[] {
  // Nine expeditions over one country grid would otherwise read the same
  // heightfield nine times, and at phase 2 that is ~70 GB of it.
  const loaded = new Map<string, Corridor | null>();
  const corridorNamed = (name: string): Corridor | null => {
    if (!loaded.has(name)) {
      const dir = join(worldRoot, name);
      loaded.set(name, existsSync(join(dir, "manifest.json")) ? loadCorridor(dir) : null);
    }
    return loaded.get(name) ?? null;
  };

  const reports: RouteReport[] = [];
  for (const e of expeditions) {
    const options = optionsFor(e);
    const authored = e.arrival !== undefined;
    const name = corridorNamesFor(e).find((n) => corridorNamed(n) !== null);
    const corridor = name ? corridorNamed(name) : null;
    if (!corridor || !name) {
      reports.push({
        expedition: e.id,
        authored,
        check: null,
        corridor: null,
        skipReason:
          `no world to fly it over; run \`make world CORRIDOR=${e.id}\` ` +
          `(looked for ${corridorNamesFor(e).join(", ")} under ${worldRoot})`,
      });
      continue;
    }
    const { route, ground } = flyable(e, corridor);
    // The stride the corridor suite settled on. A sampled floor is concave,
    // so chords sag under it, and at the end of a route - where the floor
    // falls faster than any chord can follow - 100 km puts the floor 150 m
    // below the ground. 25 km is converged on Sea to Sky and 50 is not (F21).
    reports.push({
      expedition: e.id,
      authored,
      corridor: name,
      skipReason: null,
      check: validateRoute(route, ground, { ...options, strideKm: 25, toleranceM: 5 }),
    });
  }
  return reports;
}

/** One line per finding, in the terms the author can act on. */
export function describe(report: RouteReport): string[] {
  const { check } = report;
  if (!check) return [`  ⚠ ${report.expedition} NOT CHECKED — ${report.skipReason}`];
  if (check.issues.length > 0)
    return check.issues.map((i) => `  ✗ ${report.expedition} · ${i.check}: ${i.message}`);
  const arrival = report.authored
    ? `arrives ${check.lowestArrivalM.toFixed(0)} m up against an authored ${check.arrivalM.toFixed(0)}`
    : `lowest arrival ${check.lowestArrivalM.toFixed(0)} m over it · NO ARRIVAL AUTHORED`;
  const lines = [
    `  ✓ ${report.expedition} over ${report.corridor} · ${check.minutes.toFixed(1)} min · ` +
      `clears by ${check.worstClearanceM.toFixed(0)} m at ${check.worstKm.toFixed(0)} km · ${arrival}`,
  ];
  // What a route that lands actually paid for it. Only worth a line when the
  // approach taper released margin, which is when the arrival is below the
  // clearance the rest of the route keeps (D20).
  if (check.claimed && check.arrivalM < check.clearanceM && Number.isFinite(check.approachMarginM))
    lines.push(
      `      approach: the lowest legal line passes ` +
        `${check.approachMarginM.toFixed(0)} m over terrain at its closest`,
    );
  return lines;
}
