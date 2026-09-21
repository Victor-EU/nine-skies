/**
 * The six objective primitives a challenge is built from. (Build plan,
 * workstream D, the *Challenges* row.)
 *
 * The plan's claim is that six primitives — land-in-radius, gate sequence,
 * reach-before-time, hold-altitude, stay-on-instruments, follow-line — cover
 * all twelve challenges. They are built here as separate objects because that
 * claim is only checkable if each one exists separately; what measuring them
 * found is in F43, and two of the six turn out not to be independent.
 *
 * **Every objective is fed a segment, not a point.** This is the fourth place
 * in the build to need D30's distinction and the first where a point test is
 * not merely lossy but wrong at any frame rate: a gate has no width. At 30 fps
 * the aircraft moves 12 m per frame at `approach`, 24 at `low`, 72 at cruise
 * and 144 at boost, so a disc bigger than about 150 m always contains a
 * sample and a gate never does. Discs are therefore tested by containment and
 * gates by crossing, and both take the same two verbs the discovery field and
 * the flown track take — `advance` for flying and `jump` for arriving without
 * having flown.
 *
 * **A jump satisfies nothing.** `__ns.goTo` exists, the map has a pin under
 * the cursor, and an operator drops a playtester at km 900 (F28). If a
 * teleport could cross a gate, every challenge would be completable from the
 * console — and unlike a discovery, which is a thing the player is *told*, a
 * challenge is a thing the player is *credited with*. So `jump` re-seats the
 * position and clears anything mid-hold, and credits nothing.
 */
import { entryFraction } from "../discovery/triggers.js";

/**
 * Everything an objective is allowed to look at.
 *
 * Deliberately a flat record of what the aircraft is doing rather than a
 * reference to the flight state: these run in tests with no world, in the
 * check tool over a replayed route, and in the app, and the only way all
 * three stay the same experiment is if none of them can reach for anything
 * that is not in here.
 */
export interface ChallengeSample {
  /** Seconds since this attempt began. The stopwatch, not the world clock. */
  readonly seconds: number;
  readonly eastM: number;
  readonly northM: number;
  readonly altitudeM: number;
  /**
   * Ground under the aircraft, or `null` when no tile is resident.
   *
   * Null rather than zero, for F42's reason: a coerced zero over the Hengduan
   * reads as sea level and would credit a 3,000 m fly-past as a landing.
   * An objective that needs the ground and cannot have it makes no judgement
   * at all this sample.
   */
  readonly groundM: number | null;
  /** Radians, the simulation's convention: east = sin, north = cos. */
  readonly headingRad: number;
  /** Real ground kilometres per minute — the gained speed, not the airspeed. */
  readonly groundSpeedKmPerMin: number;
  /** Beijing minutes after midnight, so a solar deadline can be read (F41). */
  readonly clockMinutes: number;
}

export type ObjectiveState = "pending" | "met" | "missed";

export interface Objective {
  readonly id: string;
  /** One line, shown as it stands: "below 300 m over Daocheng Yading". */
  readonly label: string;
  readonly state: ObjectiveState;
  /** 0–1, for a progress bar. Exactly 1 when met. */
  readonly progress: number;
  /** The aircraft *flew* from `from` to `to`. */
  advance(from: ChallengeSample, to: ChallengeSample): void;
  /** The aircraft *is* at `to`, without having flown there. Credits nothing. */
  jump(to: ChallengeSample): void;
  reset(): void;
}

/**
 * How high above the ground still counts as being at a place, metres.
 *
 * Not a tuning number and not an authoring one: it is the floor the flight
 * model leaves. `flight.ts` bounces off terrain at `ground + 25` rather than
 * crashing, which is the GDD's own rule — *no stalls, no crashes; flying into
 * terrain bounces you up with a soft camera shake* — so 25 m above ground is
 * not a difficult altitude to reach, it is the only altitude below which
 * nothing exists. An objective authored under it can never be missed and one
 * authored at it is met by flying straight at the hill. See F43.
 */
export const BOUNCE_FLOOR_M = 25;

/**
 * Arrive inside a circle, optionally low and optionally slow.
 *
 * This is both *land-in-radius* and *reach-before-time*: the deadline in the
 * second is not part of the objective, it belongs to the challenge (F43), and
 * with the deadline taken out the two are the same test with different
 * conditions on it. The GDD's landing challenge is this with `maxAglM` set;
 * its sunset race is this with nothing set and a deadline above it.
 *
 * **Containment, checked at a sample, with the crossing as a witness.** A
 * disc wider than a frame step always holds a sample and the conditions can
 * be read there; a disc narrower than one may be flown clean through between
 * two frames, and then nothing was ever measured inside it. That case is not
 * a miss and not a pass — it is the instrument failing — so it is counted and
 * reported rather than scored (`clippedWithoutSample`).
 */
