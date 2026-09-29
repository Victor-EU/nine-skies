/**
 * In another figure's way (F130): Nezha barring the Bull Demon King's way
 * over the Flaming Mountains (ch. 61), with Wukong chasing him from behind,
 * and it is Nezha who takes him. Two after the one figure had nowhere to go
 * but on each other.
 *
 * It keeps to one side of the other for the whole visit: the side the other
 * faces while it stops. Coming in, that is ahead of it, and it goes the
 * other's way; while the other stops it turns to face it, a body's length
 * off across the picture, as a chaser keeps behind (`CHASE_APART`); and
 * when the other turns and goes, it is behind it, and goes after it. So it
 * never goes backwards and never passes over the other. It keeps in the
 * picture as a chaser does (`keptBeside`): short of the edge it closes in
 * and rises over the other, by the other's painted height. The director
 * casts it with each of the other's visits that stops, for the same
 * seconds; a cue cannot name it.
 */
import type { CastCue } from "../../film/scene.js";
import { acrossSight, glanceAt, keptBeside, newPose, registerMotion, windowWeight, type FramePoint } from "../motion.js";
import { CHASE_APART, CHASE_CLEAR, CHASE_KEEP } from "./chase.js";

/** Seconds into the other's stop, and before its end, that it is turned round to face it. */
const TURN_S = 0.6;

registerMotion("block", (ctx) => {
  const { visit, leader, leaderCue, cue } = ctx;
  const height = (c: CastCue): number => ctx.heightOf?.(c) ?? 1;
  const lead = newPose();
  const stopped = newPose();
  const [a, b] = visit.dwell ?? [visit.fromS, visit.untilS];
  return {
    pose(flightS, view, out) {
      if (!leader || !leaderCue || flightS < visit.fromS || flightS > visit.untilS) return false;
      if (!leader(flightS, view, lead) || lead.space !== "frame") return false;
      // The side the other faces while it stops, -1 left or 1 right.
      const faces = leader((a + b) / 2, view, stopped) ? Math.sin(stopped.yaw) : Math.sin(lead.yaw);
      const side = faces < 0 ? -1 : 1;
      // As the layer draws the two of them.
      const drawn = (0.6 + 0.4 * lead.presence) * lead.presence;
      const other = leaderCue.sizeM * drawn;
      const apart = CHASE_APART * (other + cue.sizeM * drawn);
      const tall = other * height(leaderCue);
      const place = (s: number, over: number, at: FramePoint): void => {
        acrossSight(lead.at, apart * s, at);
        at.up += tall * Math.min(1, (1 - Math.abs(s)) / (1 - CHASE_CLEAR)) * over;
      };
      const kept = keptBeside(side, CHASE_KEEP, cue.sizeM * drawn * height(cue), side, view, place, out);
      out.space = "frame";
      out.world = null;
      place(kept.side, kept.over, out.at);
      out.at.up -= kept.lower;
      // Turned to face the other while it stops, going its way otherwise.
      const facing = windowWeight(flightS, visit.dwell, TURN_S) > 0.5 && Math.sin(lead.yaw) * side > 0;
      out.yaw = facing ? -lead.yaw : lead.yaw;
      out.pitch = lead.pitch;
      out.bank = lead.bank;
      out.presence = lead.presence;
      glanceAt(flightS, visit, out);
      return true;
    },
  };
});
