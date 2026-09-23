/**
 * The look's presets (plan v2, stage 3): every name a scene file uses
 * exists, and the tables make sense as pictures.
 */
import { describe, expect, it } from "vitest";
import {
  CLOUD_PRESETS,
  GRADE_PRESETS,
  PALETTE_PRESETS,
  SKY_PRESETS,
  lookProblems,
  resolveLook,
  scenePalette,
} from "../../engine/src/look/presets.js";
import { ELEVATION_STOPS, snowLineForLatitude } from "../../engine/src/terrain/palette.js";
import { loadFilm } from "../../tools/film.ts";

describe("the names", () => {
  it("cover every scene in the film", () => {
    const { film } = loadFilm();
    expect(film.scenes.length).toBeGreaterThan(0);
    for (const s of film.scenes) expect(lookProblems(s.look)).toEqual([]);
  });

  it("refuse a preset that is not there, naming the table", () => {
    const p = lookProblems({ sky: "gorge-afternoon", palette: "neon", cloud: "none", grade: "cool" });
    expect(p).toHaveLength(1);
    expect(p[0]!.field).toBe("palette");
    expect(p[0]!.message).toContain("limestone-green");
  });

  it("fall back to the defaults for a look the gate would have refused", () => {
    const r = resolveLook({ sky: "x", palette: "y", cloud: "z", grade: "w" });
    expect(r.sky).toBe(SKY_PRESETS.default);
    expect(r.palette).toBe(PALETTE_PRESETS.default);
    expect(r.cloud).toBe(CLOUD_PRESETS.none);
    expect(r.grade).toBe(GRADE_PRESETS.none);
  });
});

describe("the skies", () => {
  it("see furthest on the plateau and least through the karst mist", () => {
    const density = (name: string) => SKY_PRESETS[name]!.hazeDensityPerM;
    expect(density("plateau-dusk")).toBeLessThan(density("noon-hard"));
    expect(density("noon-hard")).toBeLessThan(density("gorge-afternoon"));
    expect(density("gorge-afternoon")).toBeLessThan(density("karst-mist"));
  });

  it("tint the dust ochre and nothing blue", () => {
    const dust = SKY_PRESETS["dust-afternoon"]!.hazeTint;
    expect(dust[0]).toBeGreaterThan(dust[2]);
    for (const p of Object.values(SKY_PRESETS)) expect(Math.max(...p.hazeTint)).toBeLessThanOrEqual(1);
  });
});

describe("the palettes", () => {
  it("override stops by name over the default ramp, and keep the rest", () => {
    const p = scenePalette(PALETTE_PRESETS["loess-ochre"]!, 36);
    expect(p.stops).toHaveLength(ELEVATION_STOPS.length);
    const loess = p.stops.find((s) => s.name === "loess")!;
    expect(loess.m).toBe(800);
    expect(loess.srgb[0]).toBeGreaterThan(ELEVATION_STOPS.find((s) => s.name === "loess")!.srgb[0]);
    expect(p.stops.find((s) => s.name === "snow")).toEqual(ELEVATION_STOPS.find((s) => s.name === "snow"));
  });

  it("put the snow line by latitude unless the preset says a height", () => {
    expect(scenePalette(PALETTE_PRESETS.default!, 28).snowLineM).toBe(snowLineForLatitude(28));
    expect(scenePalette(PALETTE_PRESETS["snow-rock"]!, 28).snowLineM).toBe(5400);
    // Higher in the Himalaya's rain shadow than in the Tian Shan.
    expect(snowLineForLatitude(28)).toBeGreaterThan(snowLineForLatitude(43));
    expect(snowLineForLatitude(43)).toBeGreaterThan(3500);
    expect(snowLineForLatitude(43)).toBeLessThan(4300);
  });

  it("colour the Yellow River yellow and the plateau's lakes turquoise", () => {
    const yellow = scenePalette(PALETTE_PRESETS["loess-ochre"]!, 36).riverSrgb;
    expect(yellow[0]).toBeGreaterThan(yellow[2]);
    const lake = scenePalette(PALETTE_PRESETS["plateau-tan-turquoise"]!, 30).lakeSrgb;
    expect(lake[1]).toBeGreaterThan(lake[0]);
    expect(lake[2]).toBeGreaterThan(lake[0]);
  });
});

describe("the clouds and the grades", () => {
  it("keep every mist below the band the scene flies in, so the camera looks down through it", () => {
    const { film } = loadFilm();
    for (const s of film.scenes) {
      const mist = resolveLook(s.look).cloud.mist;
      if (!mist) continue;
      // The first key's ground is under 200 m in every misty scene; the top
      // of the mist is well under the band's ceiling above it.
      expect(mist.topM).toBeLessThan(s.band.maxM + 200);
    }
  });

  it("warm the desert and cool the gorges", () => {
    expect(GRADE_PRESETS.warm!.temperature).toBeGreaterThan(0);
    expect(GRADE_PRESETS.cool!.temperature).toBeLessThan(0);
    expect(GRADE_PRESETS.cold!.temperature).toBeLessThan(GRADE_PRESETS.cool!.temperature);
    for (const g of Object.values(GRADE_PRESETS)) {
      expect(g.exposure).toBeGreaterThan(0.5);
      expect(g.exposure).toBeLessThan(2);
      expect(g.vignette).toBeLessThanOrEqual(0.5);
    }
  });
});
