import {
  G,
  RHO_0,
  densityAt,
  densityRatio,
  pistonPowerFraction,
} from "./atmosphere.js";

/**
 * Performance envelope for the default light piston aircraft.
 *
 * The GDD picks a piston single deliberately: its power falls with air density
 * and the player feels the Tibetan Plateau in the controls. Everything here is
 * ordinary aircraft performance arithmetic, tuned to one target - a service
 * ceiling a little above Everest base camp (5,150 m) and far below the summit
 * (8,849 m). That single choice does a lot of teaching for free:
 *
 *   - the plateau at 4,500 m is flyable but a struggle
 *   - Namtso (4,718 m) and base camp are reachable
 *   - the summit is not, so the player looks UP at Everest, as you must
 */
export interface AircraftSpec {
  /** All-up mass, kg. */
  massKg: number;
  /** Wing reference area, m^2. */
  wingAreaM2: number;
  /** Zero-lift drag coefficient. */
  cd0: number;
  /** Wing aspect ratio. */
  aspectRatio: number;
  /** Oswald span efficiency. */
  oswald: number;
  /** Sea-level shaft power, W. */
  shaftPowerW: number;
  /** Propeller efficiency (also absorbs installation losses). */
  propEfficiency: number;
  /** Lift coefficient available in a hard turn (flaps up CLmax). */
  clTurn: number;
  /** Comfort cap on load factor. Turns never exceed this even down low. */
  loadFactorCap: number;
}

export const LIGHT_PISTON: AircraftSpec = {
  massKg: 1300,
  wingAreaM2: 16.2,
  cd0: 0.03,
  aspectRatio: 7.4,
  oswald: 0.75,
  shaftPowerW: 173_000,
  propEfficiency: 0.75,
  clTurn: 1.6,
  loadFactorCap: 2.2,
};

export function weightN(spec: AircraftSpec): number {
  return spec.massKg * G;
}

/** Induced drag factor k = 1 / (pi * e * AR). */
export function inducedDragFactor(spec: AircraftSpec): number {
  return 1 / (Math.PI * spec.oswald * spec.aspectRatio);
}

/** Propulsive power available at altitude, W. */
export function powerAvailableW(spec: AircraftSpec, altitudeM: number): number {
  return spec.shaftPowerW * spec.propEfficiency * pistonPowerFraction(altitudeM);
}

/** Power required for level flight at a given true airspeed, W. */
export function powerRequiredW(
  spec: AircraftSpec,
  altitudeM: number,
  tasMs: number,
): number {
  const rho = densityAt(altitudeM);
  const w = weightN(spec);
  const k = inducedDragFactor(spec);
  const parasite = 0.5 * rho * tasMs ** 3 * spec.wingAreaM2 * spec.cd0;
  const induced = (2 * k * w * w) / (rho * tasMs * spec.wingAreaM2);
  return parasite + induced;
}

/** True airspeed for minimum power required (best-climb speed), m/s. */
export function bestClimbTasMs(spec: AircraftSpec, altitudeM: number): number {
  const rho = densityAt(altitudeM);
  const w = weightN(spec);
  const k = inducedDragFactor(spec);
  const numerator = (4 / 3) * k * w * w;
  const denominator = rho ** 2 * spec.wingAreaM2 ** 2 * spec.cd0;
  return Math.pow(numerator / denominator, 0.25);
}

/**
 * Best rate of climb at an altitude, m/s.
 *
 * Excess power over weight, evaluated at best-climb speed. This is the single
 * number the player feels most: 7.1 m/s at sea level, 2.1 m/s on the plateau.
 */
export function maxClimbRateMs(spec: AircraftSpec, altitudeM: number): number {
  const excess =
    powerAvailableW(spec, altitudeM) -
    powerRequiredW(spec, altitudeM, bestClimbTasMs(spec, altitudeM));
  return excess / weightN(spec);
}

/**
 * Absolute ceiling: where best rate of climb reaches `rocMs`.
 *
 * Solved by bisection rather than stored as a constant, so retuning the engine
 * or the mass moves the ceiling automatically and the tests catch it.
 * Service ceiling is conventionally quoted at 0.5 m/s (100 ft/min).
 */
/**
 * Powered descent rate at full forward stick, m/s.
 *
 * Lives here rather than in the flight model because it is half of the most
 * important ratio the aircraft has. Climb is power-limited and so it collapses
 * with density; descent is gravity-assisted and so it does not change at all.
 * The gap between them is the whole of `climbRecoveryRatio`.
 */
export const MAX_DESCENT_MS = 18;

/**
 * Seconds the aircraft takes to spool the nose to a commanded pitch, at sea
 * level. Stretched by `1/sigma` in thin air, like every other response.
 *
 * It lives here rather than in the flight model because it is not only a feel
 * parameter: any planner that asks "can this aircraft get down in time?" has
 * to pay it, and one that does not over-estimates the answer by seventy
 * metres (F23).
 */
