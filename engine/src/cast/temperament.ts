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
 * - playfulness is Wukong's and Nezha's alone: the somersault and the chase,
 *   Nezha after the monkey in Heaven and after the Bull Demon King at the
 *   Flaming Mountains (F129);
 * - Wukong goes ahead of his master wherever the pilgrims are cast with
 *   him (F128): the painting of the pilgrims is the monk, Bajie and Sha,
 *   and he is his own figure;
 * - figures of living faiths and the Queen Mother move slowly and are never
 *   drawn close (`stately`): they approach, cross and descend;
 * - birds and dragons may pitch with their path; walkers stay nearly level;
 * - a dragon surfaces where its cue stands it (D93): up out of the cloud
 *   sea, a while, and under again;
 * - what is big and hungry sends the birds flying before it comes, and
 *   what is holy makes everything turn to look (D93, the omens): the
 *   birds scatter, and the rest are curious;
 * - a figure with no head, or with none it should turn, is not curious.
 */
import type { FigureKind } from "./kinds.js";
import type { MotionKind } from "./moves.js";
import type { OmenKind } from "./omens.js";

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
  /** Figures it goes after, the first of them cast in a scene at the same time as it (F129). */
  readonly chases: readonly FigureKind[];
  /**
   * A figure it goes with when both are cast at once (F128): whenever the
   * other comes, it comes too, `ahead` of the other's size in front of the
   * other's middle, on the side the other faces in the picture, and
   * `above` of it over the other's feet. Closer in than that it rises, by
   * `over` more, over the other: from `rise[0]` ahead of the other's middle,
   * where it begins to be over the other's front, to `rise[1]`, where it is
   * over the other's highest (F129), all of it while the other comes
   * straight at the lens or goes straight away.
   */
  readonly escorts: { readonly figure: FigureKind; readonly ahead: number; readonly above: number; readonly over: number; readonly rise: readonly [number, number] } | null;
  /**
   * Whether it faces the way it goes. A creature does; a thing carried on
   * the wind keeps the facing its cue gives it, broadside to the lens, or a
   * string of flags crossing the picture is a stick seen end-on.
   */
  readonly facesPath: boolean;
  /** How often a visit of its turns its head to the lens on the way, 0 to 1 (D93). */
  readonly curiosity: number;
  /** It takes fright at an arrival that scatters the birds. */
  readonly skittish: boolean;
  /** What its own arrival brings, by weight: the omens the director may draw before it comes. */
  readonly omens: Readonly<Partial<Record<OmenKind, number>>>;
}

const base: Temperament = {
  moves: { cross: 2, overtake: 1, oncoming: 1 },
  band: [-0.5, 0.3],
  pace: 1,
  maxPitchDeg: 15,
  gapS: [8, 24],
  stately: false,
  chases: [],
  escorts: null,
  facesPath: true,
  curiosity: 0.35,
  skittish: false,
  omens: {},
};

const t = (over: Partial<Temperament>): Temperament => ({ ...base, ...over });

/** For a figure the table does not name. */
export const GENERIC: Temperament = base;

