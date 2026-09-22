/**
 * What a whole gorge does, rather than five points in it.
 *
 *   npm run content:gorges        # and `make gorges`, inside `make world`
 *
 * **Why this exists.** `gorge.ts` measures the room to turn round at the
 * places a hero area was cut to hold, and its report ended on the question it
 * could not reach: *a course is flown between them, and the narrowest place
 * on the water is what binds; finding it wants the channel centreline stage 3
 * would bring* (F55). F56 then showed a centreline does not have to be
 * downloaded -- it is in the grid -- so this walks one.
 *
 * Walking it asked a second question the first could not see. F43 read the
 * GDD's *thread a gorge at low speed* as a turn -- the aeroplane manoeuvred
 * inside a channel, against a full-bank reversal -- and F55 measured that
 * reading. To thread is also to pass through, and a pass needs no reversal:
 * it needs the aeroplane to follow the channel's bends with the turn it has.
 * The room to turn round cannot answer that, and neither can the narrowest
 * place: a channel a third of a reversal wide is no obstacle to a flight
 * straight down it, and a wide channel with a hairpin in it is. So both are
 * measured, and they are measured apart.
 *
 * **The course.** A hero area is cut to hold named places on a river
 * (`hero.py`'s `holds`), so the river is the ground that joins them. The two
 * ends are where that ground leaves the area: a flood outward from the
 * places, in order of height, reaches the edge first at one crossing, and
 * the first edge cell it reaches clear of all of that crossing is the other
 * end; the lower of the two is downstream. Between them the course keeps to the
 * lowest ground that joins them -- F56's priority-flood again, seeded at the
 * outlet alone, because seeded at every edge cell it would split a flat
 * reservoir between its two ends and drain half of it upstream. No table of
 * reaches is kept anywhere; publishing an area over places on a river
 * measures that river, which is the rule `gorge.ts` already follows.
 *
 * **The run.** Whether the channel can be flown through is answered by
 * flying it: a search over the stick, through `flight.ts`'s own `step`, at a
 * fixed level and at `low`, for any sequence of roll inputs that carries the
 * aeroplane from one end of the course to the other without meeting the
 * ground. What that search finds is a flight the model makes, frame by
 * frame, so a run it finds is a run that exists. What it does not find is
 * not proven impossible -- the search keeps one state per cell, heading and
 * bank, and that is a pruning rather than a proof -- so the report prints
 * found runs as results and a miss beside how far it got, never as a
 * verdict. The one floor that is a proof is the course's sill plus the
 * bounce: every path between the two ends crosses the sill (D57, D58, F57).
 */
import {
  BOUNCE_CLEARANCE_M,
  createFlightState,
  reversalWidthM,
  step,
  STILL_AIR,
  type FlightState,
} from "../engine/src/sim/flight.ts";
import { MODE_IAS_MS, type SpeedMode } from "../engine/src/sim/scale.ts";
import type { Corridor } from "./corridor.ts";
import { AreaTurning, CELL_M, heroAreas, RIM_RADII_M, squaredDistanceTransform, type TurningRoom } from "./gorge.ts";

/** The second end of a course is this far clear of every cell of the first. */
export const END_SEPARATION_M = 5_000;

/**
 * A binary min-heap on a numeric key with a tie-break, carrying a cell index.
 *
 * The tie-break is not decoration. In a flat -- and a reservoir is one flat
 * 190 km long -- every candidate has the same key, so the tie-break *is* the
 * order, and arrival order is what makes a flood cross a flat as a wave from
 * where it entered rather than as a scan (D56).
 */
export class MinHeap {
  private readonly keys: number[] = [];
  private readonly ties: number[] = [];
  private readonly items: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(key: number, tie: number, item: number): void {
    const { keys, ties, items } = this;
    let i = items.length;
    keys.push(key);
    ties.push(tie);
    items.push(item);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! < key || (keys[p] === key && ties[p]! <= tie)) break;
      keys[i] = keys[p]!;
      ties[i] = ties[p]!;
      items[i] = items[p]!;
      i = p;
    }
    keys[i] = key;
    ties[i] = tie;
    items[i] = item;
  }

  /** The smallest key's item; `lastKey` holds its key afterwards. */
  pop(): number {
    const { keys, ties, items } = this;
    const top = items[0]!;
    this.lastKey = keys[0]!;
    const key = keys.pop()!;
    const tie = ties.pop()!;
    const item = items.pop()!;
    const n = items.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && (keys[r]! < keys[l]! || (keys[r] === keys[l] && ties[r]! < ties[l]!)) ? r : l;
        if (keys[c]! > key || (keys[c] === key && ties[c]! >= tie)) break;
        keys[i] = keys[c]!;
        ties[i] = ties[c]!;
        items[i] = items[c]!;
        i = c;
      }
      keys[i] = key;
      ties[i] = tie;
      items[i] = item;
    }
    return top;
  }

  lastKey = 0;
}