export const PITCH_TAU_S = 4;

/**
 * Metres of altitude lost in `seconds` of full forward stick from level.
 *
 * Not `18 * seconds`. Eighteen is the *asymptote* of a first-order lag, so a
 * descent that starts from level flight is always one time-constant short of
 * the naive figure: `18 * (T - tau)` once T is a few tau, which is 72 m at
 * sea level and 104 m at Lhasa. Small, fixed, and exactly the size of the
 * error that makes a landable route report a shortfall (F23).
 *
 * `altitudeM` is where the descent happens, because thin air lengthens the
 * lag and therefore deepens the debt. Measured against the flight model
 * within nine metres everywhere it was checked, always on the low side.
 */
export function descentReachM(seconds: number, altitudeM = 0): number {
  if (seconds <= 0) return 0;
  const tau = PITCH_TAU_S / Math.max(0.35, densityRatio(altitudeM));
  return MAX_DESCENT_MS * (seconds - tau * (1 - Math.exp(-seconds / tau)));
}

/**
 * How many seconds of climbing one second of descent costs, at this altitude.
 *
 * The plateau mechanic expressed as a single number, and the one the GDD's
 * "thin air" promise actually cashes out as once an aircraft has somewhere to
 * be. At the coast a look down the valley costs four times its length; at
 * 5,900 m it costs twenty-four, because the climb that buys the altitude back
 * has lost 86 % of its rate while the descent that spent it has lost none
 * (F19). Infinite at and above the ceiling, where there is no buying it back.
 */
export function climbRecoveryRatio(
  spec: AircraftSpec,
  altitudeM: number,
  descentRateMs = MAX_DESCENT_MS,
): number {
  const climb = maxClimbRateMs(spec, altitudeM);
  return climb <= 0 ? Infinity : (climb + descentRateMs) / climb;
}

export function ceilingM(spec: AircraftSpec, rocMs = 0.5): number {
  let lo = 0;
  let hi = 11_000;
  if (maxClimbRateMs(spec, lo) < rocMs) return 0;
  if (maxClimbRateMs(spec, hi) > rocMs) return hi;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (maxClimbRateMs(spec, mid) > rocMs) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Usable load factor in a sustained turn.
 *
 * At constant indicated airspeed the dynamic pressure is constant, so the
 * aerodynamic limit does not vary with altitude - it varies with speed mode.
 * Low mode is lift-limited (n ~ 1.8) and turns tightly for gorge work; cruise
 * and boost hit the comfort cap instead.
 *
 * Turns widen over the plateau for the other reason: true airspeed rises as
 * 1/sqrt(sigma) and radius goes as v^2. Cruise radius is 141 m at the coast
 * and 222 m over the plateau - the GDD's "turns wide".
 */
export function maxLoadFactor(
  spec: AircraftSpec,
  altitudeM: number,
  tasMs: number,
): number {
  const rho = densityAt(altitudeM);
  const liftMax = 0.5 * rho * tasMs ** 2 * spec.wingAreaM2 * spec.clTurn;
  const aerodynamic = liftMax / weightN(spec);
  return Math.max(1, Math.min(spec.loadFactorCap, aerodynamic));
}

/** Sustained turn rate at full bank, rad/s. */
export function maxTurnRateRadS(
  spec: AircraftSpec,
  altitudeM: number,
  tasMs: number,
): number {
  const n = maxLoadFactor(spec, altitudeM, tasMs);
  if (n <= 1) return 0;
  return (G * Math.sqrt(n * n - 1)) / tasMs;
}

/** Radius of that turn, m. Grows roughly as 1/sigma with altitude. */
export function turnRadiusM(
  spec: AircraftSpec,
  altitudeM: number,
  tasMs: number,
): number {
  const rate = maxTurnRateRadS(spec, altitudeM, tasMs);
  return rate === 0 ? Infinity : tasMs / rate;
}

/**
 * True airspeed from indicated airspeed.
 *
 *   TAS = IAS / sqrt(sigma)
 *
 * Aircraft hold indicated airspeed, so true airspeed climbs with altitude:
 * 52 m/s indicated is 52 m/s true at sea level and 78 m/s true at 4,500 m.
 * The plane crosses the plateau faster than it crosses the coast, and turns
 * half again as wide doing it. Both are true, and both are felt.
 */
export function trueAirspeedMs(iasMs: number, altitudeM: number): number {
  return iasMs / Math.sqrt(densityRatio(altitudeM));
}

/** Dynamic pressure, Pa - used by the HUD's "heaviness" cue. */
export function dynamicPressurePa(altitudeM: number, tasMs: number): number {
  return 0.5 * densityAt(altitudeM) * tasMs ** 2;
}

/** Sea-level density, re-exported so callers need not reach into atmosphere. */
export { RHO_0 };
