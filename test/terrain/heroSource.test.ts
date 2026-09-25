import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HeroCover,
  type HeroAreaData,
  type HeroIndex,
  type HeroManifest,
  type HeroWater,
} from "../../engine/src/terrain/heroSource.js";
import { WATER_CHANNELS } from "../../engine/src/terrain/tileCodec.js";
import { NO_WATER } from "../../engine/src/terrain/tileStream.js";
import {
  NO_RIBBON_CAP_M,
  OFFSET_STEP_M,
  OFFSET_ZERO,
  REACH_M,
  WATER_LAND,
  WATER_RIVER,
} from "../../engine/src/terrain/water.js";
import { loadHeroCoverFrom } from "../../tools/heroCover.ts";
import { loadCorridor } from "../../tools/corridor.ts";
import { HERO_TILE_SAMPLES } from "../../engine/src/terrain/tileArray.js";
import { buildGrid } from "../../engine/src/terrain/grid.js";
import {
  HERO_LOD_SEGMENTS,
  SKIRT_DEPTH_M,
  Terrain,
} from "../../engine/src/terrain/terrain.js";
import {
  PackedTileSource,
  SyntheticTileSource,
  type WorldManifest,
} from "../../engine/src/terrain/tileSource.js";
import { DEFAULT_SCALE } from "../../engine/src/sim/scale.js";

const TILE_M = 11_520;
const RESOLUTION_M = 90;
const STRIDE = HERO_TILE_SAMPLES * HERO_TILE_SAMPLES;

function index(over: Partial<HeroIndex> = {}): HeroIndex {
  return {
    version: 1,
    resolutionM: RESOLUTION_M,
    tileM: TILE_M,
    tileSamples: HERO_TILE_SAMPLES,
    origin: { originXM: -3_456_000, originYM: 1_792_000 },
    areas: [],
    ...over,
  };
}

function manifest(
  id: string,
  hx0: number,
  hy0: number,
  tilesX: number,
  tilesY: number,
  over: Partial<HeroManifest> = {},
): HeroManifest {
  const tiles = tilesX * tilesY;
  return {
    version: 1,
    area: id,
    name: id,
    resolutionM: RESOLUTION_M,
    tileM: TILE_M,
    tileSamples: HERO_TILE_SAMPLES,
    silhouetteBias: 0.4,
    window: { hx0, hy0, hx1: hx0 + tilesX, hy1: hy0 + tilesY },
    origin: { originXM: -3_456_000, originYM: 1_792_000 },
    countryTiles: [],
    holds: [],
    heights: { file: `${id}.bin`, tiles, bytes: tiles * STRIDE * 2, sha256: "" },
    boundary: { meanM: 71.3, worstM: 333.2, skirtDepthM: SKIRT_DEPTH_M },
    elevationM: { min: 0, max: 0 },
    ...over,
  };
}

/** Every sample of a tile stamped with that tile's own index. */
function stamped(hx0: number, hy0: number, tilesX: number, tilesY: number): Int16Array {
  const data = new Int16Array(tilesX * tilesY * STRIDE);
  let t = 0;
  for (let hy = hy0; hy < hy0 + tilesY; hy++) {
    for (let hx = hx0; hx < hx0 + tilesX; hx++) {
      data.fill(hy * 100 + hx, t * STRIDE, (t + 1) * STRIDE);
      t++;
    }
  }
  return data;
}

function cover(hx0 = 10, hy0 = 20, tilesX = 2, tilesY = 3): HeroCover {
  const area: HeroAreaData = {
    manifest: manifest("gorge", hx0, hy0, tilesX, tilesY),
    heights: stamped(hx0, hy0, tilesX, tilesY),
  };
  return new HeroCover(
    index({
      areas: [
        {
          id: "gorge",
          name: "gorge",
          file: "gorge.json",
          window: area.manifest.window,
          bytes: area.manifest.heights.bytes,
        },
      ],
    }),
    [area],
  );
}

