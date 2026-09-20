/**
 * The committed route section (D21).
 *
 * A derived file checked in beside its source is only safe if it can be
 * caught being stale, so most of this suite is about catching it. The two
 * world-gated tests at the bottom are the ones that need the data: that a
 * freshly cut section is the one already committed, and that a corridor
 * refuses to cut a route that leaves it.
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { loadCorridor } from "../../tools/corridor.ts";
import { loadExpedition } from "../../tools/expedition.ts";
import {
  cutSection,
  readSection,
  renderSection,
  verifySection,
  SECTION_VERSION,
  type RouteSection,
} from "../../tools/section.ts";
import type { Expedition } from "../../content/schema.ts";

const SECTIONS = "content/sections";
const built = existsSync("dist-world/sea-to-sky/manifest.json");

const seaToSky = (): Expedition => loadExpedition("content/expeditions/sea-to-sky.yaml");
const committed = (): RouteSection => readSection(SECTIONS, "sea-to-sky")!;

describe("the section committed for Expedition 1", () => {
  it("describes the route that is authored today", () => {
    // If this fails, someone edited the YAML and did not re-cut. It is the
    // cheapest test in the repo and it is the one that makes the rest of the
    // committed ground trustworthy.
    expect(verifySection(committed(), seaToSky())).toBeNull();
  });

  it("carries the build it came from", () => {
    const section = committed();
    expect(section.version).toBe(SECTION_VERSION);
    expect(section.cutFrom.resolutionM).toBe(1000);
    expect(section.cutFrom.heightsSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("holds one station per kilometre of route, plus the end", () => {
    const section = committed();
    expect(section.groundM).toHaveLength(Math.ceil(section.lengthKm) + 1);
    // Sea to Sky is 2,931 km of China and none of it is below the Turpan
    // depression or above Everest; a section full of zeroes would mean the
    // route had been cut from a corridor that does not cover it.
    expect(Math.min(...section.groundM)).toBeGreaterThan(-200);
    expect(Math.max(...section.groundM)).toBeGreaterThan(4000);
  });

  it("survives the round trip through its own file format", () => {
    // Every number the gate prints depends on the decimals coming back
    // exactly as they went in: whole metres move Expedition 1's arrival by
    // 3.2 m, which is the difference between 1,588 and 1,584 in the report.
    const section = committed();
    const reparsed = JSON.parse(renderSection(section)) as RouteSection;
    expect(reparsed.groundM).toEqual(section.groundM);
    expect(reparsed.lengthKm).toBe(section.lengthKm);
  });
});

describe("a section that no longer describes its route", () => {
  const withRoute = (mutate: (e: Expedition) => Expedition): string | null =>
    verifySection(committed(), mutate(seaToSky()));

  it("names the waypoint that moved", () => {
    const moved = withRoute((e) => ({
      ...e,
      route: e.route.map((p, i) => (i === 1 ? { ...p, lon: 114.9 } : p)),
    }));
    expect(moved).toMatch(/waypoint 1 \(wuhan\) has moved/);
  });

  it("catches a waypoint being added or removed", () => {
    expect(withRoute((e) => ({ ...e, route: e.route.slice(0, 3) }))).toMatch(
      /route has 3 waypoints, section was cut from 5/,
    );
  });

  it("catches the route being handed to the wrong expedition", () => {
    expect(withRoute((e) => ({ ...e, id: "silk-road" }))).toMatch(/section is for sea-to-sky/);
  });

  it("catches a format it cannot read", () => {
    const future = { ...committed(), version: SECTION_VERSION + 1 };
    expect(verifySection(future, seaToSky())).toMatch(/this build reads v/);
  });

  it("catches ground that has lost stations", () => {
    const short = { ...committed(), groundM: committed().groundM.slice(0, -3) };
    expect(verifySection(short, seaToSky())).toMatch(/stations for a .* route/);
  });
});

describe.skipIf(!built)("cutting one from a built world", () => {
  it("reproduces the file that is already committed", () => {
    // `make world` ends by re-cutting, so a corridor rebuild that changed the
    // ground would change this file. That it does not is what lets the
    // committed copy stand in for 9.8 MB of heightfield.
    const result = cutSection(seaToSky(), loadCorridor("dist-world/sea-to-sky")!);
    expect("section" in result).toBe(true);
    if (!("section" in result)) return;
    expect(renderSection(result.section)).toBe(renderSection(committed()));
  }, 30_000);

  it("refuses to cut a route that leaves the corridor", () => {
    // Outside its window the reader answers zero, which is sea level. A
    // section cut that way would put the route over calm water and pass
    // every check in the repo, which is the one failure a gate must not have.
    const north: Expedition = {
      ...seaToSky(),
      route: [seaToSky().route[0]!, { id: "harbin", name: "Harbin", lat: 45.8, lon: 126.53, speed: "cruise" }],
    };
    const result = cutSection(north, loadCorridor("dist-world/sea-to-sky")!);
    expect("problem" in result).toBe(true);
    if (!("problem" in result)) return;
    expect(result.problem).toMatch(/leaves corridor sea-to-sky at km \d+/);
    expect(result.problem).toMatch(/sea level/);
  }, 30_000);
});
