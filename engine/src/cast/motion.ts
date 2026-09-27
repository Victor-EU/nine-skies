/**
 * A figure's way through the picture (D92): the fourth of the cast's plug
 * axes, beside the figure, the skin and the cue. A motion is built for one
 * visit of one figure and says, for any second of the flight inside it,
 * where the figure is and which way it faces. The layer turns that into
 * the world; the figure, told nothing of it, flaps and walks as before.
 *
 * Most motions are paths in the camera's level frame, laid out in the
 * picture's own terms — "in at the left edge, a kilometre off" — and read
 * back into metres through the view every frame, so a path authored for a
 * wide screen still enters and leaves off the edges of a tall one. A path
 * is a function of the flight's second alone: seek, hold or replay it and
 * it is where it was.
 *
 * Motions register themselves by being imported (`motions/index.ts`), as
 * figures do; `moves.ts` is the list the gate knows.
 */
import type { CastCue } from "../film/scene.js";
import { isMotionKind, type MotionKind } from "./moves.js";
import type { Reaction } from "./omens.js";
import { Rng } from "./random.js";
import type { Temperament } from "./temperament.js";

/** The camera's view as the motions need it: the frame's half-widths as tangents, and how far it looks down. */
export interface View {
  readonly tanHalfX: number;
  readonly tanHalfY: number;
  /** Below level, radians. */
  readonly pitchRad: number;
}

/** The film's usual view: 62° high, 16:9, six degrees down. */
export const DEFAULT_VIEW: View = { tanHalfX: Math.tan((31 * Math.PI) / 180) * (16 / 9), tanHalfY: Math.tan((31 * Math.PI) / 180), pitchRad: (6 * Math.PI) / 180 };

/** Metres of the picture in the camera's level frame: ahead along the heading, to its right, and up. */
export interface FramePoint {
  ahead: number;
  right: number;
  up: number;
}

/**
 * A place in the picture: `x` and `y` as the frame's own -1..1 (past 1 is
 * off it), `d` metres from the lens along its axis.
 */
export interface PicturePoint {
  readonly x: number;
  readonly y: number;
  readonly d: number;
  /**
   * Metres further out past an edge the point is beyond, so a figure of
   * that half-size clears the edge whatever the frame's shape.
   */
  readonly pad?: number;
}

/** Where a picture point is in the level frame, for this view. */
export function pictureToFrame(p: PicturePoint, v: View, out: FramePoint = { ahead: 0, right: 0, up: 0 }): FramePoint {
  const c = Math.cos(v.pitchRad);
  const s = Math.sin(v.pitchRad);
  const pad = p.pad ?? 0;
  const yc = p.y * p.d * v.tanHalfY + (Math.abs(p.y) > 1 ? Math.sign(p.y) * pad : 0);
  out.ahead = p.d * c + yc * s;
  out.right = p.x * p.d * v.tanHalfX + (Math.abs(p.x) > 1 ? Math.sign(p.x) * pad : 0);
  out.up = -p.d * s + yc * c;
  return out;
}

/** Where a frame point shows in the picture; `d` at or below zero is behind the lens. */
export function frameToPicture(f: FramePoint, v: View): PicturePoint {
  const c = Math.cos(v.pitchRad);
  const s = Math.sin(v.pitchRad);
  const d = f.ahead * c - f.up * s;
  const yc = f.ahead * s + f.up * c;
  return { x: f.right / (d * v.tanHalfX), y: yc / (d * v.tanHalfY), d };
}

/** Whether a frame point is inside the picture, with a margin of the frame's own units. */
export function inPicture(f: FramePoint, v: View, margin = 0): boolean {
  const p = frameToPicture(f, v);
  return p.d > 0 && Math.abs(p.x) <= 1 + margin && Math.abs(p.y) <= 1 + margin;
}

/**
 * Where a figure is and how it is turned, as a motion reports it. In the
 * frame, `at` is metres of the picture and `yaw` is from the flight (a
 * quarter turn is the camera's right); in the world, `world` is the place
 * and `yaw` a bearing from north.
 */
