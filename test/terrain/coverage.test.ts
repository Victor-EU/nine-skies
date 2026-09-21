/**
 * What a zero in the heightfield means (F54).
 *
 * The map tested `m === 0` and painted 39.2 % of its frame one colour, and
 * five cells in six of it were not water (F45). Three things were arriving as
 * one number: the East China Sea, a cell this build never fetched, and
 * everything outside the window.
 *
 * The mirror separates two of the three for free — Copernicus publishes a
 * one-degree cell only where there is something to publish — and the tests
 * that matter here are the ones that stop that turning into a guess. The
 * world-gated block is the corroboration: the publisher's claim about where
 * the water is, against the elevations the warp actually produced.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { WorldCoverage } from "../../engine/src/terrain/coverage.js";
import type { WorldManifest } from "../../engine/src/terrain/tileSource.js";
import { HorizonField } from "../../engine/src/terrain/horizonField.js";
import { baseShade, NO_DATA, SEA } from "../../engine/src/map/palette.js";
import { TILE_KM } from "../../engine/src/terrain/syntheticTiles.js";
import {
  corridorCache,
  stationsAlong,
  unvouchedGround,
  type Corridor,
} from "../../tools/corridor.ts";
import { loadExpedition, projectedWaypoints } from "../../tools/expedition.ts";
import { cutSection } from "../../tools/section.ts";
import { committedSigner } from "../../tools/attest.ts";
import type { Expedition } from "../../content/schema.ts";

const worldDir = "dist-world/sea-to-sky";
const built = existsSync(`${worldDir}/manifest.json`);

function manifest(over: Partial<WorldManifest> = {}): WorldManifest {
  return {
    version: 1,
    corridor: "test",
    tileKm: TILE_KM,
    tileSamples: 65,
    country: { tilesX: 105, tilesY: 69, originXM: 0, originYM: 0 },
    window: { tx0: 4, ty0: 7, tx1: 7, ty1: 9 },
    heights: { file: "h.bin", tiles: 6, tilesWithLand: 6, bytes: 0, sha256: "" },
    horizon: { file: "z.bin", width: 1, height: 1, sampleKm: 8, silhouetteBias: 0.6 },
    anchors: {},
    start: { eastM: 0, northM: 0, altitudeM: 0, headingRad: 0 },
    elevationM: { min: 0, max: 0 },
    ...over,
  } as WorldManifest;
}

describe("a world with no coverage record", () => {
  it("reports none rather than reporting none found", () => {
    // Every corridor built before F54 is this, and it is not the same thing
    // as a corridor that looked and found no ocean. A caller that cannot tell
    // them apart draws the second as the first (F52's rule, one artefact on).
    expect(WorldCoverage.from(manifest())).toBeNull();
  });

  it("leaves the map saying only what it knows", () => {
    expect(baseShade(0, "unrecorded")).toEqual(NO_DATA);
    expect(baseShade(0)).toEqual(NO_DATA);
  });
});

describe("the record, read back", () => {
  const cover = () =>
    WorldCoverage.from(
      manifest({ coverage: { tiles: "doced?" } } as Partial<WorldManifest>),
    )!;

  it("is tile-row-major, the same order as the heightfield", () => {
    expect(cover().atTile(4, 7)).toBe("data");
    expect(cover().atTile(5, 7)).toBe("ocean");
    expect(cover().atTile(6, 7)).toBe("coast");
    expect(cover().atTile(4, 8)).toBe("unreached");
  });

  it("answers by position too, because that is what a frame holds", () => {
    const m = TILE_KM * 1000;
    expect(cover().at(5.5 * m, 7.5 * m)).toBe("ocean");
    expect(cover().at(4.2 * m, 7.9 * m)).toBe("data");
  });

  it("calls anything outside the window unbuilt rather than unknown", () => {
    // Different facts: `unreached` is the corner of a rectangle drawn around
    // a corridor, `unbuilt` is the rest of China. The map folds them, the
    // record does not.
    expect(cover().atTile(3, 7)).toBe("unbuilt");
    expect(cover().atTile(4, 9)).toBe("unbuilt");
  });

  it("refuses a character it does not know instead of picking the nearest", () => {
    expect(cover().atTile(6, 8)).toBe("unrecorded");
  });

  it("refuses a record that is not the window's length", () => {
    expect(() =>
      WorldCoverage.from(manifest({ coverage: { tiles: "dd" } } as Partial<WorldManifest>)),
    ).toThrow(/2 tiles, the window holds 6/);
  });
});

describe("what the map is allowed to paint blue", () => {
  it("is the mirror's claim and nothing else", () => {
    expect(baseShade(0, "ocean")).toEqual(SEA);
    for (const state of ["data", "coast", "unreached", "unbuilt", "unrecorded"] as const)
      expect(baseShade(0, state)).toEqual(NO_DATA);
  });

  it("never covers an elevation, however the tile is labelled", () => {
    // An `ocean` tile holding ground is the mirror and the warp contradicting
    // each other. It should be visible rather than painted over.
    expect(baseShade(-154, "ocean")).not.toEqual(SEA);
    expect(baseShade(12, "ocean")).not.toEqual(SEA);
  });
});

describe.skipIf(!built)("a zero nothing stands behind", () => {
  const open = corridorCache("dist-world");
  const world = () => open("sea-to-sky")!;

  /** Shanghai out to the north-west corner of the window, past what was fetched. */
  const corner = (): Expedition =>
    ({
      id: "corner-run",
      route: [
        { id: "shanghai", lat: 31.23, lon: 121.47 },
        { id: "xian", lat: 34.27, lon: 108.95 },
        { id: "corner", lat: 34.9, lon: 90.0 },
      ],
    }) as unknown as Expedition;

  it("is not what `covers` answers, and never was", () => {
    // The tile is published and inside the window, so every existing check
    // says there is ground here. The reading is 0 m and the plateau around
    // it is four to five thousand.
    const corridor = world();
    const stations = stationsAlong(projectedWaypoints(corner()));
    const blank = unvouchedGround(corridor, stations);
    expect(blank.recorded).toBe(true);
    expect(blank.over).toBeGreaterThan(100);
    const at = stations[blank.firstAt]!;
    expect(corridor.covers(at.eastM, at.northM)).toBe(true);
    expect(corridor.groundAt(at.eastM, at.northM)).toBe(0);
    expect(Math.max(...stations.map((p) => corridor.groundAt(p.eastM, p.northM)))).toBeGreaterThan(5000);
  }, 30_000);

  it("leaves the genuine sea-level zeros alone", () => {
    // Expedition 1 starts at Shanghai and its first tens of kilometres read
    // zero over real fetched farmland. A guard that could not tell those from
    // a hole would refuse every route that starts at the coast.
    const corridor = world();
    const stations = stationsAlong(projectedWaypoints(loadExpedition("content/expeditions/sea-to-sky.yaml")));
    expect(stations.some((p) => corridor.groundAt(p.eastM, p.northM) === 0)).toBe(true);
    expect(unvouchedGround(corridor, stations).over).toBe(0);
  }, 30_000);

  it("stops the section being cut over it", () => {
    const result = cutSection(corner(), world(), committedSigner("."));
    expect("problem" in result).toBe(true);
    if (!("problem" in result)) return;
    expect(result.problem).toMatch(/read 0 m inside tiles the source only partly reached/);
  }, 30_000);

  it("reports nothing rather than nothing-found on a world with no record", () => {
    const bare = { coverage: null, groundAt: () => 0 } as unknown as Corridor;
    const blank = unvouchedGround(bare, [{ eastM: 0, northM: 0 }]);
    expect(blank.over).toBe(0);
    expect(blank.recorded).toBe(false);
  });
});

