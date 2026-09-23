import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { BufferGeometry } from "three";
import { LOD_SEGMENTS, buildGrid, lodForDistance } from "../../engine/src/terrain/grid.js";
import {
  crossings,
  drawnHeightAt,
  rimPieces,
} from "../../engine/src/terrain/rimCurtain.js";
import {
  HeroCover,
  type AreaBounds,
  type HeroAreaData,
  type HeroManifest,
} from "../../engine/src/terrain/heroSource.js";
import { HERO_TILE_SAMPLES, TILE_SAMPLES } from "../../engine/src/terrain/tileArray.js";
import {
  HERO_LOD_SEGMENTS,
  SKIRT_DEPTH_M,
  Terrain,
  VIEW_RADIUS_TILES,
} from "../../engine/src/terrain/terrain.js";
import {
  PackedTileSource,
  SyntheticTileSource,
  type WorldManifest,
} from "../../engine/src/terrain/tileSource.js";
import { DEFAULT_SCALE } from "../../engine/src/sim/scale.js";
import { loadHeroCoverFrom } from "../../tools/heroCover.ts";

/**
 * The country's curtain along a hero rim (F74).
 *
 * What it has to be is the surface the country grid draws, cut along the rim:
 * so the checks here are against the grid's own triangles, built by the
 * geometry the lattice draws, and not against a second copy of the rule.
 */

const COUNTRY_M = 64_000;
const HERO_M = 11_520;

/** A rough tile: every sample its own height, so no two triangles agree. */
function rough(samples: number, seed = 1): Int16Array {
  const out = new Int16Array(samples * samples);
  let x = seed;
  for (let k = 0; k < out.length; k++) {
    x = (x * 1_103_515_245 + 12_345) % 2_147_483_648;
    out[k] = (x % 4_000) - 500;
  }
  return out;
}

/** The height of the grid's own triangle over a point, found by search. */
function fromGrid(tile: Int16Array, samples: number, segments: number, u: number, v: number): number {
  const g = buildGrid(segments, samples);
  const at = (n: number) => ({
    x: g.texel[n * 2]!,
    y: g.texel[n * 2 + 1]!,
    h: tile[g.texel[n * 2 + 1]! * samples + g.texel[n * 2]!]!,
  });
  for (let k = 0; k < g.index.length; k += 3) {
    const [a, b, c] = [g.index[k]!, g.index[k + 1]!, g.index[k + 2]!];
    if (g.skirt[a] || g.skirt[b] || g.skirt[c]) continue;
    const [p, q, r] = [at(a), at(b), at(c)];
    const det = (q.y - r.y) * (p.x - r.x) + (r.x - q.x) * (p.y - r.y);
    if (det === 0) continue;
    const l1 = ((q.y - r.y) * (u - r.x) + (r.x - q.x) * (v - r.y)) / det;
    const l2 = ((r.y - p.y) * (u - r.x) + (p.x - r.x) * (v - r.y)) / det;
    const l3 = 1 - l1 - l2;
    const eps = -1e-9;
    if (l1 >= eps && l2 >= eps && l3 >= eps) return l1 * p.h + l2 * q.h + l3 * r.h;
  }
  throw new Error(`no triangle over (${u}, ${v})`);
}