export interface Pose {
  space: "frame" | "world";
  readonly at: FramePoint;
  /** A world pose's place; `eastM` and `northM` are real metres it has swum from it. */
  world: { lat: number; lon: number; aboveGroundM: number; eastM?: number; northM?: number } | null;
  yaw: number;
  /** Nose up, radians. */
  pitch: number;
  /** Rolled into a turn, radians; positive dips the right side. */
  bank: number;
  /** 0 to 1: how far into the picture it has come, for the layer's fade. */
  presence: number;
  /**
   * Where its heads look (D93), in the frame (the lens is the origin), and
   * how far they turn there: 0 leaves them as the figure holds them, 1
   * turns them as far as they go. The layer clears it before each pose.
   */
  readonly gaze: { readonly at: FramePoint; weight: number };
  /** 0 to 1: how frightened it is (D93), for a flock to break its formation; the layer clears it before each pose. */
  alarm: number;
}

export function newPose(): Pose {
  return { space: "frame", at: { ahead: 0, right: 0, up: 0 }, world: null, yaw: 0, pitch: 0, bank: 0, presence: 1, gaze: { at: { ahead: 0, right: 0, up: 0 }, weight: 0 }, alarm: 0 };
}

/** Seconds a head takes to turn to the lens and back, for a glance. */
export const GLANCE_TURN_S = 0.5;

/** How far into a window of seconds it is, 0 outside to 1 inside, turning over `turnS` at each end. */
export function windowWeight(flightS: number, window: readonly [number, number] | null, turnS: number): number {
  if (!window) return 0;
  return smooth(Math.min((flightS - window[0]) / turnS, (window[1] - flightS) / turnS));
}

/** Its heads to the lens while it is named or glancing, as the visit says. */
export function glanceAt(flightS: number, visit: Visit, out: Pose): void {
  const w = Math.max(visit.named ? windowWeight(flightS, visit.dwell ?? [visit.fromS, visit.untilS], 1.2) : 0, windowWeight(flightS, visit.glance, GLANCE_TURN_S));
  if (w <= out.gaze.weight) return;
  out.gaze.at.ahead = 0;
  out.gaze.at.right = 0;
  out.gaze.at.up = 0;
  out.gaze.weight = w;
}

/**
 * One appearance of a figure, as the director plans it: which motion, for
 * which seconds of the flight, and whether it lingers in the picture — for
 * its line, or a pause of its own.
 */
export interface Visit {
  readonly motion: MotionKind;
  readonly fromS: number;
  readonly untilS: number;
  /** Seconds it stays in the frame, drifting; null to pass straight through. */
  readonly dwell: readonly [number, number] | null;
  /** Its line is on during the dwell: it turns to the lens while it is named. */
  readonly named: boolean;
  /** The side of the picture it favours, so two figures at once keep apart. */
  readonly side: -1 | 1;
  /** For a chase, the index of the cue it follows and how far behind it is, seconds. */
  readonly leader: number | null;
  readonly lagS: number;
  readonly seed: number;
  /** Seconds it turns its head to the lens as it goes (D93), or null. */
  readonly glance: readonly [number, number] | null;
  /** What it does when another figure's arrival is near (D93): an omen, or null. */
  readonly reaction: Reaction | null;
}

/** Another figure's pose at a second, for a motion that follows it; false when it is off stage then. */
export type PoseOf = (flightS: number, view: View, out: Pose) => boolean;

export interface MotionContext {
  readonly cue: CastCue;
  readonly visit: Visit;
  readonly temperament: Temperament;
  /** The visit's own dice, from its seed. */
  readonly rng: Rng;
  /** The leader's pose, for a chase; null otherwise. */
  readonly leader: PoseOf | null;
}

export interface Motion {
  /** The pose at a second of the visit; false when the figure is off stage then. */
  pose(flightS: number, view: View, out: Pose): boolean;
}

export type MotionBuilder = (ctx: MotionContext) => Motion;

const builders = new Map<MotionKind, MotionBuilder>();

/** A builder for a motion the list knows; registering one it does not is a programming error. */
export function registerMotion(kind: string, builder: MotionBuilder): void {
  if (!isMotionKind(kind)) throw new Error(`"${kind}" is not in MOTION_KINDS; add it there first`);
  builders.set(kind, builder);
}

