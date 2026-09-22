/**
 * The whole river through a hero area, not five points in it (F57).
 *
 * F55 measured the room to turn round at the places an area was cut to hold,
 * and said what that could not reach: a course is flown between them. This
 * is the course -- its narrowest place, and whether the aeroplane can fly it
 * through at all, which is the other reading of *thread*.
 *
 * The arithmetic is checked on synthetic ground first, where the answers are
 * knowable without measuring anything: a river that falls has its sill at
 * its upstream end, a dam puts the sill on the dam, and a channel that turns
 * a right angle in less room than the aeroplane's turn cannot be followed by
 * any sequence of stick inputs `step` will fly. That last one is the test
 * that the search respects the flight model rather than threading anything
 * it is given. The built world is then asked the questions only it can
 * answer, and skipped where there is none.
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { AreaTurning, CELL_M } from "../../tools/gorge.ts";
import {
  courseThrough,
  flood,
  flyCourse,
  MinHeap,
  reachesThrough,
  RUN_DT_S,
  RUN_FRAMES,
  walkRoom,
  type Course,
  type ReachOfArea,
  type Run,
} from "../../tools/reach.ts";
import { corridorCache, type Corridor } from "../../tools/corridor.ts";
import {
  BOUNCE_CLEARANCE_M,
  createFlightState,
  reversalWidthM,
  step,
  STILL_AIR,
} from "../../engine/src/sim/flight.js";
import { MODE_IAS_MS } from "../../engine/src/sim/scale.js";

const built = existsSync("dist-world/sea-to-sky/manifest.json");
const open = corridorCache("dist-world");
const world = (): Corridor => {
  const c = open("sea-to-sky");
  if (!c) throw new Error("no world");
  return c;
};

/** 100 x 100 cells of 90 m from the origin: nine kilometres a side. */
const N = 100;
const BOX = { eastM0: 0, northM0: 0, eastM1: N * CELL_M, northM1: N * CELL_M };
const cell = (m: number) => Math.round(m / CELL_M);
const at = (x: number, y: number) => ({ eastM: x * CELL_M, northM: y * CELL_M });

/** Synthetic ground both as a lattice and as the continuous field a flight reads. */
function ground(field: (x: number, y: number) => number) {
  const read = (eastM: number, northM: number) => field(eastM / CELL_M, northM / CELL_M);
  const turning = AreaTurning.sample("synthetic", BOX, read);
  const groundAt = (eastM: number, northM: number): number | null =>
    eastM < 0 || northM < 0 || eastM >= BOX.eastM1 || northM >= BOX.northM1 ? null : read(eastM, northM);
  return { turning, groundAt };
}

/** A river along y = 50 falling eastward from 120 m to 100, in a V-shaped valley. */
const falling = (x: number, y: number) => 120 - (20 * x) / N + 8 * (y - 50) ** 2;

/**
 * Walls of `wallM` round an open floor wherever `isOpen` says. The floor falls
 * ten metres eastward across the box, so west is upstream and the course has
 * a direction to run in; a floor that is exactly level has two.
 */
const walled = (isOpen: (x: number, y: number) => boolean, wallM = 5_000) =>
  (x: number, y: number) => (isOpen(Math.round(x), Math.round(y)) ? 110 - x / 10 : wallM);

function course(g: ReturnType<typeof ground>, places: [number, number][]): Course {
  const c = courseThrough(
    g.turning,
    places.map(([x, y], i) => ({ place: `p${i}`, ...at(x, y) })),
  );
  if (!c) throw new Error("no course");
  return c;
}

/** Fly a found run again from its own start, frame by frame, as the game would. */
function replay(run: Run, groundAt: (e: number, n: number) => number | null) {
  const s = createFlightState({ ...run.start, altitudeM: run.altitudeM, iasMs: MODE_IAS_MS[run.mode], mode: run.mode });
  const env = { ...STILL_AIR, groundElevationM: -1e9 };
  let least = Infinity;
  for (const roll of run.rolls)
    for (let f = 0; f < RUN_FRAMES; f++) {
      step(s, { pitch: 0, roll, mode: run.mode }, env, RUN_DT_S);
      s.altitudeM = run.altitudeM;
      s.verticalRateMs = 0;
      const g = groundAt(s.eastM, s.northM);
      least = Math.min(least, g === null ? -Infinity : run.altitudeM - (g + BOUNCE_CLEARANCE_M));
    }
  return { least, eastM: s.eastM, northM: s.northM };
}

