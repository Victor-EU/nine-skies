/**
 * The challenge run: the two clocks, the deadline and the retry (F43).
 */
import { describe, expect, it } from "vitest";
import { ChallengeRun, stopwatchString, type ChallengeSpec } from "../../engine/src/challenge/challenge.js";
import { HoldBand, ReachDisc, type ChallengeSample } from "../../engine/src/challenge/objectives.js";

const at = (p: Partial<ChallengeSample>): ChallengeSample => ({
  seconds: 0,
  eastM: 0,
  northM: 0,
  altitudeM: 1000,
  groundM: 0,
  headingRad: 0,
  groundSpeedKmPerMin: 130,
  clockMinutes: 600,
  ...p,
});

const disc = () =>
  new ReachDisc({ id: "there", label: "get there", eastM: 10_000, northM: 0, radiusM: 2_000 });

function spec(extra: Partial<ChallengeSpec> = {}): ChallengeSpec {
  return {
    id: "test",
    name: "Test",
    start: {
      eastM: 0,
      northM: 0,
      altitudeM: 1000,
      headingRad: Math.PI / 2,
      month: 10,
      clockMinutes: 600,
    },
    objectives: [disc()],
    ...extra,
  };
}

describe("a challenge run", () => {
  it("is done when every objective is met", () => {
    const run = new ChallengeRun(spec());
    expect(run.state).toBe("flying");
    run.advance(at({ seconds: 0 }));
    run.advance(at({ seconds: 10, eastM: 10_000, clockMinutes: 600.2 }));
    expect(run.state).toBe("done");
    expect(run.seconds).toBe(10);
  });

  it("fails when the deadline passes", () => {
    const run = new ChallengeRun(
      spec({ deadline: { clockMinutes: 601, label: "sunset" } }),
    );
    run.advance(at({ seconds: 0 }));
    run.advance(at({ seconds: 120, eastM: 4000, clockMinutes: 602 }));
    expect(run.state).toBe("failed");
    expect(run.minutesRemaining).toBe(-1);
  });

  it("gives a photo finish to the player", () => {
    // Meeting the last objective on the sample the deadline passes is a win:
    // at boost one frame is 144 m of a 1,802 km run, and losing on that is
    // losing to the frame rate.
    const run = new ChallengeRun(
      spec({ deadline: { clockMinutes: 601, label: "sunset" } }),
    );
    run.advance(at({ seconds: 0 }));
    run.advance(at({ seconds: 120, eastM: 10_000, clockMinutes: 601.5 }));
    expect(run.state).toBe("done");
  });

  it("does not credit a jump", () => {
    const run = new ChallengeRun(spec());
    run.advance(at({ seconds: 0 }));
    run.jump(at({ seconds: 1, eastM: 10_000 }));
    expect(run.state).toBe("flying");
  });

  it("hands back the start on retry, with everything cleared", () => {
    const hold = new HoldBand({
      id: "hold",
      label: "hold",
      minM: 900,
      maxM: 1100,
      seconds: 30,
    });
    const run = new ChallengeRun(spec({ objectives: [disc(), hold] }));
    run.advance(at({ seconds: 0 }));
    run.advance(at({ seconds: 10, eastM: 10_000, clockMinutes: 600.2 }));
    expect(run.objectives[0]!.state).toBe("met");
    expect(hold.heldS).toBeGreaterThan(0);

    const start = run.retry();
    expect(start.eastM).toBe(0);
    expect(start.clockMinutes).toBe(600);
    expect(run.seconds).toBe(0);
    expect(run.clockMinutes).toBe(600);
    expect(run.objectives[0]!.state).toBe("pending");
    expect(hold.heldS).toBe(0);
    expect(run.state).toBe("flying");
  });

  it("clears a deadline failure on retry", () => {
    const run = new ChallengeRun(
      spec({ deadline: { clockMinutes: 601, label: "sunset" } }),
    );
    run.advance(at({ seconds: 0 }));
    run.advance(at({ seconds: 120, eastM: 4000, clockMinutes: 602 }));
    expect(run.state).toBe("failed");
    run.retry();
    expect(run.state).toBe("flying");
  });

  it("has no deadline unless one was authored", () => {
    expect(new ChallengeRun(spec()).minutesRemaining).toBeNull();
  });

  it("averages progress over its objectives", () => {
    const run = new ChallengeRun(
      spec({
        objectives: [
          disc(),
          new HoldBand({ id: "h", label: "h", minM: 900, maxM: 1100, seconds: 30 }),
        ],
      }),
    );
    run.advance(at({ seconds: 0 }));
    run.advance(at({ seconds: 10, eastM: 10_000, clockMinutes: 600.2 }));
    // One met, one a third held.
    expect(run.progress).toBeGreaterThan(0.6);
    expect(run.progress).toBeLessThan(0.7);
  });
});

describe("the stopwatch", () => {
  it("reads minutes and seconds", () => {
    expect(stopwatchString(0)).toBe("0:00");
    expect(stopwatchString(9)).toBe("0:09");
    expect(stopwatchString(125)).toBe("2:05");
    expect(stopwatchString(-3)).toBe("0:00");
  });
});
