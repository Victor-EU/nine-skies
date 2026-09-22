/**
 * How much room the aeroplane has to turn round inside a gorge, measured off
 * the ground the game actually draws.
 *
 *   npm run content:gorges        # and `make gorges`, inside `make world`
 *
 * **Why this exists.** The GDD asks for *thread a gorge at low speed* and F43
 * priced it: a full-bank reversal at `low` is 5.1 km across the ground,
 * against a channel F43 read as "1.3 to 8.0 km wide and 1.8 km at its
 * middle". Two things were wrong with the right-hand number and neither was
 * visible at the time.
 *
 * It was measured at 26.87 N, 100.75 E, which F49 later found is **71 km from
 * Tiger Leaping Gorge** -- a highland with a third of the relief. And it was
 * measured on the 1 km country grid, which F50 and F52 then showed fills a
 * gorge in: at the real coordinate the coarse grid stands 390 m above the
 * water and reads no gorge at all below it. The script that produced the
 * table is not in this repository and cannot be re-run, which is the third
 * thing wrong with it and the reason this file is a tool rather than a
 * scratch buffer.
 *
 * **What is measured.** Not a cross-section width, which needs an axis
 * somebody has to draw, and a chord is not a centreline (F48). A full-bank
 * reversal needs a level, terrain-free *disc* of its own diameter, so the
 * honest question is geometric and needs no axis at all:
 *
 *   at flight altitude A, what is the diameter of the largest level disc
 *   that is clear of terrain and that the aeroplane's own position lies
 *   inside?
 *
 * In a straight channel that is exactly the channel's width, which is why it
 * is comparable to F43's table; at a bend or a confluence it correctly finds
 * the extra room, which a cross-section cannot. "Clear of terrain" is the
 * game's own rule and not an aviator's: `flight.ts` bounces the aeroplane at
 * `BOUNCE_CLEARANCE_M` above the ground, so a cell is in the way when
 * `ground + 25 >= A`.
 *
 * The disc must contain the aeroplane because this measures *turning round*
 * in the gorge, which is how F43 read *threading* one. The largest disc
 * anywhere in the reachable air is a different and much larger number -- at
 * 400 m over the reservoir it is 4.9 km against 1.45, and it sits in open
 * country forty kilometres away. The other reading of *thread* -- flying
 * through, which needs the bends followed rather than a reversal -- is
 * `reach.ts`'s, and it is the one the GDD's own words read as (F57).
 *
 * **Where the measurement stops.** Outside a hero area there is no 90 m
 * ground, and ground nobody has at 90 m is not ground known to be clear, so
 * the area's own edge caps a disc exactly as a wall would. A result that hit
 * the edge says so and is a lower bound. The 1 km column is measured inside
 * the same rectangle for the same reason: the two numbers are a comparison
 * between grids, not between extents.
 */
import type { AreaBounds } from "../engine/src/terrain/heroSource.ts";
import { BOUNCE_CLEARANCE_M, reversalWidthM } from "../engine/src/sim/flight.ts";
import { MODE_IAS_MS, type SpeedMode } from "../engine/src/sim/scale.ts";
import type { Corridor } from "./corridor.ts";

/** The hero grid's own cell. Measuring finer would interpolate its own answer. */
export const CELL_M = 90;

/** F52's two radii, so a rim here is the same rim the siting report prints. */
export const RIM_RADII_M = [1_000, 4_000] as const;

/** Heights above the ground under the place, doubling. */
export const RUNGS_M = [100, 200, 400, 800, 1_600] as const;

/** The ladder the first-fit search climbs, and where it gives up. */
export const SEARCH_STEP_M = 25;
export const SEARCH_CAP_M = 2_500;

/**
 * Exact squared Euclidean distance to the nearest set cell, in cells.
 *
 * Felzenszwalb and Huttenlocher's separable transform: a lower envelope of
 * parabolas per row and then per column, O(cells) and exact. The obvious
 * two-pass chamfer alternative is 3-8 % wrong on the diagonal, and this
 * measurement is a comparison of two grids at the hundred-metre level.
 *
 * An empty mask gives every cell `Infinity`, which is the right answer and
 * the one a caller has to cap: a disc is only unbounded if nothing is in it.
 * Internally the transform carries a large finite stand-in instead, because
 * the envelope's own arithmetic subtracts two of these and `Infinity` minus
 * `Infinity` is `NaN` -- which does not throw, and silently reports a whole
 * area as clear air.
 */