export function motionBuilder(kind: string): MotionBuilder | null {
  return isMotionKind(kind) ? (builders.get(kind) ?? null) : null;
}

export function registeredMotions(): readonly MotionKind[] {
  return [...builders.keys()];
}

// ---- Paths ----------------------------------------------------------------

/** A key of a path: a second of the flight and a place, in the picture's terms or the frame's metres. */
export interface PathKey {
  readonly t: number;
  readonly at: PicturePoint | FramePoint;
  /** This key and the next are a dwell: the figure drifts between them at their own slow pace. */
  readonly dwell?: boolean;
}

const isPicture = (p: PicturePoint | FramePoint): p is PicturePoint => "d" in p;

export interface PathOptions {
  /** The way it faces while it is named, from the flight, radians; NaN for its path. */
  readonly namedYaw: number;
  /** The seconds it is named, when it is. */
  readonly namedS: readonly [number, number] | null;
  /** A facing it keeps the whole way, from the flight, radians; NaN to face along its path. */
  readonly fixedYaw?: number;
  /** Seconds it takes to turn to the lens and back at a named dwell's ends. */
  readonly turnS?: number;
  readonly maxPitchRad: number;
  /** The most it rolls into a turn, radians. */
  readonly maxBankRad: number;
  /** Its bob: a fraction of its distance, and a phase. */
  readonly bob: number;
  readonly phase: number;
  /** Seconds at each end over which it fades, in case an end is not quite off the picture. */
  readonly edgeS?: number;
  /** Seconds it glances at the lens, or null. */
  readonly glanceS?: readonly [number, number] | null;
}

/**
 * A timed spline through keys, in the level frame: a cubic Hermite with
 * Catmull-Rom tangents over the keys' own times, so speed changes are
 * smooth; a dwell pair's tangents are the dwell's own slow chord, so the
 * figure slows into its pause and leaves it without a stop. The figure
 * faces along its path in the frame (it crosses side-on, comes on face-on),
 * pitches with its climb and banks into its turns.
 */
export class KeyPath implements Motion {
  private readonly pts: FramePoint[];
  private readonly tan: FramePoint[];
  private readonly tmp: FramePoint = { ahead: 0, right: 0, up: 0 };
  private readonly v0: FramePoint = { ahead: 0, right: 0, up: 0 };
  private readonly v1: FramePoint = { ahead: 0, right: 0, up: 0 };
  private readonly namedWindow: readonly [number, number] | null;

  constructor(
    readonly keys: readonly PathKey[],
    private readonly options: PathOptions,
  ) {
    if (keys.length < 2) throw new Error("a path needs two keys");
    this.pts = keys.map(() => ({ ahead: 0, right: 0, up: 0 }));
    this.tan = keys.map(() => ({ ahead: 0, right: 0, up: 0 }));
    this.namedWindow = Number.isFinite(options.namedYaw) ? options.namedS : null;
  }

  get fromS(): number {
    return this.keys[0]!.t;
  }

  get untilS(): number {
    return this.keys[this.keys.length - 1]!.t;
  }

  /** The keys in metres for this view, and their tangents. */
  private lay(v: View): void {
    const { keys, pts, tan } = this;
    keys.forEach((k, i) => {
      if (isPicture(k.at)) pictureToFrame(k.at, v, pts[i]);
      else Object.assign(pts[i]!, k.at);
    });
    const n = keys.length;
    for (let i = 0; i < n; i++) {
      const out = tan[i]!;
      let a = Math.max(0, i - 1);
      let b = Math.min(n - 1, i + 1);
      // A dwell's two keys move at the dwell's own pace.
      if (keys[i]!.dwell && i + 1 < n) [a, b] = [i, i + 1];
      else if (i > 0 && keys[i - 1]!.dwell) [a, b] = [i - 1, i];
      const dt = keys[b]!.t - keys[a]!.t || 1;
      out.ahead = (pts[b]!.ahead - pts[a]!.ahead) / dt;
      out.right = (pts[b]!.right - pts[a]!.right) / dt;
      out.up = (pts[b]!.up - pts[a]!.up) / dt;
    }
  }

