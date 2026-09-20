/**
 * The route section: the ground under one expedition, cut from a built world
 * and committed to the repository so the flown checks (D17, D19) can run on a
 * machine that has no world at all.
 *
 * The corridor itself cannot be the artefact. Sea to Sky's heightfield is
 * 9.8 MB for one expedition and phase 2's country grid is ~70 GB, both built
 * from 14 GB of source rasters that CI has no business downloading. But the
 * check never asks the world a question with two dimensions in it: it asks
 * for the ground at a distance along a line, and `profileAlong` has already
 * reduced 9.8 MB to 2,932 numbers before the first flight starts. Those
 * numbers are the artefact. They are under a quarter of one per cent of the
 * corridor and they do not grow when the corridor does.
 *
 * They are kept to one decimal place, which is measured rather than tidy.
 * Whole metres cost 5 kB less and move Expedition 1's lowest arrival by
 * 3.2 m - six times the half-metre of rounding that caused it, because the
 * floor search and the arrival bisection each compound a perturbation in the
 * ground. Decimetres move it by 14 mm, so every number CI prints is the
 * number the author's own machine printed, which is the whole point of
 * committing the file.
 *
 * What makes a derived file committed next to its source safe is that it can
 * be caught being stale. A section carries the waypoints it was cut from, so
 * an edited route invalidates it and says which waypoint moved; the leg
 * lengths, which any machine can recompute from the projection without a
 * world; and the SHA of the heightfield it was read out of, so the build it
 * came from is nameable. A machine that does have a world re-cuts and
 * compares (`maxDriftM`), which is the check CI cannot do for itself.
 *
 * What a section does NOT prove is that its numbers are real elevations. A
 * hand-edited array passes every check here. That provenance belongs to the
 * pipeline and its golden probes, which is where it already lives.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { projectAlbers } from "../engine/src/terrain/worldGrid.ts";
import type { Expedition } from "../content/schema.ts";
import {
  firstUncoveredKm,
  measureAlong,
  profileAlong,
  type Corridor,
  type ProfiledRoute,
} from "./corridor.ts";
import { projectedWaypoints } from "./expedition.ts";

export const SECTION_VERSION = 1;

/**
 * How far the recomputed leg lengths may sit from the stored ones, km.
 *
 * They are the same arithmetic on the same doubles, so the only difference a
 * fresh checkout can legitimately produce is the three decimal places the
 * file keeps. Anything larger means the projection moved under the route,
 * which moves the ground the section is holding.
 */
const LEG_TOLERANCE_KM = 0.01;

export interface SectionWaypoint {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
}

export interface RouteSection {
  readonly version: number;
  readonly expedition: string;
  readonly cutFrom: {
    readonly corridor: string;
    readonly resolutionM: number;
    readonly heightsSha256: string;
  };
  readonly waypoints: readonly SectionWaypoint[];
  readonly legEndKm: readonly number[];
  readonly lengthKm: number;
  /** Ground elevation at one-kilometre stations, metres to one decimal. */
  readonly groundM: readonly number[];
}

export function waypointsOf(expedition: Expedition): SectionWaypoint[] {
  return expedition.route.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon }));
}

const round = (x: number, places: number): number => Number(x.toFixed(places));

/**
 * Cut a section, or say why this corridor cannot cut one.
 *
 * A corridor is a strip, and `groundAt` reads zero outside it. Cutting a
 * section from a corridor the route leaves would commit sea level under a
 * mountain range, so coverage is checked at every station before anything is
 * written.
 */
export function cutSection(
  expedition: Expedition,
  corridor: Corridor,
): { section: RouteSection } | { problem: string } {
  const projected = projectedWaypoints(expedition);
  const outside = firstUncoveredKm(corridor, projected);
  if (outside >= 0)
    return {
      problem:
        `the route leaves corridor ${corridor.manifest.corridor} at km ${outside}; ` +
        `ground there would read as sea level`,
    };

  const profiled = profileAlong(corridor, projected);
  return {
    section: {
      version: SECTION_VERSION,
      expedition: expedition.id,
      cutFrom: {
        corridor: corridor.manifest.corridor,
        resolutionM: corridor.manifest.resolutionM,
        heightsSha256: corridor.manifest.heights.sha256,
      },
      waypoints: waypointsOf(expedition),
      legEndKm: profiled.legEndKm.map((km) => round(km, 3)),
      lengthKm: round(profiled.lengthKm, 3),
      groundM: profiled.profileM.map((m) => Math.round(m * 10) / 10),
    },
  };
}

