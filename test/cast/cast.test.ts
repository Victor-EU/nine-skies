/**
 * The cast (D91): a scene's cues are read and refused as the design says,
 * the figures the gate knows are the figures that build, a figure is held
 * to a budget and dresses itself again on a swap, and the layer places a
 * companion where the cue says.
 */
import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { castFromRaw, cueFromRaw, SIZE_RANGE_M } from "../../content/cast.ts";
import { sceneFromRaw, validateScene } from "../../content/scenes.ts";
import { FIGURE_KINDS } from "../../engine/src/cast/kinds.js";
import { figureBuilder, registeredFigures } from "../../engine/src/cast/figure.js";
import "../../engine/src/cast/figures/index.js";
import { dragonMaterials, DRAGON_LENGTH } from "../../engine/src/cast/figures/dragon.js";
import { lanternSkin, SKINS } from "../../engine/src/cast/skin.js";
import { companionTarget, cueFade, FADE_S } from "../../engine/src/cast/cast.js";
import { FLIGHT_S } from "../../engine/src/film/timeline.js";
import { DEFAULT_SCALE, toWorldH } from "../../engine/src/sim/scale.js";
import { wantedAtStart } from "../../app/src/cast.ts";
import { loadFilm } from "../../tools/film.ts";

const problems = () => {
  const out: { field: string; message: string }[] = [];
  return { out, add: (field: string, message: string) => out.push({ field, message }) };
};
const monument = { figure: "dragon", role: "monument", at: { lat: 30.13, lon: 118.17, above_ground_m: 900 }, size_m: 1200, from: 8, until: 70 };
const companion = { figure: "dragon", role: "companion", offset: { ahead_m: 700, right_m: -120, up_m: 30 }, size_m: 400 };

describe("a cue", () => {
  it("reads a monument and a companion", () => {
    const p = problems();
    const m = cueFromRaw(monument, p.add)!;
    const c = cueFromRaw(companion, p.add)!;
    expect(p.out).toEqual([]);
    expect(m.at?.aboveGroundM).toBe(900);
    expect(m.offset).toBeNull();
    expect(c.offset?.aheadM).toBe(700);
    expect(c.fromS).toBe(0);
    expect(c.untilS).toBe(FLIGHT_S);
    expect(c.variant).toBeNull();
  });

  it("refuses what the layer could not build or place", () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ ...monument, figure: "phoenix" }, "figure"],
      [{ ...monument, role: "extra" }, "role"],
      [{ ...monument, at: undefined }, "at"],
      [{ ...companion, offset: undefined }, "offset"],
      [{ ...companion, offset: { ahead_m: -5, right_m: 0, up_m: 0 } }, "offset.ahead_m"],
      [{ ...monument, at: { lat: 60, lon: 118, above_ground_m: 100 } }, "at.lat"],
      [{ ...monument, size_m: SIZE_RANGE_M[1] * 2 }, "size_m"],
      [{ ...monument, from: 50, until: 40 }, "until"],
      [{ ...monument, until: FLIGHT_S + 1 }, "until"],
      [{ ...monument, line: 42 }, "line"],
    ];
    for (const [raw, field] of cases) {
      const p = problems();
      expect(cueFromRaw(raw, p.add), field).toBeNull();
      expect(p.out.map((x) => x.field), field).toContain(field);
    }
  });

  it("names the figures it knows when it refuses one", () => {
    const p = problems();
    cueFromRaw({ ...monument, figure: "qilin" }, p.add);
    expect(p.out[0]!.message).toContain(FIGURE_KINDS[0]);
  });

  it("is a list on the scene, absent for none, and prefixes its problems", () => {
    const p = problems();
    expect(castFromRaw(undefined, p.add)).toEqual([]);
    expect(castFromRaw([monument, { ...monument, size_m: 1 }], p.add)).toHaveLength(1);
    expect(p.out[0]!.field).toBe("cast[1].size_m");
    castFromRaw("dragon", p.add);
    expect(p.out.at(-1)!.field).toBe("cast");
  });
});

