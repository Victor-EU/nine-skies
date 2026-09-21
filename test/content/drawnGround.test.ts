/**
 * The cockpit and the content gate read different ground (F51, F53).
 *
 * `Terrain.groundElevationM` prefers the 90 m hero grid; `cutSection` and
 * `cutPatch` read the 1 km country grid, because every committed artefact was
 * cut from it and re-cutting them all is a decision rather than a fix (D23,
 * D24). So the two surfaces have to be kept from being confused for each
 * other, and the thing that does that is a measurement rather than a rule:
 * nothing authored is over a hero area *today*, and the day something is,
 * both cutters refuse to write it.
 *
 * Four of these need the built world, because the whole question is about two
 * real grids disagreeing and a synthetic pair would only test the arithmetic.
 * The arithmetic is tested first, with no world at all.
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import {
  corridorCache,
  drawnGap,
  stationsAlong,
  type Corridor,
} from "../../tools/corridor.ts";
import { cutSection } from "../../tools/section.ts";
import { cutPatch, patchPoints, readPatch } from "../../tools/patch.ts";
import { describeGap } from "../../tools/routeCheck.ts";
import { loadExpedition, projectedWaypoints } from "../../tools/expedition.ts";
import { committedSigner, privateKeyPath } from "../../tools/attest.ts";
import {
  bilinearSample,
  HeightTileArray,
  HERO_TILE_SAMPLES,
} from "../../engine/src/terrain/tileArray.js";
import { HeroCover, type HeroIndex, type HeroManifest } from "../../engine/src/terrain/heroSource.js";
import type { Challenge, Expedition } from "../../content/schema.ts";

const built = existsSync("dist-world/sea-to-sky/manifest.json");
// A cutter signs what it writes (D23), so the two refusal suites need a world
// *and* this machine's cutting key — the same pair `section.test.ts` gates on.
// Refusing before signing would make the key unnecessary here, and relying on
// that is relying on the order two guards happen to run in.
const signable = built && existsSync(privateKeyPath());
const open = corridorCache("dist-world");
const world = (): Corridor => {
  const c = open("sea-to-sky");
  if (!c) throw new Error("no world");
  return c;
};

const TILE_M = 11_520;
const STRIDE = HERO_TILE_SAMPLES * HERO_TILE_SAMPLES;

describe("one bilinear rule", () => {
  /**
   * The renderer reads a resident layer of a texture array; a content check
   * reads a published area off disk. Two copies of this arithmetic would be
   * two answers to "what is under the aeroplane", and nobody would find out
   * until they disagreed.
   */
  it("gives the renderer and the content tooling the same number", () => {
    const heights = new Int16Array(STRIDE);
    for (let y = 0; y < HERO_TILE_SAMPLES; y++)
      for (let x = 0; x < HERO_TILE_SAMPLES; x++)
        heights[y * HERO_TILE_SAMPLES + x] = 100 + x * 3 - y * 7;

    const array = new HeightTileArray(4, HERO_TILE_SAMPLES);
    array.insert(5, 9, heights);

    const manifest: HeroManifest = {
      version: 1,
      area: "one-tile",
      name: "One tile",
      resolutionM: 90,
      tileM: TILE_M,
      tileSamples: HERO_TILE_SAMPLES,
      origin: { originXM: 0, originYM: 0 },
      window: { hx0: 5, hy0: 9, hx1: 6, hy1: 10 },
      heights: { file: "one-tile.bin", bytes: STRIDE * 2, tiles: 1, sha256: "0".repeat(64) },
    } as HeroManifest;
    const index: HeroIndex = {
      version: 1,
      resolutionM: 90,
      tileM: TILE_M,
      tileSamples: HERO_TILE_SAMPLES,
      origin: { originXM: 0, originYM: 0 },
      areas: [],
    };
    const cover = new HeroCover(index, [{ manifest, heights }]);

    // Three points inside the tile, including one off any sample centre.
    for (const [u, v] of [
      [0.25, 0.5],
      [0.7134, 0.1189],
      [0.999, 0.001],
    ] as const) {
      const eastM = (5 + u) * TILE_M;
      const northM = (9 + v) * TILE_M;
      expect(cover.groundAt(eastM, northM)).toBeCloseTo(array.sample(5, 9, u, v)!, 9);
    }
  });

  it("clamps to the tile's own edge rather than reading past it", () => {
    const data = new Int16Array([0, 10, 20, 30]); // 2x2
    expect(bilinearSample(data, 0, 2, 0, 0)).toBe(0);
    expect(bilinearSample(data, 0, 2, 1, 1)).toBe(30);
    expect(bilinearSample(data, 0, 2, 1.5, -0.5)).toBe(10);
  });
});

describe("a gap nobody is standing in", () => {
  it("reports no cover rather than a pass when stage 6 was never run", () => {
    // NaN compares false against every threshold and `0 > 0` is false, so a
    // check with nothing to compare against looks exactly like a check that
    // found nothing wrong. The difference is `cover`, and callers read it
    // (F52 is the same fault in the probe runner).
    const bare = {
      hero: null,
      groundAt: () => 100,
      drawnAt: () => 100,
      covers: () => true,
    } as unknown as Corridor;
    const gap = drawnGap(bare, [{ eastM: 0, northM: 0 }]);
    expect(gap.over).toBe(0);
    expect(gap.cover).toBeNull();
    expect(describeGap(gap)).toBeNull();
  });
});

