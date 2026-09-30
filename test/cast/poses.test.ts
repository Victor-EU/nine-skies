/**
 * A figure's poses (F139): which picture of it a visit comes in, stops in
 * and goes on in, when a change is drawn and how, the figure that holds
 * them, and that every picture a scene names is one its painting has.
 */
import { Group, Texture, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import "../../engine/src/cast/figures/index.js";
import { figureBuilder, type CastFrame, type Figure } from "../../engine/src/cast/figure.js";
import type { Visit } from "../../engine/src/cast/motion.js";
import { registeredPaintings, viewFor } from "../../engine/src/cast/painting.js";
import "../../engine/src/cast/paintings/index.js";
import { HOLD_S, planPoses, POSE_S, poseAt, PosedFigure, poseNames, type PoseKey } from "../../engine/src/cast/poses.js";
import { hashSeed, Rng } from "../../engine/src/cast/random.js";
import { lanternSkin } from "../../engine/src/cast/skin.js";
import { DEFAULT_SCALE } from "../../engine/src/sim/scale.js";
import { loadFilm } from "../../tools/film.ts";

const SEEDS = Array.from({ length: 40 }, (_, i) => hashSeed("poses", i));
const visit = (over: Partial<Pick<Visit, "fromS" | "untilS" | "dwell" | "named">> = {}) => ({ fromS: 20, untilS: 34, dwell: null, named: false, ...over });
const party = { poses: ["default"], paused: ["rest", "tiger"] };
const names = poseNames(party)!;
const poseOf = (keys: readonly PoseKey[], t: number) => names[poseAt(keys, t)!.to];

describe("a figure's poses", () => {
  it("are the pictures it goes in and then those it stops in, or none but its variant", () => {
    expect(poseNames({})).toBeNull();
    expect(poseNames({ poses: ["pilgrim", "pilgrim-crouch"] })).toEqual(["pilgrim", "pilgrim-crouch"]);
    expect(poseNames({ poses: ["default"], paused: ["rest", "default"] })).toEqual(["default", "rest"]);
  });

  it("come in a picture it goes in, stop in one it stops in, and go on in one it goes in", () => {
    for (const seed of SEEDS) {
      const keys = planPoses(party, names, visit({ dwell: [25, 29] }), [], new Rng(seed), null);
      expect(poseOf(keys, 21)).toBe("default");
      expect(["rest", "tiger"]).toContain(poseOf(keys, 27));
      expect(poseOf(keys, 32)).toBe("default");
      // Changed as it comes in to stop, stopped in it by the time it stops, and as it goes on; not between.
      expect(keys.map((k) => k.atS)).toEqual([20, 25 - POSE_S, 29]);
      expect(poseAt(keys, 25)!.mix).toBe(1);
    }
  });

  it("stop for a line in the first picture it stops in, the author's", () => {
    for (const seed of SEEDS) expect(poseOf(planPoses(party, names, visit({ dwell: [25, 29], named: true }), [], new Rng(seed), null), 27)).toBe("rest");
  });

  it("take a second picture it stops in halfway through a long stop, and not a short one (F141)", () => {
    const monk = { poses: ["monk", "monk-led"], paused: ["monk-farewell", "monk-pray"] };
    const his = poseNames(monk)!;
    for (const seed of SEEDS) {
      const long = planPoses(monk, his, visit({ dwell: [23, 31], named: true }), [], new Rng(seed), null);
      expect(his[poseAt(long, 25)!.to]).toBe("monk-farewell");
      expect(his[poseAt(long, 29)!.to]).toBe("monk-pray");
      const short = planPoses(monk, his, visit({ dwell: [23, 27], named: true }), [], new Rng(seed), null);
      expect(his[poseAt(short, 26.5)!.to]).toBe("monk-farewell");
      // One that only goes in several holds its line in the author's.
      const phoenix = { poses: ["default", "glide"] };
      const line = planPoses(phoenix, poseNames(phoenix)!, visit({ dwell: [23, 31], named: true }), [], new Rng(seed), null);
      expect(poseAt(line, 29)!.to).toBe(0);
    }
  });

  it("come first in the first picture it goes in, the author's", () => {
    const wukong = { poses: ["fan", "default"] };
    for (const seed of SEEDS) expect(planPoses(wukong, poseNames(wukong)!, visit(), [], new Rng(seed), null)[0]!.pose).toBe(0);
  });

  it("come each visit in another picture than the last visit left in, where it has one", () => {
    const wukong = { poses: ["pilgrim", "pilgrim-crouch"] };
    const his = poseNames(wukong)!;
    for (const seed of SEEDS) {
      for (const previous of [0, 1]) expect(planPoses(wukong, his, visit(), [], new Rng(seed), previous)[0]!.pose).toBe(1 - previous);
    }
  });

  it("change where its motion hides a change, some of the time, holding each picture a while and not as it leaves", () => {
    const wukong = { poses: ["default", "fight", "fan"] };
    const his = poseNames(wukong)!;
    let changed = 0;
    for (const seed of SEEDS) {
      const hops = [21, 22.5, 25, 27.8, 30, 33];
      const keys = planPoses(wukong, his, visit(), hops, new Rng(seed), null);
      changed += keys.length - 1;
      for (let k = 1; k < keys.length; k++) {
        expect(hops).toContain(keys[k]!.atS);
        expect(keys[k]!.atS - keys[k - 1]!.atS).toBeGreaterThanOrEqual(HOLD_S);
        expect(34 - keys[k]!.atS).toBeGreaterThanOrEqual(HOLD_S);
        expect(keys[k]!.pose).not.toBe(keys[k - 1]!.pose);
      }
    }
    expect(changed).toBeGreaterThan(SEEDS.length / 2);
  });

  it("are the same for the same visit", () => {
    const a = planPoses(party, names, visit({ dwell: [24, 28] }), [22, 31], new Rng(7), 0);
    expect(planPoses(party, names, visit({ dwell: [24, 28] }), [22, 31], new Rng(7), 0)).toEqual(a);
  });
});

describe("a change of picture", () => {
  const keys: PoseKey[] = [
    { atS: 20, pose: 0 },
    { atS: 25, pose: 1 },
  ];

  it("is drawn over the card's own turn's length, from the one to the other", () => {
    expect(poseAt(keys, 20)).toEqual({ from: 0, to: 0, mix: 1 });
    expect(poseAt(keys, 24.9)).toEqual({ from: 0, to: 0, mix: 1 });
    const half = poseAt(keys, 25 + POSE_S / 2)!;
    expect([half.from, half.to]).toEqual([0, 1]);
    expect(half.mix).toBeCloseTo(0.5, 9);
    expect(poseAt(keys, 25 + POSE_S + 1e-6)).toEqual({ from: 1, to: 1, mix: 1 });
    expect(poseAt([], 22)).toBeNull();
  });
});

/** A picture that says how much of it it was told to draw. */
class Told implements Figure {
  readonly group = new Group();
  readonly triangles = 2;
  told: [number, number, boolean] | null = null;
  updated = 0;
  constructor(readonly nativeSize: number) {}
  update(): void {
    this.updated++;
  }
  present(width: number, show: number, leads: boolean): void {
    this.told = [width, show, leads];
  }
  setSkin(): void {}
  dispose(): void {}
}

const frameAt = (flightS: number, group: Group): CastFrame => ({ timeS: flightS, flightS, eye: new Vector3(0, 0, 100), headingRad: 0, group });

describe("a figure in several pictures", () => {
  it("draws one at a time, each the first's size, and two narrowed while one gives way to the other", () => {
    const a = new Told(2);
    const b = new Told(4);
    const keys: PoseKey[] = [
      { atS: 20, pose: 0 },
      { atS: 25, pose: 1 },
    ];
    const posed = new PosedFigure([a, b], (t) => poseAt(keys, t));
    expect(posed.nativeSize).toBe(2);
    expect(b.group.scale.x).toBeCloseTo(0.5, 12);
    posed.update(frameAt(22, posed.group));
    expect(posed.group.children).toEqual([a.group]);
    expect(b.updated).toBe(0);
    posed.update(frameAt(25 + POSE_S * 0.25, posed.group));
    expect(posed.group.children).toContain(b.group);
    expect(a.told![0]).toBeLessThan(1);
    expect(b.told![0]).toBeLessThan(1);
    // The one going holds its depth until the middle, the one coming after it.
    expect(a.told![2]).toBe(true);
    expect(b.told![2]).toBe(false);
    posed.update(frameAt(26, posed.group));
    expect(posed.group.children).toEqual([b.group]);
    expect(b.told).toEqual([1, 1, true]);
  });
});

describe("a painted card", () => {
  it("is drawn at the layer's size, once, alone or as one pose of several", () => {
    const build = figureBuilder("pilgrims")!;
    const alone = build({ skin: lanternSkin(), variant: "rest", scale: DEFAULT_SCALE });
    const shown = (f: Figure): number => {
      // Its picture, as if loaded.
      (f as unknown as { texture: Texture }).texture = new Texture();
      f.group.scale.setScalar(40);
      // A thousand off: past where a card 40 high is held smaller, short of where one counted 40 times over would be.
      f.update({ ...frameAt(20, f.group), eye: new Vector3(0, 0, 1000) });
      const card = f.group.children.find((c) => c.visible)!;
      return card.scale.y;
    };
    // Nothing holds it smaller there: the picture a unit high in the group the layer scaled, which a slip in F139 counted twice.
    expect(shown(alone)).toBeCloseTo(1, 9);
  });
});

describe("the film's poses", () => {
  it("are each a view its figure's painting has, for a companion with a painting", () => {
    const { film, problems } = loadFilm();
    expect(problems).toEqual([]);
    let named = 0;
    for (const scene of film.scenes) {
      for (const c of scene.cast) {
        const list = poseNames(c);
        if (!list) continue;
        const painting = registeredPaintings().get(c.figure);
        expect(painting, `${scene.id} ${c.figure}`).toBeDefined();
        for (const n of list) {
          expect(viewFor(painting!, n)?.name, `${scene.id} ${c.figure} ${n}`).toBe(n);
          named++;
        }
      }
    }
    expect(named).toBeGreaterThan(10);
  });
});
