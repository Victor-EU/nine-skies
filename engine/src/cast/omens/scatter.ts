/**
 * The birds take fright (D93): a moment before something big comes into
 * the picture, a skittish witness breaks off its way and bolts, away from
 * where the thing is coming, and up. It flinches first, its head snapping
 * round toward the danger, then goes faster every second and is out of the
 * picture before the arrival is fully in. Its flight is laid out in the
 * picture's own terms, as the paths are: away from the danger on the
 * screen, and up, whatever the figure's height against the lens.
 */
import { angleTo, frameToPicture, newPose, pictureToFrame, smooth, type FramePoint, type View } from "../motion.js";
import { registerOmen } from "../omens.js";

/** Seconds it checks, head round, before it bolts. */
const FLINCH_S = 0.3;
/** How much of its own way it keeps once it has taken fright. */
const KEEP = 0.6;
/** How far across the picture it flies before it has gone, in the picture's half-widths: out of it, whatever its size. */
const CLEAR = 2.4;
/** How much further off it gets as it goes, as a share of its distance, for each half-width it crosses. */
const RECEDE = 0.12;

registerOmen("scatter", (ctx) => {
  const { reaction, visit, rng, threat, temperament } = ctx;
  // Its own path, laid for the whole of it, which it keeps until it takes fright.
  const own = ctx.build({ ...visit, untilS: reaction.pathUntilS });
  if (!own) return null;
  const t0 = reaction.atS;
  const endS = visit.untilS;
  const lift = rng.range(0.4, 0.7);
  const maxPitch = (Math.max(20, temperament.maxPitchDeg) * Math.PI) / 180;
  const was = newPose();
  const before = newPose();
  const foe = newPose();
  // Where it was in the picture when it took fright, how it was going there, and which way it flees there.
  let x0 = 0;
  let y0 = 0;
  let d0 = 1;
  let vx = 0;
  let vy = 0;
  let ax = 0;
  let ay = 0;
  let seen = false;
  const startle = (view: View): boolean => {
    if (!own.pose(t0, view, was)) return false;
    const tb = Math.max(visit.fromS, t0 - 0.2);
    own.pose(tb, view, before);
    const now = frameToPicture(was.at, view);
    const then = frameToPicture(before.at, view);
    const dt = t0 - tb || 0.2;
    [x0, y0, d0] = [now.x, now.y, now.d];
    [vx, vy] = [(now.x - then.x) / dt, (now.y - then.y) / dt];
    // Away from where it comes in, across the picture, and up.
    seen = threat(reaction.arrivalS + 0.3, view, foe);
    let dx: number = visit.side;
    let dy = 0;
    if (seen) {
      const it = frameToPicture(foe.at, view);
      [dx, dy] = it.d > 0 ? [now.x - it.x, now.y - it.y] : [was.at.right - foe.at.right, was.at.up - foe.at.up];
    }
    // Birds burst across and up: the danger's height counts for half.
    const n = Math.hypot(dx, dy) || 1;
    [ax, ay] = [dx / n, (0.5 * dy) / n + lift];
    const m = Math.hypot(ax, ay);
    [ax, ay] = [ax / m, ay / m];
    return true;
  };
  const at: FramePoint = { ahead: 0, right: 0, up: 0 };
  const next: FramePoint = { ahead: 0, right: 0, up: 0 };
  /** Where it is in the frame, `tau` seconds after it took fright. */
  const fled = (tau: number, view: View, out: FramePoint): FramePoint => {
    const bolt = Math.max(0.3, endS - t0 - FLINCH_S);
    const go = Math.max(0, tau - FLINCH_S);
    const s = (CLEAR * go * go) / (bolt * bolt);
    return pictureToFrame({ x: x0 + vx * KEEP * tau + ax * s, y: y0 + vy * KEEP * tau + ay * s, d: d0 * (1 + RECEDE * s) }, view, out);
  };

  return {
    pose(flightS, view, out) {
      if (flightS < visit.fromS || flightS > endS) return false;
      if (flightS < t0) return own.pose(flightS, view, out);
      if (!startle(view)) return false;
      const tau = flightS - t0;
      fled(tau, view, at);
      fled(tau + 0.05, view, next);
      out.at.ahead = at.ahead;
      out.at.right = at.right;
      out.at.up = at.up;
      out.space = "frame";
      out.world = null;
      const v = { ahead: next.ahead - at.ahead, right: next.right - at.right, up: next.up - at.up };
      const yaw = Math.atan2(v.right, v.ahead);
      fled(tau + 0.3, view, next);
      const soon = Math.atan2(next.right - at.right, next.ahead - at.ahead);
      // Flinching, it keeps the facing it had; bolting, it faces the way it flies.
      const turn = smooth((tau - FLINCH_S * 0.5) / 0.3);
      out.yaw = was.yaw + turn * angleTo(was.yaw, yaw);
      out.pitch = turn * Math.max(-maxPitch, Math.min(maxPitch, Math.atan2(v.up, Math.hypot(v.ahead, v.right))));
      out.bank = turn * Math.max(-0.45, Math.min(0.45, angleTo(yaw, soon) * 1.2));
      out.presence = was.presence * smooth((endS - flightS) / 0.35);
      out.alarm = smooth(tau / 0.25);
      // Its head round to the danger at once, and away again as it flees.
      const look = smooth(tau / 0.12) * (1 - smooth((tau - FLINCH_S) / 0.4));
      if (seen && look > 0) {
        out.gaze.at.ahead = foe.at.ahead;
        out.gaze.at.right = foe.at.right;
        out.gaze.at.up = foe.at.up;
        out.gaze.weight = look;
      }
      return true;
    },
  };
});