function heroWater(tiles: number, over: Partial<HeroWater> = {}): HeroWater {
  return {
    file: "gorge.water.bin",
    codec: "rgba8-gzip",
    fileBytes: 0,
    channels: WATER_CHANNELS,
    tileSamples: HERO_TILE_SAMPLES,
    offsetStepM: OFFSET_STEP_M,
    offsetZero: OFFSET_ZERO,
    reachM: REACH_M,
    classes: { land: 0, sea: 1, lake: 2, river: WATER_RIVER },
    tiles,
    tilesWithWater: 1,
    bytes: tiles * STRIDE * WATER_CHANNELS,
    sha256: "",
    heightsSha256: "h".repeat(64),
    ...over,
  };
}

/** Two tiles side by side: the west one a river's surface, the east one dry. */
function wetCover(over: Partial<HeroWater> = {}, bytes?: Uint8Array): HeroCover {
  const m = manifest("gorge", 10, 20, 2, 1);
  m.heights = { ...m.heights, sha256: "h".repeat(64) };
  m.water = heroWater(2, over);
  let water = bytes;
  if (!water) {
    water = new Uint8Array(2 * STRIDE * WATER_CHANNELS);
    for (let k = 0; k < water.length; k += WATER_CHANNELS) {
      water[k] = OFFSET_ZERO;
      water[k + 1] = OFFSET_ZERO;
      water[k + 3] = k < STRIDE * WATER_CHANNELS ? WATER_RIVER : WATER_LAND;
    }
  }
  const entry = { id: "gorge", name: "gorge", file: "gorge.json", window: m.window, bytes: m.heights.bytes };
  return new HeroCover(index({ areas: [entry] }), [{ manifest: m, heights: stamped(10, 20, 2, 1), water }]);
}

describe("hero cover's water (F73)", () => {
  it("hands out a wet tile's water, none for a dry one, and nothing outside", () => {
    const hero = wetCover();
    expect(typeof hero.water).toBe("function");
    const wet = hero.water!(10, 20)!;
    expect(wet.length).toBe(STRIDE * WATER_CHANNELS);
    expect(wet[3]).toBe(WATER_RIVER);
    expect(hero.water!(11, 20)).toBe(NO_WATER);
    expect(hero.water!(12, 20)).toBeNull();
    expect(hero.wetTiles).toBe(1);
    expect(hero.label).toContain("1 with water");
  });

  it("costs no water texture where no area was cut with any", () => {
    expect(cover().water).toBeUndefined();
    expect(cover().waterRefused).toEqual([]);
  });

  it("flies an area dry whose water does not fit its heights, and says why", () => {
    const stale = wetCover({ heightsSha256: "0".repeat(64) });
    expect(stale.water).toBeUndefined();
    expect(stale.waterRefused[0]).toMatch(/other heights/);
    // The ground is still drawn: the heights are what an area cannot do without.
    expect(stale.request(10, 20)).not.toBeNull();
    expect(wetCover({}, new Uint8Array(STRIDE * WATER_CHANNELS)).waterRefused[0]).toMatch(/bytes of water/);
    expect(wetCover({ classes: { land: 0, sea: 1, lake: 2, river: 5 } }).waterRefused[0]).toMatch(
      /numbered differently/,
    );
  });

  it("gives the hero lattice water with its ribbon held to half a sample", () => {
    const terrain = new Terrain({
      scale: { ...DEFAULT_SCALE },
      viewRadiusTiles: 2,
      layers: 64,
      source: new SyntheticTileSource(),
      hero: wetCover(),
    });
    const [country, hero] = terrain.materials;
    expect(country!.uniforms.uWater).toBeUndefined();
    expect(hero!.uniforms.uWaterRibbonMaxM!.value).toBe(45);
    terrain.update(10.5 * TILE_M, 20.5 * TILE_M, 3000);
    const flags = new Map<number, number>();
    for (const mesh of terrain.meshes.slice(4, 8)) {
      const geometry = mesh.geometry as import("three").InstancedBufferGeometry;
      const origins = geometry.getAttribute("iOrigin").array as Float32Array;
      const water = geometry.getAttribute("iWater").array as Float32Array;
      for (let k = 0; k < geometry.instanceCount; k++) flags.set(Math.round(origins[k * 2]!), water[k]!);
    }
    expect([...flags.values()].sort()).toEqual([0, 1]);
  });
});

