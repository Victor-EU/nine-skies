/**
 * The ground patch: the world under one challenge, cut from a built corridor
 * and committed to the repository so the flown gate (D38) can run on a
 * machine that has no world at all (D39).
 *
 * D21 did this for expeditions and the argument is the same, but the artefact
 * cannot be. A route asks the world a one-dimensional question — *what is the
 * ground at this distance along this line?* — so `profileAlong` reduces 9.8 MB
 * to 2,932 numbers before the first flight starts, and those numbers are the
 * section. A challenge has no line. It is a set of points with conditions
 * over them, and the path between them is discovered by flying rather than
 * authored, so there is no distance to index by and no profile to cut.
 *
 * What there is, is a lattice. The world is Int16 samples one kilometre apart
 * and `groundAt` is bilinear between four of them, so the two-dimensional
 * question has a finite answer too: **the cells the flight can reach.** That
 * is what this commits — a swath of the world's own lattice, one row of spans
 * per kilometre of northing, following the course the probe is steered along
 * and as wide as the aeroplane's own turn.
 *
 * Two things fall out of committing the lattice rather than a resampling of
 * it, and both were measured (F44).
 *
 * **There is no rounding to choose.** A section stores answers: elevations
 * interpolated at stations along a slanted line, kept to one decimal place
 * because whole metres move Expedition 1's arrival by 3.2 m and decimetres by
 * 14 mm. A patch stores the numbers the pipeline wrote, so bilinear
 * interpolation over a patch and over the corridor it was cut from agree to
 * *zero* metres, at every one of the 4,740 ground reads a flight makes. The
 * drift tolerance is therefore exactly zero, which is a stronger claim than
 * any other committed artefact in this repository makes.
 *
 * **The shape is the swath and not the box.** For the one authored challenge
 * the difference is 83 % against 100 % and would not be worth writing. For the
 * challenge the GDD names next — the Great Wall sunset race, 1,801 km from
 * Shanhaiguan to Jiayuguan — the box is 216,818 cells and the swath 36,535, so
 * it is wrong by a factor of six on a straight line and seventeen once the
 * course is allowed to wander off it. The row-span form was cheaper than
 * finding that out afterwards, and it costs nothing on the compact case.
 *
 * What makes a derived file committed next to its source safe is that it can
 * be caught being stale, and this one is caught twice. Deliberately, by the
 * places and the course it was cut from, which name the edit that invalidated
 * it; and unavoidably, by the flight — a challenge whose ground has moved out
 * from under it reads off the edge of the patch, and a flight that reads no
 * ground is now a failure rather than a silent pass, which is the hole
 * cutting this found (F44).
 *
 * The cut is signed (D23) by the same key and for the same reason: the only
 * way to change the ground under a challenge is to cut it from a world again.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Challenge } from "../content/schema.ts";
import { reversalWidthM } from "../engine/src/sim/flight.ts";
import { MODE_IAS_MS, type SpeedMode } from "../engine/src/sim/scale.ts";
import { projectAlbers } from "../engine/src/terrain/worldGrid.ts";
import { flownCourse, placesOf } from "./challenge.ts";
import {
  drawnGap,
  unvouchedGround,
  type Corridor,
  type GroundField,
  type Waypoint,
} from "./corridor.ts";
import { PUBLIC_KEY_FILE, type Signer, type Verifier } from "./attest.ts";

/** 2 added the digest of what stage 3 carved the world with (F61). */
export const PATCH_VERSION = 2;

/**
 * How far a patch may sit from the world it was cut from, metres.
 *
 * Zero, and it is measured rather than aspirational: a patch is a subset of
 * the lattice rather than a resampling of it, so there is no rounding for a
 * tolerance to cover. Any disagreement at all is a rebuilt world that never
 * reached the artefact.
 */
export const PATCH_DRIFT_TOLERANCE_M = 0;

/** How far the recomputed course may sit from the stored one, km. */
const COURSE_TOLERANCE_KM = 0.01;

export interface PatchPlace {
  readonly what: string;
  readonly lat: number;
  readonly lon: number;
}

/** One row of the lattice: a run of samples starting at `i0`, northing `j`. */
export interface PatchRow {
  readonly j: number;
  readonly i0: number;
  /** Ground elevation in whole metres, exactly as the pipeline wrote it. */
  readonly m: readonly number[];
}