  /** Position and velocity at `t`, the keys already laid. */
  private at(t: number, pos: FramePoint, vel: FramePoint): void {
    const { keys, pts, tan } = this;
    let k = 0;
    while (k + 2 < keys.length && t > keys[k + 1]!.t) k++;
    const t0 = keys[k]!.t;
    const h = keys[k + 1]!.t - t0 || 1;
    const s = Math.min(1, Math.max(0, (t - t0) / h));
    const s2 = s * s;
    const s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1;
    const h10 = s3 - 2 * s2 + s;
    const h01 = -2 * s3 + 3 * s2;
    const h11 = s3 - s2;
    const d00 = 6 * s2 - 6 * s;
    const d10 = 3 * s2 - 4 * s + 1;
    const d01 = -6 * s2 + 6 * s;
    const d11 = 3 * s2 - 2 * s;
    const P0 = pts[k]!;
    const P1 = pts[k + 1]!;
    const M0 = tan[k]!;
    const M1 = tan[k + 1]!;
    for (const c of ["ahead", "right", "up"] as const) {
      pos[c] = h00 * P0[c] + h10 * h * M0[c] + h01 * P1[c] + h11 * h * M1[c];
      vel[c] = (d00 * P0[c] + d10 * h * M0[c] + d01 * P1[c] + d11 * h * M1[c]) / h;
    }
  }

  pose(flightS: number, view: View, out: Pose): boolean {
    if (flightS < this.fromS || flightS > this.untilS) return false;
    const o = this.options;
    this.lay(view);
    const { v0, v1, tmp } = this;
    this.at(flightS, out.at, v0);
    this.at(Math.min(this.untilS, flightS + 0.25), tmp, v1);
    // The bob: a slow rise and fall and a sway, a share of its distance.
    const reach = Math.hypot(out.at.ahead, out.at.right, out.at.up);
    out.at.up += o.bob * reach * Math.sin(flightS * 0.9 + o.phase);
    out.at.right += 0.6 * o.bob * reach * Math.sin(flightS * 0.55 + 2 * o.phase);
    out.space = "frame";
    out.world = null;
    const pathYaw = Math.atan2(v0.right, v0.ahead);
    const nextYaw = Math.atan2(v1.right, v1.ahead);
    out.yaw = pathYaw;
    if (o.fixedYaw !== undefined && Number.isFinite(o.fixedYaw)) out.yaw = o.fixedYaw;
    else if (this.namedWindow) {
      const [a, b] = this.namedWindow;
      const turn = o.turnS ?? 1.2;
      const w = smooth(Math.min((flightS - a) / turn, (b - flightS) / turn));
      out.yaw = pathYaw + w * angleTo(pathYaw, o.namedYaw);
    }
    const flat = Math.hypot(v0.ahead, v0.right);
    out.pitch = clamp(Math.atan2(v0.up, flat), o.maxPitchRad);
    out.bank = clamp(angleTo(pathYaw, nextYaw) * 1.6, o.maxBankRad);
    const edge = o.edgeS ?? 0.35;
    out.presence = smooth(Math.min((flightS - this.fromS) / edge, (this.untilS - flightS) / edge));
    // The head: to the lens while it is named, and for a glance.
    const look = Math.max(windowWeight(flightS, o.namedS, o.turnS ?? 1.2), windowWeight(flightS, o.glanceS ?? null, GLANCE_TURN_S));
    if (look > out.gaze.weight) {
      out.gaze.at.ahead = 0;
      out.gaze.at.right = 0;
      out.gaze.at.up = 0;
      out.gaze.weight = look;
    }
    return true;
  }
}

/** 0 below 0, 1 above 1, and a smooth step between. */
export function smooth(x: number): number {
  const s = Math.min(1, Math.max(0, x));
  return s * s * (3 - 2 * s);
}

/** The signed turn from one angle to another, the short way. */
export function angleTo(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function clamp(x: number, m: number): number {
  return Math.max(-m, Math.min(m, x));
}