describe("the hero lattice, addressed by position", () => {
  const hero = cover();

  it("hands back the tile that was asked for, not its neighbour", () => {
    // Same arithmetic as the country grid's packed source, and the same way
    // to get it wrong: one row out and the gorge is 11.5 km north of itself.
    for (let hy = 20; hy < 23; hy++) {
      for (let hx = 10; hx < 12; hx++) {
        const tile = hero.request(hx, hy)!;
        expect(tile).not.toBeNull();
        expect(tile.length).toBe(STRIDE);
        expect(tile[0]).toBe(hy * 100 + hx);
        expect(tile[STRIDE - 1]).toBe(hy * 100 + hx);
      }
    }
  });

  it("turns metres into a hero tile, which is what nothing else could do", () => {
    // The whole reason this class exists: `TileSource` is asked by country
    // tile index, and 90 m nests in no country tile at any tile size.
    expect(hero.tileAt(10 * TILE_M, 20 * TILE_M)).toEqual({ hx: 10, hy: 20 });
    expect(hero.tileAt(11.99 * TILE_M, 22.99 * TILE_M)).toEqual({ hx: 11, hy: 22 });
    expect(hero.covers(10.5 * TILE_M, 20.5 * TILE_M)).toBe(true);
    expect(hero.covers(9.5 * TILE_M, 20.5 * TILE_M)).toBe(false);
    expect(hero.covers(10.5 * TILE_M, 23.5 * TILE_M)).toBe(false);
  });

  it("reports its footprint in the same metres the aeroplane flies in", () => {
    expect(hero.bounds()).toEqual([
      {
        eastM0: 10 * TILE_M,
        northM0: 20 * TILE_M,
        eastM1: 12 * TILE_M,
        northM1: 23 * TILE_M,
      },
    ]);
  });

  it("answers null outside the cover rather than inventing ground", () => {
    expect(hero.request(9, 20)).toBeNull();
    expect(hero.request(12, 20)).toBeNull();
    expect(hero.request(10, 19)).toBeNull();
    expect(hero.request(10, 23)).toBeNull();
  });

  it("refuses two areas that are not on the same lattice", () => {
    // They would share one texture array, which has one size for every layer
    // in it. Keeping the first and warping the second is how an area ends up
    // drawn somewhere it is not.
    const odd = manifest("other", 30, 30, 1, 1, { tileM: 6000, resolutionM: 60 });
    expect(
      () =>
        new HeroCover(index(), [
          { manifest: manifest("gorge", 10, 20, 1, 1), heights: new Int16Array(STRIDE) },
          { manifest: odd, heights: new Int16Array(STRIDE) },
        ]),
    ).toThrow(/other is 129 samples of 6000 m/);
  });

  it("refuses an area indexed from a different corner", () => {
    const moved = manifest("other", 30, 30, 1, 1, {
      origin: { originXM: 0, originYM: 0 },
    });
    expect(
      () => new HeroCover(index(), [{ manifest: moved, heights: new Int16Array(STRIDE) }]),
    ).toThrow(/different origin/);
  });

  it("refuses a heights buffer that does not match its window", () => {
    expect(
      () =>
        new HeroCover(index(), [
          { manifest: manifest("gorge", 10, 20, 2, 3), heights: new Int16Array(STRIDE) },
        ]),
    ).toThrow(/manifest wants/);
  });

  it("refuses an index whose tile size is not its own cells", () => {
    expect(() => new HeroCover(index({ tileM: 11_000 }), [])).toThrow(/not 129 samples/);
  });
});