/** The eight neighbours, as lattice offsets. */
const NB8: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

/**
 * Priority-flood from `seeds`: the lowest level a path from each cell to any
 * seed has to climb to, and the order cells were settled in.
 *
 * Barnes, Lehman and Mulla (2014), as `hydro.py` has it, and for the same
 * reason: the order a flood settles cells in is a drainage order, and the
 * cell each one was first reached from is a receiver that never stands
 * higher. Eight-connected, ties on arrival.
 */
export function flood(
  ground: Float32Array,
  w: number,
  h: number,
  seeds: readonly number[],
): { level: Float64Array; parent: Int32Array; order: Int32Array } {
  const level = new Float64Array(w * h).fill(Infinity);
  const parent = new Int32Array(w * h).fill(-1);
  const order = new Int32Array(w * h);
  const settled = new Uint8Array(w * h);
  const heap = new MinHeap();
  let arrival = 0;
  for (const s of seeds) {
    if (level[s] !== Infinity) continue;
    level[s] = ground[s]!;
    heap.push(level[s]!, arrival++, s);
  }
  let n = 0;
  while (heap.size > 0) {
    const c = heap.pop();
    if (settled[c]) continue;
    settled[c] = 1;
    order[n++] = c;
    const x = c % w;
    const y = (c - x) / w;
    for (const [dx, dy] of NB8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const k = ny * w + nx;
      if (settled[k] || level[k] !== Infinity) continue;
      level[k] = Math.max(level[c]!, ground[k]!);
      parent[k] = c;
      heap.push(level[k]!, arrival++, k);
    }
  }
  return { level, parent, order: order.subarray(0, n) };
}

export interface Station {
  readonly eastM: number;
  readonly northM: number;
  /** Distance along the course from its upstream end. */
  readonly km: number;
  /** The 90 m ground under it: water, where the source flattened it. */
  readonly groundM: number;
  /** The highest ground within F52's near radius -- the wall over it. */
  readonly rimM: number;
}

export interface PlaceOnCourse {
  readonly place: string;
  readonly km: number;
  /** How far the place lies off the course, metres. */
  readonly offM: number;
}

export interface Course {
  readonly area: string;
  /** Upstream end first, one per lattice step, 90 or 127 m apart. */
  readonly stations: readonly Station[];
  readonly lengthKm: number;
  /**
   * The highest ground the lowest path between the two ends has to cross.
   *
   * For a river that falls the whole way it is the upstream end; anywhere it
   * is more than that, the grid has put a sill in the river. Below it plus
   * the bounce there is no air joining the two ends at all, so it is a floor
   * on any level run and a rigorous one -- every path crosses it.
   */
  readonly sillM: number;
  readonly sillKm: number;
  readonly places: readonly PlaceOnCourse[];
}

/**
 * The lattice's edge cells, once round in order, so that a run of them
 * along the edge is a run of indices -- including one that turns a corner.
 */
function perimeter(w: number, h: number): number[] {
  const ring: number[] = [];
  for (let x = 0; x < w; x++) ring.push(x);
  for (let y = 1; y < h; y++) ring.push(y * w + (w - 1));
  if (h > 1) for (let x = w - 2; x >= 0; x--) ring.push((h - 1) * w + x);
  if (w > 1) for (let y = h - 2; y >= 1; y--) ring.push(y * w);
  return ring;
}

/**
 * The river's course through one area, from the places the area holds.
 *
 * Returns null when the places do not lead to two ends -- an area cut over
 * something that is not a river, which none of the published ones are and
 * Everest would be.
 */
