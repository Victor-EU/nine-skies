import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { checkRoutes, describe as describeReport } from "../../tools/routeCheck.ts";
import { loadExpedition } from "../../tools/expedition.ts";
import type { Expedition } from "../../content/schema.ts";

const WORLD = "dist-world";
const built = existsSync(`${WORLD}/sea-to-sky/manifest.json`);

// Lazy, because `describe.skipIf` still runs the suite body at collection and
// a fixture that reads the corridor eagerly makes a skipped suite expensive.
const seaToSky = (): Expedition => loadExpedition("content/expeditions/sea-to-sky.yaml");

describe("a check that cannot run says so instead of passing", () => {
  it("reports every expedition as not checked when there is no world", () => {
    const reports = checkRoutes([seaToSky()], "dist-world-that-is-not-there");
    expect(reports).toHaveLength(1);
    expect(reports[0]!.check).toBeNull();
    expect(reports[0]!.skipReason).toMatch(/no world to fly it over/);
  });

  it("names the command that would build one", () => {
    // The gap between "green" and "checked" is only visible if the line that
    // marks it also says what to do about it.
    const [report] = checkRoutes([seaToSky()], "dist-world-that-is-not-there");
    const line = describeReport(report!).join("\n");
    expect(line).toMatch(/NOT CHECKED/);
    expect(line).toMatch(/make world CORRIDOR=sea-to-sky/);
  });
});

describe.skipIf(!built)("the check over a world that is actually built", () => {
  it("flies Expedition 1 and reproduces what the findings say about it", () => {
    const [report] = checkRoutes([seaToSky()], WORLD);
    const check = report!.check!;
    expect(report!.corridor).toBe("sea-to-sky");
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
    const [report] = checkRoutes([seaToSky()], WORLD);
    expect(report!.authored).toBe(false);
    expect(report!.check!.issues).toHaveLength(0);
    expect(describeReport(report!).join("\n")).toMatch(/NO ARRIVAL AUTHORED/);
  }, 30_000);

  it("fails it the moment it claims the landing it cannot make", () => {
    const claiming: Expedition = { ...seaToSky(), arrival: { altitude_m: 500 } };
    const [report] = checkRoutes([claiming], WORLD);
    const issues = report!.check!.issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]!.check).toBe("arrival");
    // F21's number: 1,588 measured against a 500 m claim.
    expect(report!.check!.shortfallM).toBeGreaterThan(1000);
  }, 30_000);
});
