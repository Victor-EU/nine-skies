/**
 * Fly a challenge with an autopilot, so that a challenge is data the build
 * has been shown to be completable rather than data it has been shown to
 * parse.
 *
 * This is D17's rule applied one level down. A route is not content until
 * something has flown it over real ground (F17 found Expedition 1 inside a
 * ridge); a challenge is a route plus a set of conditions, and every one of
 * those conditions is a claim about what the aeroplane can do. *Below 200 m
 * over a 4,411 m airfield* is either an approach or an impossibility
 * depending on numbers — the descent rate, the density lag, the rim of the
 * bowl the field sits in — that no author has in their head and no parser can
 * reach.
 *
 * **It is a proof of possibility, not a model of a player.** The autopilot
 * flies the shortest course that visits everything, holds the altitude each
 * objective wants and never sightsees. A challenge it cannot complete cannot
 * be completed; a challenge it completes with two seconds to spare is one a
 * person will fail all afternoon, which is why the report prints the margin
 * rather than a tick.
 */
import { LIGHT_PISTON, type AircraftSpec } from "../sim/aircraft.js";
import { DEFAULT_PACING, MODE_GROUND_KM_PER_MIN, type Pacing, type SpeedMode } from "../sim/scale.js";
import { STILL_AIR, createFlightState, step, telemetry, type Environment } from "../sim/flight.js";
import { ChallengeRun, type ChallengeSpec, type ChallengeState } from "./challenge.js";
import type { ChallengeSample, ObjectiveState } from "./objectives.js";

/** A height the autopilot aims for, above the sea or above the ground. */
export type TargetAltitude =
  | { readonly kind: "msl"; readonly m: number }
  | { readonly kind: "agl"; readonly m: number }
  | { readonly kind: "hold" };

export interface CoursePoint {
  readonly eastM: number;
  readonly northM: number;
  readonly altitude: TargetAltitude;
  /** How close counts as reaching it, metres. */
  readonly reachedWithinM: number;
}

export interface FlyChallengeOptions {
  /** Ground under a point, or null where nothing is built. */
  readonly groundAt: (eastM: number, northM: number) => number | null;
  readonly dt?: number;
  /** Give up after this much player time. Defaults to twenty minutes. */
  readonly maxSeconds?: number;
  /** World minutes per player minute. 1 is what ships (F41). */
  readonly clockRate?: number;
  readonly spec?: AircraftSpec;
  readonly pacing?: Pacing;
}

export interface ObjectiveOutcome {
  readonly id: string;
  readonly label: string;
  readonly state: ObjectiveState;
  readonly progress: number;
}

export interface ChallengeFlight {
  readonly state: ChallengeState;
  /** Player seconds the autopilot took. */
  readonly seconds: number;
  /** Beijing minutes when it finished. */
  readonly clockMinutes: number;
  readonly outcomes: readonly ObjectiveOutcome[];
  /** Frames the terrain clamp fired on. Any at all is flying into the ground. */
  readonly bounces: number;
  /** The lowest the aircraft got above the ground, metres. */
  readonly minAglM: number;
  /** Minutes left on the deadline at the end, or null when there is none. */
  readonly marginMinutes: number | null;
  /** True when the probe ran out of time holding over the last objective. */
  readonly ranOutOfCourse: boolean;
  /**
   * Frames flown where the world had no ground under the aircraft.
   *
   * Any at all invalidates the flight, and it took a committed patch of
   * ground to notice (F44). A null ground is handled correctly everywhere it
   * is *read* -- `conditionsHold` refuses to credit an objective it cannot
   * measure the height of (F42's rule) -- and that is exactly what hides it:
   * the aeroplane flies on over a hole at ten kilometres below sea level,
   * never bounces, and arrives somewhere it can be credited.
   *
   * Deleting one row of ninety cells from the high airfield's patch -- five
   * per cent of the file -- leaves the challenge finishing in the same 68.93
   * seconds with both objectives met, and moves the lowest pass it reports
   * from 45 m above the ground to 170. Not a worse number: a *better* one,
   * because the frames where the aeroplane was lowest are the frames it had
   * no ground for. Without this count there is nothing in the report to read
   * that against.
   */
  readonly framesWithoutGround: number;
}

/**
 * How hard the autopilot may bank. Deliberately under the model's own 60
 * degrees: a probe that flies at the limit measures the limit rather than the
 * challenge, and F23 made the same choice about descent for the same reason.
 */
