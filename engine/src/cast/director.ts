/**
 * The director (D92): what the cast does in a scene this viewing, drawn
 * once from a seed when the scene starts. A companion no longer rides
 * beside the lens for its whole cue; it visits — comes in from off the
 * picture, passes or pauses, and goes — and between visits the sky is
 * empty. Which motion, which side, how near, when, and whether a figure
 * comes at all are the dice's; the author's cue bounds them.
 *
 * What the plan keeps, whatever the dice say:
 * - a figure with a line is in the picture, paused where its author put it,
 *   for every second its line is on, having just arrived;
 * - no more than `CROWD` companions are in the picture at once, lines aside;
 * - a figure's visits stay inside its cue's seconds and apart;
 * - a monument stands for its whole cue, as it did;
 * - a figure whose temperament chases another, when both are cast, follows
 *   the leader's visits a second behind;
 * - the same seed draws the same plan.
 */
import { CAST_LINE_SHOW_S, type CastCue, type Scene } from "../film/scene.js";
import { CUE_MOTIONS, TRANSIT_MOTIONS, WORLD_MOTIONS, type MotionKind } from "./moves.js";
import { hashSeed, Rng } from "./random.js";
import { temperamentOf, type Temperament } from "./temperament.js";
import type { Visit } from "./motion.js";

/** Companions in the picture at once, not counting a figure while it is named. */
export const CROWD = 2;
/** Seconds a named figure is in place before its line and after it. */
export const LINE_PAD_S = 0.4;
/** A visit's own length by motion, seconds, before the figure's pace. */
export const NATURAL_S: Readonly<Record<MotionKind, number>> = {
  anchor: 0,
  hold: 0,
  chase: 0,
  cross: 7,
  overtake: 6,
  oncoming: 7,
  rise: 5,
  stoop: 5,
  circle: 12,
  blink: 9,
};
/** How often a visit with no line pauses in the picture, and for how long. */
const PAUSE_CHANCE = 0.35;
const PAUSE_S = [2, 4.5] as const;
/** Seconds to come in before a line and to go after it. */
const ENTRY_S = [2, 3.5] as const;
const EXIT_S = [2.2, 4] as const;
/** The least a figure may take to arrive, seconds. */
const MIN_ENTRY_S = 0.8;
/** Seconds apart one figure's visits keep. */
const APART_S = 3;
/** How often a chaser goes after each of its leader's visits. */
const CHASE_CHANCE = 0.8;

export interface CuePlan {
  /** Whether the figure is in this viewing at all. */
  readonly cast: boolean;
  readonly visits: readonly Visit[];
}

export interface Plan {
  readonly seed: number;
  readonly cues: readonly CuePlan[];
}

type Draft = { -readonly [K in keyof Visit]: Visit[K] };

/** The motions a cue draws from, by weight: its own list evenly, or its figure's temperament. */
export function repertoire(cue: CastCue, temperament: Temperament): Partial<Record<MotionKind, number>> {
  if (cue.motions && cue.motions.length > 0) {
    const out: Partial<Record<MotionKind, number>> = {};
    for (const m of cue.motions) if ((CUE_MOTIONS as readonly string[]).includes(m)) out[m as MotionKind] = 1;
    return out;
  }
  return temperament.moves;
}

function transitsOf(weights: Partial<Record<MotionKind, number>>): Partial<Record<MotionKind, number>> {
  const out: Partial<Record<MotionKind, number>> = {};
  for (const m of TRANSIT_MOTIONS) if ((weights[m] ?? 0) > 0) out[m] = weights[m]!;
  return out;
}

/** How many of `visits` are in the picture at each moment of [a, b]: the most at once. */
function crowdOver(visits: readonly Draft[], a: number, b: number): number {
  // The count only rises at a visit's start, so test those starts inside the span, and the span's own.
  const starts = [a, ...visits.filter((v) => v.fromS > a && v.fromS < b).map((v) => v.fromS)];
  let most = 0;
  for (const t of starts) most = Math.max(most, visits.filter((v) => v.fromS <= t && v.untilS > t).length);
  return most;
}

