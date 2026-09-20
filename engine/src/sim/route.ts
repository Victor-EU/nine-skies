/**
 * A route, and the question nobody had asked of one: can the aircraft
 * actually get over the ground it crosses?
 *
 * Finding F16 bounded the pacing question with the climb budget, but it
 * measured the wrong thing. It asked whether the aircraft *arrives* above the
 * plateau rim, comparing one number at the destination against the 4,500 m the
 * GDD calls plateau cruise. That is a fine question about Lhasa and a bad one
 * about the route to it, because the plateau is not a table: the Sea to Sky
 * line crosses ground at 5,579 m a hundred and thirty kilometres short of
 * Lhasa, a thousand metres above the rim it was being checked against. An
 * expedition can clear its destination and still fly into a ridge (F17).
 *
 * So the check here is clearance along the whole line, every step of the way,
 * and the failure it reports is a position rather than a verdict - the km at
 * which the ground won is what a route designer needs, and "does not close"
 * is not.
 *
 * This is also the seed of the expedition runner (workstream D): a route is a
 * polyline with a speed mode per leg, which is exactly what `flyRoute` walks.
 *
 * The second half of the file answers the question the clearance check cannot.
 * `flyRoute` flies full up-elevator, which proves a route is *possible* and
 * describes a flight nobody would take - thirty-five minutes of unbroken climb
 * ending two kilometres above the destination. What a route actually has to
 * offer is the gap between that and the minimum: `altitudeFloorM` is the
 * lowest altitude from which the rest of the route still works, and the gap
 * above it is, to the second, how long the autopilot may hand the stick back
 * (F19).
 */
import { ceilingM, LIGHT_PISTON, type AircraftSpec } from "./aircraft.js";
import {
  STILL_AIR,
  createFlightState,
  step,
  type Environment,
  type FlightState,
} from "./flight.js";
import { DEFAULT_PACING, type Pacing, type SpeedMode } from "./scale.js";

/**
 * One leg of a route: where it ends, and how fast it is flown.
 *
 * Per-leg speed is in the GDD already, and F3 suggested it as the lever that
 * buys altitude. F17 upgrades it from a lever to a requirement: at the shipped
 * pacing there is no route through the corridor that clears the ground at
 * cruise all the way.
 */
export interface RouteLeg {
  readonly name: string;
  /** Distance from the route's start at which this leg ends, real km. */
  readonly endKm: number;
  readonly mode: SpeedMode;
}

export interface Route {
  readonly name: string;
  readonly legs: readonly RouteLeg[];
}

export function routeLengthKm(route: Route): number {
  return route.legs.length === 0 ? 0 : route.legs[route.legs.length - 1]!.endKm;
}

export function modeAtKm(route: Route, km: number): SpeedMode {
  for (const leg of route.legs) if (km < leg.endKm) return leg.mode;
  return route.legs[route.legs.length - 1]?.mode ?? "cruise";
}

/** Ground elevation at a distance along the route, real metres. */
export type GroundProfile = (km: number) => number;

/** A place the ground won, and by how much. */
export interface Contact {
  readonly km: number;
  /** Metres the aircraft was below the ground. Always negative. */
  readonly shortfallM: number;
}

/** Where the aircraft was, one sample per kilometre of route. */
export interface TrackSample {
  readonly km: number;
  readonly altitudeM: number;
  readonly clearanceM: number;
}

export interface RouteFlight {
  readonly minutes: number;
  /** Smallest gap between aircraft and ground up to where the flight ended. */
  readonly worstClearanceM: number;
  readonly worstKm: number;
  /** How far along the route the aircraft got. Short of the end means it hit. */
  readonly reachedKm: number;
  readonly arrivalAltitudeM: number;
  readonly peakAltitudeM: number;
  /**
   * Where the ground first won, or null. Only the first, because everything
   * after it is fiction: the aircraft is inside a mountain, and a second
   * "contact" two hundred kilometres further on is a report about a flight
   * that never happened. Fix the first and fly it again.
   */
  readonly contact: Contact | null;
  readonly clears: boolean;
  /** Empty unless `track` was asked for. One sample per kilometre flown. */
  readonly track: readonly TrackSample[];
}

/**
 * What the aircraft is asked to do at a moment of the flight: elevator, -1 to
 * +1, the same number `step` takes. `FULL_CLIMB` is the reference policy and
 * everything else is measured against it.
 */
export type ClimbPolicy = (
  km: number,
  seconds: number,
  altitudeM: number,
) => number;

export const FULL_CLIMB: ClimbPolicy = () => 1;

