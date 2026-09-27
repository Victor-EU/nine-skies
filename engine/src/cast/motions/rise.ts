/**
 * Up from under the frame (D92): out of the cloud sea or the river, an arc
 * over, and down again — a dragon breaking the surface, a carp at the
 * Dragon Gate, a tiger's leap.
 */
import { registerMotion } from "../motion.js";
import { padFor, threeActs, visitDistance } from "./common.js";

registerMotion("rise", (ctx) => {
  const { rng, visit, temperament } = ctx;
  const s = visit.side;
  const d = visitDistance(ctx);
  const pad = padFor(ctx);
  const x0 = s * rng.range(0.05, 0.55);
  const top = Math.min(0.85, temperament.band[1] + rng.range(0, 0.25));
  return threeActs(ctx, { x: x0 - s * rng.range(0.15, 0.4), y: -1.08, d, pad }, { x: x0, y: top, d: d * 0.95 }, { x: x0 + s * rng.range(0.2, 0.5), y: -1.08, d: d * 0.9, pad }, d);
});
