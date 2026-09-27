/**
 * The ways a figure can move (D92, D93), by name, with what the director
 * and the content gate need to know of each: what the gate holds a cue's
 * `motion:` to, with no geometry and no three.js, as `kinds.ts` is for
 * figures. Every name here has a builder in `motions/`, and the cast tests
 * hold the two lists to each other. A new motion is a row here and a file
 * there; nothing else in the cast names one.
 */

export interface MotionTraits {
  /** Where it puts the figure: at a place in the world, or in the camera's frame. */
  readonly space: "world" | "frame";
  /** It comes and goes inside its cue, so the director draws visits of it; otherwise it lasts the cue. */
  readonly transit: boolean;
  /** A cue may name it; false for one only the director can cast. */
  readonly cueable: boolean;
  /** A visit's own length before the figure's pace and any pause, seconds; 0 where the cue or another figure sets it. */
  readonly naturalS: number;
  /** Seconds into a visit it is first seen: its arrival, which an omen comes before. */
  readonly arriveS: number;
}

export const MOTIONS = {
  /** A monument's: it stands at its place in the world for its whole cue. */
  anchor: { space: "world", transit: false, cueable: true, naturalS: 0, arriveS: 0 },
  /** The first companions' (F103): at its offset for the whole cue. */
  hold: { space: "frame", transit: false, cueable: true, naturalS: 0, arriveS: 0 },
  /** In at one side of the picture, out at the other. */
  cross: { space: "frame", transit: true, cueable: true, naturalS: 7, arriveS: 1 },
  /** From behind the lens, past it, and away ahead. */
  overtake: { space: "frame", transit: true, cueable: true, naturalS: 6, arriveS: 0.8 },
  /** Out of the distance, toward the lens, and past it. */
  oncoming: { space: "frame", transit: true, cueable: true, naturalS: 7, arriveS: 1.5 },
  /** Up from under the frame, over, and down again. */
  rise: { space: "frame", transit: true, cueable: true, naturalS: 5, arriveS: 0.8 },
  /** Down from over the frame, across, and away. */
  stoop: { space: "frame", transit: true, cueable: true, naturalS: 5, arriveS: 0.8 },
  /** Round the camera, behind it on both sides. */
  circle: { space: "frame", transit: true, cueable: true, naturalS: 12, arriveS: 1.5 },
  /** Wukong's somersault: gone in a flash, and back somewhere else. No warning comes before it. */
  blink: { space: "frame", transit: true, cueable: true, naturalS: 9, arriveS: 0 },
  /**
   * After another figure, on its path, a second behind. The director casts
   * it from a figure's temperament; a cue cannot name it.
   */
  chase: { space: "frame", transit: false, cueable: false, naturalS: 0, arriveS: 0 },
  /**
   * A monument's that comes and goes (D93): up out of what lies under its
   * place - the cloud sea, the water - to stand there a while, and down
   * again, on its own timing. The rise and the dive are its natural length;
   * the stand between them is drawn.
   */
  surface: { space: "world", transit: true, cueable: true, naturalS: 11, arriveS: 2.5 },
} as const satisfies Readonly<Record<string, MotionTraits>>;

export type MotionKind = keyof typeof MOTIONS;

export const MOTION_KINDS = Object.keys(MOTIONS) as readonly MotionKind[];

const kinds = (test: (t: MotionTraits) => boolean): readonly MotionKind[] => MOTION_KINDS.filter((m) => test(MOTIONS[m]));

/** The motions that place a figure in the world rather than in the camera's frame. */
export const WORLD_MOTIONS: readonly MotionKind[] = kinds((t) => t.space === "world");

/** The motions a cue may name: `chase` needs a leader, which only the director knows. */
export const CUE_MOTIONS: readonly MotionKind[] = kinds((t) => t.cueable);

/** The motions that pass through the picture and leave: what the director draws a companion's visit from. */
export const TRANSIT_MOTIONS: readonly MotionKind[] = kinds((t) => t.transit && t.space === "frame");

/** The motions by which a monument comes and goes: what the director draws a monument's visit from. */
export const WORLD_TRANSIT_MOTIONS: readonly MotionKind[] = kinds((t) => t.transit && t.space === "world");

export function isMotionKind(name: string): name is MotionKind {
  return Object.hasOwn(MOTIONS, name);
}

/** Whether a motion can carry a figure of this role: the world's for a monument, the frame's for a companion. */
export function motionSuits(motion: MotionKind, role: "monument" | "companion"): boolean {
  return WORLD_MOTIONS.includes(motion) === (role === "monument");
}
