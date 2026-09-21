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
 * None of that asks where the elevations came from, and for one release it
 * had no answer: a hand-edited array passed every check in this file. D23
 * gives it one. The cut is signed by the machine that made it and the section
 * carries the signature, so the only way to change the ground under a route
 * is to cut it from a world again (`attest.ts`, which is blunt about what a
 * signature does and does not buy). The other half of that answer is not
 * cryptographic: `pipeline/tests/test_section_probe.py` runs a golden probe
 * against this file, which is the first time one has run without a world.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { projectAlbers } from "../engine/src/terrain/worldGrid.ts";
import type { Expedition } from "../content/schema.ts";
import {
  drawnGap,
  firstUncoveredKm,
  measureAlong,
  profileAlong,
  stationsAlong,
  type Corridor,
  type ProfiledRoute,
} from "./corridor.ts";
import { projectedWaypoints } from "./expedition.ts";
import { PUBLIC_KEY_FILE, type Signer, type Verifier } from "./attest.ts";

/**
 * 2 added the signature (D23), 3 the source digest (D24). An older section
 * is not read rather than read leniently: the value of both fields is that
 * there is no path around them to fall back to.
 */
export const SECTION_VERSION = 3;

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
    /**
     * The digest of the source rasters behind that heightfield (D24), or
     * "unrecorded" for a world built before they were recorded. It names the
     * exact set without carrying several hundred hashes: the committed
     * record in `pipeline/sources/cop30.json` holds those, and every one of
     * them was corroborated against the mirror's own ETag when it was taken.
     */
    readonly sourceSha256: string;
  };
  readonly waypoints: readonly SectionWaypoint[];
  readonly legEndKm: readonly number[];
  readonly lengthKm: number;
  /** Ground elevation at one-kilometre stations, metres to one decimal. */
  readonly groundM: readonly number[];
  /** Ed25519 over `attestation(section)`, base64. See `attest.ts` (D23). */
  readonly signature: string;
}

/**
 * The bytes a signature covers: every field of a section except the
 * signature itself.
 *
 * Spelled out field by field rather than taken from the rendered file, so
 * that the signed thing is the section's *values*. A file whose keys have
 * been reordered, reindented or reflowed still verifies; a file with one
 * digit changed anywhere does not, which is the distinction that matters.
 */
export function attestation(section: Omit<RouteSection, "signature">): string {
  const { cutFrom } = section;
  return [
    `nineskies/section v${section.version}`,
    section.expedition,
    `${cutFrom.corridor} ${cutFrom.resolutionM} m ${cutFrom.heightsSha256} ${cutFrom.sourceSha256}`,
    section.waypoints.map((w) => `${w.id} ${w.lat} ${w.lon}`).join(" | "),
    `${section.legEndKm.join(" ")} of ${section.lengthKm}`,
    section.groundM.join(" "),
  ].join("\n");
}

export function waypointsOf(expedition: Expedition): SectionWaypoint[] {
  return expedition.route.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon }));
}

const round = (x: number, places: number): number => Number(x.toFixed(places));

/**
 * Cut a section, or say why this corridor cannot cut one.
 *
 * Three ways it refuses, and all three exist because the alternative is a
 * committed file that looks right.
 *
 * A corridor is a strip, and `groundAt` reads zero outside it, so cutting
 * from a corridor the route leaves would commit sea level under a mountain
 * range: coverage is checked at every station first.
 *
 * The heightfield is checked against its own manifest. The stamp a section
 * carries used to be copied from the manifest, which made it a claim about a
 * claim -- nothing in the repository had ever compared that SHA to the bytes
 * it names. It is now measured on the way past, and a corridor whose
 * heightfield does not match its manifest cuts nothing at all.
 *
 * And the cut is signed. A machine that can reach a world but not the cutting
 * key does not write an unsigned section (D23); `sign` throws, and the
 * message says where a key comes from.
 */