/**
 * Why this section does not describe this route, or null if it does.
 *
 * The message names the thing to fix, because the only useful form of "your
 * committed artefact is stale" is one that says which edit made it so.
 */
export function verifySection(section: RouteSection, expedition: Expedition): string | null {
  if (section.version !== SECTION_VERSION)
    return `section format v${section.version}, this build reads v${SECTION_VERSION}`;
  if (section.expedition !== expedition.id)
    return `section is for ${section.expedition}, not ${expedition.id}`;

  const authored = waypointsOf(expedition);
  if (section.waypoints.length !== authored.length)
    return `route has ${authored.length} waypoints, section was cut from ${section.waypoints.length}`;
  for (let i = 0; i < authored.length; i++) {
    const a = authored[i]!;
    const s = section.waypoints[i]!;
    if (Math.abs(a.lat - s.lat) > 1e-9 || Math.abs(a.lon - s.lon) > 1e-9)
      return (
        `waypoint ${i} (${a.id}) has moved to ${a.lat}, ${a.lon} since the ` +
        `section was cut at ${s.lat}, ${s.lon}`
      );
    if (a.id !== s.id) return `waypoint ${i} is now ${a.id}, was ${s.id}`;
  }

  // The geometry half, which needs no world: if the projection or the leg
  // arithmetic has moved, the stored ground is under a different line.
  const metrics = measureAlong(expedition.route.map((p) => projectAlbers(p.lat, p.lon)));
  if (Math.abs(metrics.lengthKm - section.lengthKm) > LEG_TOLERANCE_KM)
    return `route is ${metrics.lengthKm.toFixed(2)} km, section was cut at ${section.lengthKm} km`;
  for (let i = 0; i < metrics.legEndKm.length; i++)
    if (Math.abs(metrics.legEndKm[i]! - (section.legEndKm[i] ?? NaN)) > LEG_TOLERANCE_KM)
      return `leg ${i} now ends at ${metrics.legEndKm[i]!.toFixed(2)} km, section says ${section.legEndKm[i]}`;

  const expected = Math.ceil(section.lengthKm) + 1;
  if (section.groundM.length !== expected)
    return `section holds ${section.groundM.length} stations for a ${expected}-station route`;
  return null;
}

/** The largest disagreement between a section and a freshly sampled profile. */
export function maxDriftM(section: RouteSection, profiled: ProfiledRoute): number {
  let worst = 0;
  const n = Math.min(section.groundM.length, profiled.profileM.length);
  for (let i = 0; i < n; i++)
    worst = Math.max(worst, Math.abs(section.groundM[i]! - profiled.profileM[i]!));
  return worst;
}

export function sectionPath(dir: string, id: string): string {
  return join(dir, `${id}.json`);
}

export function readSection(dir: string, id: string): RouteSection | null {
  const path = sectionPath(dir, id);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as RouteSection;
}

/**
 * Written with the ground wrapped sixteen stations to a line.
 *
 * One number per line would make a three-thousand-line diff out of a rebuild;
 * one line would make an unreadable one. Twelve keeps a changed ridge to the
 * handful of rows it actually crosses.
 */
export function renderSection(section: RouteSection): string {
  const head = JSON.stringify({ ...section, groundM: "@@GROUND@@" }, null, 2);
  const rows: string[] = [];
  for (let i = 0; i < section.groundM.length; i += 12)
    rows.push(`    ${section.groundM.slice(i, i + 12).join(", ")}`);
  return `${head.replace('"@@GROUND@@"', `[\n${rows.join(",\n")}\n  ]`)}\n`;
}

export function writeSection(
  dir: string,
  section: RouteSection,
): { path: string; changed: boolean } {
  const text = renderSection(section);
  const path = sectionPath(dir, section.expedition);
  const changed = !existsSync(path) || readFileSync(path, "utf8") !== text;
  if (changed) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, text);
  }
  return { path, changed };
}

/** The section's ground as the check consumes it: metres against kilometres. */
export function groundFromSection(section: RouteSection): (km: number) => number {
  const { groundM } = section;
  return (km) => groundM[Math.min(Math.max(0, Math.round(km)), groundM.length - 1)]!;
}