export function squaredDistanceTransform(
  blocked: Uint8Array,
  w: number,
  h: number,
): Float64Array {
  // Larger than any squared distance a lattice of this size can hold, and
  // finite, so the lower envelope stays arithmetic.
  const BIG = 1e20;
  const f = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) f[i] = blocked[i] ? 0 : BIG;

  const n = Math.max(w, h);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const d = new Float64Array(n);
  const out = new Float64Array(n);

  const pass = (get: (i: number) => number, set: (i: number, value: number) => void, len: number) => {
    for (let i = 0; i < len; i++) d[i] = get(i);
    let k = 0;
    v[0] = 0;
    z[0] = -BIG;
    z[1] = BIG;
    for (let q = 1; q < len; q++) {
      let s = 0;
      for (;;) {
        const p = v[k]!;
        s = (d[q]! + q * q - (d[p]! + p * p)) / (2 * q - 2 * p);
        if (s <= z[k]!) k--;
        else break;
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = BIG;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1]! < q) k++;
      const p = v[k]!;
      out[q] = (q - p) * (q - p) + d[p]!;
    }
    // Written after the whole line is read: the column pass reads and writes
    // the same array.
    for (let q = 0; q < len; q++) set(q, out[q]!);
  };

  for (let y = 0; y < h; y++) pass((x) => f[y * w + x]!, (x, value) => { f[y * w + x] = value; }, w);
  for (let x = 0; x < w; x++) pass((y) => f[y * w + x]!, (y, value) => { f[y * w + x] = value; }, h);
  // Nothing in the mask at all: say so rather than handing back 1e20 cells.
  for (let i = 0; i < w * h; i++) if (f[i]! >= BIG) f[i] = Infinity;
  return f;
}

export interface TurningRoom {
  /** Diameter of the largest terrain-free disc the point lies inside, metres. */
  readonly roomM: number;
  /** Where that disc is centred, in metres from the country origin. */
  readonly eastM: number;
  readonly northM: number;
  /** The area's edge stopped the disc, not the ground: `roomM` is a floor. */
  readonly boundedByArea: boolean;
}

const NO_ROOM: TurningRoom = { roomM: 0, eastM: 0, northM: 0, boundedByArea: false };

/**
 * One hero area's ground, sampled once onto its own lattice.
 *
 * The sampling is the expensive half and the altitude sweep is the cheap
 * half, so the ground is read once and every altitude is answered from the
 * array. The distance transform is cached per altitude as well, because every
 * place inside one area shares it -- the three Yangtze gorges are three
 * questions about one surface.
 */
interface Clearances {
  /** Squared distance to the nearest blocked sample, in cells. */
  readonly d2: Float64Array;
  /** The largest radius anywhere, in cells, after the edge cap. */
  readonly reach: number;
}

export class AreaTurning {
  private readonly cache = new Map<number, Clearances>();

  private constructor(
    readonly area: string,
    readonly bounds: AreaBounds,
    readonly ground: Float32Array,
    readonly w: number,
    readonly h: number,
  ) {}

  /** Read a field onto the area's lattice. `at` answers in real metres. */
  static sample(area: string, bounds: AreaBounds, at: (eastM: number, northM: number) => number): AreaTurning {
    const w = Math.round((bounds.eastM1 - bounds.eastM0) / CELL_M);
    const h = Math.round((bounds.northM1 - bounds.northM0) / CELL_M);
    const ground = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        ground[y * w + x] = at(bounds.eastM0 + x * CELL_M, bounds.northM0 + y * CELL_M);
    return new AreaTurning(area, bounds, ground, w, h);
  }

  holds(eastM: number, northM: number): boolean {
    return (
      eastM >= this.bounds.eastM0 &&
      eastM < this.bounds.eastM1 &&
      northM >= this.bounds.northM0 &&
      northM < this.bounds.northM1
    );
  }

  /** The nearest sample, not a bilinear one: this lattice is the grid's own. */
  groundAt(eastM: number, northM: number): number {
    const { x, y } = this.cellOf(eastM, northM);
    return this.ground[y * this.w + x]!;
  }

  /** The highest ground within a radius — the wall over a place (F52). */
  highestWithin(eastM: number, northM: number, radiusM: number): number {
    const { x: cx, y: cy } = this.cellOf(eastM, northM);
    const r = Math.ceil(radiusM / CELL_M);
    const r2 = (radiusM / CELL_M) ** 2;
    let highest = -Infinity;
    for (let y = Math.max(0, cy - r); y <= Math.min(this.h - 1, cy + r); y++)
      for (let x = Math.max(0, cx - r); x <= Math.min(this.w - 1, cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r2) continue;
        const g = this.ground[y * this.w + x]!;
        if (g > highest) highest = g;
      }
    return highest;
  }

