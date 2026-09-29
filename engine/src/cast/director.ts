/**
 * The director (D92, D93): what the cast does in a scene this viewing,
 * drawn once from a seed when the scene starts. A companion no longer rides
 * beside the lens for its whole cue; it visits — comes in from off the
 * picture, passes or pauses, and goes — and between visits the sky is
 * empty. Which motion, which side, how near, when, and whether a figure
 * comes at all are the dice's; the author's cue bounds them.
 *
 * Monuments come and go too, where their temperament has them surface
 * (D93); figures glance at the lens on their way, as their curiosity has
 * them; and an arrival may be foretold by an omen, a reaction of another
 * figure on stage a moment before it.
 *
 * What the plan keeps, whatever the dice say:
 * - a figure with a line is in the picture, paused where its author put it,
 *   for every second its line is on, having just arrived; a monument with
 *   a line stands for it;
 * - no more than `CROWD` companions are in the picture at once, and no
 *   more than `RISEN` monuments are up, lines aside;
 * - a companion passing on its own way stays out of the picture while
 *   another figure's line is on, which has it to itself: the figures are
 *   paintings a quarter of the frame high (D94), and one crossing in front
 *   of another while it is named hid it;
 * - a figure's visits stay inside its cue's seconds and apart;
 * - a monument that does not surface stands for its whole cue, as it did;
 * - a monument that surfaces comes up where the flight is looking more
 *   often than not, when the scene's rail is known;
 * - a figure whose temperament chases others follows the visits of the
 *   first of them cast for some of the same seconds, a second behind, if
 *   that one goes its own way (F129, F130: Nezha after Wukong in Heaven,
 *   Wukong after the Bull Demon King at the Flaming Mountains);
 * - a figure whose temperament blocks another gets in its way instead, for
 *   each of its visits that stops, the same seconds (F130: Nezha barring
 *   the Bull Demon King's way);
 * - a figure whose temperament escorts another, when both are cast at once,
 *   comes with every visit of the other's and no other (F128): Wukong with
 *   the pilgrims;
 * - an omen comes only when there is a witness on stage for it, or one the
 *   omen may bring on, and never cuts a figure's line short or turns its
 *   head from the lens while its line is on;
 * - the same seed draws the same plan.
 */
import { CAST_LINE_SHOW_S, type CastCue, type Scene } from "../film/scene.js";
import { CUE_MOTIONS, MOTIONS, TRANSIT_MOTIONS, WORLD_MOTIONS, WORLD_TRANSIT_MOTIONS, type MotionKind } from "./moves.js";
import { OMENS, witnesses } from "./omens.js";
import { hashSeed, Rng } from "./random.js";
import type { Sight } from "./sight.js";
import { temperamentOf, type Temperament } from "./temperament.js";
import type { Visit } from "./motion.js";

/** Companions in the picture at once, not counting a figure while it is named. */
export const CROWD = 2;
/** Monuments up at once, not counting one standing for its line. */
export const RISEN = 3;
/** Seconds a named figure is in place before its line and after it. */
export const LINE_PAD_S = 0.4;
/** Seconds before another figure's line, and after it, that a passing companion keeps out of the picture (D94). */
export const LINE_ALONE_S = [2, 1] as const;
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
/** Seconds a surfaced monument stands, before its pace. */
const STAND_S = [6, 16] as const;
/**
 * How far past the first time it fits a monument will wait for a moment
 * the flight is looking at its place, seconds. The Dragon Kings are each in
 * the picture for one or two stretches of Huangshan's loop, so a minute.
 */
const LOOK_AHEAD_S = 60;
/** How far across the picture a place may be and count as looked at: most of the frame, not its edge. */
const IN_VIEW_X = 0.8;
/** How often a monument waits to come up where it is looked at. */
const SEEN_CHANCE = 0.85;
/** How long a glance at the lens lasts, seconds. */
const GLANCE_S = [1.6, 3.2] as const;
/** How often an arrival that can bring an omen does. */
const OMEN_CHANCE = 0.6;
/** Seconds a witness brought on for an omen hovers in the picture, part of which is before it reacts. */
const HERALD_PAUSE_S = [2.2, 3.6] as const;

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

