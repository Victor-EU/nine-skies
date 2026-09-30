/**
 * In another figure's train (F136): the egrets of the Li after the phoenix,
 * the hundred birds come to pay the king of birds its court (百鸟朝凤).
 * Whenever the other comes, it comes too, a moment behind on the other's
 * own path, and behind it across the picture past the length of it, so the
 * flock streams after the plumes rather than through them, and a little
 * below the other's line, as the plumes fall from it.
 *
 * It keeps in the picture while the other is in it, as a chaser does
 * (`keptBeside`): closing in and rising over the other where behind it is
 * past the edge (the phoenix pauses for its line wherever its author put
 * it), over it while the other comes straight at the lens or goes straight
 * away, rising no higher than keeps its top in the picture, and lower where
 * even level with the other its top would be out. A chaser hunts; a train
 * attends: it goes after every visit of the other, not most, a little
 * further behind, and below rather than over the other's line. The director
 * casts it from a figure's temperament; a cue cannot name it.
 */
import type { CastCue } from "../../film/scene.js";
import { acrossSight, glanceAt, keptBeside, newPose, registerMotion, sideFacing, type FramePoint } from "../motion.js";

/**
 * Centre to centre behind the other, of the two sizes together: past the
 * other's plumes, and a little air. A flock is drawn smaller than its
 * size, which is its loop's reach, so a share nearer a chaser's.
 */
export const TRAIN_APART = 0.45;
/** How far out, of the way behind, it is clear of the other across the picture and need not be over it. */
export const TRAIN_CLEAR = 0.55;
/** How far below the other's line it keeps, a share of its distance from the lens, least and most. */
export const TRAIN_BELOW = [0.02, 0.06] as const;
/** Where it may go in the picture, as the escort and the chaser (F128–F130). */
export const TRAIN_KEEP = { x: 0.8, crowdedX: 0.95, y: 0.95, down: 1 } as const;

registerMotion("train", (ctx) => {
  const { visit, leader, leaderCue, cue, rng } = ctx;
  const height = (c: CastCue): number => ctx.heightOf?.(c) ?? 1;
  const off = { right: rng.range(-0.04, 0.04), below: rng.range(...TRAIN_BELOW) };
  const lead = newPose();
  return {
    pose(flightS, view, out) {
      if (!leader || flightS < visit.fromS || flightS > visit.untilS) return false;
      if (!leader(flightS - visit.lagS, view, lead)) return false;
      const reach = Math.hypot(lead.at.ahead, lead.at.right, lead.at.up);
      // As the layer draws the two of them.
      const drawn = (0.6 + 0.4 * lead.presence) * lead.presence;
      const other = leaderCue ? leaderCue.sizeM * drawn : 0;
      const own = cue.sizeM * drawn;
      const apart = TRAIN_APART * (other + own);
      const tall = leaderCue ? other * height(leaderCue) : 0;
      // At a side of the other, -1 to 1 across the picture, 0 over it: below its line out there, rising that share of the way over it nearer in.
      const place = (side: number, over: number, at: FramePoint): void => {
        acrossSight(lead.at, apart * side, at);
        at.right += off.right * reach;
        at.up += -off.below * reach * Math.abs(side) + tall * Math.min(1, (1 - Math.abs(side)) / (1 - TRAIN_CLEAR)) * over;
      };
      const { side, over, lower } = keptBeside(-sideFacing(lead.yaw), TRAIN_KEEP, own * height(cue), visit.side, view, place, out);
      out.space = "frame";
      out.world = null;
      place(side, over, out.at);
      out.at.up -= lower;
      out.yaw = lead.yaw;
      out.pitch = lead.pitch;
      out.bank = lead.bank;
      out.presence = lead.presence;
      glanceAt(flightS, visit, out);
      return true;
    },
  };
});
