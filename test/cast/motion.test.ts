/**
 * The cast's motion (D92): the dice are seeded, the motions the gate knows
 * are the motions that build, the director keeps its promises whatever the
 * seed, every visit comes in and goes out off the picture in a wide frame
 * and a tall one, and the layer holds a companion where its motion puts it
 * at any speed, across a rebase of the world's origin.
 */
import { describe, expect, it } from "vitest";
import { Color, Scene as ThreeScene, Vector3 } from "three";
import { cueFromRaw } from "../../content/cast.ts";
import { FIGURE_KINDS, LIVING_FAITHS } from "../../engine/src/cast/kinds.js";
import { CUE_MOTIONS, FOLLOW_MOTIONS, MOTION_KINDS, TRANSIT_MOTIONS, WORLD_TRANSIT_MOTIONS, motionSuits, type MotionKind } from "../../engine/src/cast/moves.js";
import { DEFAULT_VIEW, SIDE_AT, facingAlong, frameToPicture, inPicture, motionBuilder, newPose, pictureToFrame, registeredMotions, type MotionContext, type PoseOf, type View, type Visit } from "../../engine/src/cast/motion.js";
import { ESCORT_CROWDED_X, ESCORT_KEEP_X, ESCORT_KEEP_Y, ESCORT_NEARER, risen } from "../../engine/src/cast/motions/escort.js";
import { CHASE_APART, CHASE_CLEAR, CHASE_KEEP } from "../../engine/src/cast/motions/chase.js";
import { TRAIN_APART, TRAIN_BELOW } from "../../engine/src/cast/motions/train.js";
import "../../engine/src/cast/motions/index.js";
import "../../engine/src/cast/figures/index.js";
import { hashSeed, Rng } from "../../engine/src/cast/random.js";
import { GENERIC, TEMPERAMENTS, temperamentOf } from "../../engine/src/cast/temperament.js";
import { CROWD, LINE_ALONE_S, RISEN, planScene, repertoire } from "../../engine/src/cast/director.js";
import { sightOf } from "../../engine/src/cast/sight.js";
import { CastLayer } from "../../engine/src/cast/cast.js";
import { CAST_LINE_SHOW_S, type CastCue, type Scene } from "../../engine/src/film/scene.js";
import { DEFAULT_SCALE, toWorldH } from "../../engine/src/sim/scale.js";
import { seedAtStart } from "../../app/src/cast.ts";
import { loadFilm } from "../../tools/film.ts";

const cue = (raw: Record<string, unknown>): CastCue => {
  const out = cueFromRaw({ figure: "cranes", role: "companion", offset: { ahead_m: 1200, right_m: 300, up_m: -200 }, size_m: 260, ...raw }, (f, m) => {
    throw new Error(`${f}: ${m}`);
  });
  return out!;
};
const TALL: View = { tanHalfY: DEFAULT_VIEW.tanHalfY, tanHalfX: DEFAULT_VIEW.tanHalfY * (9 / 19.5), pitchRad: DEFAULT_VIEW.pitchRad };
const SEEDS = Array.from({ length: 40 }, (_, i) => hashSeed("test", i));

describe("the dice", () => {
  it("draw the same numbers from the same seed, and other numbers from another", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const xs = Array.from({ length: 20 }, () => a.next());
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(xs);
    expect(Array.from({ length: 20 }, () => c.next())).not.toEqual(xs);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
    expect(hashSeed(7, "huangshan", 3)).toBe(hashSeed(7, "huangshan", 3));
    expect(hashSeed(7, "huangshan", 3)).not.toBe(hashSeed(7, "huangshan", 4));
  });

  it("pick a key in proportion to its weight, and never one that weighs nothing", () => {
    const rng = new Rng(1);
    const n = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 6000; i++) n[rng.pick({ a: 1, b: 2, c: 0 })!]++;
    expect(n.c).toBe(0);
    expect(n.b / n.a).toBeGreaterThan(1.7);
    expect(n.b / n.a).toBeLessThan(2.3);
    expect(rng.pick({})).toBeNull();
  });
});