/** The weights among `kinds` only. */
function among(weights: Partial<Record<MotionKind, number>>, kinds: readonly MotionKind[]): Partial<Record<MotionKind, number>> {
  const out: Partial<Record<MotionKind, number>> = {};
  for (const m of kinds) if ((weights[m] ?? 0) > 0) out[m] = weights[m]!;
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

/** The second a visit's figure is first seen: part way up, for one that surfaces. */
export function arrivalOf(v: Pick<Visit, "motion" | "fromS" | "dwell">): number {
  const m = MOTIONS[v.motion];
  return m.space === "world" && v.dwell ? v.fromS + 0.55 * (v.dwell[0] - v.fromS) : v.fromS + m.arriveS;
}

/** Plan a scene's cast for this viewing; with the scene's sight, monuments come up where the flight looks. */
export function planScene(scene: Pick<Scene, "id" | "cast">, seed: number, temperament: (kind: string) => Temperament = temperamentOf, sight: Sight | null = null): Plan {
  const cues = scene.cast;
  const rngs = cues.map((_, i) => new Rng(hashSeed(seed, scene.id, i)));
  const cast = cues.map((c, i) => rngs[i]!.chance(c.chance));
  const drafts: Draft[][] = cues.map(() => []);
  const moving: Draft[] = []; // every companion visit, for the crowd
  const risen: Draft[] = []; // every monument's rising, for theirs
  const base = (i: number, motion: MotionKind, fromS: number, untilS: number): Draft => ({
    motion,
    fromS,
    untilS,
    dwell: null,
    named: false,
    side: 1,
    leader: null,
    lagS: 0,
    seed: rngs[i]!.fork(),
    glance: null,
    reaction: null,
  });
  const apart = (i: number, from: number, until: number, gap = APART_S) => !drafts[i]!.some((v) => v.fromS < until + gap && from < v.untilS + gap);
  // Another cast figure's line, which a passing companion keeps out of (D94).
  const lines = cues.flatMap((c, j) => (cast[j] && c.line ? [{ j, from: c.lineAtS - LINE_ALONE_S[0], until: c.lineAtS + CAST_LINE_SHOW_S + LINE_ALONE_S[1] }] : []));
  const clearOfLines = (i: number, from: number, until: number) => lines.every((l) => l.j === i || until <= l.from || from >= l.until);
  const shuffled = (list: number[], salt: string): number[] => {
    const rng = new Rng(hashSeed(seed, scene.id, salt));
    for (let k = list.length - 1; k > 0; k--) {
      const j = Math.floor(rng.next() * (k + 1));
      [list[k], list[j]] = [list[j]!, list[k]!];
    }
    return list;
  };

  // Whom a cue follows, and how (F128–F130): the one its temperament
  // escorts, else the first it blocks, else the first it chases, cast for
  // some of the same seconds; one it blocks or chases must go its own way.
  const followOf = (i: number, depth = 0): { motion: "escort" | "block" | "chase"; leader: number } | null => {
    const c = cues[i]!;
    if (c.motions || c.role !== "companion" || depth > 2) return null;
    const t = temperament(c.figure);
    const find = (kind: string, free: boolean): number =>
      cues.findIndex((d, k) => k !== i && cast[k] && d.figure === kind && d.role === "companion" && d.fromS < c.untilS && c.fromS < d.untilS && (!free || followOf(k, depth + 1) === null));
    const escorted = t.escorts ? find(t.escorts.figure, false) : -1;
    if (escorted >= 0) return { motion: "escort", leader: escorted };
    for (const [motion, kinds] of [["block", t.blocks], ["chase", t.chases]] as const) {
      for (const kind of kinds) {
        const j = find(kind, true);
        if (j >= 0) return { motion, leader: j };
      }
    }
    return null;
  };
  const rises = (i: number) => among(repertoire(cues[i]!, temperament(cues[i]!.figure)), WORLD_TRANSIT_MOTIONS);
  const surfacing = (i: number) => cast[i] && cues[i]!.role === "monument" && cues[i]!.at !== null && Object.keys(rises(i)).length > 0;

  // Monuments that stand, and cues held in place: the whole cue, as before.
  cues.forEach((c, i) => {
    if (!cast[i] || surfacing(i)) return;
    const moves = repertoire(c, temperament(c.figure));
    if (c.role === "monument") {
      const m = (Object.keys(moves) as MotionKind[]).find((k) => WORLD_MOTIONS.includes(k) && !MOTIONS[k].transit) ?? "anchor";
      drafts[i]!.push({ ...base(i, m, c.fromS, c.untilS), named: c.line !== null });
    } else if (Object.keys(among(moves, TRANSIT_MOTIONS)).length === 0) {
      drafts[i]!.push({ ...base(i, "hold", c.fromS, c.untilS), named: c.line !== null, dwell: c.line ? [c.lineAtS, c.lineAtS + CAST_LINE_SHOW_S] : null });
    }
  });

  // Monuments that surface: up for their lines first, then on their own
  // timing, each waiting, more often than not, for a moment the flight is
  // looking its way to come up.
  const halfRise = (m: MotionKind, t: Temperament, rng: Rng) => (MOTIONS[m].naturalS / 2) * t.pace * rng.range(0.85, 1.2);
  cues.forEach((c, i) => {
    if (!surfacing(i) || !c.line) return;
    const rng = rngs[i]!;
    const t = temperament(c.figure);
    const motion = rng.pick(rises(i))!;
    let a = c.lineAtS - LINE_PAD_S;
    let b = c.lineAtS + CAST_LINE_SHOW_S + LINE_PAD_S + rng.range(0, 3);
    const from = Math.max(c.fromS, a - halfRise(motion, t, rng));
    a = Math.max(a, from + MIN_ENTRY_S);
    const until = Math.min(c.untilS, b + halfRise(motion, t, rng));
    b = Math.max(a + 0.1, Math.min(b, until - MIN_ENTRY_S));
    const v: Draft = { ...base(i, motion, from, until), dwell: [a, b], named: true };
    drafts[i]!.push(v);
    risen.push(v);
  });
  // A rising at a time round the monuments, so each has its turn under the
  // cap before any has two. More often than not a monument waits for the
  // flight: it comes up at the first time it fits, from where it last went
  // under, that the flight is looking its way, within a minute of the first
  // it fits at all, and lets the time go by if there is none; otherwise it
  // comes up at the first time it fits, seen or not.
  const monuments = shuffled(cues.map((_, k) => k).filter(surfacing), "risings");
  const cursor = monuments.map((i) => cues[i]!.fromS + rngs[i]!.range(0, 3));
  for (let rising = true; rising; ) {
    rising = false;
    monuments.forEach((i, n) => {
      const c = cues[i]!;
      const rng = rngs[i]!;
      const t = temperament(c.figure);
      const motion = rng.pick(rises(i))!;
      const up = halfRise(motion, t, rng);
      const down = halfRise(motion, t, rng);
      const length = up + rng.range(...STAND_S) * t.pace + down;
      const waits = sight !== null && rng.chance(SEEN_CHANCE);
      let first: number | null = null;
      let seen: number | null = null;
      for (let from = cursor[n]!; from + length <= c.untilS && (first === null || from <= first + LOOK_AHEAD_S); from += 1) {
        if (!apart(i, from, from + length, t.gapS[0]) || crowdOver(risen, from, from + length) >= RISEN) continue;
        first ??= from;
        const place = sight?.(c.at!, from + 0.55 * up);
        if (!waits || (place && Math.abs(place.x) <= IN_VIEW_X)) {
          seen = from;
          break;
        }
      }
      // One that waits for the flight to look and is not looked at in time lets the time go by.
      const from = seen ?? (waits ? null : first);
      if (from === null) {
        cursor[n] = first === null ? Infinity : first + LOOK_AHEAD_S;
        return;
      }
      const until = from + length;
      const v: Draft = { ...base(i, motion, from, until), dwell: [from + up, until - down] };
      drafts[i]!.push(v);
      risen.push(v);
      cursor[n] = until + rng.range(...t.gapS);
      rising = true;
    });
  }
  const free = (i: number) => cast[i] && cues[i]!.role === "companion" && drafts[i]!.length === 0;

  // Named visits first: each arrives just before its line and stays through it.
  cues.forEach((c, i) => {
    if (!free(i) || !c.line) return;
    const rng = rngs[i]!;
    const t = temperament(c.figure);
    const motion = rng.pick(among(repertoire(c, t), TRANSIT_MOTIONS))!;
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

  // Omens: before an arrival that brings one, a witness reacts — whoever is
  // on stage and answers to it, or, for an omen that may, one brought on.
  const omens = new Rng(hashSeed(seed, scene.id, "omens"));
  const foretell = (space: "world" | "frame"): void => {
    const arrivals = drafts
      .flatMap((d, i) => d.map((v) => ({ v, i })))
      .filter(({ v, i }) => MOTIONS[v.motion].transit && MOTIONS[v.motion].space === space && Object.keys(temperament(cues[i]!.figure).omens).length > 0)
      .sort((p, q) => p.v.fromS - q.v.fromS);
    for (const { v, i } of arrivals) {
      const brings = omens.chance(OMEN_CHANCE);
      const kind = omens.pick(temperament(cues[i]!.figure).omens);
      const lead = omens.next();
      if (!brings || !kind) continue;
      const arrivalS = arrivalOf(v);
      // A monument's is only worth foretelling where the flight is looking.
      const place = cues[i]!.at;
      if (space === "world" && sight && place) {
        const at = sight(place, arrivalS);
        if (!at || Math.abs(at.x) > 1) continue;
      }
      const traits = OMENS[kind];
      const atS = arrivalS - (traits.leadS[0] + lead * (traits.leadS[1] - traits.leadS[0]));
      const endS = traits.leaveS === null ? null : atS + traits.leaveS;
      const answers = (j: number) => j !== i && cast[j] && cues[j]!.role === "companion" && witnesses(kind, temperament(cues[j]!.figure));
      // A witness that flees must be well in the picture when it takes
      // fright, in a pause or the middle of its way, or its flight is only
      // its leaving come early; one that only looks may be anywhere in it.
      const [lo, hi] = endS === null ? [0.12, 0.88] : [0.3, 0.65];
      const into = (w: Draft) => (atS - w.fromS) / (w.untilS - w.fromS);
      const inMiddle = (w: Draft) => (w.dwell !== null && atS >= w.dwell[0] && atS <= w.dwell[1] + 0.3) || (into(w) >= lo && into(w) <= hi);
      const onStage = (w: Draft) =>
        w !== v &&
        w.reaction === null &&
        MOTIONS[w.motion].space === "frame" &&
        w.motion !== "hold" &&
        w.fromS + 0.8 <= atS &&
        w.untilS >= atS + 0.6 &&
        inMiddle(w) &&
        !(w.named && w.dwell && w.dwell[1] > atS - LINE_PAD_S);
      const found = cues.flatMap((_, j) => (answers(j) ? drafts[j]!.filter(onStage) : []));
      if (found.length === 0 && traits.summons) {
        // One brought on: in on its own way a few seconds before, and
        // hovering in the picture when it takes fright, which cuts its
        // way short.
        const until = endS ?? atS + 3;
        const idle = (k: number) => answers(k) && followOf(k)?.motion !== "escort" && drafts[k]!.every((w) => w.motion !== "hold") && cues[k]!.fromS <= atS - 7 && cues[k]!.untilS >= until && apart(k, atS - 7, until);
        const pick = omens.pick(Object.fromEntries(cues.map((_, k) => [String(k), idle(k) ? 1 : 0])));
        const k = pick === null ? -1 : Number(pick);
        const tk = k < 0 ? null : temperament(cues[k]!.figure);
        const motion = tk ? omens.pick(among(repertoire(cues[k]!, tk), TRANSIT_MOTIONS)) : null;
        const pause = omens.range(...HERALD_PAUSE_S);
        const hovered = omens.range(0.5, 0.85);
        if (tk && motion) {
          const way = MOTIONS[motion].naturalS * tk.pace;
          const from = atS - 0.4 * way - hovered * pause;
          if (cues[k]!.fromS <= from && apart(k, from, until) && crowdOver(moving, from, until) < CROWD) {
            const a = from + 0.4 * way;
            const w: Draft = { ...base(k, motion, from, Math.max(from + way + pause, until + 1)), dwell: [a, a + pause], side: omens.sign() };
            drafts[k]!.push(w);
            moving.push(w);
            found.push(w);
          }
        }
      }
      for (const w of found) {
        w.reaction = { omen: kind, atS, arrival: i, arrivalS, pathUntilS: w.untilS };
        if (endS !== null && endS < w.untilS) w.untilS = endS;
        if (w.glance && w.glance[1] > atS) w.glance = w.glance[0] < atS - 0.6 ? [w.glance[0], atS] : null;
      }
    }
  };

  // A monument's coming is foretold before the companions take up their seconds, so a witness can be brought on for it.
  foretell("world");

  // Then the rest of each cue's seconds, leaders before those who follow them, in an order of the seed's.
  const order = shuffled(
    cues.map((_, i) => i).filter((i) => cast[i] && cues[i]!.role === "companion" && drafts[i]!.every((v) => v.motion !== "hold")),
    "order",
  );
  const follows = (i: number) => Number(followOf(i) !== null);
  order.sort((x, y) => follows(x) - follows(y));

  for (const i of order) {
    const c = cues[i]!;
    const rng = rngs[i]!;
    const t = temperament(c.figure);
    const own = drafts[i]!;
    const follow = followOf(i);
    if (follow?.motion === "escort" || follow?.motion === "block") {
      // With the one it escorts: each of its visits, the same seconds,
      // turning to the lens while it is named. In the way of the one it
      // blocks: each of its visits that stops, the same seconds.
      const { motion, leader } = follow;
      for (const lv of drafts[leader]!) {
        if (lv.fromS < c.fromS || lv.untilS > c.untilS || (motion === "block" && !lv.dwell)) continue;
        if (own.some((v) => v.fromS < lv.untilS + 1 && lv.fromS < v.untilS + 1)) continue;
        own.push({ ...base(i, motion, lv.fromS, lv.untilS), leader, named: motion === "escort" && lv.named, dwell: lv.dwell });
      }
      continue;
    }
    if (follow?.motion === "chase") {
      const lead = follow.leader;
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
    const moves = among(repertoire(c, t), TRANSIT_MOTIONS);
    let cursor = c.fromS + rng.range(0, 6);
    while (cursor < c.untilS) {
      const motion = rng.pick(moves);
      if (!motion) break;
      const pause = rng.chance(PAUSE_CHANCE) ? rng.range(...PAUSE_S) * t.pace : 0;
      const length = MOTIONS[motion].naturalS * t.pace * rng.range(0.85, 1.2) + pause;
      let placed = false;
      for (let from = cursor; from + length <= c.untilS; from += 1.5) {
        const until = from + length;
        if (!apart(i, from, until)) continue;
        if (!clearOfLines(i, from, until)) continue;
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
    const other = sided.find((w) => w.fromS < v.untilS && v.fromS < w.untilS && w.motion !== "chase" && w.motion !== "escort" && w.motion !== "block");
    v.side = v.named && authored !== 0 ? (authored as -1 | 1) : other ? (-other.side as -1 | 1) : rngs[i]!.sign();
    sided.push(v);
  }

  // Glances: a curious figure turns its head to the lens on its way, for
  // a second or three, in a pause when it makes one. Not while it is named:
  // its line turns it to the lens already; nor in another's way, where it
  // has eyes for that one.
  drafts.forEach((d, i) => {
    const t = temperament(cues[i]!.figure);
    const rng = new Rng(hashSeed(seed, scene.id, i, "glance"));
    for (const v of d) {
      const glances = rng.chance(t.curiosity);
      const length = rng.range(...GLANCE_S);
      const u = rng.next();
      if (!glances || v.named || v.motion === "anchor" || v.motion === "hold" || v.motion === "block") continue;
      const [lo, hi] = v.dwell ? [v.dwell[0], v.dwell[1] - length] : [v.fromS + 0.3 * (v.untilS - v.fromS) - length / 2, v.fromS + 0.6 * (v.untilS - v.fromS) - length / 2];
      const a = Math.max(v.fromS + 0.3, lo + u * Math.max(0, hi - lo));
      // Not past an omen's reaction, which has its head already.
      const end = v.reaction ? v.reaction.atS : v.untilS - 0.3;
      if (a + length <= end) v.glance = [a, a + length];
    }
  });

  // A companion's coming, once every companion's seconds are known.
  foretell("frame");

  return { seed, cues: drafts.map((d, i) => ({ cast: cast[i]!, visits: d.sort((p, q) => p.fromS - q.fromS) })) };
}