describe("the surface the lattice draws", () => {
  it("is the grid's own triangles, at every LOD of both grids", () => {
    for (const [samples, ladder] of [
      [TILE_SAMPLES, LOD_SEGMENTS],
      [HERO_TILE_SAMPLES, HERO_LOD_SEGMENTS],
    ] as const) {
      const tile = rough(samples);
      for (const segments of ladder) {
        for (let n = 0; n < 40; n++) {
          const u = ((n * 37.31) % (samples - 1)) + 0.013 * n;
          const v = ((n * 53.17) % (samples - 1)) + 0.007 * n;
          const drawn = drawnHeightAt(tile, 0, samples, segments, u, v);
          expect(drawn).toBeCloseTo(fromGrid(tile, samples, segments, u, v), 6);
        }
      }
    }
  });

  it("is straight between the crossings, and only between all of them", () => {
    const tile = rough(TILE_SAMPLES, 7);
    const along = (points: number[], across: number, alongU: boolean, segments: number) => {
      let worst = 0;
      for (let t = points[0]!; t <= points.at(-1)!; t += 0.01) {
        const k = Math.max(0, points.findIndex((p) => p >= t) - 1);
        const [t0, t1] = [points[k]!, points[k + 1] ?? points[k]!];
        const h = (x: number) =>
          drawnHeightAt(tile, 0, TILE_SAMPLES, segments, alongU ? x : across, alongU ? across : x);
        const line = t1 === t0 ? h(t0) : h(t0) + ((h(t1) - h(t0)) * (t - t0)) / (t1 - t0);
        worst = Math.max(worst, Math.abs(line - h(t)));
      }
      return worst;
    };
    for (const segments of LOD_SEGMENTS) {
      for (const across of [0, 7.3, 31.62, 64]) {
        for (const alongU of [true, false]) {
          const points = crossings(TILE_SAMPLES, segments, across, 2.25, 61.5);
          expect(points[0]).toBe(2.25);
          expect(points.at(-1)).toBe(61.5);
          expect(along(points, across, alongU, segments)).toBeLessThan(1e-6);
        }
      }
    }
    // The grid lines alone are not enough: through a quad the line crosses its
    // diagonal too, and on rough ground the surface bends there.
    const stride = 1;
    const gridOnly = [2.25];
    for (let t = 3; t < 61.5; t += stride) gridOnly.push(t);
    gridOnly.push(61.5);
    expect(along(gridOnly, 7.3, false, 64)).toBeGreaterThan(100);
  });
});

describe("the stretches of a rim", () => {
  const perimeter = (a: AreaBounds) => 2 * (a.eastM1 - a.eastM0 + (a.northM1 - a.northM0));

  it("cover the rim once, each in the country tile outside it", () => {
    // Three Gorges' window: 12 hero tiles by 3.
    const area = { eastM0: 336 * HERO_M, northM0: 129 * HERO_M, eastM1: 348 * HERO_M, northM1: 132 * HERO_M };
    const pieces = rimPieces(area, COUNTRY_M, TILE_SAMPLES);
    const lengthM = pieces.reduce((n, p) => n + (p.to - p.from) * 1000, 0);
    expect(lengthM).toBeCloseTo(perimeter(area), 6);
    for (const p of pieces) {
      // A point on the stretch, and one a metre outside the area from it.
      const t = (p.from + p.to) / 2;
      const e = p.i * COUNTRY_M + (p.alongU ? t : p.across) * 1000;
      const n = p.j * COUNTRY_M + (p.alongU ? p.across : t) * 1000;
      const outE = p.alongU ? e : e - p.inward;
      const outN = p.alongU ? n - p.inward : n;
      expect(Math.floor(outE / COUNTRY_M)).toBe(p.i);
      expect(Math.floor(outN / COUNTRY_M)).toBe(p.j);
      const inside = (x: number, y: number) =>
        x > area.eastM0 && x < area.eastM1 && y > area.northM0 && y < area.northM1;
      expect(inside(outE, outN)).toBe(false);
      expect(inside(p.alongU ? e : e + p.inward, p.alongU ? n + p.inward : n)).toBe(true);
    }
  });

  it("belong to the tile outside when the rim is a tile boundary", () => {
    // 50 hero tiles is 576 km, nine country tiles exactly.
    const area = { eastM0: 50 * HERO_M, northM0: 50 * HERO_M, eastM1: 52 * HERO_M, northM1: 52 * HERO_M };
    const [west, , south] = rimPieces(area, COUNTRY_M, TILE_SAMPLES);
    expect(west).toMatchObject({ i: 8, alongU: false, across: 64, inward: 1 });
    expect(south).toMatchObject({ j: 8, alongU: true, across: 64, inward: 1 });
  });
});