export interface GroundPatch {
  readonly version: number;
  readonly challenge: string;
  readonly cutFrom: {
    readonly corridor: string;
    readonly resolutionM: number;
    readonly heightsSha256: string;
    /** The source rasters behind that heightfield (D24). */
    readonly sourceSha256: string;
    /** What stage 3 carved the world with (F61); see `RouteSection`. */
    readonly conditionedSha256: string;
  };
  /** Every place the challenge names, so a moved one can be named back. */
  readonly places: readonly PatchPlace[];
  /** The polyline the swath follows, in kilometres from the country origin. */
  readonly course: readonly { readonly eastKm: number; readonly northKm: number }[];
  /** Half-width of the swath, km: the aeroplane's own reversal, rounded up. */
  readonly marginKm: number;
  /** Cells the margin asked for that the world did not have. */
  readonly clippedByWorld: number;
  readonly rows: readonly PatchRow[];
  /** Ed25519 over `attestation(patch)`, base64. See `attest.ts` (D23). */
  readonly signature: string;
}

/**
 * How wide the committed ground has to be: the aeroplane's own full-bank
 * reversal at the challenge's speed and starting height, from cruise.
 *
 * The same number F43 measures a gate against, used for a second purpose.
 * It is the widest a probe steering towards a course point can end up off
 * that course, because it is the widest the aircraft can be displaced by a
 * turn it is able to make. Measured, the one authored challenge strays 200 m
 * from its course and flies identically on half a kilometre either side; this
 * gives it nine, and the difference between 224 cells and 1,726 is 10 kB. The
 * cheapest insurance in the repository, and the case for insurance is that
 * the failure it buys off is invisible rather than loud (F44).
 *
 * Derived from the challenge alone, so a reader with no world recomputes it
 * and a changed speed or starting altitude invalidates the patch by itself.
 */
export function marginKmFor(c: Challenge): number {
  const mode = c.speed as SpeedMode;
  return Math.ceil(reversalWidthM(c.start.altitude_m, mode, { fromIasMs: MODE_IAS_MS.cruise }) / 1000);
}

/** Distance from a lattice cell to the nearest point of the course, metres. */
function distanceToCourse(i: number, j: number, course: readonly Waypoint[]): number {
  const eastM = i * 1000;
  const northM = j * 1000;
  let best = Infinity;
  for (let k = 0; k + 1 < course.length; k++) {
    const a = course[k]!;
    const b = course[k + 1]!;
    const vx = b.eastM - a.eastM;
    const vy = b.northM - a.northM;
    const len2 = vx * vx + vy * vy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((eastM - a.eastM) * vx + (northM - a.northM) * vy) / len2));
    best = Math.min(best, Math.hypot(eastM - (a.eastM + t * vx), northM - (a.northM + t * vy)));
  }
  // A one-point course is a challenge with a single objective at its start;
  // the distance is to the point rather than to a segment.
  if (best === Infinity && course[0])
    best = Math.hypot(eastM - course[0].eastM, northM - course[0].northM);
  return best;
}

/**
 * The rows of lattice within `marginM` of a course, clipped to what a world
 * actually has.
 *
 * Dilated by one cell beyond the margin before clipping, because a point
 * inside the swath is interpolated from the four cells around it and the two
 * on the far side are outside it. Without the ring the usable region is the
 * swath minus a kilometre, which is the kind of off-by-one that shows up as a
 * flight that mysteriously stops a kilometre short of a gate.
 */
export function swathRows(
  world: Pick<Corridor, "sampleAtKm">,
  course: readonly Waypoint[],
  marginM: number,
): { rows: PatchRow[]; clippedByWorld: number } {
  const easts = course.map((p) => p.eastM / 1000);
  const norths = course.map((p) => p.northM / 1000);
  const pad = marginM / 1000 + 2;
  const i0 = Math.floor(Math.min(...easts) - pad);
  const i1 = Math.ceil(Math.max(...easts) + pad);
  const j0 = Math.floor(Math.min(...norths) - pad);
  const j1 = Math.ceil(Math.max(...norths) + pad);

  const inside = (i: number, j: number): boolean => distanceToCourse(i, j, course) <= marginM;
  // The ring: a cell is in the patch if it or any neighbour is in the margin.
  const wanted = (i: number, j: number): boolean => {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (inside(i + di, j + dj)) return true;
    return false;
  };

  const rows: PatchRow[] = [];
  let clippedByWorld = 0;
  for (let j = j0; j <= j1; j++) {
    let from = -1;
    let to = -1;
    for (let i = i0; i <= i1; i++) {
      if (!wanted(i, j)) continue;
      if (world.sampleAtKm(i, j) === null) {
        clippedByWorld++;
        continue;
      }
      if (from < 0) from = i;
      to = i;
    }
    if (from < 0) continue;
    const m: number[] = [];
    for (let i = from; i <= to; i++) m.push(world.sampleAtKm(i, j) ?? 0);
    rows.push({ j, i0: from, m });
  }
  return { rows, clippedByWorld };
}