/**
 * The player has the stick for `durationS` seconds, holding `pitch`.
 *
 * Level flight (the default) is the neutral model of a hand-off: not a
 * mistake, not a stunt, just somebody looking out of the window. It is the
 * floor of the damage rather than the ceiling - a player in a sightseeing
 * game noses down, and `pitch` is there because that costs several times as
 * much (F19).
 */
export function handOff(
  startS: number,
  durationS: number,
  pitch = 0,
  base: ClimbPolicy = FULL_CLIMB,
): ClimbPolicy {
  return (km, seconds, altitudeM) =>
    seconds >= startS && seconds < startS + durationS
      ? pitch
      : base(km, seconds, altitudeM);
}

/**
 * The route from `fromKm` onward, renumbered so it starts at zero.
 *
 * Pair it with `groundFrom` and the remainder of a route is just another
 * route, which is what lets the floor search below reuse `flyRoute` instead
 * of reimplementing the integrator backwards.
 */
export function routeFrom(route: Route, fromKm: number): Route {
  return {
    name: route.name,
    legs: route.legs
      .filter((leg) => leg.endKm > fromKm)
      .map((leg) => ({ ...leg, endKm: leg.endKm - fromKm })),
  };
}

export function groundFrom(ground: GroundProfile, fromKm: number): GroundProfile {
  return (km) => ground(km + fromKm);
}

/**
 * The lowest altitude at `km` from which the rest of the route still clears.
 *
 * This is the number the aircraft is really flying against, and it is not the
 * ground. Eight hundred kilometres inland the Sea to Sky floor is 3,588 m
 * over farmland 32 m above the sea: nothing within sight of the aircraft
 * explains it, and it is binding all the same, because the wall is fourteen
 * hundred kilometres ahead and the climb that clears it has to be bought
 * here (F19).
 *
 * Bisected on the sim itself rather than derived, because the thing being
 * asked about - climb rate falling with density, true airspeed rising with
 * altitude, boost quietly lapsing - is the integrator's behaviour and not a
 * formula anyone should write twice. Returns `Infinity` when no altitude at
 * or below `maxM` saves the route.
 */
export interface FloorOptions extends FlyRouteOptions {
  /**
   * Metres of clearance the rest of the route must keep, not just zero.
   *
   * This is where a margin belongs, and it took a wrong turn to find out:
   * adding it to the floor afterwards does not work, because floor + margin
   * is not a trajectory. Climb rate falls with altitude, so an aircraft
   * holding station a few hundred metres over the floor cannot climb as fast
   * as the floor rises and slides back down onto it - a 200 m margin asked
   * for that way arrives at the wall as 5 m (F20). Raising the ground instead
   * makes the margin part of the curve, and the curve is flyable because the
   * floor *is* a full-climb trajectory: an aircraft sitting on it and holding
   * full up-elevator stays on it exactly.
   */
  readonly clearanceM?: number;
  /**
   * Highest altitude worth searching. Defaults to the *service* ceiling - the
   * altitude where climb falls below half a metre a second - rather than the
   * absolute one, because a floor up in that last 550 m is a floor the
   * aircraft reaches by not climbing, which no route can be planned around.
   */
  readonly maxM?: number;
  /** Bisection stops here. Metres. */
  readonly toleranceM?: number;
}

export function altitudeFloorM(
  route: Route,
  ground: GroundProfile,
  km: number,
  options: FloorOptions = {},
): number {
  const {
    maxM = ceilingM(options.spec ?? LIGHT_PISTON),
    toleranceM = 1,
    clearanceM = 0,
  } = options;
  const rest = routeFrom(route, km);
  const raised = clearanceM === 0 ? ground : (k: number) => ground(k) + clearanceM;
  const restGround = groundFrom(raised, km);
  const clearsFrom = (altitudeM: number): boolean =>
    flyRoute(rest, restGround, { ...options, startAltitudeM: altitudeM }).clears;

  if (!clearsFrom(maxM)) return Infinity;
  let low = Math.min(raised(km), maxM);
  if (clearsFrom(low)) return low;
  let high = maxM;
  while (high - low > toleranceM) {
    const mid = (low + high) / 2;
    if (clearsFrom(mid)) high = mid;
    else low = mid;
  }
  return high;
}

export interface FloorSample {
  readonly km: number;
  readonly groundM: number;
  readonly floorM: number;
}

/**
 * The floor sampled along a route: the climb path the route demands.
 *
 * A route's altitude plan, in other words, and the thing an expedition ought
 * to ship beside its speed profile. The autopilot flies floor plus a chosen
 * margin, and that margin is not decoration - it is exactly how long the
 * player may hold the stick (F19).
 */