describe("the hero grid's own LOD ladder", () => {
  it("reads every 90 m sample at the finest level", () => {
    // The country ladder would stride 129 samples by two, which is 180 m
    // ground - not what a 90 m area is cut for.
    const g = buildGrid(HERO_LOD_SEGMENTS[0], HERO_TILE_SAMPLES);
    const texels = new Set(Array.from(g.texel));
    expect(Math.max(...texels)).toBe(HERO_TILE_SAMPLES - 1);
    expect(texels.size).toBe(HERO_TILE_SAMPLES);
  });

  it("lands on real samples at every level, which 90 m in a country tile does not", () => {
    for (const segments of HERO_LOD_SEGMENTS) {
      expect((HERO_TILE_SAMPLES - 1) % segments).toBe(0);
    }
  });
});

describe("terrain over both grids at once", () => {
  const eastM = 11 * TILE_M;
  const northM = 21.5 * TILE_M;

  const build = (hero: HeroCover | null): Terrain =>
    new Terrain({
      scale: { ...DEFAULT_SCALE },
      viewRadiusTiles: 2,
      layers: 64,
      source: new SyntheticTileSource(),
      hero,
    });

  it("draws two lattices and the rim between them, and says which bucket is which", () => {
    const terrain = build(cover());
    expect(terrain.meshes.length).toBe(10);
    expect(terrain.stats.bucketLabels).toEqual([
      "L-1",
      "L0",
      "L1",
      "L2",
      "L3",
      "hero L0",
      "hero L1",
      "hero L2",
      "hero L3",
      "hero rim",
    ]);
    // The rim shares the country material's uniforms rather than adding one.
    expect(terrain.materials.length).toBe(2);
  });

  it("is the world as it was when nothing is published", () => {
    const terrain = build(null);
    expect(terrain.meshes.length).toBe(5);
    expect(terrain.materials.length).toBe(1);
    // A shader with no `discard` in it, so the country grid keeps early-Z.
    expect(terrain.material.uniforms.uCutCount).toBeUndefined();
    expect(terrain.material.fragmentShader).not.toContain("discard");
  });

  it("draws an area whole and cuts exactly what it drew", () => {
    const terrain = build(cover());
    terrain.update(eastM, northM, 3000);
    expect(terrain.stats.hero.areasDrawn).toBe(1);
    expect(terrain.stats.hero.instances).toBe(6);
    expect(terrain.stats.hero.resident).toBe(6);
    expect(terrain.material.uniforms.uCutCount!.value).toBe(1);
    // Every hero instance is in a bucket, and the buckets are the four after
    // the country's five; the rim's, last, counts stretches of rim.
    const heroBuckets = terrain.stats.perLod.slice(5, 9);
    expect(heroBuckets.reduce((a, b) => a + b, 0)).toBe(6);
  });

  it("cuts nothing where it draws nothing", () => {
    const terrain = build(cover());
    // Far enough that the area is out of reach - two country tiles is 128 km.
    terrain.update(eastM + 400_000, northM, 3000);
    expect(terrain.stats.hero.areasDrawn).toBe(0);
    expect(terrain.stats.hero.instances).toBe(0);
    expect(terrain.material.uniforms.uCutCount!.value).toBe(0);
  });

  it("will not punch a hole it cannot fill", () => {
    // The invariant the whole overlap rule rests on. An area that cannot be
    // drawn whole shows sky through its unfinished half if the country grid
    // is cut away underneath it, so it is not cut away.
    class OneTileShort extends HeroCover {
      override request(hx: number, hy: number): Int16Array | null {
        if (hx === 11 && hy === 22) return null;
        return super.request(hx, hy);
      }
    }
    const short = new OneTileShort(
      index({
        areas: [
          {
            id: "gorge",
            name: "gorge",
            file: "gorge.json",
            window: { hx0: 10, hy0: 20, hx1: 12, hy1: 23 },
            bytes: 6 * STRIDE * 2,
          },
        ],
      }),
      [{ manifest: manifest("gorge", 10, 20, 2, 3), heights: stamped(10, 20, 2, 3) }],
    );
    const terrain = build(short);
    terrain.update(eastM, northM, 3000);
    expect(terrain.stats.hero.areasDrawn).toBe(0);
    expect(terrain.material.uniforms.uCutCount!.value).toBe(0);
  });

  it("reads the ground off the grid that is on screen", () => {
    const terrain = build(cover());
    terrain.update(eastM, northM, 3000);
    // Tile (11, 21) of the stamped fixture.
    expect(terrain.groundElevationM(eastM + 100, northM + 100)).toBeCloseTo(2111, 6);
    expect(terrain.overHeroGround(eastM + 100, northM + 100)).toBe(true);

    // Just outside the cover the country grid answers again, and says
    // something else entirely - which is the point of the whole exercise.
    const outside = 9.5 * TILE_M;
    expect(terrain.overHeroGround(outside, northM)).toBe(false);
    expect(terrain.groundElevationM(outside, northM)).not.toBeCloseTo(2111, 6);
  });
});

