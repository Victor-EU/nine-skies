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
 */
import { LIGHT_PISTON, type AircraftSpec } from "./aircraft.js";
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
}

export interface FlyRouteOptions {
  readonly pacing?: Pacing;
  readonly spec?: AircraftSpec;
  /** Where the aircraft starts. The corridor manifest ships 1,200 m. */
  readonly startAltitudeM?: number;
  readonly dt?: number;
  /** Everything but the ground elevation, which comes from the profile. */
  readonly env?: Environment;
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

  // Cap the walk so a tuning regression fails rather than hangs. Six hours of
  // simulated flying is an order of magnitude past the longest expedition.
  const maxSteps = Math.ceil((6 * 3600) / dt);
  for (let i = 0; i < maxSteps && travelledM < lengthKm * 1000; i++) {
    km = travelledM / 1000;
    const altitudeBefore = state.altitudeM;

    const beforeM = state.northM;
    step(
      state,
      { pitch: 1, roll: 0, mode: modeAtKm(route, km) },
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