const PROBE_ROLL = 0.8;

export function flyChallenge(
  spec: ChallengeSpec,
  course: readonly CoursePoint[],
  mode: SpeedMode,
  options: FlyChallengeOptions,
): ChallengeFlight {
  const {
    groundAt,
    dt = 1 / 30,
    maxSeconds = 20 * 60,
    clockRate = 1,
    spec: aircraft = LIGHT_PISTON,
    pacing = DEFAULT_PACING,
  } = options;

  const run = new ChallengeRun(spec);
  const state = createFlightState({
    eastM: spec.start.eastM,
    northM: spec.start.northM,
    altitudeM: spec.start.altitudeM,
    headingRad: spec.start.headingRad,
    mode,
  });

  let seconds = 0;
  let bounces = 0;
  let framesWithoutGround = 0;
  let minAglM = Infinity;
  let leg = 0;
  const groundKmPerMin = MODE_GROUND_KM_PER_MIN[mode];

  const sampleNow = (): ChallengeSample => ({
    seconds,
    eastM: state.eastM,
    northM: state.northM,
    altitudeM: state.altitudeM,
    groundM: groundAt(state.eastM, state.northM),
    headingRad: state.headingRad,
    groundSpeedKmPerMin: groundKmPerMin,
    clockMinutes: spec.start.clockMinutes + (seconds / 60) * clockRate,
  });

  run.jump(sampleNow());

  while (seconds < maxSeconds && run.state === "flying") {
    const target = course[leg]!;
    const dx = target.eastM - state.eastM;
    const dy = target.northM - state.northM;
    const range = Math.hypot(dx, dy);
    // Reaching the last point is not finishing: `land` wants a height as
    // well as a place, and the height takes longer than the place. So the
    // probe holds over the last objective and keeps descending onto it,
    // which is what a pilot told to get down over an airfield would do.
    if (range <= target.reachedWithinM && leg < course.length - 1) {
      leg++;
      continue;
    }

    // Steer: the simulation's convention is east = sin, north = cos.
    const want = Math.atan2(dx, dy);
    let error = want - state.headingRad;
    while (error > Math.PI) error -= Math.PI * 2;
    while (error < -Math.PI) error += Math.PI * 2;
    const roll = Math.max(-PROBE_ROLL, Math.min(PROBE_ROLL, error * 2));

    const groundM = groundAt(state.eastM, state.northM);
    let wantAltitudeM = state.altitudeM;
    if (target.altitude.kind === "msl") wantAltitudeM = target.altitude.m;
    else if (target.altitude.kind === "agl") {
      const under = groundAt(target.eastM, target.northM) ?? groundM;
      if (under !== null) wantAltitudeM = under + target.altitude.m;
    }
    // Proportional on altitude, saturating a hundred metres out: the pitch
    // lag is four seconds and a bang-bang command would oscillate through it.
    const climbWanted = (wantAltitudeM - state.altitudeM) / 100;
    const pitch = Math.max(-1, Math.min(1, climbWanted));

    if (groundM === null) framesWithoutGround++;
    const env: Environment = {
      ...STILL_AIR,
      groundElevationM: groundM ?? -10_000,
    };
    const before = state.altitudeM;
    step(state, { pitch, roll, mode }, env, dt, aircraft, pacing);
    if (groundM !== null) {
      const agl = state.altitudeM - groundM;
      if (agl < minAglM) minAglM = agl;
      // The clamp is the only thing that can raise the aircraft while it is
      // being commanded down; that is exactly what a bounce is.
      if (state.altitudeM > before && pitch < 0) bounces++;
    }
    seconds += dt;
    run.advance(sampleNow());
  }

  // Telemetry is computed and discarded on purpose: calling it is how this
  // stays honest about using the same model the game does, and nothing here
  // needs the numbers.
  telemetry(state, STILL_AIR, { pitch: 0, roll: 0, mode }, aircraft, pacing);

  return {
    state: run.state,
    seconds,
    clockMinutes: run.clockMinutes,
    outcomes: run.objectives.map((o) => ({
      id: o.id,
      label: o.label,
      state: o.state,
      progress: o.progress,
    })),
    bounces,
    minAglM: minAglM === Infinity ? NaN : minAglM,
    marginMinutes: run.minutesRemaining,
    ranOutOfCourse: seconds >= maxSeconds && run.state === "flying",
    framesWithoutGround,
  };
}