describe.skipIf(!built)("the mirror against the ground it claims to describe", () => {
  const world = () => {
    const m = JSON.parse(readFileSync(`${worldDir}/manifest.json`, "utf8")) as WorldManifest;
    const bytes = readFileSync(`${worldDir}/heights.bin`);
    const heights = new Int16Array(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    return { m, heights, cover: WorldCoverage.from(m)! };
  };

  it("says no land in every tile it calls open ocean", () => {
    // The corroboration. Copernicus's absent cells are a claim about water
    // made by somebody else; this is the built heightfield agreeing with it,
    // 45 tiles out of 45, with nothing tuned to make it so.
    const { m, heights, cover } = world();
    const stride = 65 * 65;
    const w = m.window;
    let ocean = 0;
    let withLand = 0;
    for (let ty = w.ty0; ty < w.ty1; ty++)
      for (let tx = w.tx0; tx < w.tx1; tx++) {
        if (cover.atTile(tx, ty) !== "ocean") continue;
        ocean++;
        const index = (ty - w.ty0) * (w.tx1 - w.tx0) + (tx - w.tx0);
        const tile = heights.subarray(index * stride, (index + 1) * stride);
        if (tile.some((h) => h > 0)) withLand++;
      }
    expect(ocean).toBe(45);
    expect(withLand).toBe(0);
  });

  it("accounts for every blank tile, and most of them were never looked at", () => {
    // 232 tiles hold no land. Before this, all 232 were one thing called
    // "no elevation here"; 169 of them are the corners of the rectangle
    // drawn around a lon/lat box, where nothing was ever fetched.
    const { m, heights, cover } = world();
    const stride = 65 * 65;
    const w = m.window;
    const blank: Record<string, number> = {};
    for (let ty = w.ty0; ty < w.ty1; ty++)
      for (let tx = w.tx0; tx < w.tx1; tx++) {
        const index = (ty - w.ty0) * (w.tx1 - w.tx0) + (tx - w.tx0);
        const tile = heights.subarray(index * stride, (index + 1) * stride);
        if (tile.some((h) => h > 0)) continue;
        const state = cover.atTile(tx, ty);
        blank[state] = (blank[state] ?? 0) + 1;
      }
    expect(blank).toEqual({ data: 1, ocean: 45, coast: 17, unreached: 169 });
    expect(m.heights.tiles - m.heights.tilesWithLand).toBe(232);
  });

  it("puts the sea beyond the land rather than inside it", () => {
    // Written first as "east of Shanghai" and it failed on four tiles, all of
    // them in the Yellow Sea 200-450 km *north* of Shanghai where the coast
    // turns west. Easting is not longitude in a conic projection and the
    // seaward direction is not one compass point along 1,300 km of coast, so
    // the claim worth making is the one that is true whichever way the shore
    // runs: in every row of tiles, no ocean tile is west of a tile with land
    // in it. Water at the end of the row is a coastline; water with land
    // beyond it would be a lake this has no business naming.
    const { m, heights, cover } = world();
    const stride = 65 * 65;
    const w = m.window;
    let landlocked = 0;
    for (let ty = w.ty0; ty < w.ty1; ty++) {
      let lastLandTx = -1;
      for (let tx = w.tx0; tx < w.tx1; tx++) {
        const index = (ty - w.ty0) * (w.tx1 - w.tx0) + (tx - w.tx0);
        const tile = heights.subarray(index * stride, (index + 1) * stride);
        if (tile.some((h) => h > 0)) lastLandTx = tx;
      }
      for (let tx = w.tx0; tx < w.tx1; tx++)
        if (cover.atTile(tx, ty) === "ocean" && tx < lastLandTx) landlocked++;
    }
    expect(landlocked).toBe(0);
  });

  it("changes what the map draws, and by how much", () => {
    // The frame F45 measured: 39.2 % of it was one colour. This is the
    // same frame with the record read.
    const { m, cover } = world();
    const bytes = readFileSync(`${worldDir}/horizon.bin`);
    const field = HorizonField.fromData(
      new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
      m.horizon.width,
      m.horizon.height,
      m.horizon.sampleKm,
    );
    const cellM = m.horizon.sampleKm * 1000;
    const bounds = {
      eastM0: (m.window.tx0 - 1) * TILE_KM * 1000,
      northM0: (m.window.ty0 - 1) * TILE_KM * 1000,
      eastM1: (m.window.tx1 + 2) * TILE_KM * 1000,
      northM1: (m.window.ty1 + 2) * TILE_KM * 1000,
    };
    let land = 0;
    let sea = 0;
    let noData = 0;
    for (let eastM = bounds.eastM0; eastM < bounds.eastM1; eastM += cellM)
      for (let northM = bounds.northM0; northM < bounds.northM1; northM += cellM) {
        const shade = baseShade(field.sampleM(eastM, northM), cover.at(eastM, northM));
        if (shade === SEA) sea++;
        else if (shade === NO_DATA) noData++;
        else land++;
      }
    const total = land + sea + noData;
    // Blue at last, and only where the source says so.
    expect(sea / total).toBeGreaterThan(0.02);
    expect(sea / total).toBeLessThan(0.10);
    // And the rest of the old blue is still honestly unclaimed.
    expect(noData / total).toBeGreaterThan(0.25);
    expect(land).toBeGreaterThan(0);
  });
});