  /**
   * The turning room at a point, flying level at `altitudeM`.
   *
   * Zero when the aeroplane would be inside the ground at that altitude,
   * which is not a degenerate case here: at 258 m over the Three Gorges the
   * 1 km grid puts the aircraft two hundred metres underground, because that
   * grid reads the reservoir at 419-462 m where the source runs it at 158.
   */
  roomAt(eastM: number, northM: number, altitudeM: number): TurningRoom {
    if (!this.holds(eastM, northM)) return NO_ROOM;
    const { x: px, y: py } = this.cellOf(eastM, northM);
    const { d2, reach } = this.distances(altitudeM);
    if (d2[py * this.w + px] === 0) return NO_ROOM;

    let best = 0;
    let bestX = px;
    let bestY = py;
    let bounded = false;
    // A centre has to lie within its own radius of the aeroplane, and no
    // radius anywhere exceeds `reach`, so nothing outside this window can win.
    // In a gorge that is a few cells and the search collapses; in open air it
    // is the whole area, which is also when the answer stopped being a gorge.
    for (let y = Math.max(0, py - reach); y <= Math.min(this.h - 1, py + reach); y++)
      for (let x = Math.max(0, px - reach); x <= Math.min(this.w - 1, px + reach); x++) {
        const r2 = Math.min(d2[y * this.w + x]!, this.edgeCap(x, y));
        if (r2 <= best) continue;
        if ((x - px) ** 2 + (y - py) ** 2 >= r2) continue;
        best = r2;
        bestX = x;
        bestY = y;
        bounded = this.edgeCap(x, y) <= d2[y * this.w + x]!;
      }
    return {
      roomM: 2 * Math.sqrt(best) * CELL_M,
      eastM: this.bounds.eastM0 + bestX * CELL_M,
      northM: this.bounds.northM0 + bestY * CELL_M,
      boundedByArea: bounded,
    };
  }

  /**
   * Beyond the area there is no 90 m ground, and ground nobody has is not
   * ground known to be clear. The edge caps a disc exactly as a wall would.
   */
  private edgeCap(x: number, y: number): number {
    const cap = Math.min(x + 1, this.w - x, y + 1, this.h - y);
    return cap * cap;
  }

  /** One altitude's clearances, shared by every place inside this area. */
  private distances(altitudeM: number): Clearances {
    const key = Math.round(altitudeM);
    const had = this.cache.get(key);
    if (had) return had;
    const blocked = new Uint8Array(this.w * this.h);
    for (let i = 0; i < blocked.length; i++)
      blocked[i] = this.ground[i]! + BOUNCE_CLEARANCE_M >= altitudeM ? 1 : 0;
    const d2 = squaredDistanceTransform(blocked, this.w, this.h);
    let widest = 0;
    for (let i = 0; i < d2.length; i++) {
      const x = i % this.w;
      const r2 = Math.min(d2[i]!, this.edgeCap(x, (i - x) / this.w));
      if (r2 > widest) widest = r2;
    }
    const made: Clearances = { d2, reach: Math.ceil(Math.sqrt(widest)) };
    this.cache.set(key, made);
    return made;
  }

  private cellOf(eastM: number, northM: number): { x: number; y: number } {
    const x = Math.round((eastM - this.bounds.eastM0) / CELL_M);
    const y = Math.round((northM - this.bounds.northM0) / CELL_M);
    return {
      x: Math.max(0, Math.min(this.w - 1, x)),
      y: Math.max(0, Math.min(this.h - 1, y)),
    };
  }
}

/** One flavour of full-bank reversal, and whether the ground ever allows it. */
export interface Fit {
  readonly what: string;
  readonly mode: SpeedMode;
  /** True when the turn starts from cruise rather than settled at `mode`. */
  readonly fromCruise: boolean;
  /** Lowest height above the ground at which it fits, or null up to the cap. */
  readonly aboveGroundM: number | null;
  /** The reversal's own width at that height — it widens as the air thins. */
  readonly reversalM: number;
  /** The room found there. */
  readonly roomM: number;
}

export interface Rung {
  readonly aboveGroundM: number;
  readonly altitudeM: number;
  readonly fine: TurningRoom;
  readonly coarse: TurningRoom;
  /** `low`, settled — the mode the GDD names for a gorge. */
  readonly reversalM: number;
}

export interface Reach {
  readonly place: string;
  readonly area: string;
  /** The 90 m ground under the place: water, for a place sited on a channel. */
  readonly groundM: number;
  /** What the 1 km grid reads at the same point. */
  readonly coarseGroundM: number;
  /** The wall over it, at F52's two radii, on the 90 m grid. */
  readonly rim: readonly { readonly radiusM: number; readonly m: number }[];
  readonly rungs: readonly Rung[];
  readonly fits: readonly Fit[];
}

