/**
 * Where the ground under an authored route comes from (D21).
 *
 * Two sources, in order. A machine that has built a world reads the world,
 * which is authoritative and lets the committed section be re-checked against
 * it. Everywhere else - CI, a writer's laptop, a fresh clone - the section
 * committed beside the route is the ground. An expedition with neither is
 * unresolved, and that is a failure rather than a pass.
 *
 * It is one function because the content gate and the finding suites must not
 * be able to disagree about it. F17 to F23 are quoted to the metre in the
 * documentation; if the gate flew one ground and the tests another, the first
 * time they diverged would be the first time anyone noticed.
 */
import {
  corridorCache,
  drawnGap,
  profileAlong,
  stationsAlong,
  type Corridor,
  type DrawnGap,
} from "./corridor.ts";
import { corridorFor, projectedWaypoints } from "./expedition.ts";
import { maxDriftM, readSection, sectionPath, verifySection } from "./section.ts";
import { committedVerifier } from "./attest.ts";
import type { Expedition } from "../content/schema.ts";

export type GroundSource = "world" | "section";

/**
 * How far a section may sit from the world it was cut from, metres.
 *
 * Sections hold decimetres, so five centimetres of disagreement is the
 * rounding and anything past it is a rebuild that never reached the artefact.
 * Deliberately far tighter than any tolerance in the flown check: this is not
 * asking whether the section is good enough to fly, it is asking whether it
 * came from the world sitting next to it.
 */
const DRIFT_TOLERANCE_M = 0.05;

export interface GroundResolution {
  /** Ground at one-kilometre stations, or null when there is none to be had. */
  readonly groundM: readonly number[] | null;
  readonly source: GroundSource | null;
  readonly corridor: string | null;
  /** Why the committed section cannot stand for this route, if it cannot. */
  readonly sectionIssue: string | null;
  /**
   * Whether this route is flown over ground the game does not draw, measured
   * against the 90 m cover beside the world -- null everywhere the world is
   * not, which is the same set of machines that cannot re-cut a section
   * either (F53).
   */
  readonly drawnGap: DrawnGap | null;
  readonly skipReason: string | null;
}

export function resolveGround(
  expedition: Expedition,
  worldRoot: string,
  sectionRoot: string,
  open: (name: string) => Corridor | null = corridorCache(worldRoot),
): GroundResolution {
  const section = readSection(sectionRoot, expedition.id);
  // `stale` covers the signature too (D23), so a section whose ground was
  // edited is refused on both paths below: it is never flown, and on a
  // machine with a world it is reported *and* overridden by the world.
  const stale = section
    ? verifySection(section, expedition, committedVerifier())
    : null;
  const { chosen, looked, leaves } = corridorFor(expedition, open);

  if (chosen) {
    const waypoints = projectedWaypoints(expedition);
    const profiled = profileAlong(chosen.corridor, waypoints);
    // The check CI cannot do for itself: the committed artefact against the
    // data it claims to come from. It only ever runs where both exist, which
    // is the machine that can fix it.
    const drift = section && !stale ? maxDriftM(section, profiled) : 0;
    return {
      groundM: profiled.profileM,
      source: "world",
      corridor: chosen.name,
      // Measured at the same stations the profile is, so "station 1,842" means
      // the same kilometre in both.
      drawnGap: drawnGap(chosen.corridor, stationsAlong(waypoints)),
      sectionIssue:
        stale ??
        (drift > DRIFT_TOLERANCE_M
          ? `the committed section is ${drift.toFixed(0)} m from ${chosen.name} at its worst; ` +
            `re-cut it with \`npm run content:sections\``
          : null),
      skipReason: null,
    };
  }

  if (section && !stale)
    return {
      groundM: section.groundM,
      source: "section",
      corridor: section.cutFrom.corridor,
      sectionIssue: null,
      drawnGap: null,
      skipReason: null,
    };

  const worlds = leaves.length
    ? leaves.map((l) => `${l.name} stops covering it at km ${l.km}`).join("; ")
    : `no world among ${looked.join(", ")} under ${worldRoot}`;
  const cut = stale
    ? `the section at ${sectionPath(sectionRoot, expedition.id)} is refused — see the line above`
    : `no section at ${sectionPath(sectionRoot, expedition.id)}`;
  return {
    groundM: null,
    source: null,
    corridor: null,
    sectionIssue: stale,
    drawnGap: null,
    skipReason:
      `no ground to fly it over — ${worlds}, and ${cut}. ` +
      `Run \`make world CORRIDOR=${expedition.id}\`, which cuts the section too`,
  };
}
