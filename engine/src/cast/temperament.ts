/**
 * How each figure likes to move (D92): the motions the director draws its
 * visits from, and how fast, how high and how often. A cue may name its
 * own motions instead; a figure with no entry here moves as `GENERIC` does,
 * so a new figure is cast the moment it is registered.
 *
 * This is the figure's character, not its body, so it lives apart from the
 * builders: a figure knows how to flap and walk, and nothing here knows a
 * mesh. The weights are how often each motion is drawn against the others.
 *
 * The rules the table keeps:
 * - playfulness is Wukong's and Nezha's alone: the somersault and the chase;
 * - figures of living faiths and the Queen Mother move slowly and are never
 *   drawn close (`stately`): they approach, cross and descend;
 * - birds and dragons may pitch with their path; walkers stay nearly level.
 */
import type { FigureKind } from "./kinds.js";
import type { MotionKind } from "./moves.js";

export interface Temperament {
  /** Motions to draw a visit from, by weight. */
  readonly moves: Readonly<Partial<Record<MotionKind, number>>>;
  /** Where in the picture it keeps, bottom to top, in the frame's own -1..1. */
  readonly band: readonly [number, number];
  /** A visit's length against the motion's own: above 1 is slower. */
  readonly pace: number;
  /** The most it pitches with its path, degrees. */
  readonly maxPitchDeg: number;
  /** Seconds of empty sky between its visits, least and most. */
  readonly gapS: readonly [number, number];
  /** Never drawn close to the lens, never hurried. */
  readonly stately: boolean;
  /** A figure it goes after when both are cast in a scene. */
  readonly chases: FigureKind | null;
  /**
   * Whether it faces the way it goes. A creature does; a thing carried on
   * the wind keeps the facing its cue gives it, broadside to the lens, or a
   * string of flags crossing the picture is a stick seen end-on.
   */
  readonly facesPath: boolean;
}

const base: Temperament = {
  moves: { cross: 2, overtake: 1, oncoming: 1 },
  band: [-0.5, 0.3],
  pace: 1,
  maxPitchDeg: 15,
  gapS: [8, 24],
  stately: false,
  chases: null,
  facesPath: true,
};

const t = (over: Partial<Temperament>): Temperament => ({ ...base, ...over });

/** For a figure the table does not name. */
export const GENERIC: Temperament = base;

export const TEMPERAMENTS: Readonly<Partial<Record<FigureKind, Temperament>>> = {
  // Serpents of the cloud: they break the surface below, arc and go under.
  dragon: t({ moves: { rise: 3, cross: 2, oncoming: 1 }, band: [-0.6, 0.3], pace: 1.2, maxPitchDeg: 35 }),
  // Sent to bring the monkey in (ch. 4): after him wherever he goes.
  nezha: t({ moves: { overtake: 2, cross: 2, stoop: 1 }, band: [-0.3, 0.5], pace: 0.8, maxPitchDeg: 20, chases: "wukong" }),
  // A somersault is 108,000 li: he is never where he was.
  wukong: t({ moves: { blink: 3, circle: 1, cross: 1 }, band: [-0.4, 0.5], pace: 0.9, gapS: [4, 14] }),
  pilgrims: t({ moves: { cross: 3, oncoming: 2 }, band: [-0.7, 0], pace: 1.5, maxPitchDeg: 4 }),
  xiwangmu: t({ moves: { cross: 2, oncoming: 1, stoop: 1 }, band: [-0.2, 0.5], pace: 1.4, maxPitchDeg: 8, stately: true }),
  cranes: t({ moves: { cross: 3, overtake: 2, oncoming: 1 }, band: [-0.5, 0.4], maxPitchDeg: 20 }),
  qilin: t({ moves: { cross: 2, oncoming: 2 }, band: [-0.5, 0.1], pace: 1.1, maxPitchDeg: 10 }),
  phoenix: t({ moves: { stoop: 2, cross: 2, overtake: 1 }, band: [-0.2, 0.6], maxPitchDeg: 30 }),
  // Tiger Leaping Gorge is on the rail: it leaps.
  tiger: t({ moves: { cross: 3, rise: 1 }, band: [-0.6, 0], pace: 0.7, maxPitchDeg: 20 }),
  turtle: t({ moves: { oncoming: 2, cross: 2 }, band: [-0.6, 0], pace: 1.6, maxPitchDeg: 5 }),
  magpie: t({ moves: { circle: 2, cross: 2, stoop: 1 }, band: [-0.4, 0.4], pace: 0.8, maxPitchDeg: 25 }),
  // Its wings like clouds hung from the sky: it passes over.
  peng: t({ moves: { overtake: 3, stoop: 1 }, band: [0, 0.7], pace: 1.3, maxPitchDeg: 20 }),
  yaoji: t({ moves: { cross: 2, oncoming: 1, stoop: 1 }, band: [-0.2, 0.5], pace: 1.3, maxPitchDeg: 10 }),
  jingwei: t({ moves: { stoop: 2, cross: 2, overtake: 1 }, band: [-0.3, 0.5], pace: 0.8, maxPitchDeg: 30 }),
  // Leaping at the Dragon Gate.
  carp: t({ moves: { rise: 4, cross: 1 }, band: [-0.7, 0.1], pace: 0.8, maxPitchDeg: 45 }),
  niumowang: t({ moves: { oncoming: 2, cross: 2 }, band: [-0.6, 0], pace: 1.2, maxPitchDeg: 8 }),
  // Crossing the sea, each by his own power.
  baxian: t({ moves: { cross: 3, oncoming: 1 }, band: [-0.5, 0.2], pace: 1.5, maxPitchDeg: 5 }),
  elephant: t({ moves: { cross: 2, oncoming: 1 }, band: [-0.7, -0.1], pace: 1.6, maxPitchDeg: 5 }),
  egrets: t({ moves: { cross: 3, overtake: 1, rise: 1 }, band: [-0.6, 0.2], maxPitchDeg: 20 }),
  sanduo: t({ moves: { cross: 2, oncoming: 2 }, band: [-0.4, 0.2], pace: 1.2, maxPitchDeg: 8, stately: true }),
  guanyin: t({ moves: { oncoming: 2, stoop: 1, cross: 1 }, band: [-0.1, 0.5], pace: 1.6, maxPitchDeg: 5, stately: true }),
  // The flags go where the wind takes them.
  lungta: t({ moves: { cross: 3, overtake: 1 }, band: [-0.1, 0.6], maxPitchDeg: 10, stately: true, facesPath: false }),
  miyolangsangma: t({ moves: { cross: 2, oncoming: 1 }, band: [-0.5, 0.1], pace: 1.3, maxPitchDeg: 8, stately: true }),
};

export function temperamentOf(kind: string): Temperament {
  return TEMPERAMENTS[kind as FigureKind] ?? GENERIC;
}