export function courseThrough(
  turning: AreaTurning,
  places: readonly { readonly place: string; readonly eastM: number; readonly northM: number }[],
): Course | null {
  const { ground, w, h, bounds } = turning;
  const cellOf = (eastM: number, northM: number): number => {
    const x = Math.max(0, Math.min(w - 1, Math.round((eastM - bounds.eastM0) / CELL_M)));
    const y = Math.max(0, Math.min(h - 1, Math.round((northM - bounds.northM0) / CELL_M)));
    return y * w + x;
  };
  if (places.length === 0) return null;

  // The two ends. A crossing is an unbroken run of edge cells the flood from
  // the places reached at or below the level it first reached the edge
  // there; the first crossing settled is one end, and the other is the first
  // edge cell settled clear of all of it -- not merely clear of one cell of
  // it, because a flat that meets the edge along more than that distance is
  // one crossing and not two.
  const fromPlaces = flood(ground, w, h, places.map((p) => cellOf(p.eastM, p.northM)));
  const ring = perimeter(w, h);
  const ringAt = new Int32Array(w * h).fill(-1);
  ring.forEach((c, i) => {
    ringAt[c] = i;
  });
  // In order along the edge, so the middle of it is the middle -- including
  // for a crossing that turns a corner of the ring's own numbering.
  const crossing = (end: number): number[] => {
    const limit = fromPlaces.level[end]!;
    const n = ring.length;
    const i0 = ringAt[end]!;
    const at = (k: number) => ring[(((i0 + k) % n) + n) % n]!;
    let lo = 0;
    let hi = 0;
    while (hi - lo + 1 < n && fromPlaces.level[at(hi + 1)]! <= limit) hi++;
    while (hi - lo + 1 < n && fromPlaces.level[at(lo - 1)]! <= limit) lo--;
    const run: number[] = [];
    for (let k = lo; k <= hi; k++) run.push(at(k));
    return run;
  };
  const apart = (END_SEPARATION_M / CELL_M) ** 2;
  let firstRun: number[] | null = null;
  let second = -1;
  for (const c of fromPlaces.order) {
    if (ringAt[c]! < 0) continue;
    if (firstRun === null) {
      firstRun = crossing(c);
      continue;
    }
    const x = c % w;
    const y = (c - x) / w;
    const clear = firstRun.every((r) => ((r % w) - x) ** 2 + (Math.floor(r / w) - y) ** 2 > apart);
    if (clear) {
      second = c;
      break;
    }
  }
  if (firstRun === null || second < 0) return null;
  // The river is a crossing's lowest ground, and where that is a flat -- a
  // reservoir meeting the edge -- the middle of it.
  const riverOf = (run: readonly number[]): number => {
    let low = Infinity;
    for (const c of run) low = Math.min(low, ground[c]!);
    const lowest = run.filter((c) => ground[c]! === low);
    return lowest[lowest.length >> 1]!;
  };
  const a = riverOf(firstRun);
  const b = riverOf(crossing(second));
  // Downstream is the lower end. A flat reservoir's two ends can read within
  // a few metres of each other; that is still a direction, and the report
  // prints both heights so nobody has to take it on trust.
  const [outlet, inlet] = ground[a]! <= ground[b]! ? [a, b] : [b, a];

  // The lowest ground joining the two, and the middle of it.
  const fromOutlet = flood(ground, w, h, [outlet]);
  const sillM = fromOutlet.level[inlet]!;
  const floor = new Uint8Array(w * h);
  for (let i = 0; i < floor.length; i++) floor[i] = fromOutlet.level[i]! <= sillM ? 1 : 0;
  const bank = new Uint8Array(w * h);
  for (let i = 0; i < bank.length; i++) bank[i] = floor[i] ? 0 : 1;
  const d2 = squaredDistanceTransform(bank, w, h);

  // Least cost from inlet to outlet at step / clearance², which keeps to the
  // middle: a path along a bank pays for it at every step.
  const cost = new Float64Array(w * h).fill(Infinity);
  const from = new Int32Array(w * h).fill(-1);
  const heap = new MinHeap();
  let arrival = 0;
  cost[inlet] = 0;
  heap.push(0, arrival++, inlet);
  while (heap.size > 0) {
    const c = heap.pop();
    const here = heap.lastKey;
    if (here > cost[c]!) continue;
    if (c === outlet) break;
    const x = c % w;
    const y = (c - x) / w;
    for (const [dx, dy] of NB8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const k = ny * w + nx;
      if (!floor[k]) continue;
      // An edge cell's clearance is unbounded on the side nobody measured;
      // one cell is the honest minimum, and it keeps the cost finite.
      const clear = Math.max(1, Math.min(d2[k]!, 1e12));
      const next = here + (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1) / clear;
      if (next < cost[k]!) {
        cost[k] = next;
        from[k] = c;
        heap.push(next, arrival++, k);
      }
    }
  }
  if (from[outlet]! < 0 && outlet !== inlet) return null;

  const cells: number[] = [];
  for (let c = outlet; c >= 0; c = from[c]!) cells.push(c);
  cells.reverse();

  const stations: Station[] = [];
  let km = 0;
  let sillKm = 0;
  let highest = -Infinity;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    const x = c % w;
    const y = (c - x) / w;
    if (i > 0) {
      const p = cells[i - 1]!;
      km += (((p % w) !== x && Math.floor(p / w) !== y ? Math.SQRT2 : 1) * CELL_M) / 1000;
    }
    if (ground[c]! > highest) {
      highest = ground[c]!;
      sillKm = km;
    }
    const eastM = bounds.eastM0 + x * CELL_M;
    const northM = bounds.northM0 + y * CELL_M;
    stations.push({ eastM, northM, km, groundM: ground[c]!, rimM: turning.highestWithin(eastM, northM, RIM_RADII_M[0]) });
  }

  const onCourse = places.map((p): PlaceOnCourse => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i]!;
      const d = (s.eastM - p.eastM) ** 2 + (s.northM - p.northM) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return { place: p.place, km: stations[best]!.km, offM: Math.sqrt(bestD) };
  });

  return { area: turning.area, stations, lengthKm: km, sillM, sillKm, places: onCourse };
}