export class ReachDisc implements Objective {
  readonly id: string;
  readonly label: string;
  private hit = false;
  private best = 0;
  /** Segments that crossed the circle without a sample landing inside it. */
  private clipped = 0;

  constructor(
    private readonly spec: {
      readonly id: string;
      readonly label: string;
      readonly eastM: number;
      readonly northM: number;
      readonly radiusM: number;
      /** Metres above the ground the arrival must be under, if any. */
      readonly maxAglM?: number | undefined;
      /** Ground speed the arrival must be under, km/min, if any. */
      readonly maxGroundSpeedKmPerMin?: number | undefined;
    },
  ) {
    this.id = spec.id;
    this.label = spec.label;
  }

  get state(): ObjectiveState {
    return this.hit ? "met" : "pending";
  }

  get progress(): number {
    return this.hit ? 1 : this.best;
  }

  /** How many segments crossed the circle with no sample inside it. */
  get clippedWithoutSample(): number {
    return this.clipped;
  }

  private inside(s: ChallengeSample): boolean {
    const dx = s.eastM - this.spec.eastM;
    const dy = s.northM - this.spec.northM;
    return dx * dx + dy * dy <= this.spec.radiusM * this.spec.radiusM;
  }

  private conditionsHold(s: ChallengeSample): boolean {
    const { maxAglM, maxGroundSpeedKmPerMin } = this.spec;
    if (maxAglM !== undefined) {
      if (s.groundM === null) return false;
      if (s.altitudeM - s.groundM > maxAglM) return false;
    }
    if (maxGroundSpeedKmPerMin !== undefined && s.groundSpeedKmPerMin > maxGroundSpeedKmPerMin)
      return false;
    return true;
  }

  /** Closest approach so far, as a fraction: 1 at the centre, 0 a radius out. */
  private note(s: ChallengeSample): void {
    const d = Math.hypot(s.eastM - this.spec.eastM, s.northM - this.spec.northM);
    const near = Math.max(0, 1 - d / (2 * this.spec.radiusM));
    if (near > this.best) this.best = near;
  }

  advance(from: ChallengeSample, to: ChallengeSample): void {
    if (this.hit) return;
    this.note(to);
    if (this.inside(to)) {
      if (this.conditionsHold(to)) this.hit = true;
      return;
    }
    const crossed = entryFraction(
      from.eastM,
      from.northM,
      to.eastM,
      to.northM,
      this.spec.eastM,
      this.spec.northM,
      this.spec.radiusM,
    );
    if (crossed !== null && !this.inside(from)) this.clipped++;
  }

  jump(to: ChallengeSample): void {
    this.note(to);
  }

  reset(): void {
    this.hit = false;
    this.best = 0;
    this.clipped = 0;
  }
}

/**
 * One gate: a line on the ground with a height band over it.
 *
 * Authored as a centre, a bearing and a width, because that is how a gate is
 * imagined — *fly through the gap facing this way* — and turned into the two
 * endpoints the crossing test needs by `gateAcross`.
 */
export interface Gate {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly minAltitudeM: number;
  readonly maxAltitudeM: number;
}

/**
 * A gate `widthM` wide, centred at `(eastM, northM)`, square across `bearingRad`.
 *
 * The bearing is the direction of flight through it, so the gate itself lies
 * across that: a gate on a course due north has its posts east and west.
 */
export function gateAcross(
  eastM: number,
  northM: number,
  bearingRad: number,
  widthM: number,
  minAltitudeM: number,
  maxAltitudeM: number,
): Gate {
  // Across the course: rotate the heading by a quarter turn. With the
  // simulation's east = sin, north = cos convention that is (cos, -sin).
  const hx = Math.cos(bearingRad);
  const hy = -Math.sin(bearingRad);
  const half = widthM / 2;
  return {
    ax: eastM - hx * half,
    ay: northM - hy * half,
    bx: eastM + hx * half,
    by: northM + hy * half,
    minAltitudeM,
    maxAltitudeM,
  };
}

/**
 * Where along `P -> Q` it crosses the segment `A -> B`, as a fraction, or null.
 *
 * Both fractions are needed: the one along the flight path says *when*, which
 * is what interpolates the altitude, and the one along the gate says whether
 * it went between the posts rather than past them.
 */