export const TEMPERAMENTS: Readonly<Partial<Record<FigureKind, Temperament>>> = {
  // Serpents of the cloud: they break the surface below, arc and go under;
  // standing, they come up out of the cloud sea and go down into it again.
  dragon: t({ moves: { rise: 3, cross: 2, oncoming: 1, surface: 1 }, band: [-0.6, 0.3], pace: 1.2, maxPitchDeg: 35, curiosity: 0.5, omens: { scatter: 3, look: 1 } }),
  // Sent to bring the monkey in (ch. 4): after him wherever he goes. At
  // the Flaming Mountains he is sent to help him (ch. 61) and goes after
  // the Bull Demon King instead, and it is he who ends the fight.
  nezha: t({ moves: { overtake: 2, cross: 2, stoop: 1 }, band: [-0.3, 0.5], pace: 0.8, maxPitchDeg: 20, chases: ["niumowang", "wukong"], curiosity: 0.4 }),
  // A somersault is 108,000 li: he is never where he was.
  // He looks at you. He always looks at you.
  // With the pilgrims he leads the way on his cloud, just past the horse's
  // nose (the painting's nose is 0.48 of its size ahead of its middle, and
  // his staff reaches back 0.13), a little over their road. Over them, his
  // cloud (0.094 either side of his feet, 0.066 under them) clears the
  // painting's outline: the horse's ears, 0.44 with the cloud, from 0.52
  // ahead of its middle in, and the monk's staff, 0.58, the highest (F129).
  wukong: t({
    moves: { blink: 3, circle: 1, cross: 1 },
    band: [-0.4, 0.5],
    pace: 0.9,
    gapS: [4, 14],
    curiosity: 0.65,
    escorts: { figure: "pilgrims", ahead: 0.7, above: 0.1, over: 0.52, rise: [0.665, 0.525] },
  }),
  pilgrims: t({ moves: { cross: 3, oncoming: 2 }, band: [-0.7, 0], pace: 1.5, maxPitchDeg: 4, curiosity: 0.3 }),
  xiwangmu: t({ moves: { cross: 2, oncoming: 1, stoop: 1 }, band: [-0.2, 0.5], pace: 1.4, maxPitchDeg: 8, stately: true, curiosity: 0.25, omens: { look: 1 } }),
  cranes: t({ moves: { cross: 3, overtake: 2, oncoming: 1 }, band: [-0.5, 0.4], maxPitchDeg: 20, curiosity: 0.3, skittish: true }),
  // Seen once in an age, and everything stops to see it.
  qilin: t({ moves: { cross: 2, oncoming: 2 }, band: [-0.5, 0.1], pace: 1.1, maxPitchDeg: 10, curiosity: 0.4, omens: { look: 2 } }),
  // A hundred birds turn to the phoenix (百鸟朝凤).
  phoenix: t({ moves: { stoop: 2, cross: 2, overtake: 1 }, band: [-0.2, 0.6], maxPitchDeg: 30, curiosity: 0.3, omens: { look: 2 } }),
  // Tiger Leaping Gorge is on the rail: it leaps.
  tiger: t({ moves: { cross: 3, rise: 1 }, band: [-0.6, 0], pace: 0.7, maxPitchDeg: 20, curiosity: 0.5, omens: { scatter: 2, look: 1 } }),
  turtle: t({ moves: { oncoming: 2, cross: 2 }, band: [-0.6, 0], pace: 1.6, maxPitchDeg: 5, curiosity: 0.3 }),
  magpie: t({ moves: { circle: 2, cross: 2, stoop: 1 }, band: [-0.4, 0.4], pace: 0.8, maxPitchDeg: 25, curiosity: 0.5, skittish: true }),
  // Its wings like clouds hung from the sky: it passes over.
  peng: t({ moves: { overtake: 3, stoop: 1 }, band: [0, 0.7], pace: 1.3, maxPitchDeg: 20, curiosity: 0.3, omens: { scatter: 3 } }),
  yaoji: t({ moves: { cross: 2, oncoming: 1, stoop: 1 }, band: [-0.2, 0.5], pace: 1.3, maxPitchDeg: 10 }),
  jingwei: t({ moves: { stoop: 2, cross: 2, overtake: 1 }, band: [-0.3, 0.5], pace: 0.8, maxPitchDeg: 30, curiosity: 0.4, skittish: true }),
  // Leaping at the Dragon Gate.
  carp: t({ moves: { rise: 4, cross: 1 }, band: [-0.7, 0.1], pace: 0.8, maxPitchDeg: 45, curiosity: 0, skittish: true }),
  niumowang: t({ moves: { oncoming: 2, cross: 2 }, band: [-0.6, 0], pace: 1.2, maxPitchDeg: 8, curiosity: 0.4, omens: { scatter: 2 } }),
  // Crossing the sea, each by his own power.
  baxian: t({ moves: { cross: 3, oncoming: 1 }, band: [-0.5, 0.2], pace: 1.5, maxPitchDeg: 5 }),
  elephant: t({ moves: { cross: 2, oncoming: 1 }, band: [-0.7, -0.1], pace: 1.6, maxPitchDeg: 5 }),
  egrets: t({ moves: { cross: 3, overtake: 1, rise: 1 }, band: [-0.6, 0.2], maxPitchDeg: 20, curiosity: 0.25, skittish: true }),
  sanduo: t({ moves: { cross: 2, oncoming: 2 }, band: [-0.4, 0.2], pace: 1.2, maxPitchDeg: 8, stately: true, curiosity: 0.2, omens: { look: 1 } }),
  guanyin: t({ moves: { oncoming: 2, stoop: 1, cross: 1 }, band: [-0.1, 0.5], pace: 1.6, maxPitchDeg: 5, stately: true, curiosity: 0, omens: { look: 2 } }),
  // The flags go where the wind takes them.
  lungta: t({ moves: { cross: 3, overtake: 1 }, band: [-0.1, 0.6], maxPitchDeg: 10, stately: true, facesPath: false, curiosity: 0 }),
  miyolangsangma: t({ moves: { cross: 2, oncoming: 1 }, band: [-0.5, 0.1], pace: 1.3, maxPitchDeg: 8, stately: true, curiosity: 0.2, omens: { look: 1 } }),
};

export function temperamentOf(kind: string): Temperament {
  return TEMPERAMENTS[kind as FigureKind] ?? GENERIC;
}
