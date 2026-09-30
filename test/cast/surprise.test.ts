/**
 * What makes the cast surprising (D93): monuments that surface on their own
 * timing and mostly where the flight is looking; heads that turn to the
 * lens, and to what is coming; omens a moment before an arrival, whose
 * witnesses scatter or look; and figures rare enough to be missed.
 */
import { describe, expect, it } from "vitest";
import { Color, Object3D, Scene as ThreeScene, Vector3 } from "three";
import { cueFromRaw } from "../../content/cast.ts";
import { CastLayer } from "../../engine/src/cast/cast.js";
import { arrivalOf, planScene } from "../../engine/src/cast/director.js";
import { figureBuilder } from "../../engine/src/cast/figure.js";
import "../../engine/src/cast/figures/index.js";
import { FIGURE_KINDS } from "../../engine/src/cast/kinds.js";
import { DEFAULT_VIEW, frameToPicture, inPicture, motionBuilder, newPose, pictureToFrame, type MotionContext, type Visit } from "../../engine/src/cast/motion.js";
import "../../engine/src/cast/motions/index.js";
import { OMEN_KINDS, OMENS, omenWrap, registeredOmens, witnesses, type Reaction } from "../../engine/src/cast/omens.js";
import "../../engine/src/cast/omens/index.js";
import { hashSeed, Rng } from "../../engine/src/cast/random.js";
import { placeKey, sightOf } from "../../engine/src/cast/sight.js";
import { SKINS } from "../../engine/src/cast/skin.js";
import { TEMPERAMENTS, temperamentOf } from "../../engine/src/cast/temperament.js";
import { CAST_LINE_SHOW_S, type CastCue, type Scene } from "../../engine/src/film/scene.js";
import { DEFAULT_SCALE } from "../../engine/src/sim/scale.js";
import { loadFilm } from "../../tools/film.ts";

const { film } = loadFilm();
const huangshan = film.scenes.find((s) => s.id === "huangshan")!;
const SEEDS = Array.from({ length: 60 }, (_, i) => hashSeed("surprise", i));
const cue = (raw: Record<string, unknown>): CastCue =>
  cueFromRaw({ figure: "cranes", role: "companion", offset: { ahead_m: 1200, right_m: 300, up_m: -200 }, size_m: 260, ...raw }, (f, m) => {
    throw new Error(`${f}: ${m}`);
  })!;
const visitOf = (motion: Visit["motion"], over: Partial<Visit> = {}): Visit => ({ motion, fromS: 20, untilS: 30, dwell: null, named: false, side: 1, leader: null, lagS: 0, seed: 5, glance: null, reaction: null, ...over });
const contextOf = (c: CastCue, visit: Visit): MotionContext => ({ cue: c, visit, temperament: temperamentOf(c.figure), rng: new Rng(visit.seed), leader: null });

describe("a monument that surfaces", () => {
  const king = huangshan.cast.find((c) => c.variant === "east-king")!;
  const visit = visitOf("surface", { fromS: 20, untilS: 44, dwell: [27, 37] });
  const m = motionBuilder("surface")!(contextOf(king, visit));
  const pose = newPose();
  const at = (t: number) => (m.pose(t, DEFAULT_VIEW, pose), { ...pose.world!, pitch: pose.pitch, presence: pose.presence });

  it("comes up from under its place, stands there, and goes under again, without a jump", () => {
    const place = king.at!.aboveGroundM;
    expect(at(20).aboveGroundM).toBeLessThan(0);
    expect(at(44).aboveGroundM).toBeLessThan(0);
    for (let t = 27; t <= 37; t += 0.5) expect(Math.abs(at(t).aboveGroundM - place), `at ${t}`).toBeLessThan(0.02 * king.sizeM);
    expect(at(32).presence).toBe(1);
    let last = at(20).aboveGroundM;
    for (let t = 20; t <= 44; t += 1 / 30) {
      const h = at(t).aboveGroundM;
      expect(Math.abs(h - last), `at ${t.toFixed(2)}`).toBeLessThan(0.05 * king.sizeM);
      last = h;
    }
    expect(m.pose(45, DEFAULT_VIEW, pose)).toBe(false);
  });

  it("rises nose up and dives nose down, swimming along its bearing", () => {
    expect(at(23).pitch).toBeGreaterThan(0.2);
    expect(at(41).pitch).toBeLessThan(-0.2);
    const a = at(23);
    const b = at(41);
    const bearing = (king.facingDeg * Math.PI) / 180;
    const along = (b.eastM! - a.eastM!) * Math.sin(bearing) + (b.northM! - a.northM!) * Math.cos(bearing);
    expect(along).toBeGreaterThan(0.3 * king.sizeM);
  });
});

