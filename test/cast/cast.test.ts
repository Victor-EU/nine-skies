/**
 * The cast (D91): a scene's cues are read and refused as the design says,
 * the figures the gate knows are the figures that build, a figure is held
 * to a budget and dresses itself again on a swap, and the layer places a
 * companion where the cue says.
 */
import { describe, expect, it } from "vitest";
import { Group, Mesh, PlaneGeometry, SkinnedMesh, SphereGeometry, Vector3, type BufferGeometry, type Material } from "three";
import { castFromRaw, cueFromRaw, SIZE_RANGE_M } from "../../content/cast.ts";
import { sceneFromRaw, textLines, validateScene } from "../../content/scenes.ts";
import { FIGURE_KINDS, LIVING_FAITHS } from "../../engine/src/cast/kinds.js";
import { figureBuilder, registeredFigures } from "../../engine/src/cast/figure.js";
import "../../engine/src/cast/figures/index.js";
import { dragonMaterials, DRAGON_LENGTH } from "../../engine/src/cast/figures/dragon.js";
import { lanternSkin, SKINS } from "../../engine/src/cast/skin.js";
import { Wardrobe, triangleCount } from "../../engine/src/cast/parts.js";
import { companionTarget, cueFade, FADE_S, figureYaw } from "../../engine/src/cast/cast.js";
import { FLIGHT_S } from "../../engine/src/film/timeline.js";
import { castLineAt, CAST_LINE_SHOW_S } from "../../engine/src/film/scene.js";
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
    expect(c.facingDeg).toBe(0);
    expect(cueFromRaw({ ...companion, facing_deg: 180 }, p.add)?.facingDeg).toBe(180);
  });

  it("carries a line with a name over it, at the cue's start unless told", () => {
    const p = problems();
    const bare = cueFromRaw({ ...monument, line: "The East King, up from the cloud." }, p.add)!;
    expect(bare.nameZh).toBeNull();
    expect(bare.lineAtS).toBe(monument.from);
    const named = cueFromRaw({ ...monument, line: "The East King, up from the cloud.", name_zh: "东海龙王 敖广", line_at: 20 }, p.add)!;
    expect(p.out).toEqual([]);
    expect(named.nameZh).toBe("东海龙王 敖广");
    expect(named.lineAtS).toBe(20);
    const cases: [Record<string, unknown>, string][] = [
      [{ ...monument, line: "A line.", name_zh: "Ao Guang" }, "name_zh"],
      [{ ...monument, name_zh: "敖广" }, "name_zh"],
      [{ ...monument, line_at: 20 }, "line_at"],
      [{ ...monument, line: "A line.", line_at: monument.until + 5 }, "line_at"],
      [{ ...monument, line: "A line.", line_at: "soon" }, "line_at"],
    ];
    for (const [raw, field] of cases) {
      const q = problems();
      expect(cueFromRaw(raw, q.add), field).toBeNull();
      expect(q.out.map((x) => x.field), field).toContain(field);
    }
  });

  it("refuses what the layer could not build or place", () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ ...monument, figure: "erlang" }, "figure"],
      [{ ...monument, role: "extra" }, "role"],
      [{ ...monument, at: undefined }, "at"],
      [{ ...companion, offset: undefined }, "offset"],
      [{ ...companion, offset: { ahead_m: -5, right_m: 0, up_m: 0 } }, "offset.ahead_m"],
      [{ ...monument, at: { lat: 60, lon: 118, above_ground_m: 100 } }, "at.lat"],
      [{ ...monument, size_m: SIZE_RANGE_M[1] * 2 }, "size_m"],
      [{ ...monument, from: 50, until: 40 }, "until"],
      [{ ...monument, until: FLIGHT_S + 1 }, "until"],
      [{ ...monument, line: 42 }, "line"],
      [{ ...companion, facing_deg: "camera" }, "facing_deg"],
    ];
    for (const [raw, field] of cases) {
      const p = problems();
      expect(cueFromRaw(raw, p.add), field).toBeNull();
      expect(p.out.map((x) => x.field), field).toContain(field);
    }
  });

  it("names the figures it knows when it refuses one", () => {
    const p = problems();
    cueFromRaw({ ...monument, figure: "zhongkui" }, p.add);
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

  it("keeps the cast's lines off the captions and off each other, and out of the film's count", () => {
    const withCaptions = (cast: unknown) => ({ ...good(cast), captions: [{ at: 20, text: "The walls close in." }] });
    const clear = sceneFromRaw(withCaptions([{ ...monument, line: "A dragon.", line_at: 30 }]), "gorges").scene!;
    expect(validateScene(clear).filter((p) => p.field.startsWith("cast"))).toEqual([]);
    const over = sceneFromRaw(withCaptions([{ ...monument, line: "A dragon.", line_at: 16 }]), "gorges").scene!;
    expect(validateScene(over).map((p) => p.field)).toContain("cast[0].line_at");
    const crowded = sceneFromRaw(withCaptions([{ ...monument, line: "A dragon.", line_at: 30 }, { ...companion, line: "Another.", line_at: 33 }]), "gorges").scene!;
    expect(validateScene(crowded).map((p) => p.field)).toContain("cast[1].line_at");
    const late = sceneFromRaw(withCaptions([{ ...monument, until: FLIGHT_S, line: "A dragon.", line_at: FLIGHT_S - 2 }]), "gorges").scene!;
    expect(validateScene(late).map((p) => p.field)).toContain("cast[0].line_at");
    // The film's forty lines are the film's; the cast's are the cast's.
    expect(textLines({ scenes: [clear] } as unknown as Parameters<typeof textLines>[0])).toHaveLength(2);
  });

  it("names its sky, whole or not at all", () => {
    expect(sceneFromRaw(good(undefined), "gorges").scene?.heaven).toBeNull();
    const named = sceneFromRaw({ ...good(undefined), heaven: { zh: "阳天", pinyin: "Yángtiān", en: "the sunlit sky" } }, "gorges");
    expect(named.problems).toEqual([]);
    expect(named.scene?.heaven?.en).toBe("the sunlit sky");
    const partial = sceneFromRaw({ ...good(undefined), heaven: { zh: "阳天", pinyin: "Yángtiān" } }, "gorges");
    expect(partial.problems.map((p) => p.field)).toContain("heaven.en");
    expect(partial.scene?.heaven).toBeNull();
    const romanised = sceneFromRaw({ ...good(undefined), heaven: { zh: "Yangtian", pinyin: "Yángtiān", en: "the sunlit sky" } }, "gorges");
    expect(romanised.problems.map((p) => p.field)).toContain("heaven.zh");
  });

  it("is in every committed scene that has one", () => {
    const { film, problems: ps } = loadFilm();
    expect(ps).toEqual([]);
    for (const s of film.scenes) for (const c of s.cast) expect(figureBuilder(c.figure)).not.toBeNull();
  });

  it("is cast in all nine scenes, each under one of the Huainanzi's nine skies", () => {
    const { film } = loadFilm();
    expect(film.scenes).toHaveLength(9);
    const skies = film.scenes.map((s) => s.heaven?.zh);
    expect(new Set(skies).size).toBe(9);
    for (const zh of skies) expect(["钧天", "苍天", "变天", "玄天", "幽天", "颢天", "朱天", "炎天", "阳天"]).toContain(zh);
    for (const s of film.scenes) expect(s.cast.length, s.id).toBeGreaterThan(0);
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
    // The departure: the monk and the horse alone, a shorter figure of fewer parts.
    const party = figureBuilder("pilgrims")!({ skin, variant: "still", scale: DEFAULT_SCALE });
    const monk = figureBuilder("pilgrims")!({ skin, variant: "monk", scale: DEFAULT_SCALE });
    expect(monk.nativeSize).toBeLessThan(party.nativeSize);
    expect(monk.triangles).toBeLessThan(party.triangles * 0.6);
    monk.update({ timeS: 2, flightS: 2, eye: new Vector3(), headingRad: 0, group: monk.group });
    party.dispose();
    monk.dispose();
    skin.dispose();
  });

  it("draw the figures of living faiths without a body: a mount, a seat, a standard, and nothing of skin", () => {
    const skin = lanternSkin();
    expect(LIVING_FAITHS.length).toBe(2);
    for (const kind of LIVING_FAITHS) {
      expect(FIGURE_KINDS).toContain(kind);
      const f = figureBuilder(kind)!({ skin, variant: null, scale: DEFAULT_SCALE });
      const parts = (f as unknown as { wardrobe?: Wardrobe }).wardrobe?.parts;
      expect(parts, kind).toBeDefined();
      expect(parts!.length, kind).toBeGreaterThan(5);
      expect(parts!.filter((p) => p.role === "skin"), kind).toEqual([]);
      f.dispose();
    }
    skin.dispose();
  });

  it("bake what never moves into one mesh per material, and leave alone what moves, hides or dresses itself", () => {
    const skin = lanternSkin();
    const w = new Wardrobe(skin);
    const root = new Group();
    const SILK = 0xc8342a;
    const IRON = 0x3a2f2a;
    w.part(new PlaneGeometry(1, 1), "silk", SILK, root, 2, 0, 0);
    const mirror = new Group();
    mirror.scale.x = -1;
    mirror.position.x = -2;
    root.add(mirror);
    w.part(new PlaneGeometry(1, 1), "silk", SILK, mirror);
    w.part(new SphereGeometry(0.5, 8, 6), "iron", IRON, root, 0, 1, 0);
    const moving = new Group();
    root.add(moving);
    const leg = w.part(new SphereGeometry(0.3, 8, 6), "silk", SILK, moving);
    const hidden = new Group();
    hidden.visible = false;
    root.add(hidden);
    const ghost = w.part(new SphereGeometry(0.3, 8, 6), "iron", IRON, hidden);
    const printed = w.part(new SphereGeometry(0.3, 8, 6), "matte", SILK, root);
    printed.material = (printed.material as Material).clone();
    const before = w.triangles;
    w.bake(root, [moving]);
    const meshes: Mesh[] = [];
    root.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(o as Mesh);
    });
    // the two planes in one, the sphere alone, and the leg, the ghost and the print as they were
    expect(meshes).toHaveLength(5);
    expect(w.triangles).toBe(before);
    expect(w.parts).toHaveLength(5);
    expect(leg.parent).toBe(moving);
    expect(ghost.parent).toBe(hidden);
    expect(printed.parent).toBe(root);
    const silk = meshes.find((m) => m.material === skin.material("silk", SILK, true))!;
    // A baked part is skinned, in the skin's skinned instance of its material: never the same one as an unbaked part's.
    expect((silk as SkinnedMesh).isSkinnedMesh).toBe(true);
    expect(leg.material).toBe(skin.material("silk", SILK));
    expect(silk.material).not.toBe(leg.material);
    expect(triangleCount(silk.geometry)).toBe(4);
    // The mirrored plane is wound again, so every face still turns the way its normals say.
    const g = silk.geometry as BufferGeometry;
    const pos = g.getAttribute("position");
    const nor = g.getAttribute("normal");
    const index = g.getIndex()!;
    const v = (i: number) => new Vector3().fromBufferAttribute(pos, index.getX(i));
    for (let t = 0; t < index.count; t += 3) {
      const face = v(t + 1).sub(v(t)).cross(v(t + 2).sub(v(t)));
      expect(face.dot(new Vector3().fromBufferAttribute(nor, index.getX(t)))).toBeGreaterThan(0);
    }
    // and the plane that was at x = -2 is still there
    g.computeBoundingBox();
    expect(g.boundingBox!.min.x).toBeCloseTo(-2.5);
    expect(g.boundingBox!.max.x).toBeCloseTo(2.5);
    w.dispose();
    skin.dispose();
  });

  it("still move what a moving group carries, once baked", () => {
    const skin = lanternSkin();
    const w = new Wardrobe(skin);
    const root = new Group();
    const wingG = new Group();
    wingG.position.x = 1;
    root.add(wingG);
    w.part(new PlaneGeometry(1, 1), "silk", 0xf4f4f0, wingG, 0.5, 0, 0);
    w.part(new SphereGeometry(0.2, 8, 6), "silk", 0xf4f4f0, root);
    w.bake(root);
    const baked = root.children.find((o) => (o as SkinnedMesh).isSkinnedMesh) as SkinnedMesh;
    expect(baked).toBeDefined();
    // The plane's far corner, at (2, 0.5) from the root before the group turns.
    const pos = baked.geometry.getAttribute("position");
    let corner = -1;
    for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getX(i) - 2) < 1e-6 && Math.abs(pos.getY(i) - 0.5) < 1e-6) corner = i;
    expect(corner).toBeGreaterThanOrEqual(0);
    // Turn the group a quarter about z at its origin: the corner swings to (0.5, 1.0); the sphere at the root stays.
    wingG.rotation.z = Math.PI / 2;
    root.updateMatrixWorld(true);
    const at = baked.applyBoneTransform(corner, new Vector3().fromBufferAttribute(pos, corner));
    expect(at.x).toBeCloseTo(0.5);
    expect(at.y).toBeCloseTo(1.0);
    let still = -1;
    for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getX(i)) < 1e-6 && Math.abs(pos.getY(i) - 0.2) < 1e-6) still = i;
    const top = baked.applyBoneTransform(still, new Vector3().fromBufferAttribute(pos, still));
    expect(top.y).toBeCloseTo(0.2);
    // Its bounds follow the bones, so three.js culls it where it is now: the swung corner is inside, and the sphere is not the world.
    const bounds = baked.boundingSphere!;
    expect(bounds.containsPoint(at)).toBe(true);
    expect(bounds.containsPoint(top)).toBe(true);
    expect(bounds.radius).toBeLessThan(4);
    wingG.position.x = 30;
    root.updateMatrixWorld(true);
    expect(baked.boundingSphere!.center.x).toBeGreaterThan(10);
    // A skin swap keeps a baked part in the skinned instance of its material.
    const other = lanternSkin();
    w.redress(other);
    expect(baked.material).toBe(other.material("silk", 0xf4f4f0, true));
    w.dispose();
    skin.dispose();
    other.dispose();
  });

  it("draw the heaviest figures as a handful of meshes, every triangle kept", () => {
    const skin = lanternSkin();
    const most: Record<string, number> = { baxian: 40, pilgrims: 25, cranes: 3, egrets: 5, dragon: 8, wukong: 12, nezha: 10, xiwangmu: 14, qilin: 10, niumowang: 11, miyolangsangma: 14, sanduo: 11, tiger: 10 };
    const least: Record<string, number> = { baxian: 30_000, pilgrims: 15_000, cranes: 10_000, egrets: 10_000, dragon: 9_000, wukong: 9_000, nezha: 8_000, xiwangmu: 10_000, qilin: 5_000, niumowang: 6_000, miyolangsangma: 6_000, sanduo: 4_000, tiger: 5_000 };
    for (const [kind, limit] of Object.entries(most)) {
      const f = figureBuilder(kind)!({ skin, variant: "still", scale: DEFAULT_SCALE });
      // the meshes drawn: a part hidden (the Queen Mother's legs, under her robe) is never drawn
      let meshes = 0;
      f.group.traverseVisible((o) => {
        if ((o as Mesh).isMesh) meshes++;
      });
      expect(meshes, kind).toBeLessThanOrEqual(limit);
      expect(f.triangles, kind).toBeGreaterThan(least[kind]!);
      f.update({ timeS: 4, flightS: 4, eye: new Vector3(), headingRad: 0, group: f.group });
      f.dispose();
    }
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

  it("has a line on for six seconds from its time, and none otherwise", () => {
    const cue = cueFromRaw({ ...monument, line: "A dragon.", line_at: 30 }, () => {})!;
    const mute = cueFromRaw({ ...companion }, () => {})!;
    const scene = { cast: [mute, cue] };
    expect(castLineAt(scene, 29)).toBeNull();
    expect(castLineAt(scene, 30)).toBe(cue);
    expect(castLineAt(scene, 30 + CAST_LINE_SHOW_S - 0.01)).toBe(cue);
    expect(castLineAt(scene, 30 + CAST_LINE_SHOW_S)).toBeNull();
  });

  it("turns a companion from the flight and a monument from north", () => {
    const heading = 0.7;
    expect(figureYaw({ role: "companion", facingDeg: 0 }, heading)).toBeCloseTo(heading);
    expect(figureYaw({ role: "companion", facingDeg: 180 }, heading)).toBeCloseTo(heading + Math.PI);
    expect(figureYaw({ role: "monument", facingDeg: 90 }, heading)).toBeCloseTo(Math.PI / 2);
    // A companion turned to its right faces where the offset's right axis points.
    const eye = new Vector3();
    const right = companionTarget(eye, heading, { aheadM: 0.0001, rightM: 100, upM: 0 }, DEFAULT_SCALE);
    const yaw = figureYaw({ role: "companion", facingDeg: 90 }, heading);
    expect(Math.atan2(right.x, right.z)).toBeCloseTo(Math.atan2(Math.sin(yaw), Math.cos(yaw)), 3);
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