describe("the heap and the flood under the course", () => {
  it("pops by key, and by arrival among equal keys", () => {
    const heap = new MinHeap();
    heap.push(3, 0, 30);
    heap.push(1, 1, 11);
    heap.push(2, 2, 22);
    heap.push(1, 3, 13);
    const popped: number[] = [];
    while (heap.size > 0) popped.push(heap.pop());
    expect(popped).toEqual([11, 13, 22, 30]);
  });

  it("gives every cell the lowest level a path to the seed has to climb to", () => {
    // A row: a spill point at 5 between the seed and a hollow at 2, then a
    // ridge at 8 before a hollow at 1. Water in either hollow stands at the
    // highest ground between it and the seed.
    const row = new Float32Array([0, 5, 2, 8, 1]);
    const { level } = flood(row, 5, 1, [0]);
    expect([...level]).toEqual([0, 5, 5, 8, 8]);
  });

  it("crosses a flat as a wave from where it entered, not as a scan (D56)", () => {
    // On a flat every candidate has the same key, so the tie-break is the
    // order and therefore the channel. Arrival order makes the depth of every
    // cell in the tree its Chebyshev distance from the seed.
    const w = 11;
    const flat = new Float32Array(w * w).fill(50);
    const seed = 5; // (5, 0)
    const { parent } = flood(flat, w, w, [seed]);
    for (let c = 0; c < w * w; c++) {
      let hops = 0;
      for (let k = c; k !== seed; k = parent[k]!) hops++;
      const x = c % w;
      const y = (c - x) / w;
      expect(hops).toBe(Math.max(Math.abs(x - 5), Math.abs(y - 0)));
    }
  });
});

describe("the course, over ground whose river is known", () => {
  it("runs edge to edge through the places, upstream end first", () => {
    const g = ground(falling);
    const c = course(g, [[30, 50], [70, 50]]);
    const first = c.stations[0]!;
    const last = c.stations[c.stations.length - 1]!;
    // West is higher, so west is upstream.
    expect(cell(first.eastM)).toBe(0);
    expect(cell(last.eastM)).toBe(N - 1);
    expect(first.groundM).toBeGreaterThan(last.groundM);
    for (const p of c.places) expect(p.offM).toBeLessThanOrEqual(CELL_M);
    expect(c.places.map((p) => p.place)).toEqual(["p0", "p1"]);
    expect(c.places[0]!.km).toBeLessThan(c.places[1]!.km);
    // Straight down the axis, one cell a step.
    expect(c.lengthKm).toBeCloseTo(((N - 1) * CELL_M) / 1000, 6);
  });

  it("puts the sill at the upstream end when the river falls the whole way", () => {
    const c = course(ground(falling), [[30, 50], [70, 50]]);
    expect(c.sillM).toBe(c.stations[0]!.groundM);
    expect(c.sillKm).toBe(0);
  });

  it("puts the sill on a dam, where no water can pass", () => {
    const dammed = (x: number, y: number) => (Math.round(x) === 50 ? Math.max(180, falling(x, y)) : falling(x, y));
    const c = course(ground(dammed), [[30, 50], [70, 50]]);
    expect(c.sillM).toBe(180);
    expect(c.sillKm).toBeCloseTo((50 * CELL_M) / 1000, 6);
  });

  it("keeps to the middle of a flat channel rather than its bank", () => {
    // A reservoir: one flat, twenty cells wide, meeting the edge at both
    // ends. Every path along it costs a flood the same, so only the
    // clearance term puts the course mid-water, and only the snap to the
    // middle of a crossing starts it there.
    const reservoir = ground((_, y) => (Math.round(y) >= 40 && Math.round(y) <= 60 ? 158 : 5_000));
    const c = course(reservoir, [[30, 50], [70, 50]]);
    for (const s of c.stations) expect(Math.abs(cell(s.northM) - 50)).toBeLessThanOrEqual(1);
  });

  it("finds the middle of a crossing that turns the corner the edge is numbered from", () => {
    // The edge is walked as a ring that starts at the south-west corner, so a
    // flat meeting both edges there is one crossing split across the ring's
    // two ends. Sorted by ring position its middle was a cell on the south
    // edge; in order along the edge it is the corner itself.
    const diagonal = ground((x, y) => (Math.abs(Math.round(x) - Math.round(y)) <= 4 ? 158 : 5_000));
    const c = course(diagonal, [[30, 30], [70, 70]]);
    const ends = [c.stations[0]!, c.stations[c.stations.length - 1]!].map((s) => [cell(s.eastM), cell(s.northM)]);
    expect(ends).toContainEqual([0, 0]);
    expect(ends).toContainEqual([N - 1, N - 1]);
  });

  it("has no course where an area holds no place to run it through", () => {
    // Everest's area would be one: a hero area that is not cut on a river
    // has no river to measure, and inventing one from its lowest edge cells
    // would be a table of reaches by the back door.
    expect(courseThrough(ground(falling).turning, [])).toBeNull();
  });
});