export function climbFloor(
  route: Route,
  ground: GroundProfile,
  options: FloorOptions & { readonly strideKm?: number } = {},
): readonly FloorSample[] {
  const { strideKm = 50 } = options;
  const lengthKm = routeLengthKm(route);
  const out: FloorSample[] = [];
  for (let km = 0; km < lengthKm; km += strideKm) {
    out.push({ km, groundM: ground(km), floorM: altitudeFloorM(route, ground, km, options) });
  }
  return out;
}

/**
 * An autopilot that flies the route rather than proving it.
 *
 * `FULL_CLIMB` answers "is this route possible?" and is the wrong thing to
 * ship: it arrives over Lhasa 2,342 m above the city with nothing left to
 * give. This one tracks a floor - which is the lowest the aircraft may ever
 * be - so it flies as low as the route allows and no lower. Pass a floor
 * built with `clearanceM` and that clearance is what the flight keeps, which
 * is the same statement as "this is how much of the expedition the player
 * gets" (D18): the margin is the authored answer, not a tuning constant.
 *
 * Proportional rather than bang-bang, over a capture band, because the
 * aircraft porpoising up and down its target is the opposite of the GDD's
 * calm. It is allowed to descend, gently, because the floor falls away into
 * Lhasa at the end and following it down is the arrival.
 *
 * Safe by construction: the floor is the altitude from which full climb still
 * clears, so an aircraft anywhere above it can always abandon this policy and
 * make the route. That is exactly what the rejoin has to decide, and it is a
 * comparison rather than a simulation.
 */
export interface FollowFloorOptions {
  /** Over how many metres of error the command goes from level to full. */
  readonly bandM?: number;
  /** Most nose-down it will ever command, 0..1. */
  readonly maxDescent?: number;
}

export function followFloor(
  floor: GroundProfile,
  options: FollowFloorOptions = {},
): ClimbPolicy {
  const { bandM = 200, maxDescent = 0.25 } = options;
  return (km, _seconds, altitudeM) => {
    const error = floor(km) - altitudeM;
    // Asymmetric on purpose. A proportional law in both directions needs
    // standing error to produce command, so it sags below a rising target by
    // most of its band - 200 m of band turned a 300 m margin into 136 (F20).
    // A floor is not a setpoint to be split: at or under it the answer is
    // always everything the aircraft has, and the easing is only for coming
    // back down.
    if (error >= 0) return 1;
    return Math.max(-maxDescent, error / bandM);
  };
}

/**
 * Turn a sampled floor into a profile, linearly between samples.
 *
 * The floor is bisected at a stride because each sample costs a dozen
 * flights, and it is smooth between them - it is an integral of climb rate,
 * not a terrain profile.
 *
 * It is also **concave**, because climb rate falls as the aircraft rises, so
 * a chord between two samples lies slightly *below* the curve and an
 * interpolated floor grants a little permission the real one did not: 100 km
 * of stride costs about 17 m of delivered clearance, 50 km costs none worth
 * measuring (F20). That is small, it is one-signed, and it is not something
 * to trust on argument - the clearance a floor actually delivers is whatever
 * the replay says it delivers, which is D17 one level down.
 */
export function floorProfile(samples: readonly FloorSample[]): GroundProfile {
  if (samples.length === 0) return () => 0;
  return (km) => {
    if (km <= samples[0]!.km) return samples[0]!.floorM;
    const last = samples[samples.length - 1]!;
    if (km >= last.km) return last.floorM;
    let i = 1;
    while (i < samples.length && samples[i]!.km < km) i++;
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const t = (km - a.km) / (b.km - a.km);
    return a.floorM + (b.floorM - a.floorM) * t;
  };
}

export interface FlyRouteOptions {
  readonly pacing?: Pacing;
  readonly spec?: AircraftSpec;
  /** Where the aircraft starts. The corridor manifest ships 1,200 m. */
  readonly startAltitudeM?: number;
  readonly dt?: number;
  /** Everything but the ground elevation, which comes from the profile. */
  readonly env?: Environment;
  /** Defaults to `FULL_CLIMB`, the policy the clearance guarantee is about. */
  readonly policy?: ClimbPolicy;
  /**
   * Record a sample per kilometre. Off by default because the floor search
   * flies a route some hundreds of times and wants none of them.
   */
  readonly track?: boolean;
}