describe.skipIf(!built)("the two grids of the built world", () => {
  it("disagree by more, in the dangerous direction, than Expedition 1 clears by", () => {
    // The whole reason the cutters refuse. Expedition 1 clears its worst
    // terrain by 333 m; the fine grid stands 374 m above the coarse one
    // inside Tiger Leaping Gorge, so a route checked against the coarse grid
    // there can pass the clearance gate and fly into a wall.
    const corridor = world();
    const hero = corridor.hero!;
    let fineAbove = 0;
    for (const b of hero.bounds())
      for (let e = b.eastM0; e < b.eastM1; e += 250)
        for (let n = b.northM0; n < b.northM1; n += 250) {
          const fine = hero.groundAt(e, n);
          if (fine === null) continue;
          fineAbove = Math.max(fineAbove, fine - corridor.groundAt(e, n));
        }
    expect(fineAbove).toBeGreaterThan(333);
  }, 30_000);

  it("agree everywhere the country grid is the only grid", () => {
    const corridor = world();
    // Shanghai, 1,000 km from the nearest area.
    const eastM = 4_400_000;
    const northM = 1_100_000;
    expect(corridor.hero!.groundAt(eastM, northM)).toBeNull();
    expect(corridor.drawnAt(eastM, northM)).toBe(corridor.groundAt(eastM, northM));
  });

  it("puts nothing authored over the fine one", () => {
    // The claim `docs/ground-report.md` exists to keep measuring. It is a
    // fact about the content as it stands, not a property of anything.
    const corridor = world();
    const expedition = loadExpedition("content/expeditions/sea-to-sky.yaml");
    const route = drawnGap(corridor, stationsAlong(projectedWaypoints(expedition)));
    expect(route.cover).not.toBeNull();
    expect(route.of).toBeGreaterThan(2900);
    expect(route.over).toBe(0);

    const patch = readPatch("content/patches", "high-airfield")!;
    const challenge = drawnGap(corridor, patchPoints(patch));
    expect(challenge.of).toBeGreaterThan(1700);
    expect(challenge.over).toBe(0);
  }, 30_000);
});

describe.skipIf(!signable)("a route down the reservoir", () => {
  /** Yichang out through Xiling, Wu and Qutang — the GDD's gorge, authored. */
  const gorgeRoute = (): Expedition =>
    ({
      id: "gorge-run",
      route: [
        { id: "yichang", lat: 30.7, lon: 111.29 },
        { id: "xiling", lat: 30.9511, lon: 110.7756 },
        { id: "wu", lat: 31.0689, lon: 109.9467 },
        { id: "qutang", lat: 31.0222, lon: 109.6089 },
      ],
    }) as unknown as Expedition;

  it("is refused by the cutter, in metres rather than in principle", () => {
    const result = cutSection(gorgeRoute(), world(), committedSigner("."));
    expect("problem" in result).toBe(true);
    if (!("problem" in result)) return;
    expect(result.problem).toMatch(/of \d+ stations are over three-gorges/);
    expect(result.problem).toMatch(/the game draws at 90 m/);
    expect(result.problem).toMatch(/open decision/);
  });

  it("is most of the route, not an edge of it", () => {
    const gap = drawnGap(world(), stationsAlong(projectedWaypoints(gorgeRoute())));
    expect(gap.over).toBeGreaterThan(gap.of / 2);
    expect(gap.areas).toEqual(["three-gorges"]);
    // And the number the refusal quotes is a real disagreement, not a rim
    // artefact: the reservoir the player flies down against the ground the
    // 1 km grid fills it in with.
    expect(gap.worstM).toBeGreaterThan(300);
    expect(gap.countryM).toBeGreaterThan(gap.heroM);
  });

  it("would be checked against ground the game does not draw", () => {
    const gap = drawnGap(world(), stationsAlong(projectedWaypoints(gorgeRoute())));
    const said = describeGap(gap);
    expect(said).not.toBeNull();
    expect(said).toMatch(/three-gorges/);
  });
});

describe.skipIf(!signable)("a challenge threading the gorge", () => {
  const gorgeChallenge = (): Challenge =>
    ({
      id: "thread-the-gorge",
      name: "Thread the gorge",
      bite: "Low over the reservoir",
      month: 5,
      start_hour: 10,
      speed: "low",
      start: { lat: 30.9511, lon: 110.7756, altitude_m: 600, heading_deg: 280 },
      objectives: [
        {
          kind: "land",
          id: "wu",
          label: "Low over Wu Gorge",
          lat: 31.0689,
          lon: 109.9467,
          radius_km: 4,
          max_agl_m: 200,
          max_speed: "low",
        },
      ],
    }) as unknown as Challenge;

  it("is refused by the patch cutter for the same reason and in the same terms", () => {
    const result = cutPatch(gorgeChallenge(), world(), committedSigner("."));
    expect("problem" in result).toBe(true);
    if (!("problem" in result)) return;
    expect(result.problem).toMatch(/cells are under three-gorges/);
    expect(result.problem).toMatch(/open decision/);
  });
});