/**
 * Against the artefact the pipeline actually wrote (F51).
 *
 * Skipped on a checkout with no world, like every other suite that reads
 * `dist-world/` - a green tick for a check that ran on nothing is worse than
 * a skip that says so.
 */
const worldDir = "dist-world/sea-to-sky";
const built = existsSync(`${worldDir}/hero/index.json`);

/** Built on first use: `skipIf` still runs a skipped suite's body to collect it. */
interface BuiltWorld {
  hero: HeroCover;
  country: PackedTileSource;
  at: { eastM: number; northM: number };
  gorges: { eastM: number; northM: number };
}
let cached: BuiltWorld | null = null;
function world(): BuiltWorld {
  if (cached === null) {
    const worldManifest = JSON.parse(
      readFileSync(`${worldDir}/manifest.json`, "utf8"),
    ) as WorldManifest;
    const bytes = readFileSync(`${worldDir}/${worldManifest.heights.file}`);
    cached = {
      hero: loadHeroCoverFrom(worldDir)!,
      country: new PackedTileSource(
        worldManifest,
        new Int16Array(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        ),
      ),
      at: worldManifest.anchors["tiger-leaping-gorge"]!,
      gorges: worldManifest.anchors["wu-gorge"]!,
    };
  }
  return cached;
}

describe.skipIf(!built)("the gorge the country grid gets wrong", () => {
  const fly = (withHero: boolean): Terrain => {
    const { hero, country, at } = world();
    const terrain = new Terrain({
      scale: { ...DEFAULT_SCALE },
      viewRadiusTiles: 2,
      layers: 64,
      source: country,
      hero: withHero ? hero : null,
    });
    terrain.update(at.eastM, at.northM, 3000);
    return terrain;
  };

  it("loads what the cutter wrote", () => {
    const { hero, at } = world();
    expect(hero.areaCount).toBe(2);
    expect(hero.resolutionM).toBe(90);
    expect(hero.label).toContain("tiger-leaping-gorge");
    expect(hero.covers(at.eastM, at.northM)).toBe(true);
  });

  it("puts the aeroplane 106 m lower than the 1 km grid does", () => {
    // F49 moved this coordinate onto the water and F50 measured what the
    // country grid does with it: at 1 km the Jinsha climbs 221 m downstream
    // of Shigu. This is the same fault seen from the cockpit - the ground
    // under the waypoint, as the HUD and the terrain clamp read it. Stage 3
    // carved the Jinsha through the country grid here (F61), which took it
    // from 2,197.2 m to 1,910.0: down to the lowest ground upstream, Shigu's,
    // and no further. Carving the hero area as well (F63) took the fine
    // reading from 1,807.3 m to 1,804.0, so the gap is 106 m rather than 103:
    // both grids came down and the coarse one had further to come.
    const { at } = world();
    const coarse = fly(false).groundElevationM(at.eastM, at.northM)!;
    const fine = fly(true).groundElevationM(at.eastM, at.northM)!;
    expect(coarse).toBeCloseTo(1910.0, 0);
    expect(fine).toBeCloseTo(1804.0, 0);
    expect(coarse - fine).toBeGreaterThan(100);
  });

  it("is drawn whole, and the country grid is cut where it is", () => {
    const terrain = fly(true);
    expect(terrain.stats.hero.areasDrawn).toBe(1);
    expect(terrain.stats.hero.instances).toBe(24);
    expect(terrain.material.uniforms.uCutCount!.value).toBe(1);
  });

  it("stays inside the frame budget's draw calls with both grids flying", () => {
    const terrain = fly(true);
    expect(terrain.stats.drawCalls).toBeLessThanOrEqual(8);
  });

  it("draws the area it is over and not the one 1,200 km away", () => {
    // The cover has two areas now. Both are published, one is in reach, and
    // the cut is what makes that safe: an area nobody draws punches no hole
    // (F52).
    const { hero } = world();
    expect(hero.areaCount).toBe(2);
    const terrain = fly(true);
    expect(terrain.stats.hero.areasDrawn).toBe(1);
    expect(terrain.material.uniforms.uCutCount!.value).toBe(1);
  });
});