/** One small area over the stand-in world, with its lowest sample known. */
function cover(): HeroCover {
  const [hx0, hy0, tilesX, tilesY] = [10, 20, 2, 3];
  const stride = HERO_TILE_SAMPLES * HERO_TILE_SAMPLES;
  const tiles = tilesX * tilesY;
  const heights = new Int16Array(tiles * stride).fill(900);
  heights[4 * stride + 700] = 120;
  const window = { hx0, hy0, hx1: hx0 + tilesX, hy1: hy0 + tilesY };
  const origin = { originXM: -3_456_000, originYM: 1_792_000 };
  const manifest: HeroManifest = {
    version: 1,
    area: "gorge",
    name: "gorge",
    resolutionM: 90,
    tileM: HERO_M,
    tileSamples: HERO_TILE_SAMPLES,
    silhouetteBias: 0.4,
    window,
    origin,
    countryTiles: [],
    holds: [],
    heights: { file: "gorge.bin", tiles, bytes: tiles * stride * 2, sha256: "" },
    boundary: { meanM: 0, worstM: 0, skirtDepthM: SKIRT_DEPTH_M },
    elevationM: { min: 120, max: 900 },
  };
  const area: HeroAreaData = { manifest, heights };
  return new HeroCover(
    {
      version: 1,
      resolutionM: 90,
      tileM: HERO_M,
      tileSamples: HERO_TILE_SAMPLES,
      origin,
      areas: [{ id: "gorge", name: "gorge", file: "gorge.json", window, bytes: manifest.heights.bytes }],
    },
    [area],
  );
}

