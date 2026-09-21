/**
 * Fly every authored challenge and report whether it can be done (D38).
 *
 *   npm run content:challenges
 *
 * The same argument as the route gate, one level down: a challenge that has
 * only been parsed is a set of numbers somebody typed. *Below 200 m over a
 * 4,411 m airfield* is an approach or an impossibility depending on the
 * descent rate, the density lag and the rim of the bowl the field sits in,
 * and none of those are in the file. So the check flies it.
 *
 * Four things are measured per challenge and every one of them has cost
 * somebody a finding somewhere else in this repository:
 *
 *   **Ground.** The elevations the objectives are written against, read off
 *   the built world, beside whatever the author believed. Daocheng Yading is
 *   4,387.7 m on the 1 km grid against a published 4,411.
 *
 *   **Width against the aeroplane's own turn.** A corridor, a gate or a gorge
 *   narrower than a full-bank reversal cannot be flown by an aircraft that is
 *   banking at all (F38, and F43 for the gorge). The reversal is measured
 *   through the flight model at the challenge's own speed and altitude, from
 *   cruise, because a player arrives at a slow mode by slowing down.
 *
 *   **The flight.** An autopilot flies the course and the objectives are
 *   scored exactly as they would be in the game.
 *
 *   **The deadline.** For a sunset it is computed where the challenge ends,
 *   and then priced at every clock rate — because whether a race is a race at
 *   all depends on a number nobody has decided yet (F41, F43).
 */
import type { Challenge } from "../content/schema.ts";
import { reversalWidthM } from "../engine/src/sim/flight.ts";
import { MODE_IAS_MS, type SpeedMode } from "../engine/src/sim/scale.ts";
import { flyChallenge, type ChallengeFlight } from "../engine/src/challenge/fly.ts";
import { projectAlbers } from "../engine/src/terrain/worldGrid.ts";
import type { Corridor, GroundField } from "./corridor.ts";
import { courseFor, courseKm, deadlineFrom, minutesFor, placesOf, specFrom } from "./challenge.ts";
import { committedVerifier } from "./attest.ts";
import {
  maxPatchDriftM,
  patchGround,
  patchPath,
  readPatch,
  verifyPatch,
  PATCH_DRIFT_TOLERANCE_M,
} from "./patch.ts";

/** A place a challenge names, and the ground the world puts under it. */
export interface GroundNote {
  readonly what: string;
  readonly groundM: number | null;
}

export interface WidthNote {
  readonly what: string;
  readonly widthM: number;
  readonly reversalM: number;
}

/**
 * Where the ground under a challenge came from (D39).
 *
 * The same two places a route's comes from and in the same order: a machine
 * that has built a world reads the world and re-checks the committed artefact
 * against it; everywhere else the artefact *is* the ground. A challenge with
 * neither is unchecked, which is a failure and not a pass.
 */
export type ChallengeGroundSource = "world" | "patch";

export interface ChallengeReport {
  readonly challenge: Challenge;
  readonly courseKm: number;
  readonly minutes: number;
  /** The corridor the ground came from, or the one a patch was cut from. */
  readonly world: string | null;
  readonly groundSource: ChallengeGroundSource | null;
  /** Why the committed patch cannot stand for this challenge, if it cannot. */
  readonly patchIssue: string | null;
  readonly ground: readonly GroundNote[];
  readonly widths: readonly WidthNote[];
  readonly flight: ChallengeFlight | null;
  readonly deadlineMinutes: number | null;
  readonly skipReason: string | null;
}

/**
 * Every width a challenge authored, against the turn that has to fit in it.
 *
 * Measured from cruise rather than settled at the mode, which is the wider of
 * the two and the one a player gets: a challenge is entered by slowing down
 * and banking, and indicated airspeed takes six seconds to come off.
 */
export function widthsOf(c: Challenge, altitudeM: number): WidthNote[] {
  const mode = c.speed as SpeedMode;
  const reversalM = reversalWidthM(altitudeM, mode, { fromIasMs: MODE_IAS_MS.cruise });
  const notes: WidthNote[] = [];
  for (const o of c.objectives) {
    if (o.kind === "gates")
      (o.gates ?? []).forEach((g, i) =>
        notes.push({ what: `${o.id} gate ${i + 1}`, widthM: g.width_km * 1000, reversalM }),
      );
    else if (o.kind === "follow")
      notes.push({ what: `${o.id} corridor`, widthM: o.corridor_km! * 2000, reversalM });
  }
  return notes;
}