describe.skipIf(!built)("the second area, on the Yangtze", () => {
  const fly = (withHero: boolean): Terrain => {
    const { hero, country, gorges } = world();
    const terrain = new Terrain({
      scale: { ...DEFAULT_SCALE },
      viewRadiusTiles: 2,
      layers: 64,
      source: country,
      hero: withHero ? hero : null,
    });
    terrain.update(gorges.eastM, gorges.northM, 1500);
    return terrain;
  };

  it("puts the reservoir back on the water", () => {
    // The three coordinates were measured off the source at 30 m, where the
    // pool behind the Three Gorges dam is flat at 156-158 m for 190 km. The
    // 1 km grid filled that trench in: it read 433 m at this waypoint, 275 m
    // of water the player would be flying inside (F52). Stage 3 cut the
    // Yangtze's channel through it at the reservoir's level (F61), but the
    // channel is a cell wide and this waypoint is not on it: 354 m, still
    // 194 m of water.
    const { gorges } = world();
    const coarse = fly(false).groundElevationM(gorges.eastM, gorges.northM)!;
    const fine = fly(true).groundElevationM(gorges.eastM, gorges.northM)!;
    expect(coarse).toBeCloseTo(353.9, 0);
    expect(fine).toBeCloseTo(159.8, 0);
    expect(coarse - fine).toBeGreaterThan(190);
  });

  it("draws the reservoir as the river's own surface, and the country's ribbons as they were", () => {
    // 157.5 m over 96.8 km² of the area at 90 m, where the 1 km grid resolves
    // a few hundred samples of the whole corridor (F73).
    const { hero, gorges } = world();
    expect(hero.waterRefused).toEqual([]);
    expect(hero.wetTiles).toBe(39);
    const { hx, hy } = hero.tileAt(gorges.eastM, gorges.northM);
    const tile = hero.water!(hx, hy)!;
    let surface = 0;
    for (let k = 3; k < tile.length; k += WATER_CHANNELS) if (tile[k] === WATER_RIVER) surface++;
    // The tile Wu Gorge's waypoint is in: 426 of its 16,641 samples.
    expect(surface).toBe(426);
    const terrain = fly(true);
    expect(terrain.materials[1]!.uniforms.uWaterRibbonMaxM!.value).toBe(45);
    expect(terrain.materials[0]!.uniforms.uWaterRibbonMaxM?.value ?? NO_RIBBON_CAP_M).toBe(NO_RIBBON_CAP_M);
  });

  it("reads the same surface the content tooling reads", () => {
    // The cockpit prefers the fine grid and so does `Corridor.drawnAt`, and
    // they get there by different routes: the renderer samples a resident
    // layer of a texture array, the tooling samples an area held whole in
    // memory. If those two ever disagree, every check built on `drawnAt` is
    // measuring something the player does not fly (F53).
    const { gorges } = world();
    const corridor = loadCorridor(worldDir)!;
    const cockpit = fly(true).groundElevationM(gorges.eastM, gorges.northM)!;
    expect(corridor.drawnAt(gorges.eastM, gorges.northM)).toBeCloseTo(cockpit, 6);
    // And it is the fine answer that both give, not the coarse one.
    expect(corridor.groundAt(gorges.eastM, gorges.northM) - cockpit).toBeGreaterThan(190);
  });

  it("is twelve tiles by three, drawn whole", () => {
    const terrain = fly(true);
    expect(terrain.stats.hero.areasDrawn).toBe(1);
    expect(terrain.stats.hero.instances).toBe(36);
    expect(terrain.material.uniforms.uCutCount!.value).toBe(1);
  });

  it("punches its hole where the aeroplane is, not where the other area is", () => {
    // The check a screenshot makes, made headlessly. With one area a cut rect
    // published from the wrong index still landed on the right ground; with
    // two it would put the hole in Yunnan and the fill on the Yangtze (F52).
    const { hero, country, gorges } = world();
    const terrain = new Terrain({
      scale: { ...DEFAULT_SCALE },
      viewRadiusTiles: 2,
      layers: 64,
      source: country,
      hero,
    });
    const camera = terrain.update(gorges.eastM, gorges.northM, 1500);
    const rect = (terrain.material.uniforms.uCutRects!.value as { x: number; y: number; z: number; w: number }[])[0]!;
    expect(camera.x).toBeGreaterThanOrEqual(rect.x);
    expect(camera.x).toBeLessThanOrEqual(rect.z);
    expect(camera.z).toBeGreaterThanOrEqual(rect.y);
    expect(camera.z).toBeLessThanOrEqual(rect.w);

    // And it is the size of the area it was drawn from, not of the other one.
    const area = hero.bounds()[1]!;
    const c = DEFAULT_SCALE.horizontalCompression;
    expect(rect.z - rect.x).toBeCloseTo((area.eastM1 - area.eastM0) / c, 3);
    expect(rect.w - rect.y).toBeCloseTo((area.northM1 - area.northM0) / c, 3);
  });

  it("reads the fine grid all the way down the reach", () => {
    // One area rather than three, so a flight from one end to the other
    // crosses the rim twice instead of six times (F51, F52). Sampled along
    // the area's own middle, which is what the aeroplane follows.
    const { hero } = world();
    const area = hero.bounds()[1]!;
    const northM = (area.northM0 + area.northM1) / 2;
    for (let eastM = area.eastM0 + 500; eastM < area.eastM1; eastM += 5000) {
      expect(hero.covers(eastM, northM)).toBe(true);
    }
  });
});