describe("the motions", () => {
  it("are the kinds the gate knows, no more and no fewer", () => {
    expect([...registeredMotions()].sort()).toEqual([...MOTION_KINDS].sort());
    expect(CUE_MOTIONS).not.toContain("chase");
    expect(CUE_MOTIONS).not.toContain("escort");
    expect([...FOLLOW_MOTIONS].sort()).toEqual(["block", "chase", "escort", "train"]);
    for (const m of FOLLOW_MOTIONS) expect(CUE_MOTIONS).not.toContain(m);
    expect(motionSuits("anchor", "monument")).toBe(true);
    expect(motionSuits("anchor", "companion")).toBe(false);
    expect(motionSuits("cross", "monument")).toBe(false);
  });

  it("read the picture back into the frame's metres and out again, and push a padded point past the edge", () => {
    for (const v of [DEFAULT_VIEW, TALL]) {
      const f = pictureToFrame({ x: 0.4, y: -0.3, d: 900 }, v);
      const p = frameToPicture(f, v);
      expect(p.x).toBeCloseTo(0.4, 6);
      expect(p.y).toBeCloseTo(-0.3, 6);
      expect(p.d).toBeCloseTo(900, 6);
      // A figure 200 m across, its middle just past the edge by its own half: off whatever the frame.
      const edge = pictureToFrame({ x: 1.02, y: 0, d: 900, pad: 120 }, v);
      expect(frameToPicture({ ...edge, right: edge.right - 100 }, v).x).toBeGreaterThan(1);
    }
    // Level ahead is above the middle of a picture that looks down.
    expect(frameToPicture({ ahead: 1000, right: 0, up: 0 }, DEFAULT_VIEW).y).toBeGreaterThan(0);
  });

  const visitOf = (motion: MotionKind, seed: number, over: Partial<Visit> = {}): Visit => ({ motion, fromS: 20, untilS: 30, dwell: null, named: false, side: new Rng(seed).sign(), leader: null, lagS: 0, seed, glance: null, reaction: null, ...over });
  const contextOf = (c: CastCue, visit: Visit): MotionContext => ({ cue: c, visit, temperament: temperamentOf(c.figure), rng: new Rng(visit.seed), leader: null });

  it("come into the picture and leave it off an edge or behind the lens, wide or tall, and never jump", () => {
    const sizes = [60, 260, 1400];
    for (const motion of TRANSIT_MOTIONS) {
      for (const seed of SEEDS.slice(0, 12)) {
        for (const size of sizes) {
          const c = cue({ size_m: size, offset: { ahead_m: size * 6, right_m: 0, up_m: 0 } });
          const m = motionBuilder(motion)!(contextOf(c, visitOf(motion, seed)));
          for (const v of [DEFAULT_VIEW, TALL]) {
            const pose = newPose();
            let seen = false;
            let last: Vector3 | null = null;
            for (let t = 20; t <= 30; t += 1 / 30) {
              expect(m.pose(t, v, pose), `${motion} at ${t}`).toBe(true);
              const at = new Vector3(pose.at.ahead, pose.at.right, pose.at.up);
              if (last) expect(at.distanceTo(last), `${motion} ${seed} jumps at ${t.toFixed(2)}`).toBeLessThan(size * 6 * 0.35);
              last = at;
              if (inPicture(pose.at, v, -0.1)) seen = true;
            }
            for (const t of [20, 30]) {
              m.pose(t, v, pose);
              const p = frameToPicture(pose.at, v);
              const half = size / 2;
              const offSide = p.d > 0 && (Math.abs(p.x) * p.d * v.tanHalfX - half > p.d * v.tanHalfX || Math.abs(p.y) * p.d * v.tanHalfY - half > p.d * v.tanHalfY);
              const faint = p.d > size * 6 * 3; // far off in the haze
              expect(p.d <= 0 || offSide || faint, `${motion} seed ${seed} size ${size} ${v === TALL ? "tall" : "wide"} at ${t}: ${JSON.stringify(p)}`).toBe(true);
            }
            if (motion !== "circle" || v !== TALL) expect(seen, `${motion} seed ${seed} size ${size} is never in the ${v === TALL ? "tall" : "wide"} picture`).toBe(true);
          }
        }
      }
    }
  });

  it("face the way they are seen to go: a crossing side-on, an approach face-on, an overtaking from behind", () => {
    const at = (motion: MotionKind, t: number) => {
      const yaws: number[] = [];
      for (const seed of SEEDS) {
        const m = motionBuilder(motion)!(contextOf(cue({}), visitOf(motion, seed)));
        const pose = newPose();
        m.pose(t, DEFAULT_VIEW, pose);
        yaws.push(Math.abs(Math.atan2(Math.sin(pose.yaw), Math.cos(pose.yaw))));
      }
      return yaws.reduce((a, b) => a + b, 0) / yaws.length;
    };
    const deg = 180 / Math.PI;
    expect(at("cross", 25) * deg).toBeGreaterThan(60);
    expect(at("cross", 25) * deg).toBeLessThan(120);
    expect(at("oncoming", 22) * deg).toBeGreaterThan(120);
    expect(at("overtake", 22) * deg).toBeLessThan(60);
  });

  it("keep an escort ahead of the one it goes with, on the side it faces, and over it while it comes straight on (F128)", () => {
    const leaderCue = cue({ figure: "pilgrims", size_m: 700 });
    const him = cue({ figure: "wukong", size_m: 250 });
    const e = temperamentOf("wukong").escorts!;
    const leaderAt = (at: { ahead: number; right: number; up: number }, yaw: number, presence = 1): PoseOf => (_t, _view, out) => {
      out.space = "frame";
      out.world = null;
      Object.assign(out.at, at);
      out.yaw = yaw;
      out.presence = presence;
      return true;
    };
    const escort = (leader: PoseOf) => motionBuilder("escort")!({ ...contextOf(him, visitOf("escort", 1, { leader: 0 })), leader, leaderCue });
    // In the middle of the picture, where there is room either side.
    const at = { ahead: 2400, right: 0, up: -420 };
    for (const yawDeg of [90, 235, -60, 180, 10]) {
      for (const presence of [1, 0.5, 0]) {
        const yaw = (yawDeg * Math.PI) / 180;
        const pose = newPose();
        expect(escort(leaderAt(at, yaw, presence)).pose(25, DEFAULT_VIEW, pose)).toBe(true);
        // A hair nearer the lens, the same in the picture: taken back out to measure.
        const k = 1 / (1 - ESCORT_NEARER);
        const back = { ahead: pose.at.ahead * k, right: pose.at.right * k, up: pose.at.up * k };
        const d = { ahead: back.ahead - at.ahead, right: back.right - at.right };
        // Across the line of sight, level, by its share of the other's size as drawn, on the side the other heads.
        const drawn = 700 * (0.6 + 0.4 * presence) * presence;
        const side = Math.max(-1, Math.min(1, Math.sin(yaw) / SIDE_AT));
        expect(d.ahead * at.ahead + d.right * at.right).toBeCloseTo(0, 6);
        expect(Math.hypot(d.ahead, d.right), `${yawDeg}° ${presence}`).toBeCloseTo(e.ahead * drawn * Math.abs(side), 6);
        const x = frameToPicture(pose.at, DEFAULT_VIEW).x - frameToPicture(at, DEFAULT_VIEW).x;
        if (Math.abs(side) > 0.5 && presence > 0) expect(Math.sign(x), `${yawDeg}°`).toBe(Math.sign(Math.sin(yaw)));
        expect(back.up - at.up).toBeCloseTo(drawn * (e.above + e.over * risen(e.ahead * Math.abs(side), e.rise)), 6);
        expect(pose.yaw).toBe(yaw);
        expect(pose.presence).toBe(presence);
      }
    }
    // Walking toward the near edge, wide or tall: in the picture while the other is, closing in and rising over it, and out with it.
    for (const view of [DEFAULT_VIEW, TALL]) {
      let lastUp = -Infinity;
      for (let x = 0; x <= 1.3; x += 0.05) {
        const near = pictureToFrame({ x, y: -0.5, d: 1500 }, view);
        const pose = newPose();
        escort(leaderAt(near, Math.PI / 2)).pose(25, view, pose);
        // Over the other is a little across from it in a pitched picture.
        const p = frameToPicture(pose.at, view);
        expect(p.x, `${x}`).toBeLessThanOrEqual(Math.max(ESCORT_KEEP_X, x + 0.05));
        expect(p.x, `${x}`).toBeGreaterThanOrEqual(x - 0.05);
        expect(pose.at.up, `${x}`).toBeGreaterThanOrEqual(lastUp - 1e-6);
        lastUp = pose.at.up;
      }
    }
    // High in the picture and coming straight on: it rises over the other no further than keeps its top in the picture.
    for (const view of [DEFAULT_VIEW, TALL]) {
      for (let y = 0; y <= 0.8; y += 0.1) {
        const high = pictureToFrame({ x: 0, y, d: 1500 }, view);
        const pose = newPose();
        escort(leaderAt(high, Math.PI)).pose(25, view, pose);
        const top = frameToPicture({ ...pose.at, up: pose.at.up + 250 * 1.15 }, view).y;
        const lowest = frameToPicture({ ...high, up: high.up + 700 * e.above + 250 * 1.15 }, view).y;
        expect(top, `${y}`).toBeLessThanOrEqual(Math.max(ESCORT_KEEP_Y, lowest) + 0.01);
        // Over the other; or, with no room even level with it, down beside it, clear of its painting (F130).
        const k = 1 / (1 - ESCORT_NEARER);
        const clear = Math.hypot(pose.at.ahead * k - high.ahead, pose.at.right * k - high.right) >= 0.6 * 700;
        expect(frameToPicture(pose.at, view).y > y || clear, `${y}`).toBe(true);
      }
    }
    // High and near the edge, with room neither ahead nor over: further ahead, part way past the edge, but not out.
    for (const view of [DEFAULT_VIEW, TALL]) {
      for (let x = 0.3; x <= 0.9; x += 0.1) {
        const near = pictureToFrame({ x, y: 0.6, d: 1500 }, view);
        const pose = newPose();
        escort(leaderAt(near, Math.PI / 2)).pose(25, view, pose);
        const p = frameToPicture(pose.at, view);
        expect(p.x, `${x}`).toBeLessThanOrEqual(Math.max(ESCORT_CROWDED_X, x + 0.05));
        expect(p.x, `${x}`).toBeGreaterThanOrEqual(x - 0.05);
      }
    }
    // Over the pilgrims his cloud clears their painting's outline: what must be under his feet, measured from
    // pilgrims-default.webp with his cloud's reach either side, in the party's size, by his middle ahead of theirs (F129).
    const outline: readonly (readonly [number, number])[] = [[0, 0.461], [0.08, 0.437], [0.12, 0.535], [0.16, 0.545], [0.24, 0.582], [0.4, 0.582], [0.44, 0.44], [0.52, 0.439], [0.56, 0.328], [0.6, 0]];
    for (let side = 0; side <= 1; side += 0.01) {
      const ahead = e.ahead * side;
      const feet = e.above + e.over * risen(ahead, e.rise);
      const under = Math.max(...outline.filter(([c]) => Math.abs(c - ahead) <= 0.04).map(([, n]) => n), 0);
      expect(feet - under, `side ${side.toFixed(2)}`).toBeGreaterThanOrEqual(0.02);
    }
    // With the other off stage, so is it.
    expect(escort(() => false).pose(25, DEFAULT_VIEW, newPose())).toBe(false);
  });

  it("keep a chaser a body's length behind the one it chases, across the picture, and over it straight on (F129)", () => {
    const bull = cue({ figure: "niumowang", size_m: 850 });
    const nezha = cue({ figure: "nezha", size_m: 310 });
    const at = { ahead: 1500, right: 0, up: -300 };
    for (const yawDeg of [90, -90, 235, 180]) {
      const yaw = (yawDeg * Math.PI) / 180;
      // Paused for its line: a second ago it stood where it stands.
      const leader: PoseOf = (_t, _view, out) => {
        out.space = "frame";
        out.world = null;
        Object.assign(out.at, at);
        out.yaw = yaw;
        out.presence = 1;
        return true;
      };
      const m = motionBuilder("chase")!({ ...contextOf(nezha, visitOf("chase", 3, { leader: 0, lagS: 1.2 })), leader, leaderCue: bull });
      const pose = newPose();
      expect(m.pose(25, DEFAULT_VIEW, pose)).toBe(true);
      const side = Math.max(-1, Math.min(1, Math.sin(yaw) / SIDE_AT));
      const x = frameToPicture(pose.at, DEFAULT_VIEW).x - frameToPicture(at, DEFAULT_VIEW).x;
      // Behind it: the other way from the way it faces, by at least the two half-lengths less the jitter across.
      if (Math.abs(side) > 0.5) expect(Math.sign(x), `${yawDeg}°`).toBe(-Math.sign(side));
      const across = Math.abs(pose.at.right - at.right);
      expect(across + 0.08 * Math.hypot(at.ahead, at.up), `${yawDeg}°`).toBeGreaterThanOrEqual(CHASE_APART * (850 + 310) * Math.abs(side) - 1e-6);
      if (Math.abs(side) < 1) expect(pose.at.up - at.up, `${yawDeg}°`).toBeGreaterThan(0.5 * 850 * (1 - Math.abs(side)));
    }
  });

  it("keep a train behind the one it attends, past its length across the picture and below its line, and never on it straight on (F136)", () => {
    const phoenix = cue({ figure: "phoenix", size_m: 670 });
    const egrets = cue({ figure: "egrets", size_m: 440 });
    const at = { ahead: 1500, right: 0, up: -300 };
    for (const yawDeg of [90, -90, 60, 180]) {
      const yaw = (yawDeg * Math.PI) / 180;
      const leader: PoseOf = (_t, _view, out) => {
        out.space = "frame";
        out.world = null;
        Object.assign(out.at, at);
        out.yaw = yaw;
        out.presence = 1;
        return true;
      };
      const m = motionBuilder("train")!({ ...contextOf(egrets, visitOf("train", 3, { leader: 0, lagS: 1.6 })), leader, leaderCue: phoenix });
      const pose = newPose();
      expect(m.pose(25, DEFAULT_VIEW, pose)).toBe(true);
      expect(pose.yaw, `${yawDeg}°`).toBe(yaw);
      const side = Math.max(-1, Math.min(1, Math.sin(yaw) / SIDE_AT));
      const x = frameToPicture(pose.at, DEFAULT_VIEW).x - frameToPicture(at, DEFAULT_VIEW).x;
      if (Math.abs(side) > 0.5) expect(Math.sign(x), `${yawDeg}°`).toBe(-Math.sign(side));
      const reach = Math.hypot(at.ahead, at.right, at.up);
      if (Math.abs(side) === 1) {
        // Wholly across: behind it past both half-lengths, and below its line.
        expect(Math.abs(pose.at.right - at.right) + 0.04 * reach, `${yawDeg}°`).toBeGreaterThanOrEqual(TRAIN_APART * (670 + 440) - 1e-6);
        expect(pose.at.up - at.up, `${yawDeg}°`).toBeLessThanOrEqual(-TRAIN_BELOW[0] * reach + 1e-6);
        expect(pose.at.up - at.up, `${yawDeg}°`).toBeGreaterThanOrEqual(-TRAIN_BELOW[1] * reach - 1e-6);
      } else if (Math.abs(side) < 0.2) {
        // Straight on: over it, or beside it where there is no room over it, never on it.
        const across = Math.abs(pose.at.right - at.right);
        const rise = pose.at.up - at.up;
        expect(across >= 0.25 * (670 + 440) || rise >= 0.3 * 670, `${yawDeg}°: across ${across.toFixed(0)}, rise ${rise.toFixed(0)}`).toBe(true);
      }
    }
  });

  it("keep a chaser off the one it chases where it comes straight at the lens, close, with no room over it (F129)", () => {
    const wukong = cue({ figure: "wukong", size_m: 130 });
    const nezha = cue({ figure: "nezha", size_m: 240 });
    for (const view of [DEFAULT_VIEW, TALL]) {
      for (const side of [-1, 1] as const) {
        for (const ahead of [500, 700, 1000]) {
          const at = { ahead, right: 0, up: -40 };
          const leader: PoseOf = (_t, _view, out) => {
            out.space = "frame";
            out.world = null;
            Object.assign(out.at, at);
            out.yaw = Math.PI;
            out.presence = 1;
            return true;
          };
          const pose = newPose();
          motionBuilder("chase")!({ ...contextOf(nezha, visitOf("chase", 3, { leader: 0, lagS: 1.2, side })), leader, leaderCue: wukong }).pose(25, view, pose);
          const h = Math.hypot(at.ahead, at.right);
          const across = Math.abs((pose.at.right - at.right) * (at.ahead / h) - (pose.at.ahead - at.ahead) * (at.right / h));
          const rise = pose.at.up - at.up;
          // Beside it by the most of the two half-widths, or over it, never on it.
          expect(across >= 0.25 * (130 + 240) || rise >= 0.9 * 130, `${ahead} m, side ${side}: across ${across.toFixed(0)}, rise ${rise.toFixed(0)}`).toBe(true);
        }
      }
    }
  });

  it("keep a figure in another's way on the side the other faces while it stops: ahead of it coming, turned to it while it stops, after it going (F130)", () => {
    const bull = cue({ figure: "niumowang", size_m: 850 });
    const nezha = cue({ figure: "nezha", size_m: 310 });
    // In from the left heading right, stopped from 24 to 28, then turned and back the way it came.
    const leader: PoseOf = (t, _view, out) => {
      out.space = "frame";
      out.world = null;
      Object.assign(out.at, { ahead: 1500, right: -300 + (t < 24 ? (t - 24) * 150 : t > 28.5 ? (28.5 - t) * 150 : 0), up: -300 });
      out.yaw = t < 28.5 ? Math.PI / 2 : -Math.PI / 2;
      out.presence = 1;
      return true;
    };
    const m = motionBuilder("block")!({ ...contextOf(nezha, visitOf("block", 3, { leader: 0, fromS: 20, untilS: 32, dwell: [24, 28] })), leader, leaderCue: bull });
    for (let t = 20; t <= 32; t += 0.25) {
      const pose = newPose();
      const lead = newPose();
      expect(m.pose(t, DEFAULT_VIEW, pose)).toBe(true);
      leader(t, DEFAULT_VIEW, lead);
      // To the other's right all the way, a body's length off across the picture, level with it.
      expect(frameToPicture(pose.at, DEFAULT_VIEW).x, `${t}`).toBeGreaterThan(frameToPicture(lead.at, DEFAULT_VIEW).x);
      expect(Math.hypot(pose.at.ahead - lead.at.ahead, pose.at.right - lead.at.right), `${t}`).toBeCloseTo(CHASE_APART * (850 + 310), 6);
      expect(pose.at.up).toBeCloseTo(lead.at.up, 6);
      // Turned to face it while it stops; the way it goes otherwise, which is ahead of it coming and after it going.
      if (t >= 24.5 && t <= 27.5) expect(Math.sin(pose.yaw), `${t}`).toBeLessThan(0);
      if (t < 23.9 || t > 28.1) expect(pose.yaw, `${t}`).toBe(lead.yaw);
    }
    expect(motionBuilder("block")!({ ...contextOf(nezha, visitOf("block", 3, { leader: 0 })), leader: () => false, leaderCue: bull }).pose(25, DEFAULT_VIEW, newPose())).toBe(false);
  });

  it("bring a follower down where the one it follows rides so high that even level with it its head would be out of the picture, but not down on it (F130)", () => {
    // Huangshan's pair as they were: a chaser nearly twice the height of the monkey he chases.
    const wukong = cue({ figure: "wukong", size_m: 130 });
    const nezha = cue({ figure: "nezha", size_m: 240 });
    const heightOf = (c: CastCue): number => (c.figure === "nezha" ? 1.033 : 1.178);
    const apart = CHASE_APART * (130 + 240);
    for (const view of [DEFAULT_VIEW, TALL]) {
      for (const y of [0, 0.3, 0.5, 0.7, 0.85]) {
        const at = pictureToFrame({ x: 0, y, d: 600 }, view);
        const leader: PoseOf = (_t, _view, out) => {
          out.space = "frame";
          out.world = null;
          Object.assign(out.at, at);
          out.yaw = Math.PI / 2;
          out.presence = 1;
          return true;
        };
        const pose = newPose();
        motionBuilder("chase")!({ ...contextOf(nezha, visitOf("chase", 3, { leader: 0, lagS: 1.2 })), leader, leaderCue: wukong, heightOf }).pose(25, view, pose);
        const top = frameToPicture({ ...pose.at, up: pose.at.up + 240 * 1.033 }, view).y;
        const across = Math.hypot(pose.at.ahead - at.ahead, pose.at.right - at.right);
        // Behind it with room, in a wide picture: down as far as keeps its head in, and no further.
        if (view === DEFAULT_VIEW) expect(top, `y ${y}`).toBeLessThanOrEqual(CHASE_KEEP.y + 1e-6);
        if (view === DEFAULT_VIEW && pose.at.up < at.up) expect(top, `y ${y}`).toBeCloseTo(CHASE_KEEP.y, 4);
        // Never down on it: in a tall picture, with no room behind it, it keeps over it and its head goes out first.
        if (pose.at.up < at.up) expect(across, `y ${y}`).toBeGreaterThanOrEqual(CHASE_CLEAR * apart);
      }
    }
  });

  it("keep a thing on the wind broadside to the lens the whole way", () => {
    const flags = cue({ figure: "lungta", facing_deg: 20 });
    for (const motion of TRANSIT_MOTIONS) {
      const m = motionBuilder(motion)!(contextOf(flags, visitOf(motion, 9)));
      const pose = newPose();
      for (const t of [21, 25, 29]) {
        m.pose(t, DEFAULT_VIEW, pose);
        expect(pose.yaw, `${motion} at ${t}`).toBeCloseTo((20 * Math.PI) / 180, 6);
      }
    }
  });

  it("pause where the author put a named figure, turned as the author turned it, for its line", () => {
    const c = cue({ facing_deg: 210, line: "Cranes over the cloud.", line_at: 24, from: 10, until: 60 });
    const off = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const author = (210 * Math.PI) / 180;
    for (const motion of TRANSIT_MOTIONS) {
      const m = motionBuilder(motion)!(contextOf(c, visitOf(motion, 5, { fromS: 20, untilS: 36, dwell: [23.6, 30.4], named: true })));
      const pose = newPose();
      m.pose(24.8, DEFAULT_VIEW, pose);
      const home = Math.hypot(1200, 300, 200);
      expect(Math.hypot(pose.at.ahead - 1200, pose.at.right - 300, pose.at.up + 200), motion).toBeLessThan(home * 0.12);
      m.pose(27, DEFAULT_VIEW, pose);
      // As the author turned it, or that mirrored to the side it drifts to (F120).
      const right = pose.at.right;
      const yaw = pose.yaw;
      m.pose(27.5, DEFAULT_VIEW, pose);
      const drift = pose.at.right - right;
      expect(Math.min(off(yaw, author), off(yaw, -author)), motion).toBeLessThan(0.05);
      if (off(yaw, author) > 0.05) expect(Math.sin(yaw) * drift, motion).toBeGreaterThan(0);
      expect(inPicture(pose.at, DEFAULT_VIEW), motion).toBe(true);
    }
  });

  it("never turn a named figure back across the picture against the way it goes (F120)", () => {
    const right = Math.PI / 2;
    const back = (250 * Math.PI) / 180;
    // Going right, a facing to the left is mirrored to the right, still turned toward the lens as the author turned it.
    expect(Math.sin(facingAlong(back, right))).toBeGreaterThan(0);
    expect(Math.cos(facingAlong(back, right))).toBeCloseTo(Math.cos(back), 9);
    // A facing already to the side it goes is kept; so is any facing of a figure coming toward the lens.
    expect(facingAlong(back, -right)).toBe(back);
    expect(facingAlong(back, Math.PI)).toBe(back);
  });
});

