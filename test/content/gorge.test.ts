/**
 * Room to turn round in a gorge (F55).
 *
 * F43 priced *thread a gorge at low speed* with the aeroplane's turn on one
 * side and a channel width on the other. The turn has had a test since F38;
 * the channel width had none, was measured 71 km from the gorge (F49), on the
 * grid that fills a gorge in (F50, F52), by a script that is not in this
 * repository. This is the other side of that comparison, with a test under it.
 *
 * The arithmetic is checked on synthetic ground first, because a straight
 * channel of a known width is the one case where the answer is knowable
 * without measuring anything. The built world is then asked the questions
 * only it can answer, and skipped where there is none.
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import {
  AreaTurning,
  CELL_M,
  reachesOf,
  squaredDistanceTransform,
  type Reach,
} from "../../tools/gorge.ts";
import { corridorCache, type Corridor } from "../../tools/corridor.ts";
import { BOUNCE_CLEARANCE_M } from "../../engine/src/sim/flight.js";

const built = existsSync("dist-world/sea-to-sky/manifest.json");
const open = corridorCache("dist-world");
const world = (): Corridor => {
  const c = open("sea-to-sky");
  if (!c) throw new Error("no world");
  return c;
};

/** 100 x 100 cells of 90 m, indexed from the origin. */
const BOX = { eastM0: 0, northM0: 0, eastM1: 100 * CELL_M, northM1: 100 * CELL_M };
const cellX = (eastM: number) => Math.round(eastM / CELL_M);
const MIDDLE = 50 * CELL_M;

/** A north-south channel of free ground between two walls, in cells. */
function channel(freeFrom: number, freeTo: number, wallM = 5_000) {
  return AreaTurning.sample("synthetic", BOX, (eastM) => {
    const x = cellX(eastM);
    return x >= freeFrom && x <= freeTo ? 0 : wallM;
  });
}

describe("the distance transform under it", () => {
  it("is exact rather than a chamfer approximation", () => {
    // Two blocked cells, and a point whose nearest one is diagonal. A 3-4
    // chamfer gets this wrong by a few per cent, which at 90 m cells is tens
    // of metres of gorge.
    const blocked = new Uint8Array(36);
    blocked[0] = 1; // (0, 0)
    blocked[5 * 6 + 5] = 1; // (5, 5)
    const d2 = squaredDistanceTransform(blocked, 6, 6);
    expect(d2[0 * 6 + 3]).toBe(9); // (3, 0) -> (0, 0)
    expect(d2[4 * 6 + 2]).toBe(10); // (2, 4) -> (5, 5), not (0, 0) at 20
    expect(d2[5 * 6 + 5]).toBe(0);
  });

  it("says Infinity when nothing is in the way, rather than a large number", () => {
    // The lower envelope subtracts two of its stand-in values, so a literal
    // Infinity here would be NaN and would report a whole area as clear air.
    const d2 = squaredDistanceTransform(new Uint8Array(9), 3, 3);
    expect([...d2].every((v) => v === Infinity)).toBe(true);
  });

  it("says zero everywhere when everything is", () => {
    const d2 = squaredDistanceTransform(new Uint8Array(9).fill(1), 3, 3);
    expect([...d2].every((v) => v === 0)).toBe(true);
  });
});

describe("turning room over ground whose answer is known", () => {
  it("is the channel's own width in a straight channel", () => {
    // Free cells 40..60, so the wall samples either side are 22 cells apart
    // and the largest disc holding no wall sample is 22 cells across.
    const room = channel(40, 60).roomAt(MIDDLE, MIDDLE, 100);
    expect(room.roomM).toBeCloseTo(22 * CELL_M, 6);
    expect(room.boundedByArea).toBe(false);
  });

  it("widens exactly as the channel does", () => {
    const narrow = channel(45, 55).roomAt(MIDDLE, MIDDLE, 100).roomM;
    const wide = channel(35, 65).roomAt(MIDDLE, MIDDLE, 100).roomM;
    expect(wide - narrow).toBeCloseTo(20 * CELL_M, 6);
  });

  it("does not count room the aeroplane is not in", () => {
    // A slot where the aeroplane is, and open ground four kilometres away.
    // The largest disc anywhere is the open one; the largest disc *containing
    // the aeroplane* is the slot, and threading a gorge is the second.
    const area = AreaTurning.sample("synthetic", BOX, (eastM, northM) => {
      const x = cellX(eastM);
      const y = cellX(northM);
      if (x >= 45 && x <= 55) return 0;
      if (x >= 70 && x <= 95 && y >= 70 && y <= 95) return 0;
      return 5_000;
    });
    expect(area.roomAt(MIDDLE, MIDDLE, 100).roomM).toBeCloseTo(12 * CELL_M, 6);
    // The open ground is there and is much wider; it is simply not a turn
    // this aeroplane can make from where it is.
    expect(area.roomAt(80 * CELL_M, 80 * CELL_M, 100).roomM).toBeGreaterThan(20 * CELL_M);
  });

  it("is capped by the area's own edge, and says so", () => {
    const flat = AreaTurning.sample("synthetic", BOX, () => 0);
    const room = flat.roomAt(MIDDLE, MIDDLE, 100);
    expect(room.boundedByArea).toBe(true);
    // Ground nobody has at 90 m is not ground known to be clear: the edge
    // stops the disc as a wall would, and 100 cells is the whole lattice.
    expect(room.roomM).toBeCloseTo(100 * CELL_M, 6);
  });

  it("is nothing at all when the aeroplane is inside the ground", () => {
    expect(channel(40, 60, 5_000).roomAt(MIDDLE, MIDDLE, -10).roomM).toBe(0);
  });

  it("uses the game's bounce floor rather than the bare ground", () => {
    // `flight.ts` pushes the aeroplane clear at ground + 25 m, so a cell is in
    // the way below that and not at it.
    const flat = AreaTurning.sample("synthetic", BOX, () => 100);
    expect(flat.roomAt(MIDDLE, MIDDLE, 100 + BOUNCE_CLEARANCE_M).roomM).toBe(0);
    expect(flat.roomAt(MIDDLE, MIDDLE, 100 + BOUNCE_CLEARANCE_M + 1).roomM).toBeGreaterThan(0);
  });

  it("finds the wall over a place at a radius, and only within it", () => {
    const spike = AreaTurning.sample("synthetic", BOX, (eastM, northM) =>
      cellX(eastM) === 60 && cellX(northM) === 50 ? 2_000 : 0,
    );
    expect(spike.highestWithin(MIDDLE, MIDDLE, 9 * CELL_M)).toBe(0);
    expect(spike.highestWithin(MIDDLE, MIDDLE, 11 * CELL_M)).toBe(2_000);
  });
});