export function crossingFraction(
  px: number,
  py: number,
  qx: number,
  qy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number | null {
  const rx = qx - px;
  const ry = qy - py;
  const sx = bx - ax;
  const sy = by - ay;
  const denom = rx * sy - ry * sx;
  if (denom === 0) return null; // parallel, or standing still
  const t = ((ax - px) * sy - (ay - py) * sx) / denom;
  const u = ((ax - px) * ry - (ay - py) * rx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/**
 * Cross a sequence of gates, in order.
 *
 * Out of order is not a failure, it is nothing: a player who doubles back
 * through gate three before gate two has not broken the challenge, they have
 * flown past a gate that was not yet the next one. The GDD is explicit that
 * *failure costs nothing*, so the only things that end an attempt are the
 * challenge's own deadline and leaving a corridor that has one.
 */
export class GateSequence implements Objective {
  readonly id: string;
  readonly label: string;
  private next = 0;
  private readonly gates: readonly Gate[];

  constructor(spec: { id: string; label: string; gates: readonly Gate[] }) {
    this.id = spec.id;
    this.label = spec.label;
    this.gates = spec.gates;
  }

  get state(): ObjectiveState {
    return this.next >= this.gates.length ? "met" : "pending";
  }

  get progress(): number {
    return this.gates.length === 0 ? 1 : this.next / this.gates.length;
  }

  /** Which gate is being flown to, 1-based, or the count when done. */
  get taken(): number {
    return this.next;
  }

  advance(from: ChallengeSample, to: ChallengeSample): void {
    // A single update may cross more than one gate: at boost a frame is 144 m
    // and gates in a sequence can be closer than that.
    for (;;) {
      const gate = this.gates[this.next];
      if (!gate) return;
      const t = crossingFraction(
        from.eastM,
        from.northM,
        to.eastM,
        to.northM,
        gate.ax,
        gate.ay,
        gate.bx,
        gate.by,
      );
      if (t === null) return;
      const altitudeM = from.altitudeM + (to.altitudeM - from.altitudeM) * t;
      if (altitudeM < gate.minAltitudeM || altitudeM > gate.maxAltitudeM) return;
      this.next++;
    }
  }

  jump(_to: ChallengeSample): void {
    // Nothing: a gate is crossed or it is not, and a teleport crosses nothing.
  }

  reset(): void {
    this.next = 0;
  }
}

/**
 * Stay inside a band — of altitude, and optionally of heading — for a while.
 *
 * *hold-altitude* is this with no heading; *stay-on-instruments* is this with
 * one. They are one class because measuring them found no third difference:
 * the instrument challenge's *obscured* half is a weather state the aircraft
 * flies through, not a thing the objective can test, and what is actually
 * scored either way is a band held for a duration (F43).
 *
 * **The hold is continuous and leaving resets it.** A challenge that added up
 * disconnected seconds would be passed by wobbling across the band, which is
 * the opposite of what holding an altitude means.
 */
export class HoldBand implements Objective {
  readonly id: string;
  readonly label: string;
  private held = 0;
  private bestHeld = 0;

  constructor(
    private readonly spec: {
      readonly id: string;
      readonly label: string;
      readonly minM: number;
      readonly maxM: number;
      /** Measure the band above the ground rather than above the sea. */
      readonly aboveGround?: boolean | undefined;
      readonly seconds: number;
      /** Radians. Absent is *hold-altitude*; present is *on instruments*. */
      readonly headingRad?: number | undefined;
      readonly headingToleranceRad?: number | undefined;
    },
  ) {
    this.id = spec.id;
    this.label = spec.label;
  }

  get state(): ObjectiveState {
    return this.bestHeld >= this.spec.seconds ? "met" : "pending";
  }

  get progress(): number {
    return Math.min(1, this.bestHeld / this.spec.seconds);
  }

  /** Seconds held without a break, right now. */
  get heldS(): number {
    return this.held;
  }

  private within(s: ChallengeSample): boolean {
    let altitudeM = s.altitudeM;
    if (this.spec.aboveGround) {
      if (s.groundM === null) return false;
      altitudeM -= s.groundM;
    }
    if (altitudeM < this.spec.minM || altitudeM > this.spec.maxM) return false;
    const { headingRad, headingToleranceRad = 0 } = this.spec;
    if (headingRad !== undefined) {
      const twoPi = Math.PI * 2;
      let d = (((s.headingRad - headingRad) % twoPi) + twoPi) % twoPi;
      if (d > Math.PI) d -= twoPi;
      if (Math.abs(d) > headingToleranceRad) return false;
    }
    return true;
  }

  advance(from: ChallengeSample, to: ChallengeSample): void {
    if (!this.within(to)) {
      this.held = 0;
      return;
    }
    // Credit the interval only when both ends are inside it: a segment that
    // entered the band halfway through was outside it for the other half, and
    // half a frame is not worth the arithmetic to recover.
    if (this.within(from)) this.held += Math.max(0, to.seconds - from.seconds);
    if (this.held > this.bestHeld) this.bestHeld = this.held;
  }

  jump(_to: ChallengeSample): void {
    this.held = 0;
  }

  reset(): void {
    this.held = 0;
    this.bestHeld = 0;
  }
}

export interface LinePoint {
  readonly eastM: number;
  readonly northM: number;
}

/**
 * Fly a line from end to end without leaving a corridor around it.
 *
 * The one primitive that can *miss*: everything else here is either done or
 * not yet, but a follow-line challenge whose whole point is the corridor has
 * to be able to say the corridor was left. Leaving it is not a crash and the
 * retry is instant, which is the GDD's rule; it just ends this attempt.
 *
 * **There is a floor under `corridorM` and it is the aeroplane, not the
 * ground.** F38 measured a full-bank reversal at 5.3 km wide at `low` and
 * 16.2–23.3 km at cruise, in real ground kilometres, because the compression
 * multiplies every turn by the mode's ground gain. A corridor narrower than
 * that cannot be flown by an aircraft that is banking at all, whatever the
 * player intends, so it is not a difficulty setting — it is an impossible
 * challenge. `minCorridorM` is not enforced here, where nothing knows the
 * mode; it is checked at authoring, where the mode is written down.
 */
export class FollowLine implements Objective {
  readonly id: string;
  readonly label: string;
  private reached = 0;
  private left = false;
  private started = false;
  private worstM = 0;
  private readonly points: readonly LinePoint[];
  private readonly cumKm: number[] = [];
  private readonly totalKm: number;

  constructor(
    private readonly spec: {
      readonly id: string;
      readonly label: string;
      readonly points: readonly LinePoint[];
      readonly corridorM: number;
    },
  ) {
    this.id = spec.id;
    this.label = spec.label;
    this.points = spec.points;
    let sum = 0;
    this.cumKm.push(0);
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1]!;
      const b = this.points[i]!;
      sum += Math.hypot(b.eastM - a.eastM, b.northM - a.northM) / 1000;
      this.cumKm.push(sum);
    }
    this.totalKm = sum;
  }

  get state(): ObjectiveState {
    if (this.left) return "missed";
    return this.totalKm > 0 && this.reached >= this.totalKm - 1e-6 ? "met" : "pending";
  }

  get progress(): number {
    return this.totalKm === 0 ? 1 : Math.min(1, this.reached / this.totalKm);
  }

  /** Kilometres of the line flown so far. */
  get km(): number {
    return this.reached;
  }

  /** The furthest off the line this attempt has been, metres. */
  get worstCrossTrackM(): number {
    return this.worstM;
  }

  /** Distance along the line, and how far off it, for a point. */
  private fix(s: ChallengeSample): { km: number; offM: number } {
    let bestOff = Infinity;
    let bestKm = 0;
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1]!;
      const b = this.points[i]!;
      const dx = b.eastM - a.eastM;
      const dy = b.northM - a.northM;
      const len2 = dx * dx + dy * dy;
      const t =
        len2 === 0
          ? 0
          : Math.max(0, Math.min(1, ((s.eastM - a.eastM) * dx + (s.northM - a.northM) * dy) / len2));
      const px = a.eastM + dx * t;
      const py = a.northM + dy * t;
      const off = Math.hypot(s.eastM - px, s.northM - py);
      if (off < bestOff) {
        bestOff = off;
        bestKm = this.cumKm[i - 1]! + (Math.sqrt(len2) * t) / 1000;
      }
    }
    return { km: bestKm, offM: bestOff };
  }

  advance(_from: ChallengeSample, to: ChallengeSample): void {
    if (this.left || this.state === "met") return;
    const { km, offM } = this.fix(to);
    if (this.started && offM > this.worstM) this.worstM = offM;
    if (offM > this.spec.corridorM) {
      // Outside the corridor before ever entering it is not a failure: the
      // aircraft has not started the line yet. This is the same distinction
      // the expedition runner draws and for the same reason (F38).
      if (this.started) this.left = true;
      return;
    }
    this.started = true;
    // Monotonic, like route progress: a player who turns round to look at
    // something does not un-fly the line behind them.
    if (km > this.reached) this.reached = km;
  }

  jump(to: ChallengeSample): void {
    // A jump forward down the line credits nothing, but it does re-seat where
    // the aircraft is, so the next segment is not measured from the old place.
    const { offM } = this.fix(to);
    this.started = offM <= this.spec.corridorM;
  }

  reset(): void {
    this.reached = 0;
    this.left = false;
    this.started = false;
    this.worstM = 0;
  }
}
