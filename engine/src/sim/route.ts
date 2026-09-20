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
  const sample = (km: number): FloorSample => ({
    km,
    groundM: ground(km),
    floorM: altitudeFloorM(route, ground, km, options),
  });
  for (let km = 0; km < lengthKm; km += strideKm) out.push(sample(km));
  // The destination itself, always. `floorProfile` holds the last sample flat
  // past its end, so a stride that stops short leaves the floor pinned at
  // whatever the route demanded fifty kilometres out - which on Sea to Sky is
  // four hundred metres above the arrival it is supposed to permit, and makes
  // the route un-landable by arithmetic rather than by terrain (F21).
  if (lengthKm > 0 && out[out.length - 1]!.km < lengthKm) out.push(sample(lengthKm));
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

/**
 * The pointwise-lowest legal trajectory: everything down, until the floor.
 *
 * `followFloor` with the brakes off. Wherever the aircraft is above the floor
 * it commands full forward stick, and the floor is by construction the lowest
 * it may ever be, so nothing a player or an autopilot could legally fly is
 * ever below this line. That is what makes it an argument rather than a
 * flight: what this one cannot reach, nothing reaches.
 *
 * It is not a flight anyone would take - eighteen metres a second nose-down
 * is the opposite of the GDD's calm, and it spends clearance the way F19's
 * hand-off budget spends it: on Sea to Sky it flies 300 m of margin down to
 * 223 before it turns round. It exists to be the bound.
 */
export function lowestLegal(floor: GroundProfile): ClimbPolicy {
  // A one-metre band rather than zero: the arithmetic is the same (any error
  // at all saturates the clamp) and it does not divide by zero to get there.
  return followFloor(floor, { maxDescent: 1, bandM: 1 });
}

export interface ArrivalOptions extends FloorOptions {
  /**
   * The lowest line the aircraft may fly, if one has already been built.
   *
   * Required in spirit and merely defaulted in code: "descend as hard as you
   * can" without a floor to stop at is a dive into the first valley and a
   * ridge the aircraft can no longer out-climb, which would report a ceiling
   * far below the real one. Pass a memoised floor - each one costs a few
   * hundred flights - or let it be built from the same options.
   */
  readonly floor?: GroundProfile;
  /**
   * How far above the destination's ground still counts as arriving there.
   *
   * An authoring number, not a tuning constant: it is how low over the place
   * the expedition is about to end. Zero is the ground itself.
   *
   * It has to clear `clearanceM`, and the arithmetic says why. A floor built
   * with a margin keeps that margin to the last kilometre, so at the
   * destination the floor is `ground + clearanceM` and the target is
   * `ground + arrivalM`: the band the route leaves open at its own end is
   * exactly `arrivalM - clearanceM`. Ask for an arrival below the margin and
   * the answer is `-Infinity` everywhere, which is not a bug but the question
   * contradicting itself. Ask for one equal to it and the answer is a
   * knife-edge. Defaults to the margin so it is never a contradiction; pass
   * the height a player would actually want to be at.
   */
  readonly arrivalM?: number;
  /**
   * How finely to sample a floor these functions have to build themselves.
   *
   * Ignored when `floor` is supplied, which is the usual case: a floor costs
   * a few hundred flights and is worth memoising across every question asked
   * about the same route.
   */
  readonly strideKm?: number;
  /**
   * How far ahead the probe's floor looks for ground, in kilometres.
   *
   * Defaults to ten. One simulation step at the fastest speed mode is four
   * kilometres of ground and the probe has to have seen a ridge before the
   * step that crosses it, so four is the floor of the range; ten is where the
   * answer stops moving. Measured on Sea to Sky: at a 25 km floor stride,
   * five gives 1,605 m of shortfall and ten and twenty both give 1,588.
   */
  readonly lookAheadKm?: number;
}

/**
 * The floor to fly against, never below the ground just ahead of it.
 *
 * The clamp is not belt-and-braces, and neither is the look-ahead.
 *
 * A sampled floor is interpolated between its samples and the floor is
 * concave, so a chord lies *below* the curve - about 17 m of clearance at a
 * 100 km stride mid-route (F20), and changing sign entirely at the end, where
 * the floor's own fall is steeper than any chord can follow. Sixty
 * kilometres from Lhasa a 100 km stride puts the floor 150 m *under the
 * ground*.
 *
 * And a policy is asked for a command once per step, while `flyRoute` checks
 * the ground at every kilometre that step crossed - which at cruise is two
 * and at boost four. A floor read only at the aircraft's own kilometre is
 * blind to a ridge the very next second flies into.
 *
 * Neither matters to the shipped autopilot, which only ever eases downward at
 * a quarter stick and is well above the floor when a chord sags. Both matter
 * enormously to a probe that dives at full stick to prove a bound: it flies
 * into the hill and reports the route un-landable for reasons that are
 * entirely about sampling. So the probe's floor is the ground it has to clear
 * over the next few kilometres, not the one underneath it.
 */
