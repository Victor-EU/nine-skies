/**
 * What survives quitting (F39).
 *
 * The save is the one file in this game written by an older version of it, so
 * most of what is checked here is refusal: a shape that half-loads puts the
 * player somewhere nobody checked.
 */
import { describe, expect, it } from "vitest";
import {
  emptyProfile,
  fingerprint,
  MAX_PROFILES,
  readProfile,
  runFor,
  SAVE_VERSION,
  withRun,
  type Profile,
  type RunSave,
} from "../../engine/src/save/profile.js";

const run = (over: Partial<RunSave> = {}): RunSave => ({
  expeditionId: "sea-to-sky",
  fingerprint: "deadbeef",
  km: 1500,
  beats: ["wuhan", "chongqing"],
  arrived: false,
  ...over,
});

const saved = (over: Partial<Profile> = {}): Profile => ({
  ...emptyProfile("default", "Profile 1"),
  savedAtMs: 1_700_000_000_000,
  seen: ["wulingyuan"],
  runs: [run()],
  position: { eastM: 3_600_000, northM: 1_330_000, altitudeM: 4200, headingRad: -1.8 },
  flying: "sea-to-sky",
  ...over,
});

describe("a profile", () => {
  it("starts empty, and the GDD's three fit in it", () => {
    const fresh = emptyProfile("a", "Profile 1");
    expect(fresh.version).toBe(SAVE_VERSION);
    expect(fresh.runs).toEqual([]);
    expect(fresh.position).toBeNull();
    expect(MAX_PROFILES).toBe(3);
  });

  it("round-trips through storage", () => {
    const read = readProfile(JSON.parse(JSON.stringify(saved())));
    expect(read).toEqual(saved());
  });

  it("refuses anything that is not this version's shape", () => {
    expect(readProfile(null)).toBeNull();
    expect(readProfile("a profile, honestly")).toBeNull();
    expect(readProfile({ ...saved(), version: SAVE_VERSION + 1 })).toBeNull();
    expect(readProfile({ ...saved(), version: undefined })).toBeNull();
    expect(readProfile({ ...saved(), id: 7 })).toBeNull();
  });

  it("drops the parts of a save it cannot trust, and keeps the rest", () => {
    // A position with a missing number is not a position. Losing it costs the
    // player the last fifteen seconds; believing it costs them the aeroplane.
    const noPosition = readProfile({ ...saved(), position: { eastM: 1, northM: 2 } });
    expect(noPosition!.position).toBeNull();
    expect(noPosition!.seen).toEqual(["wulingyuan"]);

    const halfRuns = readProfile({ ...saved(), runs: [run(), { expeditionId: "x" }, 4] });
    expect(halfRuns!.runs).toHaveLength(1);

    // Fields a later version added are not carried forward silently.
    const extra = readProfile({ ...saved(), cheats: true } as unknown);
    expect(extra).not.toHaveProperty("cheats");
  });

  it("keeps one run per expedition", () => {
    const first = withRun(emptyProfile("a", "A"), run());
    const second = withRun(first, run({ km: 2000, arrived: true }));
    expect(second.runs).toHaveLength(1);
    expect(runFor(second, "sea-to-sky")!.km).toBe(2000);
    expect(runFor(second, "kunlun")).toBeNull();

    const both = withRun(second, run({ expeditionId: "kunlun", km: 10 }));
    expect(both.runs).toHaveLength(2);
  });
});

describe("the fingerprint a saved kilometre is measured against", () => {
  it("is stable, and moves when anything that defines a kilometre moves", () => {
    expect(fingerprint(["sea-to-sky", 1, 2])).toBe(fingerprint(["sea-to-sky", 1, 2]));
    expect(fingerprint(["sea-to-sky", 1, 2])).not.toBe(fingerprint(["sea-to-sky", 1, 2.001]));
    // Separated, so two fields cannot be confused for one differently split.
    expect(fingerprint(["ab", "c"])).not.toBe(fingerprint(["a", "bc"]));
    expect(fingerprint([])).toHaveLength(8);
  });
});
