/**
 * The first companions' way (F103), kept for a cue that asks for it: at
 * its offset in the camera's frame for the whole cue, turned as the cue
 * says, fading in and out at the ends.
 */
import { FADE_S } from "../fade.js";
import { registerMotion } from "../motion.js";

registerMotion("hold", (ctx) => {
  const { cue, visit } = ctx;
  const yaw = (cue.facingDeg * Math.PI) / 180;
  return {
    pose(flightS, _view, out) {
      if (!cue.offset || flightS < visit.fromS || flightS > visit.untilS) return false;
      out.space = "frame";
      out.world = null;
      out.at.ahead = cue.offset.aheadM;
      out.at.right = cue.offset.rightM;
      out.at.up = cue.offset.upM;
      out.yaw = yaw;
      out.pitch = 0;
      out.bank = 0;
      out.presence = Math.min(1, (flightS - visit.fromS) / FADE_S, (visit.untilS - flightS) / FADE_S);
      return true;
    },
  };
});
