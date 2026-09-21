/**
 * What the challenge schema refuses, and what the one authored challenge
 * claims (F43).
 *
 * The refusals are the interesting half. Three of the GDD's four named
 * challenges cannot be written down today, and two of those three are caught
 * here rather than discovered in a browser.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHALLENGE_RULES, validateChallenges, type Challenge } from "../../content/schema.ts";
import { courseFor, courseKm, loadChallenges, minutesFor, specFrom, sunsetMinutes } from "../../tools/challenge.ts";
import { checkChallenge } from "../../tools/challengeCheck.ts";
import { corridorCache } from "../../tools/corridor.ts";
import { BOUNCE_CLEARANCE_M } from "../../engine/src/sim/flight.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const challenges = loadChallenges(join(root, "content", "challenges"));

const base = (o: Partial<Challenge> = {}): Challenge => ({
  id: "test",
  name: "Test",
  bite: "a test",
  month: 10,
  start_hour: 10,
  speed: "low",
  start: { lat: 29.3, lon: 100.7, altitude_m: 5000, heading_deg: 270 },
  objectives: [
    { kind: "reach", id: "there", label: "get there", lat: 29.3, lon: 100.0, radius_km: 4 },
  ],
  ...o,
});

describe("the authored challenges", () => {
  it("are valid", () => {
    expect(validateChallenges(challenges)).toEqual([]);
  });

  it("are one of the GDD's twelve, and the repository says so", () => {
    // The same failure class as F40's comparison spreads: a plan that claims
    // coverage of twelve things when one exists. Recorded here so the gap is
    // a number rather than a feeling.
    expect(challenges.length).toBeLessThan(12);
    expect(challenges.map((c) => c.id)).toContain("high-airfield");
  });

  it("fit in the time a challenge is meant to take", () => {
    for (const c of challenges) expect(minutesFor(c)).toBeLessThanOrEqual(CHALLENGE_RULES.maxMinutes);
  });

  it("build a course that visits every objective", () => {
    for (const c of challenges) {
      const course = courseFor(c);
      expect(course.length).toBeGreaterThanOrEqual(c.objectives.length);
      expect(courseKm(c)).toBeGreaterThan(0);
      expect(specFrom(c).objectives.length).toBe(c.objectives.length);
    }
  });
});

describe("what the schema refuses", () => {
  const message = (c: Challenge): string =>
    validateChallenges([c]).map((i) => `${i.field}: ${i.message}`).join(" | ");

  it("a landing under the height the flight model bounces off", () => {
    // The GDD's own challenge is *land at a 4,411 m airport* and there is no
    // landing in this game: `flight.ts` pushes the aeroplane clear at
    // ground + 25 rather than crashing it. F22 reached the same conclusion
    // from the route check's end, by different arithmetic.
    expect(CHALLENGE_RULES.bounceFloorM).toBe(BOUNCE_CLEARANCE_M);
    const c = base({
      objectives: [
        {
          kind: "land",
          id: "touchdown",
          label: "land",
          lat: 29.3231,
          lon: 100.0533,
          radius_km: 4,
          max_agl_m: 0,
        },
      ],
    });
    expect(message(c)).toContain("bounces off");
  });

  it("a hold band that reaches under the same floor", () => {
    const c = base({
      objectives: [
        {
          kind: "hold-altitude",
          id: "low",
          label: "hold low",
          min_m: 10,
          max_m: 200,
          above_ground: true,
          seconds: 30,
        },
      ],
    });
    expect(message(c)).toContain("bounces off");
  });

  it("a gate with no height in it", () => {
    const c = base({
      objectives: [
        {
          kind: "gates",
          id: "g",
          label: "gate",
          gates: [{ lat: 29.3, lon: 100.2, bearing_deg: 270, width_km: 10, floor_m: 5000, ceiling_m: 4000 }],
        },
      ],
    });
    expect(message(c)).toContain("above the floor");
  });

  it("an objective outside China, and one with no id", () => {
    expect(message(base({ objectives: [{ kind: "reach", id: "x", label: "x", lat: 12, lon: 100, radius_km: 4 }] })))
      .toContain("inside China");
    expect(message(base({ start: { lat: 29.3, lon: 100.7, altitude_m: 5000, heading_deg: 400 } })))
      .toContain("not a bearing");
  });

  it("a challenge with nothing to do in it", () => {
    expect(message(base({ objectives: [] }))).toContain("a flight");
  });

  it("a deadline with nowhere for the sun to set", () => {
    expect(message(base({ deadline: { kind: "sunset", label: "sunset" } }))).toContain("lat and lon");
  });
});

describe("a sunset deadline", () => {
  it("is later further west, because China keeps one clock", () => {
    // 4 minutes a degree, and the Great Wall spans 21.5 of them.
    const east = sunsetMinutes(39.97, 119.76, 9)!;
    const west = sunsetMinutes(39.8, 98.29, 9)!;
    expect(west - east).toBeGreaterThan(80);
    expect(west - east).toBeLessThan(90);
  });
});

const patches = join(root, "content", "patches");
const open = corridorCache(join(root, "dist-world"));

/**
 * Flown wherever this runs, which is new (D39).
 *
 * Until the ground under a challenge was committed these three were gated on
 * a 13.9 GB build, so the check that matters most about a challenge — that it
 * can be completed at all — ran on one machine. They now read the world where
 * there is one and the committed patch where there is not, and the flight is
 * the same either way rather than the same to a tolerance.
 */
describe("flown over real ground", () => {
  it("completes every authored challenge", () => {
    // D17's rule one level down: a challenge is data the build has been shown
    // to be completable, not data it has been shown to parse.
    for (const c of challenges) {
      const report = checkChallenge(c, open, patches);
      expect(report.flight, `${c.id} has no ground: ${report.skipReason}`).not.toBeNull();
      expect(report.patchIssue, `${c.id}`).toBeNull();
      expect(report.flight!.state, `${c.id}`).toBe("done");
      // A flight over ground that is not there proves nothing (F44).
      expect(report.flight!.framesWithoutGround, `${c.id}`).toBe(0);
    }
  });

  it("puts the world's highest airfield where it is published to be", () => {
    const report = checkChallenge(challenges.find((c) => c.id === "high-airfield")!, open, patches);
    const field = report.ground.find((g) => g.what === "low-pass centre")!;
    // Daocheng Yading is published at 4,411 m. Ours is the 1 km grid's.
    expect(field.groundM).toBeGreaterThan(4300);
    expect(Math.abs(field.groundM! - 4411)).toBeLessThan(30);
  });

  it("authors no width the aeroplane cannot turn inside", () => {
    for (const c of challenges)
      for (const w of checkChallenge(c, open, patches).widths)
        expect(w.widthM, `${c.id} ${w.what}`).toBeGreaterThanOrEqual(w.reversalM);
  });
});
