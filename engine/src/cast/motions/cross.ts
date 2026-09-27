/**
 * Across the picture (D92): in at one side, out at the other, on a slight
 * arc, side-on the whole way — the way a scroll painting shows a procession
 * or a flight of cranes.
 */
import { registerMotion } from "../motion.js";
import { bandY, padFor, threeActs, visitDistance } from "./common.js";

registerMotion("cross", (ctx) => {
  const { rng, visit } = ctx;
  const s = visit.side;
  const d = visitDistance(ctx);
  const pad = padFor(ctx);
  const y = bandY(ctx);
  return threeActs(
    ctx,
    { x: -s * 1.08, y: y + rng.range(-0.1, 0.1), d: d * rng.range(0.9, 1.2), pad },
    { x: s * rng.range(-0.25, 0.3), y: y + rng.range(0.04, 0.18), d },
    { x: s * 1.08, y: y + rng.range(-0.1, 0.12), d: d * rng.range(0.8, 1.1), pad },
    d,
  );
});