/**
 * The bytes a signature covers: every field of a patch except the signature.
 *
 * Spelled out field by field for the same reason as a section's: a file whose
 * keys have been reordered or reflowed still verifies, and one with a digit
 * changed anywhere does not.
 */
export function attestation(patch: Omit<GroundPatch, "signature">): string {
  const { cutFrom } = patch;
  return [
    `nineskies/patch v${patch.version}`,
    patch.challenge,
    `${cutFrom.corridor} ${cutFrom.resolutionM} m ${cutFrom.heightsSha256} ${cutFrom.sourceSha256} ${cutFrom.conditionedSha256}`,
    patch.places.map((p) => `${p.what} ${p.lat} ${p.lon}`).join(" | "),
    patch.course.map((p) => `${p.eastKm} ${p.northKm}`).join(" | "),
    `margin ${patch.marginKm} km, clipped ${patch.clippedByWorld}`,
    patch.rows.map((r) => `${r.j}@${r.i0}:${r.m.join(",")}`).join("\n"),
  ].join("\n");
}

const round = (x: number, places: number): number => Number(x.toFixed(places));

/**
 * Every cell of a patch as a position, for a check that needs metres.
 *
 * A patch is stored in lattice indices because that is what makes it a subset
 * of the world rather than a resampling of it (D39). Anything asking a
 * question about *where* it is -- which hero area is over it, say -- needs the
 * other spelling, and the conversion is the 1 km grid's own definition.
 */
export function patchPoints(patch: Pick<GroundPatch, "rows">): Waypoint[] {
  const points: Waypoint[] = [];
  for (const row of patch.rows)
    for (let k = 0; k < row.m.length; k++)
      points.push({ eastM: (row.i0 + k) * 1000, northM: row.j * 1000 });
  return points;
}

export function cellCount(patch: GroundPatch): number {
  return patch.rows.reduce((n, r) => n + r.m.length, 0);
}

/**
 * Cut a patch, or say why this corridor cannot cut one.
 *
 * Refuses on the two things that would produce a committed file that looks
 * right: a world that does not cover the places the challenge names, and a
 * heightfield that does not match its own manifest. The third refusal a
 * section has — the route leaving the corridor — has no analogue, because the
 * patch is *defined* as the part of the world under the challenge; what
 * corresponds to it is `clippedByWorld`, recorded rather than fatal, and the
 * flight the cutter runs afterwards is what decides whether the clipping
 * mattered.
 */
