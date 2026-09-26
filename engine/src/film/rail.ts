/**
 * The camera on its rail, and what the four inputs do to it (design v2,
 * controls; D74).
 *
 * Auto is the default and the attractor. The rail is a spline the camera
 * follows at an authored speed; steering moves the camera off it as an
 * offset, and auto eases the offset back to nothing. Auto resumes on a press
 * and by itself after a few seconds without steering, so a viewer who steers
 * once and lets go still sees the end of the scene.
 *
 * Direction is heading only: the offset is a heading away from the rail's
 * own, clamped to the scene's corridor, and the camera drifts sideways at the
 * sine of it. Speed scales the authored speed between half and double with a
 * smooth ramp. Bank is cosmetic, a lag on the heading rate. Nothing here is
 * an aircraft.
 */
import { railAtKm, type BuiltRail } from "./scene.js";

export interface RailInput {
  /** -1 slower .. +1 faster, held. */
  readonly speed: number;
  /** -1 left .. +1 right, held. */
  readonly heading: number;
  /** The auto key went down this frame. */
  readonly auto: boolean;
}

export interface RailOptions {
  /** The most the heading may leave the rail's, radians. */
  readonly corridorRad: number;
  /** How fast a held direction turns the heading, radians a second. */
  readonly turnRateRadS: number;
  /** Seconds without steering before auto resumes by itself. */
  readonly autoResumeS: number;
  /** Time constant of the ease back onto the rail, seconds. */
  readonly easeS: number;
  /** The speed multiplier's range. */
  readonly speedMin: number;
  readonly speedMax: number;
  /** Seconds of held input to double or halve the speed. */
  readonly speedRampS: number;
  /** How far off the line the drift may carry the camera, real metres. */
  readonly maxOffsetM: number;
  /** Bank per radian a second of heading rate, and its lag. */
  readonly bankPerRadS: number;
  readonly bankLagS: number;
}

export const DEFAULT_RAIL: RailOptions = {
  corridorRad: Math.PI / 3,
  turnRateRadS: 0.5,
  autoResumeS: 4,
  easeS: 3,
  speedMin: 0.5,
  speedMax: 2,
  speedRampS: 1.5,
  maxOffsetM: 20_000,
  bankPerRadS: 0.9,
  bankLagS: 0.6,
};

export interface RailState {
  readonly eastM: number;
  readonly northM: number;
  readonly headingRad: number;
  readonly bankRad: number;
  /** The camera's wanted height above the ground here, from the rail. */
  readonly aboveGroundM: number;
  /** How far below level the camera looks here, degrees, from the rail. */
  readonly pitchDeg: number;
  readonly km: number;
  readonly speedMul: number;
  readonly auto: boolean;
  /** Real metres a second over the ground, as flown. */
  readonly groundSpeedMs: number;
}

export class RailFlight {
  private km = 0;
  private headingOffsetRad = 0;
  private lateralM = 0;
  private speedMul = 1;
  private auto = true;
  private idleS = 0;
  private bankRad = 0;
  private readonly options: RailOptions;

  constructor(
    readonly rail: BuiltRail,
    options: Partial<RailOptions> = {},
  ) {
    this.options = { ...DEFAULT_RAIL, ...options };
  }

  /** Back to the start of the rail, on auto, at the authored speed. */
  reset(): void {
    this.km = 0;
    this.headingOffsetRad = 0;
    this.lateralM = 0;
    this.speedMul = 1;
    this.auto = true;
    this.idleS = 0;
    this.bankRad = 0;
  }

  get isAuto(): boolean {
    return this.auto;
  }

  get atEnd(): boolean {
    return this.km >= this.rail.path.lengthKm;
  }

  state(): RailState {
    const fix = railAtKm(this.rail, this.km);
    const heading = fix.headingRad + this.headingOffsetRad;
    // Right-hand perpendicular of the rail's own heading, in (east, north).
    const rx = Math.cos(fix.headingRad);
    const ry = -Math.sin(fix.headingRad);
    return {
      eastM: fix.eastM + rx * this.lateralM,
      northM: fix.northM + ry * this.lateralM,
      headingRad: heading,
      bankRad: this.bankRad,
      aboveGroundM: fix.aboveGroundM,
      pitchDeg: fix.pitchDeg,
      km: this.km,
      speedMul: this.speedMul,
      auto: this.auto,
      groundSpeedMs: (fix.kmPerMin * 1000 * this.speedMul) / 60,
    };
  }

  update(input: RailInput, dt: number): RailState {
    const o = this.options;
    if (dt <= 0) return this.state();

    // Speed: a held key multiplies, so the ramp is the same up and down.
    if (input.speed !== 0) {
      this.speedMul *= Math.exp((input.speed * Math.LN2 * dt) / o.speedRampS);
      this.speedMul = Math.max(o.speedMin, Math.min(o.speedMax, this.speedMul));
    }

    // Direction: any steering takes the camera off auto; the press, or the
    // idle timer, puts it back.
    const before = this.headingOffsetRad;
    if (input.heading !== 0) {
      this.auto = false;
      this.idleS = 0;
      this.headingOffsetRad += input.heading * o.turnRateRadS * dt;
      this.headingOffsetRad = Math.max(-o.corridorRad, Math.min(o.corridorRad, this.headingOffsetRad));
    } else {
      this.idleS += dt;
      if (input.auto || this.idleS >= o.autoResumeS) this.auto = true;
    }
    if (this.auto) {
      const k = 1 - Math.exp(-dt / o.easeS);
      this.headingOffsetRad -= this.headingOffsetRad * k;
      this.lateralM -= this.lateralM * k;
    }

    // Advance. Progress along the rail is the component along it, and the
    // rest is drift; both are the authored speed times the multiplier.
    const fix = railAtKm(this.rail, this.km);
    const ms = (fix.kmPerMin * 1000 * this.speedMul) / 60;
    this.km = Math.min(this.rail.path.lengthKm, this.km + (ms * Math.cos(this.headingOffsetRad) * dt) / 1000);
    this.lateralM += ms * Math.sin(this.headingOffsetRad) * dt;
    this.lateralM = Math.max(-o.maxOffsetM, Math.min(o.maxOffsetM, this.lateralM));

    // Bank, lagged behind the heading rate so a tap does not snap the horizon.
    const rate = (this.headingOffsetRad - before) / dt;
    // Held to 23 degrees: at 34 a held turn over Huangshan tipped the
    // horizon far enough to read as a dive rather than a look aside.
    const bankTarget = Math.max(-0.4, Math.min(0.4, rate * o.bankPerRadS));
    this.bankRad += (bankTarget - this.bankRad) * (1 - Math.exp(-dt / o.bankLagS));

    return this.state();
  }
}