describe("the temperaments", () => {
  it("name only motions that exist, figures that exist, and keep play to the monkey and his pursuer", () => {
    for (const [kind, t] of Object.entries(TEMPERAMENTS)) {
      expect(FIGURE_KINDS as readonly string[]).toContain(kind);
      for (const m of Object.keys(t!.moves)) expect([...TRANSIT_MOTIONS, ...WORLD_TRANSIT_MOTIONS] as readonly string[], `${kind} ${m}`).toContain(m);
      for (const k of [...t!.chases, ...t!.blocks]) expect(FIGURE_KINDS as readonly string[]).toContain(k);
      for (const k of t!.attends) expect(FIGURE_KINDS as readonly string[]).toContain(k);
      if (t!.escorts) expect(FIGURE_KINDS as readonly string[]).toContain(t!.escorts.figure);
      if (kind !== "wukong") expect(t!.moves.blink ?? 0, kind).toBe(0);
      expect(t!.band[0]).toBeLessThan(t!.band[1]);
    }
    for (const kind of LIVING_FAITHS) expect(temperamentOf(kind).stately, kind).toBe(true);
    expect(temperamentOf("no-such-figure")).toBe(GENERIC);
    expect(temperamentOf("nezha").chases).toEqual(["wukong"]);
    expect(temperamentOf("nezha").blocks).toEqual(["niumowang"]);
    expect(temperamentOf("wukong").chases).toEqual(["niumowang"]);
    expect(temperamentOf("wukong").escorts?.figure).toBe("pilgrims");
    expect(temperamentOf("egrets").attends).toEqual(["phoenix"]);
    expect(temperamentOf("lungta").facesPath).toBe(false);
  });
});

