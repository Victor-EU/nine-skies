/**
 * What the path motions share (D92): how far off a visit keeps, how high,
 * where it lingers, and the three acts most visits are — in from off the
 * picture, through it (or pausing in it), and out again.
 *
 * Distances start from the cue's own offset, the distance its author found
 * the figure reads at, and the dice move it nearer or further: a near pass
 * is rare and big, a far glimpse is rare and small, and most visits keep to
 * the author's. A named visit lingers exactly where the author put it.
 */
import { DEFAULT_VIEW, frameToPicture, KeyPath, pictureToFrame, type FramePoint, type MotionContext, type PathKey, type PathOptions, type PicturePoint } from "../motion.js";

/** How far the author put the figure, metres of the picture. */
export function homeDistance(ctx: MotionContext): number {
  const o = ctx.cue.offset;
  return o ? Math.hypot(o.aheadM, o.rightM, o.upM) : ctx.cue.sizeM * 6;
}

/** This visit's distance from the lens: mostly the author's, sometimes near, sometimes far. */
export function visitDistance(ctx: MotionContext): number {
  const home = homeDistance(ctx);
  const { rng, temperament } = ctx;
  const reach = rng.pick(temperament.stately ? { home: 5, far: 1 } : { near: 1, home: 5, far: 1 });
  const k = reach === "near" ? rng.range(0.45, 0.65) : reach === "far" ? rng.range(1.7, 2.6) : rng.range(0.8, 1.25);
  // Never so near the figure fills the frame, whatever the author wrote.
  return Math.max(home * k, ctx.cue.sizeM * 2.2);
}

/** A height in the picture from the figure's band. */
export function bandY(ctx: MotionContext, lift = 0): number {
  const [lo, hi] = ctx.temperament.band;
  return Math.min(0.9, ctx.rng.range(lo, hi) + lift);
}

/** Half the figure, metres: how far past an edge it must be to be off the picture. */
export function padFor(ctx: MotionContext): number {
  return ctx.cue.sizeM * 0.6;
}

/** The author's own spot for the figure, in the frame. */
export function homeSpot(ctx: MotionContext): FramePoint {
  const o = ctx.cue.offset!;
  return { ahead: o.aheadM, right: o.rightM, up: o.upM };
}

/** The path's options from the cue and the figure's temperament. */
export function pathOptions(ctx: MotionContext): PathOptions {
  const { cue, visit, temperament, rng } = ctx;
  return {
    namedYaw: visit.named && cue.facingDeg !== 0 ? (cue.facingDeg * Math.PI) / 180 : NaN,
    namedS: visit.named ? visit.dwell : null,
    maxPitchRad: (temperament.maxPitchDeg * Math.PI) / 180,
    maxBankRad: temperament.maxPitchDeg > 12 ? 0.45 : 0.1,
    bob: 0.01,
    phase: rng.range(0, Math.PI * 2),
    glanceS: visit.glance,
  };
}

/** How far into the picture a pause may drift, in the frame's own units. */
const DRIFT_BOUND = 0.8;

/**
 * The drift of a pause: a slow continuation of the way the figure was
 * going, a few percent of its distance a second, so it never stops dead —
 * shortened as far as it must be to stay in the picture, since a pause is
 * where its line is read (F113: the Bull Demon King, put near the left
 * edge, drifted off it with his line still on).
 */
function drifted(spot: PicturePoint | FramePoint, from: PicturePoint | FramePoint, to: PicturePoint | FramePoint, seconds: number, distance: number): FramePoint {
  const f = (p: PicturePoint | FramePoint): FramePoint => ("d" in p ? pictureToFrame(p, DEFAULT_VIEW) : { ...p });
  const s = f(spot);
  const a = f(from);
  const b = f(to);
  const dir = { ahead: b.ahead - a.ahead, right: b.right - a.right, up: b.up - a.up };
  const len = Math.hypot(dir.ahead, dir.right, dir.up) || 1;
  let step = Math.min(0.03 * distance * seconds, 0.2 * distance) / len;
  for (let k = 0; k < 8; k++, step /= 2) {
    const end = { ahead: s.ahead + dir.ahead * step, right: s.right + dir.right * step, up: s.up + dir.up * step };
    const p = frameToPicture(end, DEFAULT_VIEW);
    if (p.d > 0 && Math.abs(p.x) <= DRIFT_BOUND && Math.abs(p.y) <= DRIFT_BOUND) return end;
  }
  return s;
}

/**
 * The three acts: in at `entry`, through `middle` (a pause there when the
 * visit has one, at the author's spot when it is named), out at `exit`.
 * Extra keys may go either side of the middle, at fractions of their act.
 */
export function threeActs(
  ctx: MotionContext,
  entry: PicturePoint | FramePoint,
  middle: PicturePoint | FramePoint,
  exit: PicturePoint | FramePoint,
  distance: number,
  options: { before?: readonly [number, PicturePoint | FramePoint][]; after?: readonly [number, PicturePoint | FramePoint][] } = {},
): KeyPath {
  const { visit } = ctx;
  const keys: PathKey[] = [{ t: visit.fromS, at: entry }];
  const spot = visit.named && ctx.cue.offset ? homeSpot(ctx) : middle;
  const [a, b] = visit.dwell ?? [0.5 * (visit.fromS + visit.untilS), 0.5 * (visit.fromS + visit.untilS)];
  for (const [u, at] of options.before ?? []) keys.push({ t: visit.fromS + u * (a - visit.fromS), at });
  if (visit.dwell) {
    keys.push({ t: a, at: spot, dwell: true });
    keys.push({ t: b, at: drifted(spot, entry, exit, b - a, distance) });
  } else keys.push({ t: a, at: spot });
  for (const [u, at] of options.after ?? []) keys.push({ t: b + u * (visit.untilS - b), at });
  keys.push({ t: visit.untilS, at: exit });
  return new KeyPath(keys, pathOptions(ctx));
}

/** A frame point level with a picture height, for a key behind or beside the lens. */
export function besideLens(ahead: number, right: number, y: number, distance: number): FramePoint {
  const up = pictureToFrame({ x: 0, y, d: distance }, DEFAULT_VIEW).up;
  return { ahead, right, up };
}
