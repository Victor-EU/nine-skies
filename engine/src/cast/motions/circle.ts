/**
 * Round the camera (D92): in from behind on one side, across the picture
 * ahead, and back behind on the other, as a magpie or the monkey circles
 * something it is curious about.
 */
import { registerMotion } from "../motion.js";
import { bandY, besideLens, threeActs, visitDistance } from "./common.js";

registerMotion("circle", (ctx) => {
  const { rng, visit } = ctx;
  const s = visit.side;
  const d = visitDistance(ctx);
  const y = bandY(ctx);
  return threeActs(ctx, besideLens(-0.2 * d, -s * 0.9 * d, y, d), { x: 0, y: y + rng.range(0.05, 0.2), d: d * 1.15 }, besideLens(-0.2 * d, s * 0.9 * d, y, d), d, {
    before: [[0.5, { x: -s * 0.7, y, d }]],
    after: [[0.5, { x: s * 0.7, y, d }]],
  });
});
