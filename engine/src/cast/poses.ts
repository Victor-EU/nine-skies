/**
 * A figure's poses (F139): the pictures of it a scene draws it in by turns,
 * the eighth of the cast's plug axes, beside the figure, the skin, the cue,
 * the motion, the omens, the painting and its life.
 *
 * One painting a figure was the same picture every time it came: the
 * pilgrims walked the same road in single file in five scenes, and Wukong
 * shaded his eyes in six. Now a cue names the views of its painting it is
 * drawn in (`poses`), and those it takes when it stops (`paused`): the
 * party walks in on the road and halts to rest, or stops short at the
 * tiger; Wukong scouts, crouches on his cloud, raises his staff.
 *
 * Which picture, when, is drawn from the visit's own seed, so a viewing
 * plays the same way twice:
 * - its first visit comes in the first picture it goes in, the author's;
 *   every other in a picture it goes in, not the one it last left in;
 * - where it stops, it takes a picture it stops in, and where it goes on,
 *   one it goes in again, or keeps the one it stopped in if that is one;
 * - a named visit stops for its line in the first picture it stops in, the
 *   author's;
 * - a long stop, with more than one picture to stop in, takes another
 *   halfway (F141): the monk waves farewell to Chang'an, then prays for
 *   the road;
 * - at a moment its motion hides a change in (Wukong's somersault from spot
 *   to spot), it may change, if it has held the one it has a while.
 *
 * A change is drawn the way the card turns round (`painting.ts`): the one
 * picture narrows, as a figure coming round toward the eye does, and gives
 * way at its narrowest to the other, which widens again. A follower stops
 * when its leader does, so Wukong changes with the party.
 *
 * Only a painted figure has poses; one made in code is drawn as its
 * variant, as before.
 */
import { Group, type WebGLRenderer } from "three";
import type { CastCue } from "../film/scene.js";
import type { CastFrame, Figure } from "./figure.js";
import type { Skin } from "./skin.js";
import type { Visit } from "./motion.js";
import { sideOfTurn } from "./painting.js";
import type { Rng } from "./random.js";

/** Seconds a change of picture takes, narrowing and widening: the card's own turn's length. */
export const POSE_S = 0.7;
/** The least seconds a picture is held before a change its motion hides, and after it, before the visit ends. */
export const HOLD_S = 2;
/** How often it changes at a moment its motion hides a change in. */
export const SWAP_CHANCE = 0.5;
/** How often it keeps the picture it stopped in as it goes on, where that is one it goes in. */
export const KEEP_CHANCE = 0.4;
/** The shortest stop that takes a second picture halfway, where it has one to take: each held a while. */
export const LONG_STOP_S = 2 * HOLD_S + 2 * POSE_S;

/** A change of picture: from `atS` on, the figure is drawn in `names[pose]`. */
export interface PoseKey {
  readonly atS: number;
  readonly pose: number;
}

/** The pictures drawn at a second: the one given way to, the one coming, and how far the change is, 0 to 1. */
export interface PoseMix {
  readonly from: number;
  readonly to: number;
  readonly mix: number;
}

/** The views a cue draws its figure in, those it goes in first; null for its variant alone. */
export function poseNames(cue: Pick<CastCue, "poses" | "paused">): string[] | null {
  if (!cue.poses?.length) return null;
  return [...cue.poses, ...(cue.paused ?? []).filter((n) => !cue.poses!.includes(n))];
}