const TURNS: readonly { what: string; mode: SpeedMode; fromCruise: boolean }[] = [
  { what: "low, settled", mode: "low", fromCruise: false },
  { what: "low, from cruise", mode: "low", fromCruise: true },
  { what: "approach, settled", mode: "approach", fromCruise: false },
];

function reversalOf(turn: (typeof TURNS)[number], altitudeM: number): number {
  return turn.fromCruise
    ? reversalWidthM(altitudeM, turn.mode, { fromIasMs: MODE_IAS_MS.cruise })
    : reversalWidthM(altitudeM, turn.mode);
}

/**
 * Each published hero area, read once onto its own 90 m lattice.
 *
 * Ground beyond the area is `Infinity` rather than zero: there is no 90 m
 * ground there, and nothing measured here may mistake that for a sea.
 */
export function heroAreas(corridor: Corridor): AreaTurning[] {
  const hero = corridor.hero;
  if (!hero) return [];
  return hero.bounds().map((bounds) => {
    const id =
      hero.areaAt((bounds.eastM0 + bounds.eastM1) / 2, (bounds.northM0 + bounds.northM1) / 2) ??
      "unnamed";
    return AreaTurning.sample(id, bounds, (e, n) => hero.groundAt(e, n) ?? Infinity);
  });
}

/**
 * Every named place the 90 m grid covers, and the room it has to turn round.
 *
 * The subjects are not a list in this file. A hero area is cut to hold named
 * places (`hero.py`'s `holds`), the corridor manifest carries every place it
 * was built with, and a place inside an area is therefore one this grid was
 * built to resolve. Publishing an area over a place measures it; there is no
 * second table to keep in step, which is the fault D46 was written about.
 *
 * That also means the control comes for free: `shigu` is a broad valley in
 * the same area as Tiger Leaping Gorge, 41 km up the same river, and it is
 * here because the grid covers it rather than because a gorge report wanted
 * one.
 */
export function reachesOf(corridor: Corridor): Reach[] {
  const hero = corridor.hero;
  if (!hero) return [];

  const areas = heroAreas(corridor);
  const coarse = areas.map((a) => AreaTurning.sample(a.area, a.bounds, (e, n) => corridor.groundAt(e, n)));

  const out: Reach[] = [];
  for (const [place, anchor] of Object.entries(corridor.manifest.anchors)) {
    const index = areas.findIndex((a) => a.holds(anchor.eastM, anchor.northM));
    if (index < 0) continue;
    const fine = areas[index]!;
    const rough = coarse[index]!;
    // The bilinear reading, which is what the cockpit shows and what every
    // other measurement of this place in the repository is. The mask below is
    // built on the lattice's own samples; in a gorge the two differ by tens of
    // metres, and the heights here are "above what the game says the ground
    // is" rather than "above the nearest cell".
    const groundM = hero.groundAt(anchor.eastM, anchor.northM) ?? fine.groundAt(anchor.eastM, anchor.northM);

    const rungs = RUNGS_M.map((aboveGroundM): Rung => {
      const altitudeM = groundM + aboveGroundM;
      return {
        aboveGroundM,
        altitudeM,
        fine: fine.roomAt(anchor.eastM, anchor.northM, altitudeM),
        coarse: rough.roomAt(anchor.eastM, anchor.northM, altitudeM),
        reversalM: reversalWidthM(altitudeM, "low"),
      };
    });

    const fits = TURNS.map((turn): Fit => {
      for (let above = SEARCH_STEP_M; above <= SEARCH_CAP_M; above += SEARCH_STEP_M) {
        const altitudeM = groundM + above;
        const reversalM = reversalOf(turn, altitudeM);
        const { roomM } = fine.roomAt(anchor.eastM, anchor.northM, altitudeM);
        if (roomM >= reversalM)
          return { what: turn.what, mode: turn.mode, fromCruise: turn.fromCruise, aboveGroundM: above, reversalM, roomM };
      }
      const altitudeM = groundM + SEARCH_CAP_M;
      return {
        what: turn.what,
        mode: turn.mode,
        fromCruise: turn.fromCruise,
        aboveGroundM: null,
        reversalM: reversalOf(turn, altitudeM),
        roomM: fine.roomAt(anchor.eastM, anchor.northM, altitudeM).roomM,
      };
    });

    out.push({
      place,
      area: fine.area,
      groundM,
      coarseGroundM: corridor.groundAt(anchor.eastM, anchor.northM),
      rim: RIM_RADII_M.map((radiusM) => ({
        radiusM,
        m: fine.highestWithin(anchor.eastM, anchor.northM, radiusM),
      })),
      rungs,
      fits,
    });
  }
  return out;
}