describe("the narrowest place along a course", () => {
  it("is the channel's own width in a straight channel, and a turn fits nowhere in it", () => {
    // Free rows 40..60, walls either side: 22 cells between wall samples,
    // as gorge.ts's own straight-channel case.
    const g = ground(walled((_, y) => y >= 40 && y <= 60));
    const c = course(g, [[30, 50], [70, 50]]);
    const walk = walkRoom(g.turning, c, 250);
    expect(walk.narrowest.room.roomM).toBeCloseTo(22 * CELL_M, 6);
    expect(walk.reversalM).toBeGreaterThan(22 * CELL_M);
    expect(walk.fitsKm).toBe(0);
  });

  it("finds a turn wherever the channel opens wider than one", () => {
    const g = ground(walled((x, y) => (y >= 40 && y <= 60) || (x >= 40 && x <= 99 && y >= 5 && y <= 95)));
    const c = course(g, [[20, 50], [70, 50]]);
    const walk = walkRoom(g.turning, c, 250);
    expect(walk.fitsKm).toBeGreaterThan(0);
    expect(walk.firstFitKm!).toBeGreaterThan((30 * CELL_M) / 1000);
    // Every wall here is 5,000 m, so wherever a wall is within a kilometre
    // it stands over the aeroplane; the part of the fit that has one is a
    // part of the fit and no more.
    expect(walk.fitsInsideKm).toBeLessThanOrEqual(walk.fitsKm);
  });
});

