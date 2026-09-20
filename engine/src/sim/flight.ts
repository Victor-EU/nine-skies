import {
  boostAvailable,
  densityRatio,
  outsideAirTemperatureC,
  humidityProxy,
} from "./atmosphere.js";
import {
  LIGHT_PISTON,
  maxClimbRateMs,
  maxTurnRateRadS,
  trueAirspeedMs,
  type AircraftSpec,
} from "./aircraft.js";
import {
  DEFAULT_PACING,
  MODE_IAS_MS,
  groundGain,
  type Pacing,
  type SpeedMode,
} from "./scale.js";

/**
 * Arcade flight model. Pitch, roll, throttle, auto-coordinated turn, no stall,
 * no crash - the GDD's "calm, not punishing". The realism lives entirely in
 * the performance envelope it borrows from `aircraft.ts`.
 */

export interface FlightState {
  /** Real metres east and north of the projection origin. */
  eastM: number;
  northM: number;
  /** Real metres above sea level. Never compressed. */
  altitudeM: number;
  /** Radians, 0 = north, increasing clockwise. */
  headingRad: number;
  /** Radians, positive = right wing down. */
  bankRad: number;
  /** Indicated airspeed, m/s. */
  iasMs: number;
  /** Real metres per second, positive up. */
  verticalRateMs: number;
  mode: SpeedMode;
}

export interface FlightInput {
  /** -1 (descend) .. +1 (climb). */
  pitch: number;
  /** -1 (left) .. +1 (right). */
  roll: number;
  mode: SpeedMode;
}

/** What the world under the aircraft says. Sampled from terrain + climate atlas. */
export interface Environment {
  groundElevationM: number;
  groundTempC: number;
  monthlyPrecipMm: number;
  /** Wind in real m/s, east and north. Affects the balloon most. */
  windEastMs: number;
  windNorthMs: number;
}

export const STILL_AIR: Environment = {
  groundElevationM: 0,
  groundTempC: 15,
  monthlyPrecipMm: 0,
  windEastMs: 0,
  windNorthMs: 0,
};

/** Maximum bank the arcade model will roll to. */
const MAX_BANK_RAD = (60 * Math.PI) / 180;

/** Powered descent is not power-limited, so it is much faster than the climb. */
const MAX_DESCENT_MS = 18;

/** Terrain contact bounces rather than crashes; this is the clearance held. */
const BOUNCE_CLEARANCE_M = 25;

/**
 * Response time constants at sea level, seconds. Every one of these is divided
 * by the density ratio in `step`, so at sigma 0.63 the aircraft takes 1.6x as
 * long to do anything. This is the GDD's "feels heavy" - it is a lag, not a
 * weight change.
 */
const TAU_SPEED_S = 6;
const TAU_VERTICAL_S = 4;
const TAU_BANK_S = 1.5;

function approach(current: number, target: number, tau: number, dt: number): number {
  if (tau <= 0) return target;
  const alpha = 1 - Math.exp(-dt / tau);
  return current + (target - current) * alpha;
}

export function createFlightState(partial: Partial<FlightState> = {}): FlightState {
  return {
    eastM: 0,
    northM: 0,
    altitudeM: 1000,
    headingRad: 0,
    bankRad: 0,
    iasMs: MODE_IAS_MS.cruise,
    verticalRateMs: 0,
    mode: "cruise",
    ...partial,
  };
}

/** Derived numbers the HUD and the renderer both read. */
export interface FlightTelemetry {
  densityRatio: number;
  trueAirspeedMs: number;
  groundSpeedMs: number;
  maxClimbRateMs: number;
  outsideAirTempC: number;
  humidity: number;
  boostAvailable: boolean;
  /** True when the player is asking for climb the air cannot give. */
  powerLimited: boolean;
}

/**
 * Pacing is configuration, not input: it is not what the player is asking for,
 * it is what this build means by "cruise". It travels the same way `spec`
 * does, as a trailing default, so the sim stays a pure function of everything
 * that can change.
 */