/**
 * Fly a route flat out and report the worst the ground ever got.
 *
 * The autopilot holds full up-elevator for the entire route. That is not a
 * player, and it is not meant to be: it is the *most favourable* simple
 * policy, because best rate of climb at every instant is the highest the
 * aircraft can be at every instant. A route this autopilot cannot clear is a
 * route no player clears either, which is the only direction of inference a
 * clearance check needs to support.
 *
 * **The terrain bounce is switched off**, and that is not a detail. `step`
 * pushes an aircraft that touches the ground back up to 25 m above it, which
 * is the right kindness to a player and a lie to a clearance check: on any
 * slope gentle enough that the ground rises less than 25 m per step, the
 * bounce carries the aircraft up the escarpment a bounce at a time and the
 * check reports a flight. The first version of this function did exactly
 * that and called a route over 7,000 m of Tibet clear, on an aircraft whose
 * absolute ceiling is 6,750 m. So the ground here is held below the
 * aircraft's reach and the collision is detected rather than resolved.
 *
 * Distance is accumulated from the state's own displacement rather than from
 * nominal ground speed, so true airspeed rising with altitude is counted -
 * worth 13 % over a climbing expedition, all of it on the wrong side of the
 * question.
 */
export function flyRoute(
  route: Route,
  ground: GroundProfile,
  options: FlyRouteOptions = {},
): RouteFlight {
  const {
    pacing = DEFAULT_PACING,
    spec = LIGHT_PISTON,
    startAltitudeM = 1_200,
    dt = 1,
    env = STILL_AIR,
    policy = FULL_CLIMB,
    track = false,
  } = options;

  const lengthKm = routeLengthKm(route);
  const state: FlightState = createFlightState({ altitudeM: startAltitudeM });
  let contact: Contact | null = null;
  // Far enough below the aircraft that `step` never reaches for the bounce.
  const noBounce = { ...env, groundElevationM: -1e9 };

  let travelledM = 0;
  let seconds = 0;
  let km = 0;
  let worstClearanceM = Infinity;
  let worstKm = 0;
  let peakAltitudeM = startAltitudeM;
  const samples: TrackSample[] = [];
  // Steps overlap at kilometre boundaries (a step from 10.2 to 10.6 spans the
  // same two integers as the step after it), which is harmless for a minimum
  // and would duplicate every sample of a track.
  let recordedKm = -1;

  // Cap the walk so a tuning regression fails rather than hangs. Six hours of
  // simulated flying is an order of magnitude past the longest expedition.
  const maxSteps = Math.ceil((6 * 3600) / dt);
  for (let i = 0; i < maxSteps && travelledM < lengthKm * 1000; i++) {
    km = travelledM / 1000;
    const altitudeBefore = state.altitudeM;

    const beforeM = state.northM;
    step(
      state,
      {
        pitch: policy(km, seconds, state.altitudeM),
        roll: 0,
        mode: modeAtKm(route, km),
      },
      noBounce,
      dt,
      spec,
      pacing,
    );
    travelledM += state.northM - beforeM;
    seconds += dt;
    peakAltitudeM = Math.max(peakAltitudeM, state.altitudeM);

    // Every kilometre the step crossed, not just the one it landed on. A
    // single second of boost covers four kilometres of ground, and a check
    // that samples only its endpoints steps straight over a ridge and reports
    // a flight. Altitude is interpolated across the span, which is exact
    // enough: the aircraft climbs at metres per second and the ground it is
    // being compared against moves by thousands.
    const kmAfter = travelledM / 1000;
    const from = Math.floor(km);
    const to = Math.min(Math.ceil(kmAfter), Math.ceil(lengthKm));
    for (let k = from; k <= to; k++) {
      const t = kmAfter === km ? 0 : Math.min(1, Math.max(0, (k - km) / (kmAfter - km)));
      const altitudeM = altitudeBefore + (state.altitudeM - altitudeBefore) * t;
      const clearanceM = altitudeM - ground(k);
      if (clearanceM < worstClearanceM) {
        worstClearanceM = clearanceM;
        worstKm = k;
      }
      if (track && k > recordedKm) {
        samples.push({ km: k, altitudeM, clearanceM });
        recordedKm = k;
      }
      if (clearanceM <= 0 && contact === null) {
        contact = { km: k, shortfallM: clearanceM };
      }
    }
    if (contact !== null) {
      km = contact.km;
      break;
    }
  }

  return {
    minutes: seconds / 60,
    worstClearanceM,
    worstKm,
    reachedKm: km,
    arrivalAltitudeM: state.altitudeM,
    peakAltitudeM,
    contact,
    clears: contact === null,
    track: samples,
  };
}