describe("flying a course through", () => {
  const straight = () => ground(walled((_, y) => y >= 35 && y <= 65));

  it("flies a straight channel, and the flight it returns replays clean", () => {
    const g = straight();
    const c = course(g, [[30, 50], [70, 50]]);
    const run = flyCourse(g.turning, c, g.groundAt, { altitudeM: 200, marginM: 0 });
    expect(run.flown).toBe(true);
    expect(run.outcome).toBe("flown");
    expect(run.leastClearanceM).toBeGreaterThan(0);
    // Fly it again from its own start, frame by frame, with nothing from the
    // search but the stick inputs.
    const again = replay(run, g.groundAt);
    expect(again.least).toBeGreaterThan(0);
    expect(again.least).toBeCloseTo(run.leastClearanceM, 9);
    expect(again.eastM).toBeGreaterThan(c.stations[c.stations.length - 1]!.eastM - 1_500);
  });

  it("finds no air at the sill plus the bounce, and says so rather than searching", () => {
    // A reservoir is its own sill the whole way along, so at the bounce over
    // it every cell of the run is ground.
    const g = ground((_, y) => (Math.round(y) >= 35 && Math.round(y) <= 65 ? 158 : 5_000));
    const c = course(g, [[30, 50], [70, 50]]);
    const run = flyCourse(g.turning, c, g.groundAt, { altitudeM: c.sillM + BOUNCE_CLEARANCE_M, marginM: 0 });
    expect(run.flown).toBe(false);
    expect(run.outcome).toBe("no air");
    expect(run.expanded).toBe(0);
  });

  it("cannot follow a right angle narrower than its own turn", () => {
    // East along row 20, then north up column 50: five cells wide, 450 m,
    // against a full-bank turn at `low` that is kilometres across. No stick
    // input `step` will fly makes this corner, so the search must not find
    // one. This is the test that it respects the flight model rather than
    // threading whatever channel it is handed.
    const narrow = ground(walled((x, y) => (Math.abs(y - 20) <= 2 && x <= 52) || (Math.abs(x - 50) <= 2 && y >= 18)));
    const c = course(narrow, [[25, 20], [50, 60]]);
    const run = flyCourse(narrow.turning, c, narrow.groundAt, { altitudeM: 200, marginM: 0 });
    expect(run.flown).toBe(false);
    expect(run.outcome).toBe("exhausted");
    // The same corner with room to swing through it is flown.
    const wide = ground(
      walled((x, y) => (Math.abs(y - 20) <= 2 && x <= 52) || (Math.abs(x - 50) <= 2 && y >= 18) || (x >= 15 && x <= 70 && y >= 5 && y <= 60)),
    );
    const c2 = course(wide, [[5, 20], [50, 80]]);
    const run2 = flyCourse(wide.turning, c2, wide.groundAt, { altitudeM: 200, marginM: 0 });
    expect(run2.flown).toBe(true);
    expect(replay(run2, wide.groundAt).least).toBeGreaterThan(0);
  }, 30_000);

  it("keeps the room it is asked for either side, and cannot keep more than the channel has", () => {
    const g = straight();
    const c = course(g, [[30, 50], [70, 50]]);
    // Thirty-one cells between the walls is 2.8 km: 500 m either side fits,
    // 1,400 m either side does not.
    expect(flyCourse(g.turning, c, g.groundAt, { altitudeM: 200, marginM: 500 }).flown).toBe(true);
    expect(flyCourse(g.turning, c, g.groundAt, { altitudeM: 200, marginM: 1_400 }).flown).toBe(false);
  });
});