describe("the curtain the country hangs along a drawn rim", () => {
  const hero = cover();
  const area = hero.bounds()[0]!;
  const eastM = (area.eastM0 + area.eastM1) / 2;
  const northM = (area.northM0 + area.northM1) / 2;
  const scale = { ...DEFAULT_SCALE };
  const fly = (e = eastM, n = northM) => {
    const terrain = new Terrain({ scale, viewRadiusTiles: 2, layers: 64, source: new SyntheticTileSource(), hero });
    terrain.update(e, n, 3000);
    return terrain;
  };
  const rimOf = (terrain: Terrain) => {
    const geometry = terrain.meshes.at(-1)!.geometry as BufferGeometry;
    return {
      position: geometry.getAttribute("position").array as Float32Array,
      skirt: geometry.getAttribute("aSkirt").array as Float32Array,
      index: geometry.getIndex()!.array as Uint32Array,
      count: geometry.drawRange.count,
      geometry,
    };
  };

  it("hangs from the ground the country draws, on the rim, to below the area's lowest", () => {
    const terrain = fly();
    expect(terrain.stats.hero.areasDrawn).toBe(1);
    expect(hero.lowestM).toBe(120);
    const rim = rimOf(terrain);
    expect(terrain.meshes.at(-1)!.visible).toBe(true);
    // Each edge crosses one country tile boundary, so eight stretches; at L0
    // a point a kilometre and one a diagonal, round 115 km of rim.
    expect(terrain.stats.perLod.at(-1)).toBe(8);
    expect(terrain.stats.hero.rimPoints).toBeGreaterThan(2 * 115);

    const c = scale.horizontalCompression;
    const zero = terrain.toWorld(0, 0, 0);
    const source = new SyntheticTileSource();
    const camera = { i: Math.floor(eastM / COUNTRY_M), j: Math.floor(northM / COUNTRY_M) };
    for (let p = 0; p < terrain.stats.hero.rimPoints; p++) {
      const [x, h, z] = [rim.position[p * 6]!, rim.position[p * 6 + 1]!, rim.position[p * 6 + 2]!];
      const e = (x - zero.x) * c;
      const n = (z - zero.z) * c;
      // On the rim: a metre from one edge or another.
      const onWestEast = Math.min(Math.abs(e - area.eastM0), Math.abs(e - area.eastM1)) < 1;
      const onSouthNorth = Math.min(Math.abs(n - area.northM0), Math.abs(n - area.northM1)) < 1;
      expect(onWestEast || onSouthNorth).toBe(true);
      // The drawn country ground just outside, from the tile and LOD there.
      const candidates: number[] = [];
      const out = (oe: number, on: number) => {
        const i = Math.floor(oe / COUNTRY_M);
        const j = Math.floor(on / COUNTRY_M);
        const lod = lodForDistance(Math.hypot(i - camera.i, j - camera.j), 1);
        const u = (e - i * COUNTRY_M) / 1000;
        const v = (n - j * COUNTRY_M) / 1000;
        candidates.push(drawnHeightAt(source.request(i, j)!, 0, TILE_SAMPLES, LOD_SEGMENTS[lod], u, v));
      };
      if (onWestEast) out(e + (Math.abs(e - area.eastM0) < 1 ? -1 : 1), n);
      if (onSouthNorth) out(e, n + (Math.abs(n - area.northM0) < 1 ? -1 : 1));
      expect(Math.min(...candidates.map((d) => Math.abs(d - h)))).toBeLessThan(0.01);
      // Top, then bottom: the bottom stands at the floor and drops a skirt.
      expect(rim.skirt[p * 2]).toBe(0);
      expect(rim.skirt[p * 2 + 1]).toBe(1);
      expect(rim.position[p * 6 + 4]).toBe(Math.fround(Math.min(h, hero.lowestM)));
    }
  });

  it("faces into the area, the way the lattice's own ground faces up", () => {
    const terrain = fly();
    const rim = rimOf(terrain);
    const exaggeration = scale.verticalExaggeration;
    const depth = SKIRT_DEPTH_M * exaggeration;
    const vertex = (k: number) => [
      rim.position[k * 3]!,
      rim.position[k * 3 + 1]! * exaggeration - rim.skirt[k]! * depth,
      rim.position[k * 3 + 2]!,
    ];
    const normal = (a: number[], b: number[], c: number[]) => {
      const [ux, uy, uz] = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
      const [vx, vy, vz] = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
      return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    };
    // The convention, from the lattice's own geometry: its first surface
    // triangle, by the same arithmetic, faces up - and it is seen from above.
    const g = buildGrid(8, TILE_SAMPLES);
    const firstSurface = [...Array(g.index.length / 3).keys()].find(
      (t) => !g.skirt[g.index[t * 3]!] && !g.skirt[g.index[t * 3 + 1]!] && !g.skirt[g.index[t * 3 + 2]!],
    )!;
    const uv = (k: number) => [g.uv[k * 2]!, 0, g.uv[k * 2 + 1]!];
    const up = normal(uv(g.index[firstSurface * 3]!), uv(g.index[firstSurface * 3 + 1]!), uv(g.index[firstSurface * 3 + 2]!));
    expect(up[1]).toBeGreaterThan(0);

    const rect = terrain.material.uniforms.uCutRects!.value[0] as { x: number; y: number; z: number; w: number };
    const centre = [(rect.x + rect.z) / 2, (rect.y + rect.w) / 2];
    let faced = 0;
    for (let t = 0; t < rim.count; t += 3) {
      const [a, b, c] = [vertex(rim.index[t]!), vertex(rim.index[t + 1]!), vertex(rim.index[t + 2]!)];
      const n = normal(a, b, c);
      if (Math.hypot(n[0]!, n[2]!) < 1e-6) continue; // a stretch's zero-length end
      // Toward the area's middle from the wall.
      const toward = [centre[0]! - a[0]!, centre[1]! - a[2]!];
      expect(n[0]! * toward[0]! + n[2]! * toward[1]!).toBeGreaterThan(0);
      expect(Math.abs(n[1]!)).toBeLessThan(1e-3 * Math.hypot(n[0]!, n[2]!));
      faced++;
    }
    expect(faced).toBeGreaterThan(100);
  });

  it("hangs nothing where no area is drawn, and uploads nothing when nothing moved", () => {
    const far = fly(eastM + 400_000, northM);
    expect(far.stats.hero.areasDrawn).toBe(0);
    expect(far.meshes.at(-1)!.visible).toBe(false);
    expect(far.stats.hero.rimPoints).toBe(0);

    const terrain = fly();
    const position = rimOf(terrain).geometry.getAttribute("position") as import("three").BufferAttribute;
    const version = position.version;
    terrain.update(eastM, northM, 3000);
    expect(position.version).toBe(version);
    // Flying away and back does.
    terrain.update(eastM, northM + 3 * COUNTRY_M, 3000);
    terrain.update(eastM, northM, 3000);
    expect(position.version).toBeGreaterThan(version);
  });
});