export function cutPatch(
  c: Challenge,
  corridor: Corridor,
  sign: Signer,
): { patch: GroundPatch } | { problem: string } {
  const uncovered = placesOf(c).filter((p) => {
    const { eastM, northM } = projectAlbers(p.lat, p.lon);
    return !corridor.covers(eastM, northM);
  });
  if (uncovered.length)
    return {
      problem:
        `corridor ${corridor.manifest.corridor} has no ground under ` +
        `${uncovered.map((p) => p.what).join(", ")}; a patch cut from it would ` +
        `commit sea level under the challenge`,
    };

  const claimed = corridor.manifest.heights.sha256;
  if (corridor.heightsSha256 !== claimed)
    return {
      problem:
        `corridor ${corridor.manifest.corridor} does not match its own manifest — ` +
        `heights.bin hashes to ${corridor.heightsSha256.slice(0, 12)}…, the manifest ` +
        `says ${claimed.slice(0, 12)}…. Rebuild it with \`make world CORRIDOR=` +
        `${corridor.manifest.corridor}\` rather than cutting from it`,
    };

  const marginKm = marginKmFor(c);
  const course = flownCourse(c);
  const { rows, clippedByWorld } = swathRows(corridor, course, marginKm * 1000);
  if (!rows.length)
    return { problem: `nothing to cut — ${corridor.manifest.corridor} has no lattice under the course` };

  // The third refusal, and the same one a section has: this patch would be a
  // faithful cut of a surface the game does not draw here. See `cutSection`
  // for why it refuses rather than quietly cutting from the finer grid.
  const cells = patchPoints({ rows });
  const blank = unvouchedGround(corridor, cells);
  if (blank.over > 0)
    return {
      problem:
        `${blank.over} of ${blank.of} cells read 0 m inside tiles the source only ` +
        `partly reached; the patch would commit sea level there and the challenge ` +
        `would be flown over it (F44, F54)`,
    };

  const gap = drawnGap(corridor, cells);
  if (gap.over > 0)
    return {
      problem:
        `${gap.over} of ${gap.of} cells are under ${gap.areas.join(", ")}, which the ` +
        `game draws at 90 m. A patch cut from the 1 km grid would put the ground ` +
        `${gap.worstM.toFixed(0)} m from what the player flies over at its worst ` +
        `(${gap.countryM.toFixed(0)} m against ${gap.heroM.toFixed(0)} m). ` +
        `Which grid content is cut from is an open decision (F51, F53)`,
    };

  const unsigned = {
    version: PATCH_VERSION,
    challenge: c.id,
    cutFrom: {
      corridor: corridor.manifest.corridor,
      resolutionM: corridor.manifest.resolutionM,
      heightsSha256: corridor.heightsSha256,
      sourceSha256: corridor.manifest.source?.sha256 ?? "unrecorded",
      conditionedSha256: corridor.manifest.conditioning?.sha256 ?? "unconditioned",
    },
    places: placesOf(c),
    course: course.map((p) => ({ eastKm: round(p.eastM / 1000, 3), northKm: round(p.northM / 1000, 3) })),
    marginKm,
    clippedByWorld,
    rows,
  };
  return { patch: { ...unsigned, signature: sign(attestation(unsigned)) } };
}

/**
 * Why this patch does not describe this challenge, or null if it does.
 *
 * Every check here runs with no world, and the message names the edit to
 * re-cut for. What it deliberately does not try to do is enumerate every
 * field that could move the flight: an objective's radius changes where the
 * probe turns, and no amount of comparing files will notice. That case is
 * covered by flying — a flight that reads off the patch is a failure (F44) —
 * so this only has to be good at the diagnosis, not at the safety.
 */
export function verifyPatch(
  patch: GroundPatch,
  c: Challenge,
  verify: Verifier | null,
): string | null {
  if (patch.version !== PATCH_VERSION)
    return `patch format v${patch.version}, this build reads v${PATCH_VERSION}`;
  if (patch.challenge !== c.id) return `patch is for ${patch.challenge}, not ${c.id}`;

  if (!verify)
    return (
      `no cutting key committed, so no patch can be attested — expected one ` +
      `at content/sections/${PUBLIC_KEY_FILE}`
    );
  if (!patch.signature) return `patch is unsigned; re-cut it with \`npm run content:patches\``;
  const { signature, ...unsigned } = patch;
  if (!verify(attestation(unsigned), signature))
    return (
      `the signature does not match the file — its ground was edited after it ` +
      `was cut, or it was cut with a different key. Ground comes from a world: ` +
      `re-cut it with \`npm run content:patches\``
    );

  const places = placesOf(c);
  if (places.length !== patch.places.length)
    return `challenge names ${places.length} places, patch was cut from ${patch.places.length}`;
  for (let i = 0; i < places.length; i++) {
    const a = places[i]!;
    const s = patch.places[i]!;
    if (a.what !== s.what) return `place ${i} is now ${a.what}, was ${s.what}`;
    if (Math.abs(a.lat - s.lat) > 1e-9 || Math.abs(a.lon - s.lon) > 1e-9)
      return (
        `${a.what} has moved to ${a.lat}, ${a.lon} since the patch was cut at ` +
        `${s.lat}, ${s.lon}`
      );
  }

  const margin = marginKmFor(c);
  if (margin !== patch.marginKm)
    return (
      `the challenge now wants ${margin} km of ground either side of its course ` +
      `and the patch holds ${patch.marginKm} — its speed or its starting height ` +
      `has changed`
    );

  const course = flownCourse(c);
  if (course.length !== patch.course.length)
    return `the course is now ${course.length} points, the patch was cut along ${patch.course.length}`;
  for (let i = 0; i < course.length; i++) {
    const a = course[i]!;
    const s = patch.course[i]!;
    if (
      Math.abs(a.eastM / 1000 - s.eastKm) > COURSE_TOLERANCE_KM ||
      Math.abs(a.northM / 1000 - s.northKm) > COURSE_TOLERANCE_KM
    )
      return (
        `course point ${i} is now at ${(a.eastM / 1000).toFixed(2)}, ` +
        `${(a.northM / 1000).toFixed(2)} km, the patch was cut along ` +
        `${s.eastKm}, ${s.northKm}`
      );
  }
  return null;
}