describe.skipIf(!built)("the rivers this world has", () => {
  // Walked once, without the run ladder: the searches that matter here are
  // asked for directly below, one each.
  let measured: ReachOfArea[] | null = null;
  const reaches = (): ReachOfArea[] => (measured ??= reachesThrough(world(), { runs: false }));
  const find = (area: string): ReachOfArea => {
    const r = reaches().find((x) => x.area === area);
    if (!r) throw new Error(`${area} has no course`);
    return r;
  };
  const turningOf = (area: string): AreaTurning => {
    const hero = world().hero!;
    const bounds = hero.bounds().find((b) => hero.areaAt((b.eastM0 + b.eastM1) / 2, (b.northM0 + b.northM1) / 2) === area)!;
    return AreaTurning.sample(area, bounds, (e, n) => hero.groundAt(e, n) ?? Infinity);
  };

  it("runs the Three Gorges reservoir edge to edge, west to east, through all three gorges", () => {
    const { course } = find("three-gorges");
    const first = course.stations[0]!;
    const last = course.stations[course.stations.length - 1]!;
    expect(first.eastM).toBeLessThan(last.eastM);
    // The reservoir is flat to the metre (F52), and the lower end is the dam side.
    expect(first.groundM).toBe(158);
    expect(last.groundM).toBeLessThan(first.groundM);
    expect(course.places.map((p) => p.place)).toEqual(
      expect.arrayContaining(["qutang-gorge", "wu-gorge", "xiling-gorge"]),
    );
    const byKm = [...course.places].sort((a, b) => a.km - b.km).map((p) => p.place);
    expect(byKm).toEqual(["qutang-gorge", "wu-gorge", "xiling-gorge"]);
    for (const p of course.places) expect(p.offM).toBeLessThan(250);
  });

  it("finds a place on that reach half the width of any of the three it was cut for", () => {
    // F55's want. At a hundred metres over the water the three sited gorges
    // read 0.74-0.90 km; the course's narrowest is Qutang's upper mouth.
    const r = find("three-gorges");
    const walk = r.walks[0]!;
    expect(walk.altitudeM - r.course.sillM).toBe(100);
    expect(walk.narrowest.room.roomM).toBeLessThan(500);
    const qutang = r.course.places.find((p) => p.place === "qutang-gorge")!;
    expect(Math.abs(walk.narrowest.km - qutang.km)).toBeLessThan(5);
    // And nowhere on 166 km of it does a reversal at `low` fit.
    expect(walk.fitsKm).toBe(0);
  });

  it("finds nothing damming the Jinsha now that stage 3 carves this grid too", () => {
    // It did dam it, and this test asserted the dam: the lowest path between
    // the ends rose to 1,935 m at km 77.0, which is 116 m over the water at
    // Shigu, and every path between the two places the seventh golden probe
    // reads crossed it (F57, F58). Stage 3 reached this grid in F63 and cut
    // it. What is left is the upstream end itself - the highest ground on the
    // lowest path is where the river enters the area, 15 m over the water at
    // Shigu because it is 27 km upstream of it.
    const r = find("tiger-leaping-gorge");
    const { course, water } = r;
    expect(course.sillKm).toBe(0);
    expect(course.sillM).toBe(course.stations[0]!.groundM);
    expect(course.sillM - water.shigu!).toBeLessThan(50);
    // ...and the river falls from the one place to the other, as the probe says.
    expect(water["tiger-leaping-gorge"]!).toBeLessThan(water.shigu!);
  });

  it("flies the whole Three Gorges reach at low, a hundred metres over the water", () => {
    const r = find("three-gorges");
    const hero = world().hero!;
    const run = flyCourse(turningOf("three-gorges"), r.course, (e, n) => hero.groundAt(e, n), {
      altitudeM: r.course.sillM + 100,
      marginM: 0,
    });
    expect(run.flown).toBe(true);
    // Under the walls the whole way: this is a flight inside the gorges.
    for (const p of ["qutang-gorge", "wu-gorge", "xiling-gorge"]) {
      const s = r.course.stations.reduce((best, x) =>
        Math.abs(x.km - r.course.places.find((q) => q.place === p)!.km) < Math.abs(best.km - r.course.places.find((q) => q.place === p)!.km) ? x : best,
      );
      expect(s.rimM).toBeGreaterThan(run.altitudeM);
    }
    // Three and a half minutes: the GDD's "a few minutes in a gorge".
    expect((run.frames * RUN_DT_S) / 60).toBeGreaterThan(3);
    expect((run.frames * RUN_DT_S) / 60).toBeLessThan(4);
  }, 30_000);

  it("flies Tiger Leaping Gorge through at low, under its rim, where it cannot turn round", () => {
    // Two hundred metres over the sill rather than a hundred, because stage 3
    // took the sill down 101 m to the upstream end (F63): this is 2,034 m,
    // within a metre of the 2,035 m this asked for before, and the same air.
    const r = find("tiger-leaping-gorge");
    const hero = world().hero!;
    const run = flyCourse(turningOf("tiger-leaping-gorge"), r.course, (e, n) => hero.groundAt(e, n), {
      altitudeM: r.course.sillM + 200,
      marginM: 0,
    });
    expect(run.flown).toBe(true);
    const gorge = r.course.places.find((p) => p.place === "tiger-leaping-gorge")!;
    const s = r.course.stations.reduce((best, x) => (Math.abs(x.km - gorge.km) < Math.abs(best.km - gorge.km) ? x : best));
    expect(s.rimM).toBeGreaterThan(run.altitudeM);
    // And at that same level the turn round does not fit at the gorge.
    expect(reversalWidthM(run.altitudeM, "low")).toBeGreaterThan(
      turningOf("tiger-leaping-gorge").roomAt(s.eastM, s.northM, run.altitudeM).roomM,
    );
  }, 30_000);

  it("finds no level run below the sill plus the bounce, which is a proof and not a search", () => {
    const r = find("tiger-leaping-gorge");
    const hero = world().hero!;
    const run = flyCourse(turningOf("tiger-leaping-gorge"), r.course, (e, n) => hero.groundAt(e, n), {
      altitudeM: r.course.sillM + BOUNCE_CLEARANCE_M,
      marginM: 0,
    });
    expect(run.outcome).toBe("no air");
  });
});