/** The pictures a visit is drawn in, and when each comes, from the visit's own dice; `previous` is the one its last visit left in. */
export function planPoses(
  cue: Pick<CastCue, "poses" | "paused">,
  names: readonly string[],
  visit: Pick<Visit, "fromS" | "untilS" | "dwell" | "named">,
  swaps: readonly number[],
  rng: Rng,
  previous: number | null,
): PoseKey[] {
  const index = (list: readonly string[]) => list.map((n) => names.indexOf(n)).filter((i) => i >= 0);
  const going = index(cue.poses ?? names);
  const stopping = cue.paused?.length ? index(cue.paused) : going;
  const pick = (from: readonly number[]) => from[Math.min(from.length - 1, Math.floor(rng.next() * from.length))]!;
  const other = (from: readonly number[], not: number | null) => {
    const rest = from.filter((i) => i !== not);
    return rest.length > 0 ? pick(rest) : pick(from);
  };
  let pose = previous === null ? going[0]! : other(going, previous);
  const keys: PoseKey[] = [{ atS: visit.fromS, pose }];
  // A change it must make, where it stops or goes on, needs only the room to be drawn; one it may make, a picture held a while.
  const change = (atS: number, next: number, hold: number): void => {
    if (next === pose || atS - keys[keys.length - 1]!.atS < hold || visit.untilS - atS < hold) return;
    keys.push({ atS, pose: next });
    pose = next;
  };
  const dwell = visit.dwell;
  const free = (s: number) => !dwell || s < dwell[0] - HOLD_S || s > dwell[1] + HOLD_S;
  const events: Array<{ atS: number; stop: 0 | 0.5 | 1 | null }> = swaps.filter(free).map((atS) => ({ atS, stop: null }));
  if (dwell) events.push({ atS: dwell[0], stop: 0 }, { atS: dwell[1], stop: 1 });
  if (dwell && stopping.length > 1 && dwell[1] - dwell[0] >= LONG_STOP_S) events.push({ atS: (dwell[0] + dwell[1]) / 2, stop: 0.5 });
  events.sort((a, b) => a.atS - b.atS);
  for (const e of events) {
    if (e.stop === 0) change(e.atS, visit.named ? stopping[0]! : stopping.includes(pose) && stopping.length === 1 ? pose : other(stopping, pose), POSE_S);
    else if (e.stop === 0.5) change(e.atS, other(stopping, pose), HOLD_S);
    else if (e.stop === 1) change(e.atS, going.includes(pose) && rng.chance(KEEP_CHANCE) ? pose : other(going, pose), POSE_S);
    else if (rng.chance(SWAP_CHANCE)) change(e.atS, other(going, pose), HOLD_S);
  }
  return keys;
}

/** The pictures drawn at a second of a visit, from its changes. */
export function poseAt(keys: readonly PoseKey[], flightS: number): PoseMix | null {
  if (keys.length === 0) return null;
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1]!.atS <= flightS) i++;
  const mix = i === 0 ? 1 : (flightS - keys[i]!.atS) / POSE_S;
  return mix >= 1 ? { from: keys[i]!.pose, to: keys[i]!.pose, mix: 1 } : { from: keys[i - 1]!.pose, to: keys[i]!.pose, mix: Math.max(0, mix) };
}

/**
 * A figure in several pictures, one of them drawn at a time but while one
 * gives way to another. Each is built as its own figure, scaled to this
 * one's size, and told how much of it to draw; one not drawn is taken out
 * of the group, so the layer measures only what is seen, and is not moved.
 */
export class PosedFigure implements Figure {
  readonly group = new Group();
  readonly nativeSize: number;
  readonly triangles: number;
  private shown: number;

  constructor(
    private readonly poses: readonly Figure[],
    private readonly at: (flightS: number) => PoseMix | null,
  ) {
    this.nativeSize = poses[0]!.nativeSize;
    this.triangles = Math.max(...poses.map((p) => p.triangles));
    for (const p of poses) p.group.scale.setScalar(this.nativeSize / p.nativeSize);
    this.shown = 0;
  }

  update(f: CastFrame): void {
    const m = this.at(f.flightS) ?? { from: this.shown, to: this.shown, mix: 1 };
    this.shown = m.to;
    const turn = 2 * m.mix - 1;
    this.poses.forEach((p, i) => {
      const drawn = i === m.to || (i === m.from && m.mix < 1);
      if (!drawn) {
        if (p.group.parent) this.group.remove(p.group);
        return;
      }
      if (!p.group.parent) this.group.add(p.group);
      if (m.from === m.to) p.present?.(1, 1, true);
      else {
        const { width, show } = sideOfTurn(turn, i === m.to ? 1 : -1);
        p.present?.(width, show, (i === m.to) === m.mix >= 0.5);
      }
      p.update(f);
    });
  }

  setSkin(skin: Skin): void {
    for (const p of this.poses) p.setSkin(skin);
  }

  warm(renderer: WebGLRenderer): boolean {
    return this.poses.some((p) => p.warm?.(renderer) ?? false);
  }

  dispose(): void {
    for (const p of this.poses) p.dispose();
  }
}