describe("the director", () => {
  const { film } = loadFilm();

  it("draws the same plan from the same seed, and another from another", () => {
    for (const s of film.scenes) {
      expect(planScene(s, 11)).toEqual(planScene(s, 11));
    }
    const differ = film.scenes.filter((s) => JSON.stringify(planScene(s, 11)) !== JSON.stringify(planScene(s, 12)));
    expect(differ.length).toBe(film.scenes.length);
  });

  it("keeps every named figure in the picture, in place, for every second of its line, whatever the seed", () => {
    for (const s of film.scenes) {
      for (const seed of SEEDS) {
        const plan = planScene(s, seed);
        s.cast.forEach((c, i) => {
          if (!plan.cues[i]!.cast || !c.line) return;
          const named = plan.cues[i]!.visits.find((v) => v.named);
          expect(named, `${s.id} ${c.figure} seed ${seed}`).toBeDefined();
          if (c.role === "monument") return;
          const end = Math.min(c.lineAtS + CAST_LINE_SHOW_S, c.untilS - 1);
          expect(named!.dwell![0], `${s.id} ${c.figure} seed ${seed}`).toBeLessThanOrEqual(c.lineAtS + 1);
          expect(named!.dwell![1], `${s.id} ${c.figure} seed ${seed}`).toBeGreaterThanOrEqual(end);
          const m = motionBuilder(named!.motion)!({ cue: c, visit: named!, temperament: temperamentOf(c.figure), rng: new Rng(named!.seed), leader: null });
          const pose = newPose();
          for (let t = c.lineAtS + 1; t <= end; t += 0.5) {
            expect(m.pose(t, DEFAULT_VIEW, pose)).toBe(true);
            expect(inPicture(pose.at, DEFAULT_VIEW, 0.15), `${s.id} ${c.figure} seed ${seed} at ${t}`).toBe(true);
          }
        });
      }
    }
  });

  it("keeps each figure's visits inside its cue and apart, and the picture uncrowded", () => {
    for (const s of film.scenes) {
      for (const seed of SEEDS) {
        const plan = planScene(s, seed, temperamentOf, sightOf(s));
        const passing: Visit[] = [];
        const risings: Visit[] = [];
        s.cast.forEach((c, i) => {
          const vs = plan.cues[i]!.visits;
          if (!plan.cues[i]!.cast) return expect(vs).toEqual([]);
          if (c.role === "monument" && !repertoire(c, temperamentOf(c.figure)).surface) return expect(vs.map((v) => [v.motion, v.fromS, v.untilS])).toEqual([["anchor", c.fromS, c.untilS]]);
          if (c.role === "monument") {
            // A monument that surfaces: up and under inside its cue, standing between, and a while apart.
            vs.forEach((v, k) => {
              expect(v.motion).toBe("surface");
              expect(v.fromS).toBeGreaterThanOrEqual(c.fromS);
              expect(v.untilS).toBeLessThanOrEqual(c.untilS);
              expect(v.dwell![0]).toBeGreaterThan(v.fromS);
              expect(v.dwell![1]).toBeLessThan(v.untilS);
              if (k > 0) expect(v.fromS, `${s.id} ${c.variant} seed ${seed}`).toBeGreaterThanOrEqual(vs[k - 1]!.untilS + temperamentOf(c.figure).gapS[0] - 1e-9);
            });
            risings.push(...vs);
            return;
          }
          vs.forEach((v, k) => {
            expect(v.fromS, `${s.id} ${c.figure}`).toBeGreaterThanOrEqual(c.fromS);
            expect(v.untilS, `${s.id} ${c.figure}`).toBeLessThanOrEqual(c.untilS);
            expect(v.untilS).toBeGreaterThan(v.fromS);
            if (k > 0) expect(v.fromS, `${s.id} ${c.figure} seed ${seed}`).toBeGreaterThan(vs[k - 1]!.untilS);
            if (!FOLLOW_MOTIONS.includes(v.motion) && v.motion !== "hold") passing.push(v);
          });
        });
        for (let t = 0; t < 114; t += 0.25) {
          const on = passing.filter((v) => v.fromS <= t && v.untilS > t);
          if (on.some((v) => !v.named)) expect(on.length, `${s.id} seed ${seed} at ${t}`).toBeLessThanOrEqual(CROWD + on.filter((v) => v.named).length);
          const up = risings.filter((v) => v.fromS <= t && v.untilS > t);
          if (up.some((v) => !v.named)) expect(up.length, `${s.id} seed ${seed} at ${t}`).toBeLessThanOrEqual(RISEN + up.filter((v) => v.named).length);
        }
      }
    }
  });

  it("leaves each line the picture to itself: no companion passes on its own way while another is named (D94)", () => {
    for (const s of film.scenes) {
      for (const seed of SEEDS) {
        const plan = planScene(s, seed, temperamentOf, sightOf(s));
        s.cast.forEach((named, j) => {
          if (!plan.cues[j]!.cast || !named.line) return;
          const from = named.lineAtS - LINE_ALONE_S[0];
          const until = named.lineAtS + CAST_LINE_SHOW_S + LINE_ALONE_S[1];
          s.cast.forEach((c, i) => {
            if (i === j || c.role !== "companion") return;
            for (const v of plan.cues[i]!.visits) {
              if (v.named || FOLLOW_MOTIONS.includes(v.motion) || v.motion === "hold" || v.reaction) continue;
              expect(v.untilS <= from || v.fromS >= until, `${s.id} ${c.figure} across ${named.figure}'s line, seed ${seed}`).toBe(true);
            }
          });
        });
      }
    }
  });

  it("empties the sky between visits: no companion rides the whole of its cue any more", () => {
    let shown = 0;
    let total = 0;
    for (const s of film.scenes) {
      const plan = planScene(s, 3);
      s.cast.forEach((c, i) => {
        if (c.role !== "companion" || !plan.cues[i]!.cast) return;
        total += c.untilS - c.fromS;
        shown += plan.cues[i]!.visits.reduce((a, v) => a + v.untilS - v.fromS, 0);
      });
    }
    expect(shown / total).toBeLessThan(0.6);
    expect(shown / total).toBeGreaterThan(0.2);
  });

  it("sends Nezha after Wukong where both are cast, a second or so behind", () => {
    const huangshan = film.scenes.find((s) => s.id === "huangshan")!;
    const nezha = huangshan.cast.findIndex((c) => c.figure === "nezha");
    const wukong = huangshan.cast.findIndex((c) => c.figure === "wukong");
    let chases = 0;
    for (const seed of SEEDS) {
      for (const v of planScene(huangshan, seed).cues[nezha]!.visits.filter((x) => x.motion === "chase")) {
        chases++;
        expect(v.leader).toBe(wukong);
        expect(v.lagS).toBeGreaterThanOrEqual(0.9);
        expect(v.lagS).toBeLessThanOrEqual(1.6);
      }
    }
    expect(chases).toBeGreaterThan(SEEDS.length);
    // Beside the monkey he is about the monkey's size, not twice it (F130).
    const ratio = huangshan.cast[nezha]!.sizeM / huangshan.cast[wukong]!.sizeM;
    expect(ratio).toBeGreaterThanOrEqual(1);
    expect(ratio).toBeLessThan(1.25);
  });

  it("sends Wukong after the Bull Demon King at the Flaming Mountains and puts Nezha in his way, neither after the other (F130)", () => {
    const turpan = film.scenes.find((s) => s.id === "below-the-sea")!;
    const bull = turpan.cast.findIndex((c) => c.figure === "niumowang");
    const b = turpan.cast[bull]!;
    const nezha = turpan.cast.findIndex((c) => c.figure === "nezha");
    const wukong = turpan.cast.findIndex((c) => c.figure === "wukong" && c.fromS < b.untilS && b.fromS < c.untilS);
    let blocked = 0;
    let chased = 0;
    for (const seed of SEEDS) {
      const plan = planScene(turpan, seed, temperamentOf, sightOf(turpan));
      const his = plan.cues[bull]!.visits;
      const nezhas = plan.cues[nezha]!.visits.filter((v) => v.leader !== null);
      for (const v of nezhas) {
        expect(v.motion, `seed ${seed}`).toBe("block");
        expect(v.leader).toBe(bull);
        // For one of the Bull's visits that stops, its seconds and its stop.
        expect(his.some((h) => h.dwell !== null && h.fromS === v.fromS && h.untilS === v.untilS && h.dwell === v.dwell), `seed ${seed}`).toBe(true);
      }
      const wukongs = plan.cues[wukong]!.visits.filter((v) => v.leader !== null);
      for (const v of wukongs) {
        expect(v.motion, `seed ${seed}`).toBe("chase");
        expect(v.leader).toBe(bull);
      }
      if (nezhas.length > 0) blocked++;
      if (wukongs.length > 0) chased++;
    }
    // Wukong was over the Flaming Mountains in one viewing in twelve, crowded out by the lines there.
    expect(blocked).toBeGreaterThan(0.6 * SEEDS.length);
    expect(chased).toBeGreaterThan(0.6 * SEEDS.length);
  });

  it("sends the egrets in the phoenix's train, a moment behind every visit of its that their cue holds, and always for its line (F136)", () => {
    const karst = film.scenes.find((s) => s.id === "karst")!;
    const phoenix = karst.cast.findIndex((c) => c.figure === "phoenix");
    const egrets = karst.cast.findIndex((c) => c.figure === "egrets");
    const e = karst.cast[egrets]!;
    expect(karst.cast[phoenix]!.chance, "the king of birds comes every viewing").toBe(1);
    let visits = 0;
    let trains = 0;
    for (const seed of SEEDS) {
      const plan = planScene(karst, seed, temperamentOf, sightOf(karst));
      const theirs = plan.cues[phoenix]!.visits;
      const own = plan.cues[egrets]!.visits;
      for (const v of own.filter((w) => w.motion === "train")) {
        expect(v.leader, `seed ${seed}`).toBe(phoenix);
        expect(v.lagS).toBeGreaterThanOrEqual(1.2);
        expect(v.lagS).toBeLessThanOrEqual(2.2);
        expect(theirs.some((lv) => Math.abs(lv.fromS + v.lagS - v.fromS) < 1e-9 && Math.abs(lv.untilS + v.lagS - v.untilS) < 1e-9), `seed ${seed}`).toBe(true);
      }
      // Their own way is gone: only their line, the train, and a herald's hover.
      for (const v of own) expect(v.motion === "train" || v.named || v.reaction !== null, `seed ${seed} ${v.motion} at ${v.fromS}`).toBe(true);
      for (const lv of theirs) {
        const fits = lv.fromS + 2.2 >= e.fromS && lv.untilS + 2.2 <= e.untilS && !own.some((w) => w.motion !== "train" && w.fromS < lv.untilS + 3.2 && lv.fromS < w.untilS + 1);
        if (!fits) continue;
        visits += 1;
        const behind = own.find((w) => w.motion === "train" && Math.abs(w.fromS - w.lagS - lv.fromS) < 1e-9);
        if (behind) trains += 1;
        if (lv.named) expect(behind, `seed ${seed}: the phoenix named without its train`).toBeDefined();
      }
    }
    expect(visits).toBeGreaterThan(SEEDS.length * 1.5);
    expect(trains / visits).toBeGreaterThan(0.95);
  });

  it("sends Wukong with the pilgrims wherever both are cast, for each of their visits and no other (F128)", () => {
    let escorts = 0;
    for (const s of film.scenes) {
      const pilgrims = s.cast.findIndex((c) => c.figure === "pilgrims");
      if (pilgrims < 0) continue;
      const p = s.cast[pilgrims]!;
      const withThem = s.cast.flatMap((c, i) => (c.figure === "wukong" && c.fromS < p.untilS && p.fromS < c.untilS ? [i] : []));
      // The monk rides out of Chang'an alone (the Loess): the monkey is the first disciple, taken on later.
      if (p.variant === "monk") {
        expect(withThem, s.id).toEqual([]);
        continue;
      }
      expect(withThem.length, `${s.id}: the pilgrims without Wukong`).toBe(1);
      const w = s.cast[withThem[0]!]!;
      expect(w.fromS, s.id).toBeLessThanOrEqual(p.fromS);
      expect(w.untilS, s.id).toBeGreaterThanOrEqual(p.untilS);
      // A monkey on foot is Sha's height or a little under: about a third of the party's length.
      expect(w.sizeM / p.sizeM, s.id).toBeGreaterThan(0.33);
      expect(w.sizeM / p.sizeM, s.id).toBeLessThan(0.4);
      for (const seed of SEEDS) {
        const plan = planScene(s, seed, temperamentOf, sightOf(s));
        const theirs = plan.cues[pilgrims]!.visits;
        const his = plan.cues[withThem[0]!]!.visits;
        expect(his.map((v) => [v.motion, v.fromS, v.untilS, v.leader, v.named]), `${s.id} seed ${seed}`).toEqual(theirs.map((v) => ["escort", v.fromS, v.untilS, pilgrims, v.named]));
        escorts += his.length;
      }
    }
    expect(escorts).toBeGreaterThan(SEEDS.length * 5);
  });

  it("casts a figure with a chance in about that share of viewings, and a cue's own motions over its temperament", () => {
    const scene = { id: "test", cast: [cue({ chance: 0.3 }), cue({ motion: ["rise"], from: 0, until: 114 })] };
    let cast = 0;
    for (let seed = 0; seed < 1000; seed++) {
      const plan = planScene(scene, seed);
      if (plan.cues[0]!.cast) cast++;
      for (const v of plan.cues[1]!.visits) expect(v.motion).toBe("rise");
    }
    expect(cast).toBeGreaterThan(240);
    expect(cast).toBeLessThan(360);
    const held = planScene({ id: "test", cast: [cue({ motion: "hold", from: 5, until: 50 })] }, 1).cues[0]!.visits;
    expect(held.map((v) => [v.motion, v.fromS, v.untilS])).toEqual([["hold", 5, 50]]);
  });
});