describe("the sight", () => {
  it("sees what is ahead of the rail, not what is behind it, and needs a rail", () => {
    const sight = sightOf(huangshan)!;
    const [k0, k1] = huangshan.rail;
    const ahead = sight({ lat: k0!.lat + 0.6 * (k1!.lat - k0!.lat), lon: k0!.lon + 0.6 * (k1!.lon - k0!.lon) }, 0)!;
    expect(ahead.aheadM).toBeGreaterThan(0);
    expect(Math.abs(ahead.x)).toBeLessThan(0.3);
    expect(sight({ lat: k0!.lat - 0.6 * (k1!.lat - k0!.lat), lon: k0!.lon - 0.6 * (k1!.lon - k0!.lon) }, 0)).toBeNull();
    expect(sightOf({ rail: [] })).toBeNull();
  });

  it("does not see a place while the ground stands between it and the lens (F133)", () => {
    const north = huangshan.cast.find((c) => c.variant === "north-king")!;
    const spans = huangshan.behind?.[placeKey(north.at!)];
    expect(spans?.length).toBeGreaterThan(0);
    const across = sightOf({ rail: huangshan.rail })!;
    const sight = sightOf(huangshan)!;
    let checked = 0;
    for (const [a, b] of spans!) {
      for (let t = a; t < b; t += 0.5) {
        if (!across(north.at!, t)) continue;
        expect(sight(north.at!, t), `at ${t}`).toBeNull();
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
    // Clear of the ground, it is seen as it was.
    const clear = [0, 30, 45].find((t) => !spans!.some(([a, b]) => t >= a && t < b) && across(north.at!, t))!;
    expect(sight(north.at!, clear)).toEqual(across(north.at!, clear));
  });

  it("brings the Dragon Kings up where the flight is looking, most of the time, and every king up in most viewings", () => {
    const sight = sightOf(huangshan)!;
    const share = (plan: (seed: number) => ReturnType<typeof planScene>) => {
      let risings = 0;
      let seen = 0;
      let absent = 0;
      for (const seed of SEEDS) {
        plan(seed).cues.forEach((cp, i) => {
          const c = huangshan.cast[i]!;
          if (c.role !== "monument") return;
          if (cp.visits.length === 0) absent++;
          for (const v of cp.visits) {
            risings++;
            const x = sight(c.at!, arrivalOf(v));
            if (x && Math.abs(x.x) <= 0.8) seen++;
          }
        });
      }
      return { seen: seen / risings, absent: absent / (huangshan.cast.filter((c) => c.role === "monument").length * SEEDS.length) };
    };
    const looked = share((seed) => planScene(huangshan, seed, temperamentOf, sight));
    const blind = share((seed) => planScene(huangshan, seed));
    expect(looked.seen).toBeGreaterThan(0.7);
    expect(looked.seen).toBeGreaterThan(blind.seen + 0.2);
    expect(looked.absent).toBeLessThan(0.25);
  });

  it("stands the four kings together for every second of their line, mid-picture and clear of the peaks, and no king alone while they are up (F133)", () => {
    const sight = sightOf(huangshan)!;
    const four = huangshan.cast.findIndex((c) => c.variant === "four-kings");
    const c = huangshan.cast[four]!;
    expect(c.line).toMatch(/four Dragon Kings/);
    for (const seed of SEEDS) {
      const plan = planScene(huangshan, seed, temperamentOf, sight);
      const named = plan.cues[four]!.visits.find((v) => v.named)!;
      expect(named.motion).toBe("surface");
      expect(named.dwell![0]).toBeLessThanOrEqual(c.lineAtS);
      expect(named.dwell![1]).toBeGreaterThanOrEqual(c.lineAtS + CAST_LINE_SHOW_S);
      for (let t = c.lineAtS; t <= c.lineAtS + CAST_LINE_SHOW_S; t += 0.5) expect(Math.abs(sight(c.at!, t)?.x ?? Infinity), `at ${t}`).toBeLessThanOrEqual(0.8);
      huangshan.cast.forEach((k, i) => {
        if (k.figure !== "dragon" || i === four) return;
        for (const v of plan.cues[i]!.visits) expect(v.fromS >= named.untilS || v.untilS <= named.fromS, `${k.variant} ${v.fromS}–${v.untilS}`).toBe(true);
      });
    }
  });

  it("brings each king up on his own after, where he is seen, in most viewings (F133)", () => {
    const sight = sightOf(huangshan)!;
    const kings = huangshan.cast.flatMap((c, i) => (c.figure === "dragon" && c.variant !== "four-kings" ? [i] : []));
    expect(kings).toHaveLength(4);
    for (const i of kings) {
      const c = huangshan.cast[i]!;
      let seen = 0;
      for (const seed of SEEDS) {
        const visits = planScene(huangshan, seed, temperamentOf, sight).cues[i]!.visits;
        if (visits.some((v) => { for (let t = v.dwell![0]; t <= v.dwell![1]; t += 0.5) if (Math.abs(sight(c.at!, t)?.x ?? Infinity) <= 1) return true; return false; })) seen++;
      }
      expect(seen / SEEDS.length, c.variant!).toBeGreaterThan(0.85);
    }
  });
});

describe("a glance", () => {
  it("falls inside its visit, never while the figure is named, as often as the figure is curious", () => {
    const tally = new Map<string, [number, number]>();
    for (const s of film.scenes) {
      const sight = sightOf(s);
      for (const seed of SEEDS.slice(0, 30)) {
        planScene(s, seed, temperamentOf, sight).cues.forEach((cp, i) => {
          const figure = s.cast[i]!.figure;
          for (const v of cp.visits) {
            if (v.named || v.motion === "anchor" || v.motion === "hold") {
              expect(v.glance).toBeNull();
              continue;
            }
            const [n, g] = tally.get(figure) ?? [0, 0];
            tally.set(figure, [n + 1, g + (v.glance ? 1 : 0)]);
            if (!v.glance) continue;
            expect(v.glance[0]).toBeGreaterThanOrEqual(v.fromS);
            expect(v.glance[1]).toBeLessThanOrEqual(v.untilS);
            expect(v.glance[1]).toBeGreaterThan(v.glance[0]);
          }
        });
      }
    }
    for (const figure of ["guanyin", "carp"]) expect(tally.get(figure)?.[1] ?? 0, figure).toBe(0);
    const [n, g] = tally.get("wukong")!;
    expect(g / n).toBeGreaterThan(0.45);
    expect(g / n).toBeLessThan(0.8);
  });

  it("turns the head, not the body, toward the lens while a figure is named, and lets it go after", () => {
    const light = { sunDirection: new Vector3(0, 1, 0), sunColor: new Color(1, 1, 1), ambientZenith: new Color(0.5, 0.6, 0.8), ambientGround: new Color(0.3, 0.3, 0.3), skyHorizon: new Color(0.8, 0.8, 0.9), hazeDensity: 0, daylight: 1 };
    const flat = { toWorld: (e: number, n: number, a: number) => new Vector3(e / 8, a * 0.75, n / 8), groundElevationM: () => null };
    const monkey = cue({ figure: "wukong", size_m: 70, offset: { ahead_m: 600, right_m: -170, up_m: -10 }, facing_deg: 90, motion: "cross", line: "The monkey.", line_at: 30, from: 10, until: 60 });
    const layer = new CastLayer({ scene: new ThreeScene(), terrain: flat, scale: DEFAULT_SCALE, seed: 4 });
    layer.setScene({ id: "test", cast: [monkey] } as unknown as Scene);
    const figure = layer.figures[0]!;
    const head = figure.heads![0]!;
    const named = layer.plan!.cues[0]!.visits.find((v) => v.named)!;
    const eye = new Vector3(0, 3000, 0);
    const frame = (t: number) => layer.frame({ timeS: t, flightS: t, eye, headingRad: 0, eastM: 0, northM: 0, altitudeM: 4000, light });
    const facing = (o: Object3D) => new Vector3(0, 0, 1).transformDirection(o.matrixWorld);
    frame(33);
    figure.group.updateMatrixWorld(true);
    const toLens = eye.clone().sub(head.pivot.getWorldPosition(new Vector3())).normalize();
    expect(head.pivot.rotation.y !== 0 || head.pivot.rotation.x !== 0).toBe(true);
    expect(facing(head.pivot).angleTo(toLens)).toBeLessThan(facing(head.pivot.parent!).angleTo(toLens) - 0.1);
    // Past its line and its turn back, the head is at rest again.
    frame(named.dwell![1] + 1.5);
    expect(figure.group.visible).toBe(true);
    expect(head.pivot.rotation.y).toBe(0);
    expect(head.pivot.rotation.x).toBe(0);
  });

  it("has a head to turn on every figure that has one, on a pivot of its own", () => {
    for (const kind of FIGURE_KINDS) {
      const f = figureBuilder(kind)!({ skin: SKINS.lantern!(), variant: null, scale: DEFAULT_SCALE });
      const heads = f.heads ?? [];
      if (kind === "carp") expect(heads, kind).toHaveLength(0);
      else expect(heads.length, kind).toBeGreaterThan(0);
      for (const h of heads) {
        let inside = false;
        f.group.traverse((o) => (inside ||= o === h.pivot));
        expect(inside, kind).toBe(true);
        expect(h.pivot.rotation.order, kind).toBe("YXZ");
        expect(h.pivot.children.length, kind).toBeGreaterThan(0);
      }
      f.dispose();
    }
  });
});

describe("the omens", () => {
  it("are the kinds the director knows, no more and no fewer, and the temperaments bring only those", () => {
    expect([...registeredOmens()].sort()).toEqual([...OMEN_KINDS].sort());
    for (const [kind, t] of Object.entries(TEMPERAMENTS)) for (const o of Object.keys(t!.omens)) expect(OMEN_KINDS as readonly string[], kind).toContain(o);
  });

  it("come before an arrival, from a witness that answers to them, and never cut a line short", () => {
    let scattered = 0;
    for (const s of film.scenes) {
      const sight = sightOf(s);
      for (const seed of SEEDS.slice(0, 30)) {
        const plan = planScene(s, seed, temperamentOf, sight);
        let cranesFled = false;
        plan.cues.forEach((cp, j) => {
          for (const w of cp.visits) {
            const r = w.reaction;
            if (!r) continue;
            const arriving = plan.cues[r.arrival]!.visits.find((v) => Math.abs(arrivalOf(v) - r.arrivalS) < 1e-9);
            expect(arriving, `${s.id} ${seed}`).toBeDefined();
            expect(r.arrival).not.toBe(j);
            expect(r.atS).toBeLessThan(r.arrivalS);
            expect(r.atS).toBeGreaterThan(w.fromS);
            expect(s.cast[j]!.role).toBe("companion");
            expect(witnesses(r.omen, temperamentOf(s.cast[j]!.figure)), `${s.cast[j]!.figure} ${r.omen}`).toBe(true);
            expect(Object.keys(temperamentOf(s.cast[r.arrival]!.figure).omens)).toContain(r.omen);
            if (w.named) expect(w.dwell![1]).toBeLessThanOrEqual(r.atS);
            const leave = OMENS[r.omen].leaveS;
            if (leave !== null) expect(w.untilS).toBeLessThanOrEqual(r.atS + leave + 1e-9);
            expect(r.pathUntilS).toBeGreaterThanOrEqual(w.untilS);
            if (s.id === "huangshan" && r.omen === "scatter" && s.cast[j]!.figure === "cranes") cranesFled = true;
          }
        });
        if (cranesFled) scattered++;
      }
    }
    // The cranes break before a Dragon King in a good share of viewings of Huangshan.
    expect(scattered / 30).toBeGreaterThan(0.3);
  });

  const threat = { x: -0.6, y: -1.2, d: 2400 };
  const scatter = (atS: number) => {
    const cranes = cue({});
    const base = visitOf("cross", { fromS: 20, untilS: 30, seed: 11 });
    const reaction: Reaction = { omen: "scatter", atS, arrival: 1, arrivalS: atS + 1.5, pathUntilS: 30 };
    const visit: Visit = { ...base, untilS: atS + OMENS.scatter.leaveS, reaction };
    const own = motionBuilder("cross")!(contextOf(cranes, base));
    const wrapped = omenWrap("scatter")!({
      reaction,
      cue: cranes,
      visit,
      temperament: temperamentOf("cranes"),
      rng: new Rng(3),
      threat: (_t, view, out) => (Object.assign(out.at, pictureToFrame(threat, view)), true),
      build: (v) => motionBuilder("cross")!(contextOf(cranes, v)),
    })!;
    return { own, wrapped, visit };
  };

  it("scatter the birds: their own way until they take fright, then out of the picture, away from the danger, head round to it first", () => {
    const { own, wrapped, visit } = scatter(24);
    const a = newPose();
    const b = newPose();
    for (let t = 20.5; t < 24; t += 0.5) {
      own.pose(t, DEFAULT_VIEW, a);
      wrapped.pose(t, DEFAULT_VIEW, b);
      expect(b.at).toEqual(a.at);
    }
    let last: Vector3 | null = null;
    for (let t = 23.5; t <= visit.untilS; t += 1 / 30) {
      expect(wrapped.pose(t, DEFAULT_VIEW, b)).toBe(true);
      const at = new Vector3(b.at.ahead, b.at.right, b.at.up);
      if (last) expect(at.distanceTo(last), `at ${t.toFixed(2)}`).toBeLessThan(120);
      last = at;
    }
    wrapped.pose(24.15, DEFAULT_VIEW, b);
    expect(b.gaze.weight).toBeGreaterThan(0.5);
    const danger = pictureToFrame(threat, DEFAULT_VIEW);
    expect(Math.hypot(b.gaze.at.ahead - danger.ahead, b.gaze.at.right - danger.right, b.gaze.at.up - danger.up)).toBeLessThan(1e-6);
    wrapped.pose(24, DEFAULT_VIEW, a);
    wrapped.pose(visit.untilS - 0.05, DEFAULT_VIEW, b);
    const from = frameToPicture(a.at, DEFAULT_VIEW);
    const to = frameToPicture(b.at, DEFAULT_VIEW);
    expect(to.y).toBeGreaterThan(from.y);
    expect(to.x).toBeGreaterThan(from.x);
    expect(inPicture(b.at, DEFAULT_VIEW, 0.1)).toBe(false);
    expect(wrapped.pose(visit.untilS + 0.1, DEFAULT_VIEW, b)).toBe(false);
  });

  it("turn the curious to look, and leave their way as it was", () => {
    const pilgrims = cue({ figure: "pilgrims", size_m: 220 });
    const visit = visitOf("cross", { seed: 8 });
    const reaction: Reaction = { omen: "look", atS: 23, arrival: 1, arrivalS: 25, pathUntilS: 30 };
    const own = motionBuilder("cross")!(contextOf(pilgrims, visit));
    const wrapped = omenWrap("look")!({
      reaction,
      cue: pilgrims,
      visit: { ...visit, reaction },
      temperament: temperamentOf("pilgrims"),
      rng: new Rng(3),
      threat: (_t, view, out) => (Object.assign(out.at, pictureToFrame(threat, view)), true),
      build: (v) => motionBuilder("cross")!(contextOf(pilgrims, v)),
    })!;
    const a = newPose();
    const b = newPose();
    for (let t = 20.5; t < 30; t += 0.5) {
      own.pose(t, DEFAULT_VIEW, a);
      b.gaze.weight = 0;
      wrapped.pose(t, DEFAULT_VIEW, b);
      expect(b.at).toEqual(a.at);
      if (t < 23) expect(b.gaze.weight).toBe(0);
    }
    b.gaze.weight = 0;
    wrapped.pose(26, DEFAULT_VIEW, b);
    expect(b.gaze.weight).toBeGreaterThan(0.9);
  });
});

describe("rarity", () => {
  it("makes a few figures rare, and leaves every scene one that always comes", () => {
    const rare = film.scenes.flatMap((s) => s.cast.filter((c) => c.chance < 1));
    expect(rare.length).toBeGreaterThanOrEqual(3);
    for (const s of film.scenes) if (s.cast.length > 0) expect(s.cast.some((c) => c.chance === 1), s.id).toBe(true);
  });
});