describe.skipIf(!built)("the gorges this world has", () => {
  // Measured once: every question below is about the same five places over the
  // same two grids, and the altitude sweep is seconds rather than milliseconds.
  let measured: Reach[] | null = null;
  const reaches = (): Reach[] => (measured ??= reachesOf(world()));
  const find = (id: string, rs: Reach[]): Reach => {
    const r = rs.find((x) => x.place === id);
    if (!r) throw new Error(`${id} is not covered by a hero area`);
    return r;
  };

  it("measures every named place the 90 m grid covers, and nothing else", () => {
    const rs = reaches();
    expect(rs.map((r) => r.place).sort()).toEqual([
      "qutang-gorge",
      "shigu",
      "tiger-leaping-gorge",
      "wu-gorge",
      "xiling-gorge",
    ]);
    // The control comes with the area rather than from a list: `shigu` is a
    // broad valley 41 km up the same river, inside the gorge's own rectangle.
    expect(find("shigu", rs).area).toBe("tiger-leaping-gorge");
  });

  it("reads a gorge as tighter than the valley on the same river", () => {
    const rs = reaches();
    const gorge = find("tiger-leaping-gorge", rs).rungs[0]!;
    const valley = find("shigu", rs).rungs[0]!;
    expect(gorge.aboveGroundM).toBe(valley.aboveGroundM);
    expect(gorge.fine.roomM).toBeLessThan(valley.fine.roomM / 2);
  });

  it("puts the aeroplane underground on the 1 km grid where the 90 m grid has a gorge", () => {
    // The coarse grid read the reservoir 260-300 m above its own surface, so
    // a hundred metres over the water was inside the hill it drew there.
    // Stage 3 cut the Yangtze's channel through it at the reservoir's level
    // (F61), and a slot a cell wide is room of a kind: at Qutang and Xiling
    // the 1 km grid now has some, less than the gorge the 90 m grid draws,
    // and at Wu Gorge, off the channel, it still has none. Either way,
    // measuring a gorge on the country grid answers a question about
    // resampling rather than about a gorge.
    const wu = find("wu-gorge", reaches()).rungs[0]!;
    expect(wu.coarse.roomM).toBe(0);
    expect(wu.fine.roomM).toBeGreaterThan(0);
    for (const id of ["qutang-gorge", "xiling-gorge"]) {
      const first = find(id, reaches()).rungs[0]!;
      expect(first.coarse.roomM).toBeGreaterThan(0);
      expect(first.coarse.roomM).toBeLessThan(first.fine.roomM);
    }
  });

  it("never reports less room higher up, on either grid", () => {
    for (const r of reaches())
      for (let i = 1; i < r.rungs.length; i++) {
        expect(r.rungs[i]!.fine.roomM).toBeGreaterThanOrEqual(r.rungs[i - 1]!.fine.roomM);
        expect(r.rungs[i]!.coarse.roomM).toBeGreaterThanOrEqual(r.rungs[i - 1]!.coarse.roomM);
      }
  });

  it("has one gorge the turn fits inside and one it does not", () => {
    const rs = reaches();
    const below = (r: Reach) => {
      const fit = r.fits.find((f) => f.what === "low, settled")!;
      const rim = r.rim[0]!.m - r.groundM;
      return fit.aboveGroundM !== null && fit.aboveGroundM < rim;
    };
    // Wu Gorge: the reversal fits under a wall that still stands over it.
    expect(below(find("wu-gorge", rs))).toBe(true);
    // Tiger Leaping Gorge, the one this repository always reached for -- the
    // GDD names Qutang, not this one (F57): the turn first fits well above the
    // rim, which is a turn made in the open air over a gorge rather than in
    // one. Flying *through* it is another question, and `reach.test.ts` asks.
    expect(below(find("tiger-leaping-gorge", rs))).toBe(false);
  });
});