describe("a cue's motion", () => {
  it("names motions its role can take, and a chance of being cast", () => {
    expect(cue({ motion: ["cross", "rise"] }).motions).toEqual(["cross", "rise"]);
    expect(cue({ motion: "oncoming" }).motions).toEqual(["oncoming"]);
    expect(cue({}).motions).toBeNull();
    expect(cue({}).chance).toBe(1);
    expect(cue({ chance: 0.4 }).chance).toBe(0.4);
    const cases: [Record<string, unknown>, string][] = [
      [{ motion: "teleport" }, "motion"],
      [{ motion: "chase" }, "motion"],
      [{ motion: "anchor" }, "motion"],
      [{ motion: [] }, "motion"],
      [{ chance: 0 }, "chance"],
      [{ chance: 1.5 }, "chance"],
      [{ chance: "often" }, "chance"],
    ];
    for (const [raw, field] of cases) {
      const fields: string[] = [];
      expect(cueFromRaw({ figure: "cranes", role: "companion", offset: { ahead_m: 1200, right_m: 0, up_m: 0 }, size_m: 260, ...raw }, (f) => fields.push(f)), JSON.stringify(raw)).toBeNull();
      expect(fields).toContain(field);
    }
    const fields: string[] = [];
    expect(cueFromRaw({ figure: "dragon", role: "monument", at: { lat: 30.1, lon: 118.2, above_ground_m: 500 }, size_m: 1500, motion: "cross" }, (f) => fields.push(f))).toBeNull();
    expect(fields).toContain("motion");
  });
});

