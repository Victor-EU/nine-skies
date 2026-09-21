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
import { corridorCache, type Corridor, type DrawnGap } from "./corridor.ts";
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
  /** How much of this route is flown over ground the game does not draw (F53). */
  readonly drawnGap: DrawnGap | null;
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
  /** Injectable so a suite can move the world and see the section notice. */
  open: (name: string) => Corridor | null = corridorCache(worldRoot),
): readonly RouteReport[] {
  const reports: RouteReport[] = [];

  for (const e of expeditions) {
    const authored = e.arrival !== undefined;
    const ground = resolveGround(e, worldRoot, sectionRoot, open);
    const { groundM, source, corridor, sectionIssue, drawnGap, skipReason } = ground;
    if (!groundM) {
      reports.push({
        expedition: e.id,
        authored,
        check: null,
        source,
        corridor,
        sectionIssue,
        drawnGap,
        skipReason,
      });
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
      drawnGap,
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
  const gap = describeGap(report.drawnGap);
  if (gap) lines.push(`  ✗ ${report.expedition} · ${gap}`);

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
  // What the pass covers, in the habit F48 put on the probe report: a route
  // that misses every hero area is checked against the ground the game draws,
  // and a reader should be able to see that rather than infer it from silence.
  const { drawnGap: g } = report;
  if (g && g.cover)
    lines.push(
      `      90 m cover beside it: ${g.cover} · ` +
        `${g.over} of ${g.of} stations over it`,
    );
  return lines;
}

/**
 * The one line a route flown over the wrong grid gets, or null.
 *
 * Separate from `describe` because the challenge gate says the same thing
 * about a patch, and the two must not drift into two different sentences
 * about one fault.
 *
 * It names no remedy on purpose. "Re-cut it" is what a stale section is told
 * and it is the wrong advice here: re-cutting produces the same 1 km numbers,
 * because the cutters read `groundAt` and that is not a thing to change
 * quietly -- it invalidates every committed section and patch at once
 * (D23, D24). What this is for is making the choice arrive at the moment the
 * first piece of content needs it, instead of arriving as a flight that
 * cleared in CI and hit a wall in play.
 */
export function describeGap(gap: DrawnGap | null): string | null {
  if (!gap || gap.over === 0) return null;
  const where = gap.areas.join(", ");
  return (
    `${gap.over} of ${gap.of} checked points are over ${where}, which the game ` +
    `draws at 90 m — the ground here was cut from the 1 km grid and the two ` +
    `differ by ${gap.worstM.toFixed(0)} m at their worst ` +
    `(${gap.countryM.toFixed(0)} m against ${gap.heroM.toFixed(0)} m). ` +
    `Which grid content is cut from is an open decision (F51, F53)`
  );
}

/** Where sections live, relative to the content directory. */
export function sectionsDir(contentDir: string): string {
  return join(contentDir, "sections");
}