/**
 * The rate of climb a gradient demands at a given ground speed, m/s.
 *
 * This is the whole of F17 in one line. Terrain gradient is a property of the
 * ground; the climb it demands is a property of how fast you cross it. The
 * Longmen Shan escarpment rises 44 m per kilometre, which at the shipped 130
 * km/min asks for 96 m/s of climb from an aircraft that gives 7 at sea level
 * and 2 at plateau height. The wall is not climbed. It is climbed *before*.
 */
export function climbDemandMs(riseMPerKm: number, groundSpeedKmPerMin: number): number {
  return (riseMPerKm * groundSpeedKmPerMin) / 60;
}

/** The inverse: how slowly a gradient must be crossed to be climbed in place. */
export function groundSpeedForGradient(
  riseMPerKm: number,
  climbRateMs: number,
): number {
  return riseMPerKm === 0 ? Infinity : (climbRateMs * 60) / riseMPerKm;
}

export interface Escarpment {
  readonly footKm: number;
  readonly rimKm: number;
  readonly riseM: number;
  /** Metres of rise per kilometre of ground, averaged over the window. */
  readonly gradientMPerKm: number;
}

/** Median of `span` samples centred on `at`, clamped to the array. */
function localMedian(profileM: readonly number[], at: number, span: number): number {
  const half = Math.floor(span / 2);
  const lo = Math.max(0, at - half);
  const hi = Math.min(profileM.length - 1, at + half);
  const window = profileM.slice(lo, hi + 1).sort((a, b) => a - b);
  return window[Math.floor(window.length / 2)]!;
}

/**
 * The steepest sustained rise on a sampled profile - the wall, not a peak.
 *
 * A window wide enough to be a landform and narrow enough to be one landform.
 * Every line from the eastern plain to Lhasa has exactly one of these, and
 * where it falls is the single fact that decides whether a route, or a twelve
 * minute playtest session, contains the thing the game is about.
 *
 * Both ends are medians over `smoothKm` rather than single samples, because a
 * raw endpoint difference cannot tell an escarpment from a needle: one 6,000 m
 * spike at the far end of the window wins against a genuine 4,400 m wall, and
 * a route crosses the needle in half a second.
 */
export function steepestRise(
  profileM: readonly number[],
  windowKm = 100,
  smoothKm = 11,
): Escarpment {
  let footKm = 0;
  let riseM = -Infinity;
  for (let k = 0; k + windowKm < profileM.length; k++) {
    const rise =
      localMedian(profileM, k + windowKm, smoothKm) - localMedian(profileM, k, smoothKm);
    if (rise > riseM) {
      riseM = rise;
      footKm = k;
    }
  }
  return {
    footKm,
    rimKm: footKm + windowKm,
    riseM,
    gradientMPerKm: riseM / windowKm,
  };
}

/**
 * The longest the player can hold `pitch` anywhere on the route and still
 * arrive, in seconds.
 *
 * Scanned rather than solved. The worst moment to take the controls is not
 * obvious and is not the start: it is the last hold still being paid for when
 * the route's tightest point arrives (F19).
 *
 * The budget belongs to the route *and* the autopilot flying it, so the hold
 * interrupts whatever `options.policy` was doing rather than always
 * interrupting full climb. Measuring one autopilot's budget against another's
 * flight is how the first version of this reported that riding the floor and
 * climbing flat out cost the player exactly the same thing.
 */
export function longestHoldS(
  route: Route,
  ground: GroundProfile,
  pitch = 0,
  options: FlyRouteOptions & {
    /** How finely start times are scanned. Seconds. */
    readonly probeS?: number;
    /** Longest hold worth considering. Seconds. */
    readonly maxS?: number;
  } = {},
): number {
  const { probeS = 15, maxS = 3_600, policy: base = FULL_CLIMB } = options;
  const reference = flyRoute(route, ground, options);
  if (!reference.clears) return 0;
  const totalS = Math.ceil(reference.minutes * 60);

  const survivesAnywhere = (durationS: number): boolean => {
    for (let start = 0; start + durationS <= totalS; start += probeS) {
      const policy = handOff(start, durationS, pitch, base);
      if (!flyRoute(route, ground, { ...options, policy }).clears) return false;
    }
    return true;
  };

  let low = 0;
  let high = Math.min(maxS, totalS);
  if (survivesAnywhere(high)) return high;
  while (high - low > 1) {
    const mid = Math.round((low + high) / 2);
    if (survivesAnywhere(mid)) low = mid;
    else high = mid;
  }
  return low;
}