describe("the seed", () => {
  it("comes from the address when it is there, and fresh otherwise", () => {
    expect(seedAtStart("?cast&castseed=7")).toBe(7);
    expect(seedAtStart("?cast", () => 99)).toBe(99);
    expect(seedAtStart("?castseed=-3", () => 5)).toBe(5);
    expect(seedAtStart("?castseed=soon", () => 5)).toBe(5);
  });
});

describe("the layer", () => {
  const light = { sunDirection: new Vector3(0, 1, 0), sunColor: new Color(1, 1, 1), ambientZenith: new Color(0.5, 0.6, 0.8), ambientGround: new Color(0.3, 0.3, 0.3), skyHorizon: new Color(0.8, 0.8, 0.9), hazeDensity: 0, daylight: 1 };
  const flat = { toWorld: (e: number, n: number, a: number) => new Vector3(e / 8, a * 0.75, n / 8), groundElevationM: () => null };

  it("holds a companion where its motion puts it at the Roof's speed, across a rebase, and says only a cast figure's line", () => {
    const named = cue({ motion: "cross", line: "Cranes over the plateau.", line_at: 30, from: 10, until: 60 });
    const unseen = cue({ figure: "turtle", chance: 0.0001, line: "A turtle.", line_at: 50, from: 40, until: 100 });
    const layer = new CastLayer({ scene: new ThreeScene(), terrain: flat, scale: DEFAULT_SCALE, seed: 21 });
    layer.setScene({ id: "roof", cast: [named, unseen] } as unknown as Scene);
    expect(layer.figures).toHaveLength(1);
    expect(layer.lineAt(31)).toBe(named);
    expect(layer.lineAt(51)).toBeNull();

    const visit = layer.plan!.cues[0]!.visits.find((v) => v.named)!;
    const motion = motionBuilder(visit.motion)!({ cue: named, visit, temperament: temperamentOf("cranes"), rng: new Rng(visit.seed), leader: null });
    const heading = 0.4;
    const speed = 750; // world units a second: 360 km/min at 1:8
    const eye = new Vector3(0, 3000, 0);
    const group = layer.figures[0]!.group;
    const pose = newPose();
    for (let k = 0; k <= 120; k++) {
      const t = visit.fromS + k / 20;
      eye.x += (Math.sin(heading) * speed) / 20;
      eye.z += (Math.cos(heading) * speed) / 20;
      if (k === 60) eye.set(0, 3000, 0); // the world's origin moves under the camera
      layer.frame({ timeS: t, flightS: t, eye: eye.clone(), headingRad: heading, eastM: eye.x * 8, northM: eye.z * 8, altitudeM: 4000, light });
      // At a visit's very ends it has no presence and the layer hides it.
      if (!motion.pose(t, DEFAULT_VIEW, pose) || pose.presence <= 0) continue;
      expect(group.visible).toBe(true);
      const want = new Vector3(Math.sin(heading), 0, Math.cos(heading))
        .multiplyScalar(toWorldH(pose.at.ahead, DEFAULT_SCALE))
        .add(new Vector3(Math.cos(heading), 0, -Math.sin(heading)).multiplyScalar(toWorldH(pose.at.right, DEFAULT_SCALE)))
        .add(new Vector3(0, toWorldH(pose.at.up, DEFAULT_SCALE), 0));
      expect(group.position.clone().sub(eye).distanceTo(want), `at ${t.toFixed(2)}`).toBeLessThan(1e-6);
    }
  });
});
