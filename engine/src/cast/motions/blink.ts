/**
 * The somersault cloud (D92): Wukong drops in from over the frame, pauses,
 * and is gone in half a second — up and over — to be somewhere else in the
 * picture, two or three times, before he leaves the way he came; he may
 * land in another of his pictures (F139). A named
 * visit's pause is at the author's spot, while his line is on.
 */
import { KeyPath, registerMotion, type FramePoint, type PathKey, type PicturePoint } from "../motion.js";
import { bandY, homeSpot, padFor, pathOptions, visitDistance } from "./common.js";

/** Seconds a hop takes, spot to spot. */
export const HOP_S = 0.45;

registerMotion("blink", (ctx) => {
  const { rng, visit } = ctx;
  const d = visitDistance(ctx);
  const pad = padFor(ctx);
  let x = visit.side * rng.range(0.2, 0.6);
  const next = (): PicturePoint => {
    x = -Math.sign(x) * rng.range(0.15, 0.65);
    return { x, y: bandY(ctx), d: d * rng.range(0.8, 1.2) };
  };
  const pauses: [number, number, PicturePoint | FramePoint][] = [];
  // Pauses of two to three seconds between `from` and `to`, the last one taking what is left.
  const fill = (from: number, to: number): void => {
    let t = from;
    while (to - t >= 1.2) {
      const stay = rng.range(1.8, 3);
      if (to - (t + stay) < 1.2 + HOP_S) {
        pauses.push([t, to, next()]);
        return;
      }
      pauses.push([t, t + stay, next()]);
      t += stay + HOP_S;
    }
  };
  const named = visit.named && visit.dwell && ctx.cue.offset ? visit.dwell : null;
  if (named) {
    fill(visit.fromS + HOP_S, named[0] - HOP_S);
    pauses.push([named[0], named[1], homeSpot(ctx)]);
    fill(named[1] + HOP_S, visit.untilS - HOP_S);
  } else fill(visit.fromS + HOP_S, visit.untilS - HOP_S);

  const keys: PathKey[] = [{ t: visit.fromS, at: { x, y: 1.08, d, pad } }];
  for (const [a, b, at] of pauses) {
    keys.push({ t: a, at, dwell: true });
    keys.push({ t: b, at });
  }
  keys.push({ t: visit.untilS, at: { x: -x, y: 1.08, d, pad } });
  const path = new KeyPath(
    keys.filter((k, i) => i === 0 || k.t > keys[i - 1]!.t + 0.05),
    { ...pathOptions(ctx), maxBankRad: 0.3, edgeS: 0.2 },
  );
  // He may land from a hop in another stance (F139): each hop between two spots, not the last, which leaves.
  const hops = pauses.slice(0, -1).map(([, b]) => b);
  return Object.assign(path, { swaps: () => hops });
});
