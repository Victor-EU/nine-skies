/**
 * The ways a figure can move through the picture (D92), by name: what the
 * content gate holds a cue's `motion:` to, with no geometry and no three.js,
 * as `kinds.ts` is for figures. Every name here has a builder in `motions/`,
 * and the cast tests hold the two lists to each other.
 *
 * - `anchor`: a monument's; it stands at its place in the world.
 * - `hold`: the first companions' (F103); at its offset for the whole cue.
 * - `cross`: in at one side of the picture, out at the other.
 * - `overtake`: from behind the lens, past it, and away ahead.
 * - `oncoming`: out of the distance, toward the lens, and past it.
 * - `rise`: up from under the frame, over, and down again.
 * - `stoop`: down from over the frame, across, and away.
 * - `circle`: round the camera, behind it on both sides.
 * - `blink`: Wukong's somersault; gone in a flash, and back somewhere else.
 * - `chase`: after another figure, on its path, a second behind. The
 *   director casts it from a figure's temperament; a cue cannot name it.
 */
export const MOTION_KINDS = ["anchor", "hold", "cross", "overtake", "oncoming", "rise", "stoop", "circle", "blink", "chase"] as const;

export type MotionKind = (typeof MOTION_KINDS)[number];

/** The motions that place a figure in the world rather than in the camera's frame. */
export const WORLD_MOTIONS: readonly MotionKind[] = ["anchor"];

/** The motions a cue may name: `chase` needs a leader, which only the director knows. */
export const CUE_MOTIONS: readonly MotionKind[] = MOTION_KINDS.filter((m) => m !== "chase");

/** The motions that pass through the picture and leave: what the director draws a visit from. */
export const TRANSIT_MOTIONS: readonly MotionKind[] = ["cross", "overtake", "oncoming", "rise", "stoop", "circle", "blink"];

export function isMotionKind(name: string): name is MotionKind {
  return (MOTION_KINDS as readonly string[]).includes(name);
}

/** Whether a motion can carry a figure of this role: the world's for a monument, the frame's for a companion. */
export function motionSuits(motion: MotionKind, role: "monument" | "companion"): boolean {
  return WORLD_MOTIONS.includes(motion) === (role === "monument");
}