/** The stick, held for `RUN_FRAMES` frames at a time. */
export const RUN_ROLLS = [-1, -0.5, 0, 0.5, 1] as const;

/** The game's floor frame rate, and the step `flight.ts` is tuned at. */
export const RUN_DT_S = 1 / 30;

/** Frames per decision: a quarter of a second, a sixth of the bank lag. */
export const RUN_FRAMES = 8;

/** The run starts and finishes this far inside the area, on the course. */
export const RUN_INSET_KM = 1;

/** How far either side of the course the finish line reaches. */
const FINISH_HALF_WIDTH_M = 3_000;

/**
 * The most the search's order credits a state for being clear of the
 * ground. Past this the air is open and the middle of it means nothing.
 */
const MIDDLE_CAP_M = 500;

/** One kept state per 90 m cell, 3 degrees of heading and 7.5 of bank. */
const HEADING_BINS = 120;
const BANK_BIN_RAD = (7.5 * Math.PI) / 180;
const BANK_BINS = 17;

export interface RunQuestion {
  /** Level flight at this altitude, metres. */
  readonly altitudeM: number;
  /** Room either side of the track the ground must also leave, metres. */
  readonly marginM: number;
  readonly mode?: SpeedMode;
  /** Give up after this many expanded states. */
  readonly budget?: number;
  /**
   * Which flights are tried first. `middle` credits a state for its distance
   * from the ground, so flights down the middle of a channel claim their
   * bins before flights along a wall; `line` follows the air distance to go
   * alone, which runs along the shortest line. Each finds flights the other
   * prunes, which is what makes it worth asking both.
   */
  readonly order?: "middle" | "line";
}

export interface Run {
  /** Which flights the search tried first. */
  readonly order: "middle" | "line";
  /** Where and how the flight begins, so anyone can fly it again. */
  readonly start: { readonly eastM: number; readonly northM: number; readonly headingRad: number };
  readonly altitudeM: number;
  readonly marginM: number;
  readonly mode: SpeedMode;
  /** A flight through the whole course was found, and replayed clean. */
  readonly flown: boolean;
  /**
   * How far down the course the best state got, km. For a flown run, the
   * finish; otherwise where the search stopped making progress.
   */
  readonly reachedKm: number;
  /** "flown", "exhausted" (every kept state tried) or "budget" (gave up). */
  readonly outcome: "flown" | "exhausted" | "budget" | "no air";
  readonly expanded: number;
  /** The flight, one roll input per decision, for a flown run. */
  readonly rolls: readonly number[];
  /** The least clearance over the ground at any frame of the flight, metres. */
  readonly leastClearanceM: number;
  /** Frames flown, for a flown run. */
  readonly frames: number;
}

/**
 * Air distance to the downstream end of the course at one level, 8-connected
 * over cells the aeroplane can be in, metres.
 *
 * This is the search's sense of direction. A straight-line one would send
 * it up every side valley that points the right way.
 */
