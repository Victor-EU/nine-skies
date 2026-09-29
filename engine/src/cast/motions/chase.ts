/**
 * After another figure (D92): on its path, a second or so behind and a
 * little off it, so the two read as one chase — Nezha sent after the
 * monkey (ch. 4), and after the Bull Demon King at the Flaming Mountains
 * (ch. 61, F129). The director casts it when a figure's temperament names
 * a leader who is in the same scene.
 *
 * It keeps a body's length behind the other across the picture as well
 * (F129): a second behind on a path the other pauses on for its line is
 * where the other stands, and there the Bull Demon King, nearly three
 * times Nezha's size, hid him but for his head over its back. While the
 * other comes straight at the lens or goes straight away it keeps over it
 * instead, by the other's size, since half of it stood Nezha on Wukong's
 * head. And it keeps in the picture while the other is in it, as the
 * escort does (`keptBeside`): closing in and rising over the other where
 * behind it is past the edge (the Bull pauses for his line at the
 * picture's edge, facing in), rising no higher than keeps its top in the
 * picture (Wukong passes close over Huangshan), and further behind where
 * there is no room over the other.
 */
import { acrossSight, glanceAt, keptBeside, newPose, registerMotion, sideFacing, type FramePoint } from "../motion.js";

/** Centre to centre behind the other, of the two sizes together: the two half-lengths and a little air. */
export const CHASE_APART = 0.55;
/** How far out, of the way behind, it is clear of the other across the picture and need not be over it: the two half-widths of the paintings' figures, a little over half. */
export const CHASE_CLEAR = 0.55;
/** Where it may go in the picture, as the escort (F128): its middle across, and further when crowded; its top up. */
export const CHASE_KEEP = { x: 0.8, crowdedX: 0.95, y: 0.95 } as const;
/** Its top over its feet, of its size: Nezha's sash and flames stand over his crown. */
const TOP = 1.1;

registerMotion("chase", (ctx) => {
  const { visit, leader, leaderCue, cue, rng } = ctx;
  const off = { right: rng.range(-0.08, 0.08), up: rng.range(0.03, 0.1) };
  const lead = newPose();
  return {
    pose(flightS, view, out) {
      if (!leader || flightS < visit.fromS || flightS > visit.untilS) return false;
      if (!leader(flightS - visit.lagS, view, lead)) return false;
      const reach = Math.hypot(lead.at.ahead, lead.at.right, lead.at.up);
      // As the layer draws the two of them.
      const drawn = (0.6 + 0.4 * lead.presence) * lead.presence;
      const other = leaderCue ? leaderCue.sizeM * drawn : 0;
      const apart = CHASE_APART * (other + cue.sizeM * drawn);
      // At a side of the other, -1 to 1 across the picture, 0 over it, rising that share of the way over it.
      const place = (side: number, over: number, at: FramePoint): void => {
        acrossSight(lead.at, apart * side, at);
        at.right += off.right * reach;
        at.up += (off.up * reach + other * Math.min(1, (1 - Math.abs(side)) / (1 - CHASE_CLEAR))) * over;
      };
      const { side, over } = keptBeside(-sideFacing(lead.yaw), CHASE_KEEP, cue.sizeM * drawn * TOP, visit.side, view, place, out);
      out.space = "frame";
      out.world = null;
      place(side, over, out.at);
      out.yaw = lead.yaw;
      out.pitch = lead.pitch;
      out.bank = lead.bank;
      out.presence = lead.presence;
      glanceAt(flightS, visit, out);
      return true;
    },
  };
});
