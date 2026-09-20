/**
 * The gate that runs on every commit (D17, D19, D21).
 *
 * Most of this suite has no `skipIf` on it, which is the point of D21: the
 * ground under Expedition 1 is committed beside it, so CI flies the route
 * rather than printing NOT CHECKED. The world-gated suite at the bottom is
 * the half only a machine with the data can run - whether the committed
 * section still agrees with the corridor it was cut from.
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { checkRoutes, describe as describeReport } from "../../tools/routeCheck.ts";
import { loadCorridor, type Corridor } from "../../tools/corridor.ts";
import { loadExpedition } from "../../tools/expedition.ts";
import type { Expedition } from "../../content/schema.ts";

const WORLD = "dist-world";
const SECTIONS = "content/sections";
const NO_WORLD = "dist-world-that-is-not-there";
const NO_SECTIONS = "content/sections-that-are-not-there";
const built = existsSync(`${WORLD}/sea-to-sky/manifest.json`);

// Lazy, because `describe.skipIf` still runs the suite body at collection and
// a fixture that reads the corridor eagerly makes a skipped suite expensive.
const seaToSky = (): Expedition => loadExpedition("content/expeditions/sea-to-sky.yaml");

describe("a check that cannot run says so instead of passing", () => {
  it("reports every expedition as not checked when there is neither world nor section", () => {
    const reports = checkRoutes([seaToSky()], NO_WORLD, NO_SECTIONS);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.check).toBeNull();
    expect(reports[0]!.source).toBeNull();
    expect(reports[0]!.skipReason).toMatch(/no ground to fly it over/);
  });

  it("names the command that would produce some", () => {
    // The gap between "green" and "checked" is only visible if the line that
    // marks it also says what to do about it.
    const [report] = checkRoutes([seaToSky()], NO_WORLD, NO_SECTIONS);
    const line = describeReport(report!).join("\n");
    expect(line).toMatch(/NOT CHECKED/);
    expect(line).toMatch(/make world CORRIDOR=sea-to-sky/);
  });

  it("refuses a section that was cut from a different route, and says which waypoint moved", () => {
    // The whole risk of committing derived data: it goes stale silently.
    // Moving Chengdu moves 1,200 km of ground out from under the route, and
    // the check has to notice without a world to compare against.
    const moved = seaToSky();
    const elsewhere: Expedition = {
      ...moved,
      route: moved.route.map((p, i) => (i === 3 ? { ...p, lat: 31.4 } : p)),
    };
    const [report] = checkRoutes([elsewhere], NO_WORLD, SECTIONS);
    expect(report!.check).toBeNull();
    expect(report!.sectionIssue).toMatch(/waypoint 3 \(chengdu\) has moved/);
    expect(describeReport(report!).join("\n")).toMatch(/✗ sea-to-sky · section:/);
  });
});

describe("the committed section, which is the ground CI flies over", () => {
  it("flies Expedition 1 with no world present at all", () => {
    const [report] = checkRoutes([seaToSky()], NO_WORLD, SECTIONS);
    const check = report!.check!;
    expect(report!.source).toBe("section");
    expect(report!.sectionIssue).toBeNull();
    // F18: the authored speed profile is 35.5 minutes.
    expect(check.minutes).toBeCloseTo(35.5, 0);
    // F17/F18: it clears, by 333 m at its worst.
    expect(check.clears).toBe(true);
    expect(check.worstClearanceM).toBeGreaterThan(300);
    // F21: and it still arrives 1,588 m over Lhasa at its lowest.
    expect(check.lowestArrivalM).toBeGreaterThan(1500);
    expect(check.lowestArrivalM).toBeLessThan(1700);
  }, 30_000);

  it("does not fail an expedition that never claimed an arrival", () => {
    // Sea to Sky authors no `arrival:` today, because which ending it has is
    // a writing decision F21 priced and did not make. The gate prints the
    // measured height and stays green; it does not invent a claim to fail.
    const [report] = checkRoutes([seaToSky()], NO_WORLD, SECTIONS);
    expect(report!.authored).toBe(false);
    expect(report!.check!.issues).toHaveLength(0);
    expect(describeReport(report!).join("\n")).toMatch(/NO ARRIVAL AUTHORED/);
  }, 30_000);

  it("fails it the moment it claims the landing it cannot make", () => {
    // An arrival is not part of the geometry, so the section still describes
    // this route - which is what lets CI catch the claim rather than skip it.
    const claiming: Expedition = { ...seaToSky(), arrival: { altitude_m: 500 } };
    const [report] = checkRoutes([claiming], NO_WORLD, SECTIONS);
    const issues = report!.check!.issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]!.check).toBe("arrival");
    // F21's number: 1,588 measured against a 500 m claim.
    expect(report!.check!.shortfallM).toBeGreaterThan(1000);
  }, 30_000);
});

describe.skipIf(!built)("the section against the world it was cut from", () => {
  it("gives the same verdict as the corridor, to the metre it prints", () => {
    // The claim the committed artefact lives or dies on. If these two ever
    // disagree, every number in findings F17 to F23 depends on which machine
    // ran it.
    const [fromWorld] = checkRoutes([seaToSky()], WORLD, SECTIONS);
    const [fromSection] = checkRoutes([seaToSky()], NO_WORLD, SECTIONS);
    expect(fromWorld!.source).toBe("world");
    expect(fromSection!.source).toBe("section");
    const w = fromWorld!.check!;
    const s = fromSection!.check!;
    expect(s.worstClearanceM).toBeCloseTo(w.worstClearanceM, 0);
    expect(s.worstKm).toBe(w.worstKm);
    expect(s.lowestArrivalM).toBeCloseTo(w.lowestArrivalM, 0);
    expect(s.minutes).toBeCloseTo(w.minutes, 2);
  }, 60_000);

  it("finds the committed section current, which is what keeps it honest", () => {
    const [report] = checkRoutes([seaToSky()], WORLD, SECTIONS);
    expect(report!.sectionIssue).toBeNull();
  }, 30_000);

  it("catches a section whose ground has drifted from the corridor", () => {
    // Staleness is the world moving under a section that is otherwise
    // perfect: a corridor rebuilt from better rasters, or a pipeline fix,
    // with no re-cut afterwards. So the world is what moves here. Editing
    // the section instead would test D23's signature, which fires first and
    // means something else entirely — that the file was tampered with rather
    // than left behind.
    const risen = (name: string): Corridor | null => {
      const real = loadCorridor(join(WORLD, name));
      return real && { ...real, groundAt: (e, n) => real.groundAt(e, n) + 40 };
    };
    const [report] = checkRoutes([seaToSky()], WORLD, SECTIONS, risen);
    expect(report!.sectionIssue).toMatch(/40 m from sea-to-sky/);
    // And it still flies, because the world is right there and is the one
    // that counts. The section is reported behind, not obeyed.
    expect(report!.source).toBe("world");
    expect(report!.check!.clears).toBe(true);
  }, 30_000);

  it("lands a route that ends on the plain, which nothing could do before D20", () => {
    // Shanghai to Wuhan over the real eastern corridor, arriving 100 m over
    // a destination 25 m above the sea. World-only on purpose: this edits the
    // waypoints, and a section cut from other waypoints is exactly what D21
    // refuses to fly.
    const base = seaToSky();
    const east: Expedition = { ...base, route: base.route.slice(0, 2), arrival: { altitude_m: 100 } };
    const [report] = checkRoutes([east], WORLD, NO_SECTIONS);
    const check = report!.check!;
    expect(check.clears).toBe(true);
    expect(check.arrives).toBe(true);
    expect(check.lowestArrivalM).toBeLessThan(150);
    // And the line says what it cost: the taper releases margin on the way
    // in, so the lowest legal line passes closer to the ground than the
    // 300 m the rest of the route keeps.
    expect(check.approachMarginM).toBeLessThan(300);
    expect(describeReport(report!).join("\n")).toMatch(/approach: the lowest legal line/);
  }, 30_000);
});
