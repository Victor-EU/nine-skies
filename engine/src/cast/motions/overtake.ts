/**
 * From behind the lens (D92): it comes past the camera on one side, close
 * and fast, pulls ahead, and goes off into the distance or over the top of
 * the picture. Seen from behind and beside, as a bird is that overtakes.
 */
import { registerMotion } from "../motion.js";
import { bandY, besideLens, padFor, threeActs, visitDistance } from "./common.js";

registerMotion("overtake", (ctx) => {
  const { rng, visit } = ctx;
  const s = visit.side;
  const d = visitDistance(ctx);
  const pad = padFor(ctx);
  const y = bandY(ctx);
  const exit = rng.chance(0.6) ? { x: s * 1.08, y: y + rng.range(0, 0.2), d: d * rng.range(3.5, 5), pad } : { x: s * rng.range(0, 0.5), y: 1.08, d: d * rng.range(2.5, 3.5), pad };
  return threeActs(ctx, besideLens(-0.35 * d, s * 0.7 * d, y, d), { x: s * rng.range(0.3, 0.65), y, d: d * 0.9 }, exit, d);
});
