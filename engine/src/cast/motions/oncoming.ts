/**
 * Out of the distance (D92): it slides in from a side far off, comes on
 * toward the lens face-on, and passes close beside the camera. The motion
 * that shows a figure's face.
 */
import { registerMotion } from "../motion.js";
import { bandY, besideLens, padFor, threeActs, visitDistance } from "./common.js";

registerMotion("oncoming", (ctx) => {
  const { rng, visit } = ctx;
  const s = visit.side;
  const d = visitDistance(ctx);
  const pad = padFor(ctx);
  const y = bandY(ctx);
  return threeActs(ctx, { x: s * 1.08, y: y + rng.range(0, 0.15), d: d * rng.range(3.5, 5), pad }, { x: s * rng.range(0.2, 0.55), y, d }, besideLens(-0.3 * d, s * 0.9 * d, y, d), d);
});
