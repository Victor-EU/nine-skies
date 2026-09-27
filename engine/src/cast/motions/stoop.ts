/**
 * Down from over the frame (D92): a dive across the picture from above,
 * levelling out low, and away off a side — a Peng's stoop, a phoenix
 * coming down to the wutong, Guanyin descending.
 */
import { registerMotion } from "../motion.js";
import { bandY, padFor, threeActs, visitDistance } from "./common.js";

registerMotion("stoop", (ctx) => {
  const { rng, visit, temperament } = ctx;
  const s = visit.side;
  const d = visitDistance(ctx);
  const pad = padFor(ctx);
  const low = temperament.band[0] + rng.range(0, 0.2);
  return threeActs(ctx, { x: -s * rng.range(0.2, 0.7), y: 1.08, d: d * 1.2, pad }, { x: s * rng.range(-0.05, 0.3), y: low, d }, { x: s * 1.08, y: bandY(ctx), d: d * 0.9, pad }, d);
});