export function checkChallenge(
  c: Challenge,
  open: (name: string) => Corridor | null,
  /** Where committed patches live; null to look only at built worlds. */
  patchRoot: string | null,
): ChallengeReport {
  const patch = patchRoot ? readPatch(patchRoot, c.id) : null;
  // `stale` covers the signature too (D23), so a patch whose ground was
  // edited is refused on both paths below: never flown, and on a machine with
  // a world reported *and* overridden by the world.
  const stale = patch ? verifyPatch(patch, c, committedVerifier()) : null;
  const world = pickWorld(c, open);

  const deadline = deadlineFrom(c);
  const base = {
    challenge: c,
    courseKm: courseKm(c),
    minutes: minutesFor(c),
    widths: widthsOf(c, c.start.altitude_m),
    deadlineMinutes: deadline?.clockMinutes ?? null,
  };

  let field: GroundField | null = null;
  let source: ChallengeGroundSource | null = null;
  let name: string | null = null;
  let patchIssue: string | null = stale;

  if (world) {
    field = world.corridor;
    source = "world";
    name = world.name;
    // The check CI cannot do for itself: the committed artefact against the
    // data it claims to come from. A patch is a subset of the lattice rather
    // than a resampling of it, so the tolerance is zero.
    if (patch && !stale) {
      const drift = maxPatchDriftM(patch, world.corridor);
      if (drift > PATCH_DRIFT_TOLERANCE_M)
        patchIssue =
          drift === Infinity
            ? `the committed patch holds ground ${world.name} no longer has; ` +
              `re-cut it with \`npm run content:patches\``
            : `the committed patch is ${drift.toFixed(0)} m from ${world.name} at ` +
              `its worst; re-cut it with \`npm run content:patches\``;
    }
  } else if (patch && !stale) {
    field = patchGround(patch);
    source = "patch";
    name = patch.cutFrom.corridor;
  }

  const ground: GroundNote[] = placesOf(c).map((p) => ({
    what: p.what,
    groundM: field ? groundUnder(field, p.lat, p.lon) : null,
  }));

  if (!field) {
    const cut = stale
      ? `the patch at ${patchRoot ? patchPath(patchRoot, c.id) : "(not looked for)"} is refused — see the line above`
      : `no patch at ${patchRoot ? patchPath(patchRoot, c.id) : "(not looked for)"}`;
    return {
      ...base,
      world: null,
      groundSource: null,
      patchIssue,
      ground,
      flight: null,
      skipReason:
        `no ground to fly it over — no built world under it, and ${cut}. ` +
        `Run \`make world CORRIDOR=sea-to-sky\`, which cuts the patch too`,
    };
  }

  const flight = flyChallenge(specFrom(c), courseFor(c), c.speed as SpeedMode, {
    groundAt: (eastM, northM) => (field.covers(eastM, northM) ? field.groundAt(eastM, northM) : null),
  });
  return { ...base, world: name, groundSource: source, patchIssue, ground, flight, skipReason: null };
}

function groundUnder(field: GroundField, lat: number, lon: number): number | null {
  const { eastM, northM } = projectAlbers(lat, lon);
  return field.covers(eastM, northM) ? field.groundAt(eastM, northM) : null;
}

/**
 * A built world with tiles under everything the challenge names.
 *
 * Its own name first, then every expedition corridor, then the country.
 * Same rule as the route check and for the same reason: a corridor answers
 * zero outside its strip, which is the East China Sea, and a challenge flown
 * over the sea passes everything.
 */
function pickWorld(
  c: Challenge,
  open: (name: string) => Corridor | null,
): { name: string; corridor: Corridor } | null {
  for (const name of [c.id, "sea-to-sky", "china"]) {
    const corridor = open(name);
    if (!corridor) continue;
    const covered = placesOf(c).every((p) => {
      const { eastM, northM } = projectAlbers(p.lat, p.lon);
      return corridor.covers(eastM, northM);
    });
    if (covered) return { name, corridor };
  }
  return null;
}
