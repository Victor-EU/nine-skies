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
import { CUE_MOTIONS, MOTION_KINDS, TRANSIT_MOTIONS, WORLD_TRANSIT_MOTIONS, motionSuits, type MotionKind } from "../../engine/src/cast/moves.js";
import { DEFAULT_VIEW, facingAlong, frameToPicture, inPicture, motionBuilder, newPose, pictureToFrame, registeredMotions, type MotionContext, type View, type Visit } from "../../engine/src/cast/motion.js";
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
      if (t!.chases) expect(FIGURE_KINDS as readonly string[]).toContain(t!.chases);
      if (kind !== "wukong") expect(t!.moves.blink ?? 0, kind).toBe(0);
      expect(t!.band[0]).toBeLessThan(t!.band[1]);
    }
    for (const kind of LIVING_FAITHS) expect(temperamentOf(kind).stately, kind).toBe(true);
    expect(temperamentOf("no-such-figure")).toBe(GENERIC);
    expect(temperamentOf("nezha").chases).toBe("wukong");
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
            if (v.motion !== "chase" && v.motion !== "hold") passing.push(v);
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
              if (v.named || v.motion === "chase" || v.motion === "hold" || v.reaction) continue;
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