function distanceToGo(turning: AreaTurning, altitudeM: number, outlet: number): Float64Array {
  const { ground, w, h } = turning;
  const togo = new Float64Array(w * h).fill(Infinity);
  if (ground[outlet]! + BOUNCE_CLEARANCE_M >= altitudeM) return togo;
  const heap = new MinHeap();
  let arrival = 0;
  togo[outlet] = 0;
  heap.push(0, arrival++, outlet);
  while (heap.size > 0) {
    const c = heap.pop();
    const here = heap.lastKey;
    if (here > togo[c]!) continue;
    const x = c % w;
    const y = (c - x) / w;
    for (const [dx, dy] of NB8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const k = ny * w + nx;
      if (ground[k]! + BOUNCE_CLEARANCE_M >= altitudeM) continue;
      const next = here + (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1) * CELL_M;
      if (next < togo[k]!) {
        togo[k] = next;
        heap.push(next, arrival++, k);
      }
    }
  }
  return togo;
}

/**
 * Can the aeroplane fly this course end to end, level, without meeting the
 * ground?
 *
 * A best-first search over roll inputs, each held for a quarter of a second,
 * through `step` itself -- so bank lags the stick exactly as it does in the
 * game, turn rate is what bank gives at this airspeed, and the ground gain
 * multiplies all of it as it does in play. `groundAt` is the ground the game
 * draws: a frame whose ground plus the bounce reaches the aeroplane is
 * contact, and so is a frame over ground nobody has at 90 m.
 *
 * **What it proves and what it does not.** A flight it returns is replayed
 * from its first frame before it is believed, so `flown` means the model
 * flies it. `exhausted` means every state the search kept was tried, and it
 * keeps one per cell, heading and bank -- two flights through the same
 * bin are one flight to it, and in a channel a few cells wide the one it
 * dropped can be the one that fits. So a run not found is a run not found.
 */