/** Against the areas the pipeline wrote, and the country beside them. */
const worldDir = "dist-world/sea-to-sky";
const built = existsSync(`${worldDir}/hero/index.json`);

describe.skipIf(!built)("the seam at the built rims (F74)", () => {
  /**
   * Every step between the two grids along both rims, 10 m apart, at every
   * pairing of a country LOD the app's view draws with a hero LOD - including
   * pairings no flight makes, such as the country at L2 beside hero L0, so
   * it bounds what a flight sees rather than measuring it.
   */
  const steps = () => {
    const manifest = JSON.parse(readFileSync(`${worldDir}/manifest.json`, "utf8")) as WorldManifest;
    const bytes = readFileSync(`${worldDir}/${manifest.heights.file}`);
    const country = new PackedTileSource(
      manifest,
      new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    );
    const hero = loadHeroCoverFrom(worldDir)!;
    // The farthest country tile a view draws is half a tile past its radius.
    const coarsest = lodForDistance(VIEW_RADIUS_TILES + 0.5, 1);
    const worst = hero.bounds().map((area) => {
      let countryAbove = 0;
      let heroAbove = 0;
      let lowestHero = Infinity;
      for (const piece of rimPieces(area, COUNTRY_M, TILE_SAMPLES)) {
        const tile = country.request(piece.i, piece.j)!;
        for (let t = piece.from; t <= piece.to + 1e-9; t += 0.01) {
          const u = piece.alongU ? t : piece.across;
          const v = piece.alongU ? piece.across : t;
          const e = piece.i * COUNTRY_M + u * 1000;
          const n = piece.j * COUNTRY_M + v * 1000;
          const inE = piece.alongU ? e : e + piece.inward;
          const inN = piece.alongU ? n + piece.inward : n;
          const hx = Math.min(Math.floor(inE / HERO_M), area.eastM1 / HERO_M - 1);
          const hy = Math.min(Math.floor(inN / HERO_M), area.northM1 / HERO_M - 1);
          const heroTile = hero.request(hx, hy)!;
          for (let cl = 0; cl <= coarsest; cl++) {
            const c = drawnHeightAt(tile, 0, TILE_SAMPLES, LOD_SEGMENTS[cl]!, u, v);
            for (const segments of HERO_LOD_SEGMENTS) {
              const h = drawnHeightAt(heroTile, 0, HERO_TILE_SAMPLES, segments, (e - hx * HERO_M) / 90, (n - hy * HERO_M) / 90);
              countryAbove = Math.max(countryAbove, c - h);
              heroAbove = Math.max(heroAbove, h - c);
              lowestHero = Math.min(lowestHero, h);
            }
          }
        }
      }
      return { countryAbove, heroAbove, lowestHero };
    });
    return { hero, coarsest, worst };
  };

  it("is closed at every LOD the view draws: the hero skirts on one side, the curtain on the other", () => {
    const { hero, coarsest, worst } = steps();
    expect(coarsest).toBe(2);
    const [gorge, threeGorges] = worst;
    // Where the hero edge stands higher, the hero skirt is the wall, and it
    // hangs 900 m: the worst is the Three Gorges', with the country at L2.
    expect(Math.round(gorge!.heroAbove)).toBe(661);
    expect(Math.round(threeGorges!.heroAbove)).toBe(818);
    for (const w of worst) expect(w.heroAbove).toBeLessThan(SKIRT_DEPTH_M);
    // Where the country stands higher, 900 m would not have done: with the
    // country at L2 both rims stand more than that over some hero LOD's edge
    // (1,032 m at the gorge at the pairings a flight makes). The curtain hangs
    // from the country's ground to below the lowest the cover draws.
    expect(Math.round(gorge!.countryAbove)).toBe(1047);
    expect(Math.round(threeGorges!.countryAbove)).toBe(908);
    expect(Math.max(...worst.map((w) => w.countryAbove))).toBeGreaterThan(SKIRT_DEPTH_M);
    for (const w of worst) expect(hero.lowestM).toBeLessThanOrEqual(w.lowestHero);
    expect(hero.lowestM).toBe(139);
  });
});
