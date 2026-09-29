/**
 * With another figure (F128): Wukong ahead of his master's horse, on his
 * cloud, wherever the pilgrims go. The painting of the pilgrims is the
 * monk, Bajie and Sha; the monkey is his own figure, and without this he
 * was somewhere else in the sky, or in another scene.
 *
 * It is the other's pose, moved across the line of sight toward the way
 * the other faces in the picture by a share of the other's size (the
 * temperament's `escorts`), and lifted a little over its road; lifted over
 * the other instead while it comes straight at the lens or goes straight
 * away, when ahead of it would be on top of it. The painted cards stand
 * face on whichever way a figure heads, so ahead is across the picture, not
 * nearer the lens. It comes out of the other as the other comes into the
 * picture, and goes back into it as the other leaves, so it is never seen
 * where the other is not.
 *
 * It keeps in the picture while the other is in it: ahead would put it past
 * the edge whenever the other walks toward the nearer one, which a line's
 * pause often does, so short of the edge it closes in and rises over the
 * other instead, and goes out with it; and it rises no higher than keeps
 * its crown under the top, where the other goes high in the picture (the
 * Roof's party rides at the horizon). Where there is no room over the
 * other either, it keeps further ahead, part way past the edge, rather
 * than stand in front of the monk; and where there is not even room level
 * with it, it comes down ahead of the horse, as far as it is clear of it
 * (F130). It stands a hair nearer the lens than the other, the same in the
 * picture, so where the two overlap it is cleanly in front. The director
 * casts it; a cue cannot name it.
 */
import { acrossSight, glanceAt, keptBeside, newPose, registerMotion, sideFacing, type FramePoint } from "../motion.js";
/** How far across the picture its middle may go, of the half width, before it closes in: its own half width short of the edge. */
export const ESCORT_KEEP_X = 0.8;
/** How far it may go when there is no room over the other: part way past the edge. */
export const ESCORT_CROWDED_X = 0.95;
/** How high in the picture its top may go, of the half height, before it rises no further over the other. */
export const ESCORT_KEEP_Y = 0.95;
/** How far it may come down, of its height, where the other rides so high that even level with it its top is past that (F130). */
export const ESCORT_DOWN = 1;
const KEEP = { x: ESCORT_KEEP_X, crowdedX: ESCORT_CROWDED_X, y: ESCORT_KEEP_Y, down: ESCORT_DOWN } as const;
/** Its top over its feet, of its size: the size is feet to crown, and Wukong's plumes stand over the crown. */
const TOP = 1.15;
/** How much nearer the lens than the other it stands, a share of the distance. */
export const ESCORT_NEARER = 0.01;

registerMotion("escort", (ctx) => {
  const { visit, leader, leaderCue, temperament } = ctx;
  const e = temperament.escorts;
  const lead = newPose();
  return {
    pose(flightS, view, out) {
      if (!leader || !leaderCue || !e || flightS < visit.fromS || flightS > visit.untilS) return false;
      if (!leader(flightS, view, lead) || lead.space !== "frame") return false;
      // Its size as the layer draws it, and no way out of it until it is in the picture.
      const size = leaderCue.sizeM * (0.6 + 0.4 * lead.presence) * lead.presence;
      const top = ctx.cue.sizeM * (0.6 + 0.4 * lead.presence) * TOP;
      // At a side of the other, rising that share of the way over it.
      const place = (side: number, over: number, at: FramePoint): void => {
        acrossSight(lead.at, e.ahead * size * side, at);
        at.up += size * (e.above + e.over * risen(e.ahead * Math.abs(side), e.rise) * over);
      };
      const { side, over, lower } = keptBeside(sideFacing(lead.yaw), KEEP, top, visit.side, view, place, out);
      out.space = "frame";
      out.world = null;
      place(side, over, out.at);
      out.at.up -= lower;
      out.at.ahead *= 1 - ESCORT_NEARER;
      out.at.right *= 1 - ESCORT_NEARER;
      out.at.up *= 1 - ESCORT_NEARER;
      out.yaw = lead.yaw;
      out.pitch = lead.pitch;
      out.bank = lead.bank;
      out.presence = lead.presence;
      glanceAt(flightS, visit, out);
      return true;
    },
  };
});

/** How far over the other it has risen, `ahead` of the other's size in front of its middle: 0 clear of it to 1 over its highest. */
export function risen(ahead: number, rise: readonly [number, number]): number {
  return Math.max(0, Math.min(1, (rise[0] - ahead) / (rise[0] - rise[1])));
}