describe("a scene with a cast", () => {
  const good = (cast: unknown) => ({
    id: "gorges",
    title: { zh: "三峡", pinyin: "Sānxiá", en: "The Three Gorges" },
    line: "The walls close in.",
    month: 5,
    hour: 17,
    rail: [
      { lat: 30.7, lon: 111.29, above_ground_m: 300, speed: 90 },
      { lat: 31.04, lon: 109.57, above_ground_m: 300, speed: 90 },
    ],
    band: { above_ground_m: [100, 2000] },
    corridor_deg: 60,
    cast,
  });

  it("carries its cues, and none when the block is absent", () => {
    expect(sceneFromRaw(good(undefined), "gorges").scene?.cast).toEqual([]);
    const read = sceneFromRaw(good([{ ...monument, line: "The dragon rises {1800 m} over the gorge." }]), "gorges");
    expect(read.problems).toEqual([]);
    expect(read.scene?.cast).toHaveLength(1);
    expect(read.scene?.cast[0]!.line).toContain("ft");
  });

  it("holds a cue's line to the film's rules", () => {
    const bare = sceneFromRaw(good([{ ...monument, line: "It rises 1800 m." }]), "gorges");
    expect(bare.problems.map((p) => p.field)).toContain("cast");
    const long = sceneFromRaw(good([{ ...monument, line: "one two three four five six seven eight nine ten eleven twelve thirteen" }]), "gorges");
    expect(long.problems).toEqual([]);
    expect(validateScene(long.scene!).map((p) => p.field)).toContain("cast[0].line");
  });

  it("is in every committed scene that has one", () => {
    const { film, problems: ps } = loadFilm();
    expect(ps).toEqual([]);
    for (const s of film.scenes) for (const c of s.cast) expect(figureBuilder(c.figure)).not.toBeNull();
  });
});

describe("the figures", () => {
  it("are the kinds the gate knows, no more and no fewer", () => {
    expect([...registeredFigures()].sort()).toEqual([...FIGURE_KINDS].sort());
  });

  it("build under budget, at their native size, with every part dressed by the skin", () => {
    const skin = lanternSkin();
    for (const kind of FIGURE_KINDS) {
      const f = figureBuilder(kind)!({ skin, variant: null, scale: DEFAULT_SCALE });
      expect(f.triangles, kind).toBeGreaterThan(100);
      expect(f.triangles, kind).toBeLessThan(60_000);
      expect(f.nativeSize, kind).toBeGreaterThan(0);
      f.update({ timeS: 3, flightS: 3, eye: new Vector3(), headingRad: 0, group: f.group });
      f.dispose();
    }
    const dragon = figureBuilder("dragon")!({ skin, variant: "north-king", scale: DEFAULT_SCALE });
    expect(dragon.nativeSize).toBe(DRAGON_LENGTH);
    expect(dragon.group.children.length).toBeGreaterThan(5);
    skin.dispose();
  });

  it("dress themselves again from another skin, every material", () => {
    const a = lanternSkin();
    const b = SKINS.lantern!();
    const dragon = figureBuilder("dragon")!({ skin: a, variant: null, scale: DEFAULT_SCALE });
    const before = dragonMaterials(dragon);
    dragon.setSkin(b);
    const after = dragonMaterials(dragon);
    expect(after.length).toBe(before.length);
    for (const m of after) expect(before).not.toContain(m);
    // The same role and colour share one material: a figure costs a handful.
    expect(new Set(after).size).toBeLessThan(12);
  });
});

describe("the layer", () => {
  it("fades a cue in and out over its seconds, and shows nothing outside them", () => {
    const cue = cueFromRaw({ ...monument, from: 10, until: 40 }, () => {})!;
    expect(cueFade(cue, 9)).toBe(0);
    expect(cueFade(cue, 10 + FADE_S / 2)).toBeCloseTo(0.5);
    expect(cueFade(cue, 25)).toBe(1);
    expect(cueFade(cue, 40 - FADE_S / 4)).toBeCloseTo(0.25);
    expect(cueFade(cue, 41)).toBe(0);
  });

  it("puts a companion ahead, to the right and up in the camera's frame, all in the picture's metres", () => {
    const eye = new Vector3(100, 50, -200);
    const north = 0;
    const p = companionTarget(eye, north, { aheadM: 800, rightM: 160, upM: 40 }, DEFAULT_SCALE);
    expect(p.z - eye.z).toBeCloseTo(toWorldH(800, DEFAULT_SCALE));
    expect(p.x - eye.x).toBeCloseTo(toWorldH(160, DEFAULT_SCALE));
    expect(p.y - eye.y).toBeCloseTo(toWorldH(40, DEFAULT_SCALE));
    const east = Math.PI / 2;
    const q = companionTarget(eye, east, { aheadM: 800, rightM: 0, upM: 0 }, DEFAULT_SCALE);
    expect(q.x - eye.x).toBeCloseTo(toWorldH(800, DEFAULT_SCALE));
    expect(q.z - eye.z).toBeCloseTo(0);
  });
});

describe("the switch", () => {
  it("is off unless the address or this browser says otherwise", () => {
    expect(wantedAtStart("", null)).toBe(false);
    expect(wantedAtStart("", "off")).toBe(false);
    expect(wantedAtStart("", "on")).toBe(true);
    expect(wantedAtStart("?cast", null)).toBe(true);
    expect(wantedAtStart("?cast=off", "on")).toBe(false);
  });
});