export function telemetry(
  state: FlightState,
  env: Environment,
  input: FlightInput,
  spec: AircraftSpec = LIGHT_PISTON,
  pacing: Pacing = DEFAULT_PACING,
): FlightTelemetry {
  const sigma = densityRatio(state.altitudeM);
  const tas = trueAirspeedMs(state.iasMs, state.altitudeM);
  const maxRoc = maxClimbRateMs(spec, state.altitudeM);
  return {
    densityRatio: sigma,
    trueAirspeedMs: tas,
    groundSpeedMs: tas * groundGain(state.mode, pacing),
    maxClimbRateMs: maxRoc,
    outsideAirTempC: outsideAirTemperatureC(
      env.groundTempC,
      env.groundElevationM,
      state.altitudeM,
    ),
    humidity: humidityProxy(env.monthlyPrecipMm),
    boostAvailable: boostAvailable(state.altitudeM),
    powerLimited: input.pitch > 0.1 && maxRoc < 1.0,
  };
}

/**
 * Advance the aircraft by `dt` seconds of player time.
 *
 * Horizontal motion is multiplied by the mode's ground gain; vertical motion
 * is not. See `scale.ts` for why that asymmetry is the point.
 */
export function step(
  state: FlightState,
  input: FlightInput,
  env: Environment,
  dt: number,
  spec: AircraftSpec = LIGHT_PISTON,
  pacing: Pacing = DEFAULT_PACING,
): FlightState {
  // Boost is gated on air density, so it quietly stops working over the
  // plateau. The mode falls back rather than failing, so the player is never
  // stuck holding a dead button.
  const mode: SpeedMode =
    input.mode === "boost" && !boostAvailable(state.altitudeM)
      ? "cruise"
      : input.mode;
  state.mode = mode;

  const sigma = densityRatio(state.altitudeM);
  // Thin air lengthens every response. 1.0 at sea level, ~1.6 on the plateau.
  const heaviness = 1 / Math.max(0.35, sigma);

  // --- speed ---------------------------------------------------------------
  state.iasMs = approach(
    state.iasMs,
    MODE_IAS_MS[mode],
    TAU_SPEED_S * heaviness,
    dt,
  );
  const tas = trueAirspeedMs(state.iasMs, state.altitudeM);

  // --- vertical ------------------------------------------------------------
  const maxRoc = maxClimbRateMs(spec, state.altitudeM);
  const pitch = Math.max(-1, Math.min(1, input.pitch));
  const commandedVs = pitch >= 0 ? pitch * maxRoc : pitch * MAX_DESCENT_MS;
  state.verticalRateMs = approach(
    state.verticalRateMs,
    commandedVs,
    TAU_VERTICAL_S * heaviness,
    dt,
  );
  state.altitudeM += state.verticalRateMs * dt;

  // --- turn ----------------------------------------------------------------
  const roll = Math.max(-1, Math.min(1, input.roll));
  state.bankRad = approach(
    state.bankRad,
    roll * MAX_BANK_RAD,
    TAU_BANK_S * heaviness,
    dt,
  );
  // Auto-coordinated: bank alone produces the turn.
  const rateFromBank = (9.80665 * Math.tan(state.bankRad)) / tas;
  const rateCap = maxTurnRateRadS(spec, state.altitudeM, tas);
  const turnRate = Math.sign(rateFromBank) * Math.min(Math.abs(rateFromBank), rateCap);
  state.headingRad = wrapAngle(state.headingRad + turnRate * dt);

  // --- horizontal ----------------------------------------------------------
  // The only place the ground gain is applied. Note what it is not: the
  // compression. Ground speed is real km/min, so how hard the world is drawn
  // has no effect on how long a route takes (F15).
  const groundSpeed = tas * groundGain(mode, pacing);
  state.eastM += (Math.sin(state.headingRad) * groundSpeed + env.windEastMs) * dt;
  state.northM += (Math.cos(state.headingRad) * groundSpeed + env.windNorthMs) * dt;

  // --- terrain contact -----------------------------------------------------
  // No crash, no consequence: the aircraft is pushed clear and the camera
  // shakes. GDD, "Calm, not punishing".
  const floor = env.groundElevationM + BOUNCE_CLEARANCE_M;
  if (state.altitudeM < floor) {
    state.altitudeM = floor;
    if (state.verticalRateMs < 0) state.verticalRateMs = 0;
  }

  return state;
}

export function wrapAngle(rad: number): number {
  const twoPi = Math.PI * 2;
  return ((rad % twoPi) + twoPi) % twoPi;
}