function floorFor(
  route: Route,
  ground: GroundProfile,
  options: ArrivalOptions,
): GroundProfile {
  const { clearanceM = 0, lookAheadKm = 10 } = options;
  const floor = options.floor ?? floorProfile(climbFloor(route, ground, options));
  return (km) => {
    let worst = ground(km);
    for (let k = Math.ceil(km); k <= km + lookAheadKm; k++) worst = Math.max(worst, ground(k));
    return Math.max(floor(km), worst + clearanceM);
  };
}

/**
 * The highest altitude at `km` from which the route can still be *arrived at*.
 *
 * The mirror of `altitudeFloorM`, and the half of the question nobody had
 * asked. A floor says how low the aircraft may be; on a route that ends in
 * open sky that is the whole story, and on a route that ends at a place it is
 * half of one. Descent is 18 m/s and does not improve with altitude, so every
 * metre held at `km` is a metre that has to be given back before the
 * destination - and where the ground ahead forces the aircraft to hold more
 * than the remaining minutes can return, the route cannot be landed by any
 * policy at all.
 *
 * Bisected on the sim for the same reason the floor is: true airspeed rises
 * with altitude, so a high aircraft covers the remaining ground faster and
 * has *less* time to lose the height, not more. That is the wrong sign for
 * anyone doing this on paper.
 *
 * Returns `-Infinity` when even sitting on the floor arrives too high, which
 * is not "no answer" but the sharpest answer there is: the route is
 * un-landable here and the gap is the shortfall.
 */
