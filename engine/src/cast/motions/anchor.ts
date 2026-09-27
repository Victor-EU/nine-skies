/**
 * A monument's (D91, D92): it stands at its place in the world, turned to
 * its bearing, and fades in and out at its cue's ends. The layer finds the
 * ground under it.
 */
import { FADE_S } from "../fade.js";
import { glanceAt, registerMotion } from "../motion.js";

registerMotion("anchor", (ctx) => {
  const { cue, visit } = ctx;
  const yaw = (cue.facingDeg * Math.PI) / 180;
  return {
    pose(flightS, _view, out) {
      if (!cue.at || flightS < visit.fromS || flightS > visit.untilS) return false;
      out.space = "world";
      out.world = { lat: cue.at.lat, lon: cue.at.lon, aboveGroundM: cue.at.aboveGroundM };
      out.yaw = yaw;
      out.pitch = 0;
      out.bank = 0;
      out.presence = Math.min(1, (flightS - visit.fromS) / FADE_S, (visit.untilS - flightS) / FADE_S);
      glanceAt(flightS, visit, out);
      return true;
    },
  };
});