export function flyCourse(
  turning: AreaTurning,
  course: Course,
  groundAt: (eastM: number, northM: number) => number | null,
  question: RunQuestion,
): Run {
  const { altitudeM, marginM } = question;
  const mode = question.mode ?? "low";
  const budget = question.budget ?? RUN_BUDGET;
  const order = question.order ?? "middle";
  const { w, h, bounds } = turning;
  const stations = course.stations;
  const last = stations[stations.length - 1]!;
  const cellOf = (eastM: number, northM: number): number => {
    const x = Math.round((eastM - bounds.eastM0) / CELL_M);
    const y = Math.round((northM - bounds.northM0) / CELL_M);
    return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x;
  };
  const togo = distanceToGo(turning, altitudeM, cellOf(last.eastM, last.northM));
  // How far each cell is from ground at this level. The search's order is
  // air distance still to go, less this: at equal progress a flight down the
  // middle is tried before one along a wall. The distance-to-go alone runs
  // along the shortest line, which hugs the inside of every bend, and with
  // one state kept per bin the flights along the wall would claim the bins
  // first and leave the middle -- which is where a pilot flies a gorge, and
  // where the next bend is made from -- untried.
  const blocked = new Uint8Array(w * h);
  for (let i = 0; i < blocked.length; i++) blocked[i] = turning.ground[i]! + BOUNCE_CLEARANCE_M >= altitudeM ? 1 : 0;
  const d2 = squaredDistanceTransform(blocked, w, h);
  const middle = (cell: number): number =>
    order === "line" ? MIDDLE_CAP_M : Math.min(MIDDLE_CAP_M, Math.sqrt(Math.min(d2[cell]!, 1e12)) * CELL_M);

  const startAt = stations.findIndex((s) => s.km >= RUN_INSET_KM);
  let finishAt = stations.length - 1;
  while (finishAt > 0 && stations[finishAt]!.km > course.lengthKm - RUN_INSET_KM) finishAt--;
  const start = stations[startAt]!;
  const ahead = stations[Math.min(stations.length - 1, startAt + 11)]!;
  // The finish is a line across the course, not a place on it: the run is
  // over when the aeroplane crosses the perpendicular at the finish station
  // anywhere within a few kilometres of the course. A target cell pressed
  // against the area's edge would be a question about the edge.
  const finish = stations[finishAt]!;
  const behind = stations[Math.max(0, finishAt - 11)]!;
  const along = Math.hypot(finish.eastM - behind.eastM, finish.northM - behind.northM) || 1;
  const ux = (finish.eastM - behind.eastM) / along;
  const uy = (finish.northM - behind.northM) / along;
  const crossed = (eastM: number, northM: number): boolean => {
    const dx = eastM - finish.eastM;
    const dy = northM - finish.northM;
    return dx * ux + dy * uy >= 0 && Math.abs(dx * uy - dy * ux) <= FINISH_HALF_WIDTH_M;
  };
  const finishToGo = togo[cellOf(finish.eastM, finish.northM)]!;
  const startToGo = togo[cellOf(start.eastM, start.northM)]!;
  const heading0 = Math.atan2(ahead.eastM - start.eastM, ahead.northM - start.northM);
  const origin0 = { eastM: start.eastM, northM: start.northM, headingRad: heading0 };
  /** The course kilometre nearest a position: where a stalled search got to. */
  const kmAt = (eastM: number, northM: number): number => {
    let best = start.km;
    let bestD = Infinity;
    for (const s of stations) {
      const d = (s.eastM - eastM) ** 2 + (s.northM - northM) ** 2;
      if (d < bestD) {
        bestD = d;
        best = s.km;
      }
    }
    return best;
  };
  const none = (outcome: Run["outcome"], reachedKm: number, expanded: number): Run => ({
    order, start: origin0, altitudeM, marginM, mode, flown: false, reachedKm, outcome, expanded,
    rolls: [], leastClearanceM: -Infinity, frames: 0,
  });
  if (!Number.isFinite(startToGo) || !Number.isFinite(finishToGo)) return none("no air", start.km, 0);

  const clearance = (eastM: number, northM: number, headingRad: number): number => {
    const g = groundAt(eastM, northM);
    if (g === null) return -Infinity;
    let least = altitudeM - (g + BOUNCE_CLEARANCE_M);
    if (marginM > 0 && least > 0) {
      // Perpendicular to the track, both sides, no wider apart than half a
      // cell so a spur between two checks cannot pass unseen.
      const px = Math.cos(headingRad);
      const py = -Math.sin(headingRad);
      const n = Math.ceil(marginM / (CELL_M / 2));
      for (let i = 1; i <= n && least > 0; i++)
        for (const side of [-1, 1]) {
          const o = (side * marginM * i) / n;
          const gg = groundAt(eastM + px * o, northM + py * o);
          if (gg === null) return -Infinity;
          least = Math.min(least, altitudeM - (gg + BOUNCE_CLEARANCE_M));
        }
    }
    return least;
  };

  const env = { ...STILL_AIR, groundElevationM: -1e9 };
  const input = { pitch: 0, roll: 0 as number, mode };
  /** Fly one decision from `s`; null on contact. */
  const advance = (s: FlightState, roll: number): FlightState | null => {
    const t: FlightState = { ...s };
    input.roll = roll;
    for (let f = 0; f < RUN_FRAMES; f++) {
      step(t, input, env, RUN_DT_S);
      // Level, and held there: the question is a height, not a climb.
      t.altitudeM = altitudeM;
      t.verticalRateMs = 0;
      if (clearance(t.eastM, t.northM, t.headingRad) <= 0) return null;
    }
    return t;
  };
  const binOf = (s: FlightState, cell: number): number => {
    const turn = ((s.headingRad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const hb = Math.min(HEADING_BINS - 1, Math.floor((turn / (2 * Math.PI)) * HEADING_BINS));
    const bb = Math.max(0, Math.min(BANK_BINS - 1, Math.round(s.bankRad / BANK_BIN_RAD) + (BANK_BINS >> 1)));
    return (cell * HEADING_BINS + hb) * BANK_BINS + bb;
  };

  // Every state kept, and how it was reached, so a found flight can be
  // replayed rather than trusted.
  const kept: FlightState[] = [];
  const parentOf: number[] = [];
  const rollOf: number[] = [];
  const seen = new Set<number>();
  const buckets: number[][] = [];
  let lowest = Infinity;
  const keep = (s: FlightState, parent: number, roll: number, toGo: number, cell: number): void => {
    const id = kept.length;
    kept.push(s);
    parentOf.push(parent);
    rollOf.push(roll);
    const b = Math.max(0, Math.floor((toGo - middle(cell) + MIDDLE_CAP_M) / CELL_M));
    (buckets[b] ??= []).push(id);
    if (b < lowest) lowest = b;
  };

  for (const offset of [0, -0.1, 0.1, -0.2, 0.2]) {
    const s = createFlightState({
      eastM: start.eastM, northM: start.northM, altitudeM, mode,
      headingRad: (heading0 + offset + 2 * Math.PI) % (2 * Math.PI), iasMs: MODE_IAS_MS[mode],
    });
    if (clearance(s.eastM, s.northM, s.headingRad) <= 0) continue;
    const bin = binOf(s, cellOf(s.eastM, s.northM));
    if (seen.has(bin)) continue;
    seen.add(bin);
    keep(s, -1, 0, startToGo, cellOf(s.eastM, s.northM));
  }

  const reached = (): number =>
    kept.length === 0 ? start.km : kmAt(kept[bestId]!.eastM, kept[bestId]!.northM);
  let expanded = 0;
  let bestToGo = startToGo;
  let bestId = 0;
  let arrived = -1;
  search: while (lowest < buckets.length) {
    const bucket = buckets[lowest];
    if (!bucket || bucket.length === 0) {
      lowest++;
      continue;
    }
    if (expanded >= budget) return none("budget", reached(), expanded);
    const id = bucket.pop()!;
    expanded++;
    for (const roll of RUN_ROLLS) {
      const t = advance(kept[id]!, roll);
      if (t === null) continue;
      const cell = cellOf(t.eastM, t.northM);
      if (cell < 0) continue;
      const toGo = togo[cell]!;
      if (!Number.isFinite(toGo)) continue;
      if (crossed(t.eastM, t.northM)) {
        keep(t, id, roll, toGo, cell);
        arrived = kept.length - 1;
        break search;
      }
      const bin = binOf(t, cell);
      if (seen.has(bin)) continue;
      seen.add(bin);
      keep(t, id, roll, toGo, cell);
      if (toGo < bestToGo) {
        bestToGo = toGo;
        bestId = kept.length - 1;
      }
    }
  }
  if (arrived < 0) return none(kept.length === 0 ? "no air" : "exhausted", reached(), expanded);

  // Replay it from the first frame, as the game would fly it.
  const rolls: number[] = [];
  let origin = arrived;
  for (let i = arrived; parentOf[i]! >= 0; i = parentOf[i]!) {
    rolls.push(rollOf[i]!);
    origin = parentOf[i]!;
  }
  rolls.reverse();
  const replay: FlightState = { ...kept[origin]! };
  let least = Infinity;
  let frames = 0;
  for (const roll of rolls) {
    input.roll = roll;
    for (let f = 0; f < RUN_FRAMES; f++) {
      step(replay, input, env, RUN_DT_S);
      replay.altitudeM = altitudeM;
      replay.verticalRateMs = 0;
      frames++;
      least = Math.min(least, clearance(replay.eastM, replay.northM, replay.headingRad));
    }
  }
  const flown = least > 0 && crossed(replay.eastM, replay.northM);
  const first = kept[origin]!;
  return {
    order,
    start: { eastM: first.eastM, northM: first.northM, headingRad: first.headingRad },
    altitudeM, marginM, mode, flown,
    reachedKm: flown ? stations[finishAt]!.km : kmAt(replay.eastM, replay.northM),
    outcome: flown ? "flown" : "exhausted",
    expanded, rolls, leastClearanceM: least, frames,
  };
}

export interface RoomWalk {
  readonly altitudeM: number;
  /** One per station, the same order as `course.stations`. */
  readonly rooms: readonly TurningRoom[];
  /**
   * The least room anywhere on the course, leaving out `RUN_INSET_KM` at each
   * end -- where the area's edge rather than the ground can be what stops a
   * disc, and the run neither starts nor finishes.
   */
  readonly narrowest: { readonly km: number; readonly room: TurningRoom; readonly eastM: number; readonly northM: number };
  /** The full-bank reversal at `low`, settled, at this altitude. */
  readonly reversalM: number;
  /** Kilometres of course where that reversal fits, and where it first does. */
  readonly fitsKm: number;
  readonly firstFitKm: number | null;
  /**
   * Of those, the kilometres with wall standing above the aeroplane within a
   * kilometre -- a turn made *in* the gorge rather than over it (F55).
   */
  readonly fitsInsideKm: number;
}

/**
 * F55's turning room at every station of the course, at one level.
 *
 * Level rather than a height over each station's own ground, because a run
 * is flown level and this is the same air the run is searched in. Over a
 * reservoir the two are the same number; down a falling river they are not,
 * and the report prints what the level is over the water at each place.
 */
export function walkRoom(turning: AreaTurning, course: Course, altitudeM: number): RoomWalk {
  const stations = course.stations;
  const rooms = stations.map((s) => turning.roomAt(s.eastM, s.northM, altitudeM));
  const inside = (i: number) =>
    stations[i]!.km >= RUN_INSET_KM && stations[i]!.km <= course.lengthKm - RUN_INSET_KM;
  let at = -1;
  for (let i = 0; i < rooms.length; i++)
    if (inside(i) && (at < 0 || rooms[i]!.roomM < rooms[at]!.roomM)) at = i;
  const reversalM = reversalWidthM(altitudeM, "low");
  let fitsKm = 0;
  let fitsInsideKm = 0;
  let firstFitKm: number | null = null;
  for (let i = 1; i < rooms.length; i++) {
    if (rooms[i]!.roomM < reversalM) continue;
    firstFitKm ??= stations[i]!.km;
    const stepKm = stations[i]!.km - stations[i - 1]!.km;
    fitsKm += stepKm;
    if (stations[i]!.rimM > altitudeM) fitsInsideKm += stepKm;
  }
  const s = stations[Math.max(0, at)]!;
  return {
    altitudeM,
    rooms,
    narrowest: { km: s.km, room: rooms[Math.max(0, at)]!, eastM: s.eastM, northM: s.northM },
    reversalM,
    fitsKm,
    firstFitKm,
    fitsInsideKm,
  };
}

/** Levels over each course's sill that the whole course's room is walked at. */
export const WALK_LEVELS_M = [100, 200, 400, 800] as const;

/** Levels over the sill the run is searched at. */
export const RUN_LEVELS_M = [50, 100, 200] as const;

/**
 * Room either side of the track the ground must also leave. The flights the
 * search finds graze the ground -- it asks for clearance and not comfort --
 * so this is the number that says how exactly a run would have to be flown.
 * A flight with room either side is also a flight with less, so the widest
 * margin flown at a level settles every margin under it.
 */
export const RUN_MARGINS_M = [0, 25, 50, 100] as const;

/** States a search may expand before it gives up. */
export const RUN_BUDGET = 400_000;

/** Both orders, because each finds flights the other prunes. */
export const RUN_ORDERS = ["middle", "line"] as const;

export interface ReachOfArea {
  readonly area: string;
  readonly course: Course;
  /** The 90 m ground under each held place, bilinear: "over the water" is from here. */
  readonly water: Readonly<Record<string, number>>;
  readonly walks: readonly RoomWalk[];
  /**
   * One list per level in `RUN_LEVELS_M`: for each margin, the flight found,
   * or the searches that did not find one -- both orders.
   */
  readonly runs: readonly (readonly Run[])[];
  /** Kilometres of course, inside the insets, with wall above each run level. */
  readonly underWallKm: readonly number[];
}

/**
 * Every hero area's river, its narrowest place, and whether it can be flown.
 *
 * The areas and their places come from what was built, as `reachesOf` does:
 * an area over places on a river is measured by being published.
 */
export function reachesThrough(
  corridor: Corridor,
  options: { readonly runs?: boolean; readonly budget?: number } = {},
): ReachOfArea[] {
  const hero = corridor.hero;
  if (!hero) return [];
  const { runs = true, budget = RUN_BUDGET } = options;
  const out: ReachOfArea[] = [];
  for (const turning of heroAreas(corridor)) {
    const places = Object.entries(corridor.manifest.anchors)
      .filter(([, a]) => turning.holds(a.eastM, a.northM))
      .map(([place, a]) => ({ place, eastM: a.eastM, northM: a.northM }));
    const course = courseThrough(turning, places);
    if (!course) continue;
    const water: Record<string, number> = {};
    for (const p of places) water[p.place] = hero.groundAt(p.eastM, p.northM) ?? turning.groundAt(p.eastM, p.northM);
    const groundAt = (eastM: number, northM: number) => hero.groundAt(eastM, northM);

    const ladder: Run[][] = [];
    if (runs)
      for (const above of RUN_LEVELS_M) {
        const tried: Run[] = [];
        // Widest first: once a margin is flown every narrower one is too,
        // so the ladder is climbed down and stops at the first flight.
        for (const marginM of [...RUN_MARGINS_M].reverse()) {
          let flown = false;
          for (const order of RUN_ORDERS) {
            const run = flyCourse(turning, course, groundAt, { altitudeM: course.sillM + above, marginM, budget, order });
            tried.push(run);
            if (run.flown) {
              flown = true;
              break;
            }
          }
          if (flown) break;
        }
        ladder.push(tried);
      }

    const inset = course.stations.filter((s) => s.km >= RUN_INSET_KM && s.km <= course.lengthKm - RUN_INSET_KM);
    const underWallKm = RUN_LEVELS_M.map((above) => {
      let km = 0;
      for (let i = 1; i < inset.length; i++)
        if (inset[i]!.rimM > course.sillM + above) km += inset[i]!.km - inset[i - 1]!.km;
      return km;
    });

    out.push({
      area: turning.area,
      course,
      water,
      walks: WALK_LEVELS_M.map((above) => walkRoom(turning, course, course.sillM + above)),
      runs: ladder,
      underWallKm,
    });
  }
  return out;
}