export function cutSection(
  expedition: Expedition,
  corridor: Corridor,
  sign: Signer,
): { section: RouteSection } | { problem: string } {
  const projected = projectedWaypoints(expedition);
  const outside = firstUncoveredKm(corridor, projected);
  if (outside >= 0)
    return {
      problem:
        `the route leaves corridor ${corridor.manifest.corridor} at km ${outside}; ` +
        `ground there would read as sea level`,
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

  // The fourth refusal, and the only one that is not about this file being
  // wrong: it is about the file being *right about the wrong surface*. Since
  // stage 6 the game draws 90 m ground over a hero area, and a section is cut
  // from the 1 km grid, so a route through one is checked to clear terrain
  // that is not the terrain it flies over. Through Tiger Leaping Gorge the
  // two differ by more than any clearance a route is held to.
  //
  // Refusing rather than cutting from `drawnAt` on the spot, because the
  // choice of grid is not this function's to make: every committed section
  // and patch was cut from `groundAt`, and changing that re-signs all of them
  // (D23, D24). Refusing makes the choice arrive at the moment the first
  // route needs it; cutting quietly would make it arrive as a route that
  // cleared in CI (F51, F53).
  const gap = drawnGap(corridor, stationsAlong(projected));
  if (gap.over > 0)
    return {
      problem:
        `${gap.over} of ${gap.of} stations are over ${gap.areas.join(", ")}, which ` +
        `the game draws at 90 m. A section cut from the 1 km grid would put the ` +
        `ground ${gap.worstM.toFixed(0)} m from what the player flies over at its ` +
        `worst (${gap.countryM.toFixed(0)} m against ${gap.heroM.toFixed(0)} m). ` +
        `Which grid content is cut from is an open decision (F51, F53)`,
    };

  const profiled = profileAlong(corridor, projected);
  const unsigned = {
    version: SECTION_VERSION,
    expedition: expedition.id,
    cutFrom: {
      corridor: corridor.manifest.corridor,
      resolutionM: corridor.manifest.resolutionM,
      heightsSha256: corridor.heightsSha256,
      sourceSha256: corridor.manifest.source?.sha256 ?? "unrecorded",
    },
    waypoints: waypointsOf(expedition),
    legEndKm: profiled.legEndKm.map((km) => round(km, 3)),
    lengthKm: round(profiled.lengthKm, 3),
    groundM: profiled.profileM.map((m) => Math.round(m * 10) / 10),
  };
  return { section: { ...unsigned, signature: sign(attestation(unsigned)) } };
}

/**
 * Why this section does not describe this route, or null if it does.
 *
 * The message names the thing to fix, because the only useful form of "your
 * committed artefact is stale" is one that says which edit made it so.
 */
export function verifySection(
  section: RouteSection,
  expedition: Expedition,
  verify: Verifier | null,
): string | null {
  if (section.version !== SECTION_VERSION)
    return `section format v${section.version}, this build reads v${SECTION_VERSION}`;
  if (section.expedition !== expedition.id)
    return `section is for ${section.expedition}, not ${expedition.id}`;

  // Before anything else, because every check below reads numbers out of this
  // file and none of them means anything if the file has been edited. The
  // remedy is the only legitimate way to change ground: cut it again (D23).
  if (!verify)
    return (
      `no cutting key committed, so no section can be attested — expected one ` +
      `at content/sections/${PUBLIC_KEY_FILE}`
    );
  if (!section.signature) return `section is unsigned; re-cut it with \`npm run content:sections\``;
  const { signature, ...unsigned } = section;
  if (!verify(attestation(unsigned), signature))
    return (
      `the signature does not match the file — its ground was edited after it ` +
      `was cut, or it was cut with a different key. Ground comes from a world: ` +
      `re-cut it with \`npm run content:sections\``
    );

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
 * Written with the ground wrapped twelve stations to a line.
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