/**
 * The patch's own lattice: the same question a corridor's `sampleAtKm` answers.
 *
 * Exported because a patch is a world as far as cutting is concerned — a
 * narrower patch can be cut out of a wider one with no rasters in the room,
 * which is how the failure that F44 names is a test rather than an anecdote.
 */
export function patchSampler(patch: GroundPatch): (i: number, j: number) => number | null {
  const byRow = new Map(patch.rows.map((r) => [r.j, r]));
  return (i, j) => {
    const row = byRow.get(j);
    if (!row) return null;
    const k = i - row.i0;
    return k >= 0 && k < row.m.length ? row.m[k]! : null;
  };
}

/**
 * The patch as the flown check consumes it: the same two questions a corridor
 * answers, over committed numbers.
 *
 * `covers` asks for all four cells of the bilinear stencil rather than two
 * opposite corners the way a corridor can, because a swath is not a rectangle
 * and the corners of a stencil straddling the edge of a row are not enough to
 * decide the other two.
 */
export function patchGround(patch: GroundPatch): GroundField {
  const sample = patchSampler(patch);
  return {
    covers(eastM, northM) {
      const i = Math.floor(eastM / 1000);
      const j = Math.floor(northM / 1000);
      return (
        sample(i, j) !== null &&
        sample(i + 1, j) !== null &&
        sample(i, j + 1) !== null &&
        sample(i + 1, j + 1) !== null
      );
    },
    groundAt(eastM, northM) {
      const ex = eastM / 1000;
      const ny = northM / 1000;
      const i = Math.floor(ex);
      const j = Math.floor(ny);
      const fx = ex - i;
      const fy = ny - j;
      return (
        (sample(i, j) ?? 0) * (1 - fx) * (1 - fy) +
        (sample(i + 1, j) ?? 0) * fx * (1 - fy) +
        (sample(i, j + 1) ?? 0) * (1 - fx) * fy +
        (sample(i + 1, j + 1) ?? 0) * fx * fy
      );
    },
  };
}

/** The largest disagreement between a patch and the world beside it. */
export function maxPatchDriftM(patch: GroundPatch, corridor: Corridor): number {
  let worst = 0;
  for (const row of patch.rows)
    for (let k = 0; k < row.m.length; k++) {
      const world = corridor.sampleAtKm(row.i0 + k, row.j);
      // A cell the world no longer has is a rebuilt window rather than a
      // changed elevation, and it is as much a stale patch as a moved number.
      if (world === null) return Infinity;
      worst = Math.max(worst, Math.abs(row.m[k]! - world));
    }
  return worst;
}

export function patchPath(dir: string, id: string): string {
  return join(dir, `${id}.json`);
}

export function readPatch(dir: string, id: string): GroundPatch | null {
  const path = patchPath(dir, id);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as GroundPatch;
}

/**
 * Written one row of lattice to a line.
 *
 * A row is a place on the map, so a rebuild that moves one ridge touches the
 * rows that ridge crosses and nothing else. The section wraps at twelve
 * stations for the same reason; here the natural width is already there.
 */
export function renderPatch(patch: GroundPatch): string {
  const head = JSON.stringify({ ...patch, rows: "@@ROWS@@" }, null, 2);
  const rows = patch.rows.map(
    (r) => `    { "j": ${r.j}, "i0": ${r.i0}, "m": [${r.m.join(", ")}] }`,
  );
  return `${head.replace('"@@ROWS@@"', `[\n${rows.join(",\n")}\n  ]`)}\n`;
}

export function writePatch(dir: string, patch: GroundPatch): { path: string; changed: boolean } {
  const text = renderPatch(patch);
  const path = patchPath(dir, patch.challenge);
  const changed = !existsSync(path) || readFileSync(path, "utf8") !== text;
  if (changed) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, text);
  }
  return { path, changed };
}
