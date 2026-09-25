/**
 * The ground between its samples (F97): the spline the finest country
 * levels draw, and the rule both the shader and the curtain read past a
 * tile's edge by.
 */
import { describe, expect, it } from "vitest";
import { FINE_REACH_M, FINE_SEGMENTS, LOD_SEGMENTS, buildGrid, fineLevelFor } from "../../engine/src/terrain/grid.js";
import { splineAt, splineSlopeWeights, splineWeights, tileFetch, type TileHeights } from "../../engine/src/terrain/spline.js";
import { COUNTRY_SEGMENTS } from "../../engine/src/terrain/terrain.js";
import { TILE_SAMPLES } from "../../engine/src/terrain/tileArray.js";
import { SyntheticTileSource } from "../../engine/src/terrain/tileSource.js";

const LAST = TILE_SAMPLES - 1;
const source = new SyntheticTileSource();
/** A synthetic tile and a reader that crosses into every tile beside it. */
const tileAt = (i: number, j: number) => {
  const tile: TileHeights = { data: source.request(i, j)!, base: 0 };
  const fetch = tileFetch(tile, TILE_SAMPLES, (di, dj) => ({ data: source.request(i + di, j + dj)!, base: 0 }));
  return { tile, fetch, sample: (x: number, y: number) => tile.data[y * TILE_SAMPLES + x]! };
};

describe("the spline between samples", () => {
  it("weighs the four samples to one, and its slope's to nothing", () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(splineWeights(t).reduce((a, b) => a + b)).toBeCloseTo(1, 12);
      expect(splineSlopeWeights(t).reduce((a, b) => a + b)).toBeCloseTo(0, 12);
    }
  });

  it("passes through every sample, with the central difference for its slope", () => {
    const { fetch, sample } = tileAt(40, 22);
    for (const [x, y] of [[1, 1], [17, 30], [32, 32], [63, 5], [LAST, LAST - 1]] as const) {
      const at = splineAt(fetch, TILE_SAMPLES, x, y);
      expect(at.h).toBeCloseTo(sample(x, y), 9);
      if (x > 0 && x < LAST) expect(at.dx).toBeCloseTo((sample(x + 1, y) - sample(x - 1, y)) / 2, 9);
      if (y > 0 && y < LAST) expect(at.dy).toBeCloseTo((sample(x, y + 1) - sample(x, y - 1)) / 2, 9);
    }
  });

  it("is the same ground on both sides of a tile's edge, height and slope", () => {
    const west = tileAt(40, 22);
    const east = tileAt(41, 22);
    const south = tileAt(40, 21);
    for (const along of [0.25, 7.5, 31.75, 63.25]) {
      const w = splineAt(west.fetch, TILE_SAMPLES, LAST, along);
      const e = splineAt(east.fetch, TILE_SAMPLES, 0, along);
      expect(w.h).toBeCloseTo(e.h, 9);
      expect(w.dy).toBeCloseTo(e.dy, 9);
      const n = splineAt(south.fetch, TILE_SAMPLES, along, LAST);
      const s = splineAt(west.fetch, TILE_SAMPLES, along, 0);
      expect(n.h).toBeCloseTo(s.h, 9);
      expect(n.dx).toBeCloseTo(s.dx, 9);
      // The slope across the edge reads a sample past it, and within one
      // sample of a corner that sample is on the tile diagonal to one side,
      // which neither reads: each holds the row, and the two differ there.
      if (along > 1 && along < LAST - 1) expect(w.dx).toBeCloseTo(e.dx, 9);
      // A metre in a kilometre's sample at most: a shade no one can see.
      else expect(Math.abs(w.dx - e.dx)).toBeLessThan(1);
    }
  });

  it("holds the edge where the tile beside is not resident", () => {
    const { tile, sample } = tileAt(40, 22);
    const alone = tileFetch(tile, TILE_SAMPLES);
    expect(alone(-1, 10)).toBe(sample(0, 10));
    expect(alone(LAST + 2, 10)).toBe(sample(LAST, 10));
    expect(alone(10, -1)).toBe(sample(10, 0));
    // Off both axes, the row is held first, and then the column.
    expect(alone(-1, LAST + 1)).toBe(sample(0, LAST));
  });

  it("reads the tile beside past each edge, as the shader does", () => {
    const { fetch } = tileAt(40, 22);
    expect(fetch(-1, 10)).toBe(tileAt(39, 22).sample(LAST - 1, 10));
    expect(fetch(LAST + 2, 10)).toBe(tileAt(41, 22).sample(2, 10));
    expect(fetch(10, -1)).toBe(tileAt(40, 21).sample(10, LAST - 1));
    expect(fetch(10, LAST + 1)).toBe(tileAt(40, 23).sample(10, 1));
    // Off both axes: the row held, then read across into the tile beside.
    expect(fetch(LAST + 1, LAST + 2)).toBe(tileAt(41, 22).sample(1, LAST));
  });
});

describe("the country's levels finer than its samples", () => {
  it("come first in the country's ladder, halving down to L0", () => {
    expect(COUNTRY_SEGMENTS).toEqual([...FINE_SEGMENTS, ...LOD_SEGMENTS]);
    expect(FINE_SEGMENTS).toEqual([128]);
  });

  it("put a vertex on every sample and one between each", () => {
    for (const [segments, per] of [[128, 2]] as const) {
      const g = buildGrid(segments, TILE_SAMPLES);
      const steps = new Set<number>();
      for (let k = 0; k < g.texel.length; k++) steps.add(g.texel[k]! % 1);
      expect([...steps].sort()).toEqual(Array.from({ length: per }, (_, k) => k / per));
      // The corners are samples, so a coarser level beside it meets it there.
      expect(g.texel.reduce((a, b) => Math.max(a, b))).toBe(LAST);
    }
  });

  it("are chosen by how near a tile's nearest point is", () => {
    expect(fineLevelFor(0)).toBe(0);
    expect(fineLevelFor(FINE_REACH_M - 1)).toBe(0);
    expect(fineLevelFor(FINE_REACH_M)).toBe(1);
  });
});
