/**
 * Everything turns to look (D93): a moment before something holy or rare
 * comes in, the curious on stage turn their heads toward where it is coming
 * from, keep them on it as it comes, and hold them there a while. They keep
 * their own way; only their heads are taken.
 */
import { newPose, smooth } from "../motion.js";
import { registerOmen } from "../omens.js";

/** Seconds they keep looking once it has come. */
const HOLD_S = 4;

registerOmen("look", (ctx) => {
  const { reaction, visit, threat } = ctx;
  const own = ctx.build(visit);
  if (!own) return null;
  const foe = newPose();
  return {
    pose(flightS, view, out) {
      if (!own.pose(flightS, view, out)) return false;
      if (flightS < reaction.atS) return true;
      const w = smooth((flightS - reaction.atS) / 0.8) * (1 - smooth(flightS - (reaction.arrivalS + HOLD_S)));
      // Where it is, or, still to come, where it will come in.
      if (w <= out.gaze.weight || !threat(Math.max(flightS, reaction.arrivalS), view, foe)) return true;
      out.gaze.at.ahead = foe.at.ahead;
      out.gaze.at.right = foe.at.right;
      out.gaze.at.up = foe.at.up;
      out.gaze.weight = w;
      return true;
    },
  };
});
