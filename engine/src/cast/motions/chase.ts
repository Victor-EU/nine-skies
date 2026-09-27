/**
 * After another figure (D92): on its path, a second or so behind and a
 * little off it, so the two read as one chase — Nezha sent after the
 * monkey (ch. 4). The director casts it when a figure's temperament names
 * a leader who is in the same scene.
 */
import { glanceAt, newPose, registerMotion } from "../motion.js";

registerMotion("chase", (ctx) => {
  const { visit, leader, rng } = ctx;
  const off = { right: rng.range(-0.08, 0.08), up: rng.range(0.03, 0.1) };
  const lead = newPose();
  return {
    pose(flightS, view, out) {
      if (!leader || flightS < visit.fromS || flightS > visit.untilS) return false;
      if (!leader(flightS - visit.lagS, view, lead)) return false;
      const reach = Math.hypot(lead.at.ahead, lead.at.right, lead.at.up);
      out.space = "frame";
      out.world = null;
      out.at.ahead = lead.at.ahead;
      out.at.right = lead.at.right + off.right * reach;
      out.at.up = lead.at.up + off.up * reach;
      out.yaw = lead.yaw;
      out.pitch = lead.pitch;
      out.bank = lead.bank;
      out.presence = lead.presence;
      glanceAt(flightS, visit, out);
      return true;
    },
  };
});
