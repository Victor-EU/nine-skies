/**
 * A painting's life (D96): that the list and the modules agree, that a
 * serpent swims from head to tail and harder as it works, that loose parts
 * stir and stiff ones do not, that cloud is found by its colour and only
 * churns once the picture is read, that a flier noses into its climb, that
 * a figure's pace is read from its path, that a beast's legs stride in a
 * walk's order, each a part of its own carrying its cloud level, that a
 * person keeps their balance over their feet, that a picture of several
 * moves each on its own, and that a living painting bends its card while a
 * still one stays two triangles.
 */
import { Group, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { paceBetween, spotOf } from "../../engine/src/cast/cast.js";
import type { CastFrame } from "../../engine/src/cast/figure.js";
import { circlesAlong, insideBy, isLifeKind, layerShare, LIFE_KINDS, lifeModule, registeredLives, type Body, type Life, type Stride } from "../../engine/src/cast/life.js";
import "../../engine/src/cast/life/index.js";
import { churn, cloudiness } from "../../engine/src/cast/life/churn.js";
import { DOWN, flap, reachAt, strokeAt } from "../../engine/src/cast/life/flap.js";
import { flutter } from "../../engine/src/cast/life/flutter.js";
import { BEAT, DUTY, gait, legLayer, liftAt, swingAt as strideAt, type Leg } from "../../engine/src/cast/life/gait.js";
import { noseUp, pitch } from "../../engine/src/cast/life/pitch.js";
import { leanAt, sway } from "../../engine/src/cast/life/sway.js";
import { serpent, swingAt } from "../../engine/src/cast/life/serpent.js";
import { newPose } from "../../engine/src/cast/motion.js";
import { effortOf, IDLE, MOST_EFFORT, registerPainting, type PaintingView } from "../../engine/src/cast/painting.js";

/** A body of `n` by `m` cells over a picture `w` by `h`, as the card's mesh lays it. */
function grid(w: number, h: number, n: number, m: number, colour?: (x: number, y: number) => [number, number, number, number]): Body {
  const across = n + 1;
  const rest = new Float32Array(2 * across * (m + 1));
  const c = colour ? new Float32Array(4 * across * (m + 1)) : null;
  for (let j = 0; j <= m; j++) {
    for (let i = 0; i <= n; i++) {
      const v = j * across + i;
      rest[2 * v] = (i / n) * w;
      rest[2 * v + 1] = (j / m) * h;
      if (c && colour) c.set(colour(rest[2 * v]!, rest[2 * v + 1]!), 4 * v);
    }
  }
  return { width: w, height: h, rest, across, layers: [{ name: "picture", start: 0, count: rest.length / 2 }], origin: [w / 2, h / 2], faces: "right", colour: c };
}

/** The vertex of a body nearest a point of the picture. */
function nearest(body: Body, x: number, y: number): number {
  let best = 0;
  let d = Infinity;
  for (let v = 0; v < body.rest.length / 2; v++) {
    const e = Math.hypot(body.rest[2 * v]! - x, body.rest[2 * v + 1]! - y);
    if (e < d) [best, d] = [v, e];
  }
  return best;
}

function stride(effort: number, dt = 0.1, climb = 0): Stride {
  return { timeS: 0, dt, effort, climb };
}

/** The largest move of a vertex over `frames` frames, less vertex `from`'s when one is named. */
function most(life: Life, count: number, v: number, frames: number, s: Stride, from = -1): number {
  let m = 0;
  for (let f = 0; f < frames; f++) {
    const out = new Float32Array(2 * count);
    life.move(s, out);
    const [fx, fy] = from < 0 ? [0, 0] : [out[2 * from]!, out[2 * from + 1]!];
    m = Math.max(m, Math.hypot(out[2 * v]! - fx, out[2 * v + 1]! - fy));
  }
  return m;
}

describe("the lives", () => {
  it("are each registered, and only those the list names", () => {
    expect([...registeredLives()].sort()).toEqual([...LIFE_KINDS].sort());
    expect(isLifeKind("serpent")).toBe(true);
    expect(isLifeKind("wings")).toBe(false);
    expect(lifeModule("wings")).toBeNull();
  });
});

describe("a serpent", () => {
  // A body along the middle of a 1000 by 400 picture, head at the right.
  const body = grid(1000, 400, 50, 20);
  const count = body.rest.length / 2;
  const rig = serpent({ spine: [[950, 200], [700, 200], [450, 200], [200, 200], [50, 200]], radius: 40, reach: 120 });

  it("swims more at the tail than at the head", () => {
    expect(swingAt(0)).toBeLessThan(0.2);
    expect(swingAt(1)).toBeGreaterThan(swingAt(0.5));
    // Less the rise and fall the whole picture has, which the air far off the body shows.
    const air = nearest(body, 500, 0);
    const head = most(lifeModule("serpent")!.build(body, rig, 1), count, nearest(body, 940, 200), 60, stride(1), air);
    const tail = most(lifeModule("serpent")!.build(body, rig, 1), count, nearest(body, 60, 200), 60, stride(1), air);
    expect(tail).toBeGreaterThan(3 * head);
  });

  it("carries only what is within its reach, and the rest of the picture only rises and falls with it", () => {
    const life = lifeModule("serpent")!.build(body, rig, 1);
    const out = new Float32Array(2 * count);
    life.move(stride(1), out);
    const far = nearest(body, 300, 0);
    expect(out[2 * far]).toBe(0);
    const near = nearest(body, 300, 200);
    expect(Math.abs(out[2 * near + 1]! - out[2 * far + 1]!)).toBeGreaterThan(0);
  });

  it("sends its wave from the head toward the tail", () => {
    // The crest along the midline: where the sideways move is greatest, a moment apart.
    const crest = (frames: number): number => {
      const life = lifeModule("serpent")!.build(body, rig, 0);
      const out = new Float32Array(2 * count);
      for (let f = 0; f < frames; f++) {
        out.fill(0);
        life.move(stride(1, 0.05), out);
      }
      let best = 0;
      let at = 0;
      for (let x = 500; x <= 900; x += 20) {
        const v = nearest(body, x, 200);
        const bob = out[2 * nearest(body, x, 0) + 1]!;
        const d = out[2 * v + 1]! - bob;
        if (d > best) [best, at] = [d, x];
      }
      return at;
    };
    expect(crest(4)).toBeLessThan(crest(1));
  });

  it("swims quicker the harder it works", () => {
    const moved = (effort: number): number => {
      const life = lifeModule("serpent")!.build(body, rig, 0);
      const out = new Float32Array(2 * count);
      life.move(stride(effort, 0.3), out);
      return out[2 * nearest(body, 200, 200) + 1]!;
    };
    expect(moved(0)).not.toBeCloseTo(moved(2), 3);
  });

  it("is refused a midline off its picture or a reach inside its body", () => {
    expect(() => lifeModule("serpent")!.check(serpent({ ...rig, spine: [[0, 0], [5000, 0], [10, 10]] }), 1000, 400)).toThrow();
    expect(() => lifeModule("serpent")!.check(serpent({ ...rig, reach: 10 }), 1000, 400)).toThrow();
  });
});

describe("loose parts", () => {
  const body = grid(400, 400, 40, 40);
  const count = body.rest.length / 2;
  const rig = flutter({ root: [200, 200], regions: [{ at: [200, 200], r: 180 }], stiff: [{ at: [300, 200], r: 30 }], stir: 10 });

  it("stir more the further from their root, and not at all where they are stiff or outside", () => {
    const life = () => lifeModule("flutter")!.build(body, rig, 3);
    const tip = most(life(), count, nearest(body, 200, 90), 40, stride(1));
    const root = most(life(), count, nearest(body, 200, 190), 40, stride(1));
    expect(tip).toBeGreaterThan(root);
    expect(most(life(), count, nearest(body, 300, 200), 40, stride(1))).toBe(0);
    expect(most(life(), count, nearest(body, 0, 0), 40, stride(1))).toBe(0);
  });

  it("lick quicker as flames than as cloth", () => {
    /** How far the tip goes from one frame to the next, on the whole. */
    const restless = (pace: number): number => {
      const life = lifeModule("flutter")!.build(body, flutter({ ...rig, pace }), 3);
      const tip = nearest(body, 200, 90);
      let was: [number, number] | null = null;
      let sum = 0;
      for (let f = 0; f < 60; f++) {
        const out = new Float32Array(2 * count);
        life.move(stride(1, 0.05), out);
        if (was) sum += Math.hypot(out[2 * tip]! - was[0], out[2 * tip + 1]! - was[1]);
        was = [out[2 * tip]!, out[2 * tip + 1]!];
      }
      return sum;
    };
    expect(restless(4)).toBeGreaterThan(2.5 * restless(1));
    expect(() => lifeModule("flutter")!.check(flutter({ ...rig, pace: 0 }), 400, 400)).toThrow(/pace/);
  });
});

describe("cloud", () => {
  it("is pale and grey and there", () => {
    expect(cloudiness(0.95, 0.95, 0.97, 1)).toBeGreaterThan(0.9);
    expect(cloudiness(0.2, 0.55, 0.4, 1)).toBe(0);
    expect(cloudiness(0.3, 0.3, 0.3, 1)).toBe(0);
    expect(cloudiness(0.95, 0.95, 0.97, 0)).toBe(0);
  });

  it("churns once the picture has been read, and not where it is spared", () => {
    const blank = grid(400, 400, 20, 20);
    const white = grid(400, 400, 20, 20, () => [0.95, 0.95, 0.96, 1]);
    const count = white.rest.length / 2;
    const rig = churn({ swirl: 8, spare: [{ at: [100, 100], r: 60 }] });
    expect(most(lifeModule("churn")!.build(blank, rig, 2), count, nearest(white, 300, 300), 30, stride(1))).toBe(0);
    const unread = lifeModule("churn")!.build(blank, rig, 2);
    unread.see!(white);
    expect(most(unread, count, nearest(white, 300, 300), 30, stride(1))).toBeGreaterThan(0);
    expect(most(lifeModule("churn")!.build(white, rig, 2), count, nearest(white, 100, 100), 30, stride(1))).toBe(0);
  });

  it("is spared along a band of circles that covers the line", () => {
    const band = circlesAlong([[0, 0], [100, 0], [100, 100]], 20);
    for (const [x, y] of [[0, 0], [50, 0], [100, 0], [100, 55], [100, 100]] as const) {
      expect(band.some((c) => Math.hypot(c.at[0] - x, c.at[1] - y) <= c.r * 0.6)).toBe(true);
    }
  });
});

describe("wings", () => {
  // A bird in a 1000 by 600 picture: its near wing over sky above a hinge along y = 300 from x 300 to 700, its far wing below one along y = 400.
  const near = { hinge: [[300, 300], [700, 300]] as const, outline: [[300, 300], [700, 300], [700, 0], [300, 0]] as const, top: 1, bottom: -0.5 };
  const far = { hinge: [[300, 400], [700, 400]] as const, outline: [[300, 400], [700, 400], [700, 600], [300, 600]] as const, top: -0.2, bottom: 1 };
  const rig = flap({ beatHz: 2, bob: 20, near, far });
  const layers = lifeModule("flap")!.layers!(rig);

  /** The picture's grid and a grid for each wing, as the card lays them out. */
  function layered(): Body {
    const one = grid(1000, 600, 20, 12);
    const n = one.rest.length / 2;
    const rest = new Float32Array(2 * n * 3);
    for (let l = 0; l < 3; l++) rest.set(one.rest, 2 * n * l);
    return { ...one, rest, layers: [{ name: "picture", start: 0, count: n }, ...layers.map((layer, k) => ({ name: layer.name, start: (k + 1) * n, count: n }))] };
  }

  it("beat down in the longer part of a beat and up in the rest", () => {
    expect(strokeAt(0)).toBeCloseTo(0, 9);
    expect(strokeAt(DOWN)).toBeCloseTo(1, 9);
    expect(strokeAt(1)).toBeCloseTo(0, 9);
    expect(strokeAt(DOWN / 2)).toBeCloseTo(0.5, 9);
    expect(DOWN).toBeGreaterThan(0.5);
  });

  it("reach as the rig says at the top and bottom of the stroke, and hold their glide when not beating", () => {
    expect(reachAt(near, 0, 1)).toBe(1);
    expect(reachAt(near, 1, 1)).toBe(-0.5);
    expect(reachAt(near, 0.3, 0)).toBe(0.25);
    expect(reachAt({ ...near, glide: 0.8 }, 1, 0)).toBe(0.8);
  });

  it("are a part drawn in front and a part drawn behind", () => {
    expect(layers.map((l) => [l.name, l.behind])).toEqual([["wing-near", false], ["wing-far", true]]);
    expect(layerShare(500, 100, layers[0]!)).toBe(1);
    expect(layerShare(500, 500, layers[0]!)).toBe(0);
    expect(insideBy(500, 100, near.outline)).toBeCloseTo(100, 6);
    expect(insideBy(500, 500, near.outline)).toBeLessThan(0);
  });

  it("move their own vertices about their hinge, and the rest of the picture only rises and falls", () => {
    const body = layered();
    const life = lifeModule("flap")!.build(body, rig, 0);
    const n = body.layers[0]!.count;
    const out = new Float32Array(body.rest.length);
    life.move(stride(1, 0.1), out);
    const at = (layer: number, x: number, y: number) => n * layer + nearest(grid(1000, 600, 20, 12), x, y);
    // The tip of the near wing moves across its hinge; a point on its hinge does not; the picture there only bobs, as all of it does.
    const bob = out[2 * at(0, 500, 100) + 1]!;
    expect(out[2 * at(0, 500, 500) + 1]).toBe(bob);
    expect(Math.abs(out[2 * at(1, 500, 0) + 1]! - bob)).toBeGreaterThan(1);
    expect(out[2 * at(1, 500, 300) + 1]! - bob).toBeCloseTo(0, 6);
    expect(out[2 * at(1, 500, 0)]).toBeCloseTo(0, 6);
  });

  it("glide when the bird dives, beat when it climbs, and rest between bursts", () => {
    const moves = (climb: number, seconds: number, r = rig) => {
      const body = layered();
      const life = lifeModule("flap")!.build(body, r, 0);
      const tip = body.layers[1]!.start + nearest(grid(1000, 600, 20, 12), 500, 0);
      const ys: number[] = [];
      for (let t = 0; t < seconds; t += 0.05) {
        const out = new Float32Array(body.rest.length);
        life.move(stride(1, 0.05, climb), out);
        ys.push(out[2 * tip + 1]!);
      }
      return ys;
    };
    const spread = (ys: number[]) => Math.max(...ys) - Math.min(...ys);
    // After a moment's settling, a diving bird's wing holds still; a climbing one's beats.
    expect(spread(moves(-0.4, 4).slice(-30))).toBeLessThan(1);
    expect(spread(moves(0.3, 4).slice(-30))).toBeGreaterThan(50);
    // Two beats a second in bursts of two with three seconds between: somewhere in any four seconds it holds still for one.
    const bursty = moves(0, 8, flap({ ...rig, burst: 2, rest: 3 }));
    let still = false;
    for (let k = 0; k + 20 <= bursty.length; k++) if (spread(bursty.slice(k, k + 20)) < 1) still = true;
    expect(still).toBe(true);
  });

  it("are refused a hinge of one point, a reach past what a wing can do, or a burst without its rest", () => {
    const m = lifeModule("flap")!;
    expect(() => m.check(flap({ ...rig, near: { ...near, hinge: [[300, 300], [300, 300]] } }), 1000, 600)).toThrow(/hinge/);
    expect(() => m.check(flap({ ...rig, near: { ...near, bottom: -3 } }), 1000, 600)).toThrow(/reach/);
    expect(() => m.check(flap({ ...rig, burst: 3 }), 1000, 600)).toThrow(/burst/);
  });
});

describe("legs", () => {
  // A beast in a 1000 by 600 picture, its body across the top half and four legs hanging below it, each on a puff of cloud.
  const leg = (foot: Leg["foot"], x: number): Leg => ({ foot, line: [[x, 300], [x, 450], [x, 540]], radius: 30, painted: 0, cloud: [{ at: [x, 570], r: 30 }] });
  const legs = [leg("near-hind", 200), leg("far-hind", 400), leg("far-fore", 600), leg("near-fore", 800)];
  const rig = gait({ strideHz: 1, swing: 0.3, bob: 10, legs });
  const layers = lifeModule("gait")!.layers!(rig);
  const one = grid(1000, 600, 50, 30);
  const n = one.rest.length / 2;

  /** The picture's grid and a grid for each leg, as the card lays them out. */
  function layered(faces: Body["faces"] = "right"): Body {
    const rest = new Float32Array(2 * n * (1 + layers.length));
    for (let l = 0; l <= layers.length; l++) rest.set(one.rest, 2 * n * l);
    return { ...one, faces, rest, layers: [{ name: "picture", start: 0, count: n }, ...layers.map((layer, k) => ({ name: layer.name, start: (k + 1) * n, count: n }))] };
  }
  /** A point of the picture in a leg's own layer. */
  const on = (body: Body, foot: Leg["foot"], x: number, y: number) => body.layers.find((l) => l.name === legLayer(foot))!.start + nearest(one, x, y);
  /** Where each of some vertices goes, frame by frame, over `seconds`. */
  function track(body: Body, vs: number[], seconds: number, effort = 1): Array<Array<[number, number]>> {
    const life = lifeModule("gait")!.build(body, rig, 0);
    const paths: Array<Array<[number, number]>> = vs.map(() => []);
    for (let t = 0; t < seconds; t += 0.02) {
      const out = new Float32Array(body.rest.length);
      life.move(stride(effort, 0.02), out);
      vs.forEach((v, k) => paths[k]!.push([out[2 * v]!, out[2 * v + 1]!]));
    }
    return paths;
  }

  it("stride in a walk's order, each foot back while it bears the body and forward, lifted, while it does not", () => {
    expect(Object.entries(BEAT).sort((a, b) => a[1] - b[1]).map(([f]) => f)).toEqual(["near-hind", "near-fore", "far-hind", "far-fore"]);
    expect(strideAt(0)).toBeCloseTo(1, 9);
    expect(strideAt(DUTY / 2)).toBeCloseTo(0, 9);
    expect(strideAt(DUTY)).toBeCloseTo(-1, 9);
    expect(strideAt(1)).toBeCloseTo(1, 9);
    // No jerk where the foot leaves the ground or comes down on it.
    expect(Math.abs(strideAt(DUTY - 1e-6) - strideAt(DUTY + 1e-6))).toBeLessThan(1e-4);
    expect(Math.abs(strideAt(1 - 1e-6) - strideAt(1e-6))).toBeLessThan(1e-4);
    expect(liftAt(DUTY / 2)).toBe(0);
    expect(liftAt((1 + DUTY) / 2)).toBeCloseTo(1, 9);
  });

  it("are each a part of their own, the far ones behind the body and the near ones in front", () => {
    expect(layers.map((l) => [l.name, l.behind])).toEqual([
      ["leg-near-hind", false],
      ["leg-far-hind", true],
      ["leg-far-fore", true],
      ["leg-near-fore", false],
    ]);
    expect(layerShare(200, 500, layers[0]!)).toBe(1);
    expect(layerShare(200, 580, layers[0]!)).toBe(1);
    expect(layerShare(300, 500, layers[0]!)).toBe(0);
    // A far leg's cloud is drawn in from its rim, since the part behind is drawn whole a little past its feather.
    expect(layerShare(428, 570, layers[1]!)).toBeLessThan(layerShare(228, 570, layers[0]!));
  });

  it("swing each foot to and fro about its hip, the far hind half a stride from the near", () => {
    const body = layered();
    const [nearFoot, farFoot, hip] = track(body, [on(body, "near-hind", 200, 540), on(body, "far-hind", 400, 540), on(body, "near-hind", 200, 300)], 2);
    const xs = (path: Array<[number, number]>) => path.slice(-50).map(([x]) => x);
    const spread = (a: number[]) => Math.max(...a) - Math.min(...a);
    expect(spread(xs(nearFoot!))).toBeGreaterThan(60);
    expect(spread(xs(hip!))).toBeLessThan(1);
    // Half a stride apart: as one foot goes forward the other goes back.
    const a = xs(nearFoot!);
    const b = xs(farFoot!);
    const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
    const [ma, mb] = [mean(a), mean(b)];
    expect(a.reduce((s, x, k) => s + (x - ma) * (b[k]! - mb), 0)).toBeLessThan(0);
  });

  it("carry a foot's cloud level with it, and press it as the foot comes down", () => {
    const body = layered();
    const [left, right, top] = track(body, [on(body, "near-fore", 775, 570), on(body, "near-fore", 825, 570), on(body, "near-fore", 800, 545)], 2);
    let widest = 0;
    for (let k = 0; k < left!.length; k++) {
      // The cloud's two ends move together, but for the press that spreads them a little.
      expect(Math.abs(left![k]![1] - right![k]![1])).toBeLessThan(0.5);
      widest = Math.max(widest, right![k]![0] - left![k]![0]);
    }
    expect(widest).toBeGreaterThan(1);
    expect(widest).toBeLessThan(10);
    expect(top).toBeDefined();
  });

  it("walk toward the way the beast faces", () => {
    const foot = (faces: Body["faces"]) => {
      const body = layered(faces);
      return track(body, [on(body, "near-hind", 200, 540)], 0.3)[0]!.map(([x]) => x);
    };
    const right = foot("right");
    const left = foot("left");
    right.forEach((x, k) => expect(left[k]).toBeCloseTo(-x, 6));
  });

  it("are refused two legs for a foot, a leg painted past its swing, or a swing past what a leg can do", () => {
    const m = lifeModule("gait")!;
    expect(() => m.check(gait({ ...rig, legs: [...legs, leg("near-fore", 900)] }), 1000, 600)).toThrow(/one near-fore/);
    expect(() => m.check(gait({ ...rig, legs: [{ ...legs[0]!, painted: 2 }] }), 1000, 600)).toThrow(/painted/);
    expect(() => m.check(gait({ ...rig, swing: 1 }), 1000, 600)).toThrow(/swing/);
    expect(() => m.check(gait({ ...rig, legs: [] }), 1000, 600)).toThrow(/leg/);
  });
});

describe("a person's sway", () => {
  // A person 800 pixels tall standing on a cloud, feet at 200, 900 of a 400 by 1000 picture.
  const body = grid(400, 1000, 20, 50);
  const count = body.rest.length / 2;
  const rig = sway({ feet: [200, 900], crown: 100, lean: 20 });
  /** x and y of a vertex, frame by frame, over `seconds`. */
  function track(r: typeof rig, v: number, seconds: number, dt = 0.05, effort = 1): Array<[number, number]> {
    const life = lifeModule("sway")!.build(body, r, 0);
    const path: Array<[number, number]> = [];
    for (let t = 0; t < seconds; t += dt) {
      const out = new Float32Array(2 * count);
      life.move(stride(effort, dt), out);
      path.push([out[2 * v]!, out[2 * v + 1]!]);
    }
    return path;
  }

  it("leans the crown one way and the other over still feet, never further than the rig says", () => {
    const crown = track(rig, nearest(body, 200, 100), 40);
    const xs = crown.map(([x]) => x);
    expect(Math.max(...xs)).toBeGreaterThan(10);
    expect(Math.min(...xs)).toBeLessThan(-10);
    expect(Math.max(...xs.map(Math.abs))).toBeLessThanOrEqual(20.01);
    for (const [x, y] of track(rig, nearest(body, 200, 900), 40)) expect(Math.hypot(x, y)).toBe(0);
    for (const [x, y] of track(rig, nearest(body, 320, 980), 40)) expect(Math.hypot(x, y)).toBe(0);
  });

  it("turns about the feet, so what stands out to one side goes down as the crown leans toward it", () => {
    const side = track(rig, nearest(body, 360, 300), 40);
    for (const [x, y] of side) if (Math.abs(x) > 1) expect(Math.sign(y)).toBe(Math.sign(x));
  });

  it("never leans in time, and more slowly than a stride", () => {
    const peaks = [0.1, 0.35, 0.6, 0.85].map((p) => leanAt(p));
    expect(new Set(peaks.map((l) => l.toFixed(3))).size).toBe(4);
    expect(Math.max(...[...Array(1000)].map((_, k) => Math.abs(leanAt(k / 100))))).toBeLessThanOrEqual(1);
  });

  it("rises over each step if they walk, twice a stride, the feet kept where they are", () => {
    const walking = sway({ ...rig, lean: 0.001, stepHz: 1, step: 10 });
    const ys = track(walking, nearest(body, 200, 100), 2.2, 0.01).map(([, y]) => y);
    expect(Math.min(...ys)).toBeLessThan(-8);
    expect(Math.max(...ys)).toBeLessThanOrEqual(0.01);
    let lows = 0;
    for (let k = 1; k + 1 < ys.length; k++) if (ys[k]! < ys[k - 1]! && ys[k]! <= ys[k + 1]!) lows++;
    expect(lows).toBe(4);
    for (const [x, y] of track(walking, nearest(body, 200, 900), 2)) expect(Math.hypot(x, y)).toBe(0);
  });

  it("is refused feet off the picture, a crown below them, no lean, or steps without a rise", () => {
    const m = lifeModule("sway")!;
    expect(() => m.check(sway({ ...rig, feet: [500, 900] }), 400, 1000)).toThrow(/feet/);
    expect(() => m.check(sway({ ...rig, crown: 950 }), 400, 1000)).toThrow(/crown/);
    expect(() => m.check(sway({ ...rig, lean: 0 }), 400, 1000)).toThrow(/lean/);
    expect(() => m.check(sway({ ...rig, stepHz: 1 }), 400, 1000)).toThrow(/together/);
    expect(() => m.check(sway({ ...rig, who: { name: "he-xiangu", within: [] } }), 400, 1000)).toThrow(/he-xiangu/);
  });
});

describe("a picture of several", () => {
  // Two walkers abreast in a 1000 by 600 picture, each with a leg, and a bird over them.
  const legOf = (x: number): Leg => ({ foot: "near-hind", line: [[x, 300], [x, 450], [x, 540]], radius: 30, painted: 0 });
  const left = gait({ strideHz: 1, swing: 0.3, bob: 10, legs: [legOf(200)], who: { name: "sha", within: [{ at: [200, 350], r: 200 }] } });
  const right = gait({ strideHz: 1, swing: 0.3, bob: 10, legs: [legOf(800)], who: { name: "bajie", within: [{ at: [800, 350], r: 200 }] } });
  const bird = flap({ beatHz: 2, bob: 20, near: { hinge: [[450, 150], [550, 150]], outline: [[450, 150], [550, 150], [550, 50], [450, 50]], top: 1, bottom: -0.5 }, who: { name: "bird", within: [{ at: [500, 150], r: 80 }] } });

  it("names each one's parts as theirs", () => {
    expect(lifeModule("gait")!.layers!(left).map((l) => l.name)).toEqual([legLayer("near-hind", left.who)]);
    expect(legLayer("near-hind", left.who)).toBe("sha:leg-near-hind");
    expect(lifeModule("flap")!.layers!(bird).map((l) => l.name)).toEqual(["bird:wing-near"]);
  });

  it("moves each one's body within their own circles only", () => {
    const body = grid(1000, 600, 50, 30);
    const count = body.rest.length / 2;
    for (const [rig, mine, theirs] of [
      [left, nearest(body, 200, 200), nearest(body, 800, 200)],
      [bird, nearest(body, 500, 170), nearest(body, 200, 200)],
    ] as const) {
      const life = lifeModule(rig.kind)!.build(body, rig, 0);
      expect(most(life, count, mine, 60, stride(1, 0.05))).toBeGreaterThan(1);
      expect(most(life, count, theirs, 60, stride(1, 0.05))).toBe(0);
    }
  });

  it("is refused two parts of one name in one view", () => {
    const one = gait({ strideHz: 1, swing: 0.3, bob: 10, legs: [legOf(200)] });
    const view: PaintingView = { name: "default", url: "cast/x.webp", faces: "right", aspect: 1000 / 600, feet: 0.1, size: { across: 0.9 }, pixels: [1000, 600], life: [one, { ...one }] };
    expect(() => registerPainting("carp", { views: [view] })).toThrow(/two parts are named "leg-near-hind"/);
    expect(() => registerPainting("carp", { views: [{ ...view, life: [left, right] }] })).not.toThrow();
  });
});

describe("a flier's pitch", () => {
  it("raises what is ahead of it when it climbs, whichever way it faces", () => {
    expect(noseUp(100, 0, 0.3, "right")[1]).toBeLessThan(0);
    expect(noseUp(-100, 0, 0.3, "left")[1]).toBeLessThan(0);
    expect(noseUp(-100, 0, 0.3, "right")[1]).toBeGreaterThan(0);
  });

  it("follows the climb a moment late, never past its most", () => {
    const body = grid(200, 100, 4, 2);
    const count = body.rest.length / 2;
    const life = lifeModule("pitch")!.build(body, pitch({ most: 0.2 }), 0);
    const nose = nearest(body, 200, 50);
    const rise = (dt: number, climb: number): number => {
      const out = new Float32Array(2 * count);
      life.move(stride(1, dt, climb), out);
      return -out[2 * nose + 1]!;
    };
    rise(0.1, 0);
    const soon = rise(0.1, 1);
    const later = rise(3, 1);
    expect(soon).toBeGreaterThan(0);
    expect(later).toBeGreaterThan(soon);
    expect(later).toBeCloseTo(100 * Math.sin(0.2), 0);
  });
});

describe("a figure's pace", () => {
  it("is how many of its lengths it goes a second, through the picture or over the ground", () => {
    const a = newPose();
    const b = newPose();
    b.at.right = 30;
    b.at.up = 40;
    expect(paceBetween(spotOf(a), spotOf(b), 0.5, 100)).toBeCloseTo(1, 9);
    a.space = b.space = "world";
    a.world = { lat: 30, lon: 118, aboveGroundM: 0 };
    b.world = { lat: 30, lon: 118, aboveGroundM: 300 };
    expect(paceBetween(spotOf(a), spotOf(b), 1, 1500)).toBeCloseTo(0.2, 9);
  });

  it("is nothing between two kinds of place, or two places", () => {
    const a = newPose();
    const b = newPose();
    b.space = "world";
    b.world = { lat: 30, lon: 118, aboveGroundM: 300 };
    expect(paceBetween(spotOf(a), spotOf(b), 1, 100)).toBe(0);
    a.space = "world";
    a.world = { lat: 31, lon: 118, aboveGroundM: 0 };
    expect(paceBetween(spotOf(a), spotOf(b), 1, 100)).toBe(0);
  });

  it("is read from a pose at once, since a motion may fill the same place for every pose", () => {
    const pose = newPose();
    pose.space = "world";
    pose.world = { lat: 30, lon: 118, aboveGroundM: 100 };
    const spot = spotOf(pose);
    pose.world.aboveGroundM = 900;
    expect(spot.y).toBe(100);
  });

  it("makes it work: at rest where it stands, keeping pace with the flight, harder as it goes, and never frantic", () => {
    expect(effortOf(undefined)).toBe(IDLE);
    expect(effortOf({ bodiesPerS: 0, withFlight: false })).toBe(IDLE);
    expect(effortOf({ bodiesPerS: 0, withFlight: true })).toBe(1);
    expect(effortOf({ bodiesPerS: 0.3, withFlight: false })).toBeGreaterThan(IDLE);
    expect(effortOf({ bodiesPerS: 9, withFlight: true })).toBe(MOST_EFFORT);
  });
});

describe("a living painting", () => {
  afterEach(() => vi.restoreAllMocks());
  const still: PaintingView = { name: "default", url: "cast/test-still.webp", faces: "right", aspect: 2, feet: 0.5, size: { across: 0.9 } };
  const living: PaintingView = { ...still, url: "cast/test-living.webp", pixels: [1000, 500], life: [serpent({ spine: [[900, 250], [500, 250], [100, 250]], radius: 40, reach: 150 }), pitch({ most: 0.3 })] };

  it("needs its pixels, the shape of its picture, and lives that fit in it", () => {
    expect(() => registerPainting("carp", { views: [{ ...living, pixels: undefined as never }] })).toThrow(/pixels/);
    expect(() => registerPainting("carp", { views: [{ ...living, pixels: [1000, 900] }] })).toThrow(/pixels/);
    expect(() => registerPainting("carp", { views: [{ ...living, life: [serpent({ spine: [[900, 250], [500, 250], [100, 900]], radius: 40, reach: 150 })] }] })).toThrow(/leaves the picture/);
    expect(() => registerPainting("carp", { views: [{ ...living, life: [{ kind: "wings" as never }] }] })).toThrow(/no life/);
  });

  it("bends its card from frame to frame, where a still one stays two triangles", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { figureBuilder } = await import("../../engine/src/cast/figure.js");
    const { lanternSkin } = await import("../../engine/src/cast/skin.js");
    const { DEFAULT_SCALE } = await import("../../engine/src/sim/scale.js");
    registerPainting("carp", { views: [still, { ...living, name: "alive" }] });
    const build = (variant: string | null) => figureBuilder("carp")!({ skin: lanternSkin(), variant, scale: DEFAULT_SCALE });
    expect(build(null).triangles).toBe(2);
    const figure = build("alive");
    expect(figure.triangles).toBeGreaterThan(100);
    const group = new Group();
    group.scale.setScalar(100);
    group.position.set(0, 0, 1000);
    const frame = (timeS: number): CastFrame => ({ timeS, flightS: timeS, eye: new Vector3(), headingRad: 0, group, pace: { bodiesPerS: 0.5, withFlight: true } });
    const card = figure.group.children[0] as unknown as { geometry: { getAttribute(n: string): { array: Float32Array } } };
    figure.update(frame(0));
    figure.update(frame(0.05));
    const before = Float32Array.from(card.geometry.getAttribute("position").array);
    figure.update(frame(0.8));
    const after = card.geometry.getAttribute("position").array;
    expect(after.some((x, k) => Math.abs(x - before[k]!) > 1e-4)).toBe(true);
    figure.dispose();
  });

  it("draws a winged one's wings as parts of their own, and not the picture under them", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { figureBuilder } = await import("../../engine/src/cast/figure.js");
    const { lanternSkin } = await import("../../engine/src/cast/skin.js");
    const { DEFAULT_SCALE } = await import("../../engine/src/sim/scale.js");
    const bare = { ...living, name: "bare", life: [pitch({ most: 0.3 })] };
    const winged = { ...living, name: "winged", life: [flap({ beatHz: 2, bob: 10, near: { hinge: [[300, 250], [700, 250]], outline: [[300, 250], [700, 250], [700, 0], [300, 0]], top: 1, bottom: -0.3 } })] };
    registerPainting("carp", { views: [bare, winged] });
    const build = (variant: string) => figureBuilder("carp")!({ skin: lanternSkin(), variant, scale: DEFAULT_SCALE });
    const a = build("bare");
    const b = build("winged");
    // The wing is drawn again on its own, less the cells of the picture it covers wholly.
    expect(b.triangles).toBeGreaterThan(a.triangles);
    expect(b.triangles).toBeLessThan(2 * a.triangles);
    // Wherever a cell of the picture is cut away at a corner, the wing over it is whole at all four, or the sky shows through.
    // The card holds only the vertices a drawn cell uses: one not drawn is sky.
    const card = b.group.children[0] as unknown as { geometry: { getAttribute(n: string): { array: Float32Array }; userData: { grid: Int32Array } } };
    const across = 65;
    const grid = across * 33;
    const alpha = new Float32Array(2 * grid);
    const colour = card.geometry.getAttribute("color").array;
    card.geometry.userData.grid.forEach((v, k) => (alpha[v] = colour[4 * k + 3]!));
    expect(card.geometry.userData.grid.length).toBeLessThan(2 * grid);
    for (let j = 0; j < 32; j++) {
      for (let i = 0; i < 64; i++) {
        const corners = [j * across + i, j * across + i + 1, (j + 1) * across + i, (j + 1) * across + i + 1];
        if (corners.some((v) => alpha[v]! < 1e-3)) for (const v of corners) expect(alpha[grid + v]).toBe(1);
      }
    }
    a.dispose();
    b.dispose();
  });

  it("draws a walker's legs as parts of their own, the far ones before the picture and the near after it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { figureBuilder } = await import("../../engine/src/cast/figure.js");
    const { lanternSkin } = await import("../../engine/src/cast/skin.js");
    const { DEFAULT_SCALE } = await import("../../engine/src/sim/scale.js");
    const legOf = (foot: Leg["foot"], x: number): Leg => ({ foot, line: [[x, 250], [x, 380], [x, 450]], radius: 25, painted: 0, cloud: [{ at: [x, 470], r: 25 }] });
    const walking = { ...living, name: "walking", life: [gait({ strideHz: 1, swing: 0.2, bob: 5, legs: [legOf("near-hind", 200), legOf("far-hind", 400), legOf("far-fore", 600), legOf("near-fore", 800)] })] };
    registerPainting("carp", { views: [walking] });
    const figure = figureBuilder("carp")!({ skin: lanternSkin(), variant: "walking", scale: DEFAULT_SCALE });
    const card = figure.group.children[0] as unknown as { material: unknown[]; geometry: { groups: Array<{ materialIndex: number }> } };
    // Three draws, far parts, picture, near parts, each held apart from the next in depth.
    expect(card.geometry.groups.map((g) => g.materialIndex)).toEqual([0, 1, 2]);
    expect(card.material).toHaveLength(3);
    figure.dispose();
  });
});
