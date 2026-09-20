/**
 * Fly every authored expedition over real ground and report what is wrong
 * with it (D17, D19).
 *
 * This is the half of content validation a parser cannot do. `validate.ts`
 * checks that a route is well-formed: waypoints in China, legs long enough to
 * be legs, every leg with a speed. None of that notices that Expedition 1
 * flies into a ridge west of Chengdu (F17) or that it cannot be arrived at
 * from any altitude until thirty-one kilometres out (F21). Those are
 * properties of the route *and the ground*, so the check needs the ground.
 *
 * It gets it from one of two places. A machine that has built a world reads
 * the world, which is authoritative and also re-checks the committed section
 * against it. A machine that has not - CI, a writer's laptop, a fresh clone -
 * reads the section, which is the same ground cut to this route and committed
 * beside it (D21). Only an expedition with neither is unchecked, and that is
 * reported as a failure rather than a pass: a gate that silently passes when
 * it cannot run is worse than no gate, because it is the same green tick.
 */
import { join } from "node:path";
import { validateRoute, type RouteCheck } from "../engine/src/sim/route.ts";
import { EXPEDITION_RULES, type Expedition } from "../content/schema.ts";
import { corridorCache } from "./corridor.ts";
import { flyableFrom } from "./expedition.ts";
import { resolveGround, type GroundSource } from "./ground.ts";

export interface RouteReport {
  readonly expedition: string;
  /** Null when this expedition had no ground to fly over, which is not a pass. */
  readonly check: RouteCheck | null;
  /** True when the file authored an arrival, so the numbers are a claim. */
  readonly authored: boolean;
  readonly source: GroundSource | null;
  readonly corridor: string | null;
  /** Why the committed section cannot stand for this route, if it cannot. */
  readonly sectionIssue: string | null;
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

export function checkRoutes(
  expeditions: readonly Expedition[],
  worldRoot: string,
  sectionRoot: string,
): readonly RouteReport[] {
  const open = corridorCache(worldRoot);
  const reports: RouteReport[] = [];

  for (const e of expeditions) {
    const authored = e.arrival !== undefined;
    const ground = resolveGround(e, worldRoot, sectionRoot, open);
    const { groundM, source, corridor, sectionIssue, skipReason } = ground;
    if (!groundM) {
      reports.push({ expedition: e.id, authored, check: null, source, corridor, sectionIssue, skipReason });
      continue;
    }
    const { route, ground: profile } = flyableFrom(e, groundM);
    // The stride the corridor suite settled on. A sampled floor is concave,
    // so chords sag under it, and at the end of a route - where the floor
    // falls faster than any chord can follow - 100 km puts the floor 150 m
    // below the ground. 25 km is converged on Sea to Sky and 50 is not (F21).
    reports.push({
      expedition: e.id,
      authored,
      source,
      corridor,
      sectionIssue,
      skipReason: null,
      check: validateRoute(route, profile, { ...optionsFor(e), strideKm: 25, toleranceM: 5 }),
    });
  }
  return reports;
}

/** One line per finding, in the terms the author can act on. */
export function describe(report: RouteReport): string[] {
  const lines: string[] = [];
  if (report.sectionIssue)
    lines.push(`  ✗ ${report.expedition} · section: ${report.sectionIssue}`);

  const { check } = report;
  if (!check) {
    lines.push(`  ⚠ ${report.expedition} NOT CHECKED — ${report.skipReason}`);
    return lines;
  }
  if (check.issues.length > 0) {
    for (const i of check.issues)
      lines.push(`  ✗ ${report.expedition} · ${i.check}: ${i.message}`);
    return lines;
  }

  const arrival = report.authored
    ? `arrives ${check.lowestArrivalM.toFixed(0)} m up against an authored ${check.arrivalM.toFixed(0)}`
    : `lowest arrival ${check.lowestArrivalM.toFixed(0)} m over it · NO ARRIVAL AUTHORED`;
  lines.push(
    `  ✓ ${report.expedition} over ${report.corridor} (${report.source}) · ` +
      `${check.minutes.toFixed(1)} min · clears by ${check.worstClearanceM.toFixed(0)} m ` +
      `at ${check.worstKm.toFixed(0)} km · ${arrival}`,
  );
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

/** Where sections live, relative to the content directory. */
export function sectionsDir(contentDir: string): string {
  return join(contentDir, "sections");
}