describe("an area announced before its heights arrive (stage 4)", () => {
  const waiting = () => {
    const m = manifest("gorge", 10, 20, 2, 3, { elevationM: { min: 140, max: 2000 } });
    const entry = { id: "gorge", name: "gorge", file: "gorge.json", window: m.window, bytes: m.heights.bytes };
    return { m, cover: new HeroCover(index({ areas: [entry] }), [], [m]) };
  };

  it("is sized for and bounded, but draws nothing and answers nothing until then", () => {
    const { cover } = waiting();
    expect(cover.bounds()).toHaveLength(1);
    expect(cover.request(10, 20)).toBeNull();
    expect(cover.covers(10.5 * TILE_M, 20.5 * TILE_M)).toBe(false);
    expect(cover.awaitingAreas).toEqual(["gorge"]);
    // The curtain along its rim hangs from the manifest until the heights come.
    expect(cover.lowestM).toBe(140);
  });

  it("is drawn once its heights are given, and is given them once", () => {
    const { m, cover } = waiting();
    cover.addArea({ manifest: m, heights: stamped(10, 20, 2, 3) });
    expect(cover.request(11, 22)![0]).toBe(22 * 100 + 11);
    expect(cover.awaitingAreas).toEqual([]);
    expect(cover.bounds()).toHaveLength(1);
    expect(cover.lowestM).toBe(2010);
    cover.addArea({ manifest: m, heights: stamped(10, 20, 2, 3) });
    expect(cover.bounds()).toHaveLength(1);
  });
});