/** Plan a scene's cast for this viewing. */
export function planScene(scene: Pick<Scene, "id" | "cast">, seed: number, temperament: (kind: string) => Temperament = temperamentOf): Plan {
  const cues = scene.cast;
  const rngs = cues.map((_, i) => new Rng(hashSeed(seed, scene.id, i)));
  const cast = cues.map((c, i) => rngs[i]!.chance(c.chance));
  const drafts: Draft[][] = cues.map(() => []);
  const moving: Draft[] = []; // every companion visit, for the crowd
  const base = (i: number, motion: MotionKind, fromS: number, untilS: number): Draft => ({ motion, fromS, untilS, dwell: null, named: false, side: 1, leader: null, lagS: 0, seed: rngs[i]!.fork() });

  const leaderOf = (i: number): number | null => {
    const chases = temperament(cues[i]!.figure).chases;
    if (!chases || cues[i]!.motions) return null;
    const j = cues.findIndex((c, k) => k !== i && cast[k] && c.figure === chases && c.role === "companion");
    return j >= 0 ? j : null;
  };

  // Monuments, and cues held in place: the whole cue, as before.
  cues.forEach((c, i) => {
    if (!cast[i]) return;
    const moves = repertoire(c, temperament(c.figure));
    if (c.role === "monument") {
      const m = (Object.keys(moves) as MotionKind[]).find((k) => WORLD_MOTIONS.includes(k)) ?? "anchor";
      drafts[i]!.push({ ...base(i, m, c.fromS, c.untilS), named: c.line !== null });
    } else if (Object.keys(transitsOf(moves)).length === 0) {
      drafts[i]!.push({ ...base(i, "hold", c.fromS, c.untilS), named: c.line !== null, dwell: c.line ? [c.lineAtS, c.lineAtS + CAST_LINE_SHOW_S] : null });
    }
  });
  const free = (i: number) => cast[i] && cues[i]!.role === "companion" && drafts[i]!.length === 0;

  // Named visits first: each arrives just before its line and stays through it.
  cues.forEach((c, i) => {
    if (!free(i) || !c.line) return;
    const rng = rngs[i]!;
    const t = temperament(c.figure);
    const motion = rng.pick(transitsOf(repertoire(c, t)))!;
    let a = c.lineAtS - LINE_PAD_S;
    let b = c.lineAtS + CAST_LINE_SHOW_S + LINE_PAD_S + rng.range(0, 3);
    const from = Math.max(c.fromS, a - rng.range(...ENTRY_S) * t.pace);
    a = Math.max(a, from + MIN_ENTRY_S);
    const until = Math.min(c.untilS, b + rng.range(...EXIT_S) * t.pace);
    b = Math.max(a + 0.1, Math.min(b, until - MIN_ENTRY_S));
    const v: Draft = { ...base(i, motion, from, until), dwell: [a, b], named: true };
    drafts[i]!.push(v);
    moving.push(v);
  });

  // Then the rest of each cue's seconds, leaders before those who chase them, in an order of the seed's.
  const order = cues.map((_, i) => i).filter((i) => cast[i] && cues[i]!.role === "companion" && drafts[i]!.every((v) => v.motion !== "hold"));
  const shuffle = new Rng(hashSeed(seed, scene.id, "order"));
  for (let k = order.length - 1; k > 0; k--) {
    const j = Math.floor(shuffle.next() * (k + 1));
    [order[k], order[j]] = [order[j]!, order[k]!];
  }
  order.sort((x, y) => Number(leaderOf(x) !== null) - Number(leaderOf(y) !== null));

  for (const i of order) {
    const c = cues[i]!;
    const rng = rngs[i]!;
    const t = temperament(c.figure);
    const own = drafts[i]!;
    const lead = leaderOf(i);
    if (lead !== null) {
      // After the leader: each of its visits, a second or so behind, where the chaser's cue allows.
      for (const lv of drafts[lead]!) {
        if (!rng.chance(CHASE_CHANCE)) continue;
        const lagS = rng.range(0.9, 1.6);
        const from = lv.fromS + lagS;
        const until = lv.untilS + lagS;
        if (from < c.fromS || until > c.untilS) continue;
        if (own.some((v) => v.fromS < until + 1 && from < v.untilS + 1)) continue;
        own.push({ ...base(i, "chase", from, until), leader: lead, lagS });
      }
      continue;
    }
    const moves = transitsOf(repertoire(c, t));
    let cursor = c.fromS + rng.range(0, 6);
    while (cursor < c.untilS) {
      const motion = rng.pick(moves);
      if (!motion) break;
      const pause = rng.chance(PAUSE_CHANCE) ? rng.range(...PAUSE_S) * t.pace : 0;
      const length = NATURAL_S[motion] * t.pace * rng.range(0.85, 1.2) + pause;
      let placed = false;
      for (let from = cursor; from + length <= c.untilS; from += 1.5) {
        const until = from + length;
        if (own.some((v) => v.fromS < until + APART_S && from < v.untilS + APART_S)) continue;
        if (crowdOver(moving, from, until) >= CROWD) continue;
        const a = from + 0.4 * (length - pause);
        const v: Draft = { ...base(i, motion, from, until), dwell: pause > 0 ? [a, a + pause] : null };
        own.push(v);
        moving.push(v);
        cursor = until + rng.range(...t.gapS);
        placed = true;
        break;
      }
      if (!placed) break;
    }
  }

  // Sides: a named visit comes and goes on its author's side of the picture,
  // so it never swings across the lens to leave; any other that shares the
  // picture with one before it takes the other side.
  const all = drafts.flatMap((d, i) => d.map((v) => ({ v, i }))).filter(({ i }) => cues[i]!.role === "companion");
  all.sort((p, q) => p.v.fromS - q.v.fromS);
  const sided: Draft[] = [];
  for (const { v, i } of all) {
    const authored = Math.sign(cues[i]!.offset?.rightM ?? 0);
    const other = sided.find((w) => w.fromS < v.untilS && v.fromS < w.untilS && w.motion !== "chase");
    v.side = v.named && authored !== 0 ? (authored as -1 | 1) : other ? (-other.side as -1 | 1) : rngs[i]!.sign();
    sided.push(v);
  }

  return { seed, cues: drafts.map((d, i) => ({ cast: cast[i]!, visits: d.sort((p, q) => p.fromS - q.fromS) })) };
}