export function arrivalCeilingM(
  route: Route,
  ground: GroundProfile,
  km: number,
  options: ArrivalOptions = {},
): number {
  const {
    maxM = ceilingM(options.spec ?? LIGHT_PISTON),
    toleranceM = 1,
    arrivalM = options.clearanceM ?? 0,
  } = options;
  const floor = floorFor(route, ground, options);
  const lengthKm = routeLengthKm(route);
  const targetM = ground(lengthKm) + arrivalM;

  const rest = routeFrom(route, km);
  const restGround = groundFrom(ground, km);
  const restFloor = groundFrom(floor, km);
  const policy = lowestLegal(restFloor);
  const arrivesFrom = (altitudeM: number): boolean => {
    const flight = flyRoute(rest, restGround, { ...options, startAltitudeM: altitudeM, policy });
    return flight.clears && flight.arrivalAltitudeM <= targetM;
  };

  const low = floor(km);
  if (!arrivesFrom(low)) return -Infinity;
  if (arrivesFrom(maxM)) return maxM;
  let lo = low;
  let hi = maxM;
  while (hi - lo > toleranceM) {
    const mid = (lo + hi) / 2;
    if (arrivesFrom(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

export interface ApproachSample {
  readonly km: number;
  readonly groundM: number;
  readonly floorM: number;
  readonly ceilingM: number;
  /**
   * Ceiling minus floor: the altitudes this route actually leaves open.
   *
   * Negative is not a near miss. It is the number of metres by which the
   * route asks the aircraft to be somewhere it cannot afterwards leave, and
   * no autopilot, no hand-off and no speed mode moves it - only the route.
   */
  readonly bandM: number;
}

/**
 * Floor and ceiling together, which is the only way either one means anything.
 *
 * A route is flyable where the band is positive and landable only if it is
 * positive everywhere. Where it goes negative is where the route has to
 * change, and the depth says by how much - on Sea to Sky the answer is a
 * ridge 46 km from Lhasa and 1,738 m above it, which is a waypoint problem
 * and was being discussed as a pacing one (F21).
 */
export function approachBand(
  route: Route,
  ground: GroundProfile,
  options: ArrivalOptions = {},
): readonly ApproachSample[] {
  const { strideKm = 50 } = options;
  const floor = floorFor(route, ground, options);
  const withFloor: ArrivalOptions = { ...options, floor };
  const lengthKm = routeLengthKm(route);
  const out: ApproachSample[] = [];
  for (let km = 0; km <= lengthKm; km += strideKm) {
    const floorM = floor(km);
    const ceiling = arrivalCeilingM(route, ground, km, withFloor);
    out.push({
      km,
      groundM: ground(km),
      floorM,
      ceilingM: ceiling,
      bandM: ceiling - floorM,
    });
  }
  return out;
}

/**
 * How far above its destination the route arrives when it tries hardest.
 *
 * Zero or less means the route can be landed. A positive number is the
 * shortfall in metres, and it is a property of the route and the ground, not
 * of anything the flight does: this is the lowest trajectory that exists.
 */
export function arrivalShortfallM(
  route: Route,
  ground: GroundProfile,
  options: ArrivalOptions = {},
): number {
  const { arrivalM = options.clearanceM ?? 0 } = options;
  const floor = floorFor(route, ground, options);
  const lengthKm = routeLengthKm(route);
  const flight = flyRoute(route, ground, { ...options, policy: lowestLegal(floor) });
  if (!flight.clears) return Infinity;
  return flight.arrivalAltitudeM - (ground(lengthKm) + arrivalM);
}

/**
 * A thing that is wrong with a route, in the terms the author can act on.
 *
 * `check` names which half found it, because the two have different fixes and
 * saying so is most of the value. A clearance failure is usually a speed
 * profile or a start altitude; an arrival failure is a waypoint, a
 * destination, or a decision to stop calling it a landing (F21).
 */
export interface RouteIssue {
  readonly check: "clearance" | "arrival";
  readonly km: number;
  readonly message: string;
}

export interface RouteCheck {
  /** D17: the full-climb replay never met the ground. */
  readonly clears: boolean;
  readonly worstClearanceM: number;
  readonly worstKm: number;
  readonly contact: Contact | null;
  /** Trip time of the clearance replay, minutes. */
  readonly minutes: number;
  /** Metres above the destination the route arrives at when it tries hardest. */
  readonly lowestArrivalM: number;
  /** What the route was asked to arrive at, metres above the destination. */
  readonly arrivalM: number;
  /** Whether that was authored or defaulted. Only a claim can be broken. */
  readonly claimed: boolean;
  /** `lowestArrivalM - arrivalM`. Zero or less means the route arrives. */
  readonly shortfallM: number;
  readonly arrives: boolean;
  readonly issues: readonly RouteIssue[];
}

/**
 * Both halves of the question, which is the whole question.
 *
 * D17 asks whether the aircraft can get over the ground. This also asks
 * whether it can get back down onto the place the route ends, because those
 * are different questions and Expedition 1 passes the first and fails the
 * second by 1,588 m (F21). A route that clears and cannot arrive is not a
 * route with a tuning problem; it is geography, and the fix is always the
 * line rather than the flight.
 *
 * Two flights and one floor, which is about a second for a 3,000 km route.
 * Deliberately no band scan: the shortfall is the verdict and `approachBand`
 * is the diagnostic, so the passing case - the one that runs on every commit
 * forever - pays for a verdict and nothing else.
 */
export function validateRoute(
  route: Route,
  ground: GroundProfile,
  options: ArrivalOptions = {},
): RouteCheck {
  const { arrivalM = options.clearanceM ?? 0 } = options;
  const issues: RouteIssue[] = [];
  const lengthKm = routeLengthKm(route);

  // D17. Full up-elevator, which is the most favourable simple policy: a
  // route this does not clear is a route nothing clears.
  const climb = flyRoute(route, ground, options);
  if (!climb.clears) {
    const at = climb.contact;
    issues.push({
      check: "clearance",
      km: at?.km ?? climb.reachedKm,
      message: at
        ? `flies into the ground ${at.km.toFixed(0)} km out, ` +
          `${Math.abs(at.shortfallM).toFixed(0)} m below it, ` +
          `climbing as hard as the aircraft can`
        : `never reaches the end; stops ${climb.reachedKm.toFixed(0)} km out`,
    });
  }

  // D19. The mirror: the lowest trajectory anything could legally fly, and
  // whether it gets low enough by the end. Only worth asking of a route that
  // clears - the shortfall of a route that flies into a mountain is a report
  // about a flight that never happened.
  //
  // Naming an `arrivalM` is what turns the measurement into a claim. Without
  // one the lowest arrival is still computed and returned, because that is
  // the number somebody needs in order to write a claim down, but it is not
  // an issue: a route has not failed to keep a promise it never made.
  const floor = climb.clears ? floorProfile(climbFloor(route, ground, options)) : null;
  const lowestArrivalM = floor
    ? arrivalShortfallM(route, ground, { ...options, floor, arrivalM: 0 })
    : Infinity;
  const shortfallM = lowestArrivalM - arrivalM;
  const claimed = options.arrivalM !== undefined;
  if (floor && claimed && shortfallM > 0) {
    issues.push({
      check: "arrival",
      km: lengthKm,
      message:
        `cannot be arrived at: the lowest trajectory that exists arrives ` +
        `${lowestArrivalM.toFixed(0)} m above the destination and the route asks ` +
        `for ${arrivalM.toFixed(0)}, a shortfall of ${shortfallM.toFixed(0)} m. ` +
        `No policy moves this; see approachBand for where the band closes`,
    });
  }

  return {
    clears: climb.clears,
    worstClearanceM: climb.worstClearanceM,
    worstKm: climb.worstKm,
    contact: climb.contact,
    minutes: climb.minutes,
    lowestArrivalM,
    arrivalM,
    claimed,
    shortfallM,
    arrives: shortfallM <= 0,
    issues,
  };
}
