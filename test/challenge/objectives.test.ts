/**
 * The six objective primitives, pinned (F43).
 *
 * Every test here is synthetic: an objective is a judgement about a track and
 * nothing in it needs a world. What does need one is whether a *challenge*
 * can be flown, and that is `flown.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  BOUNCE_FLOOR_M,
  FollowLine,
  GateSequence,
  HoldBand,
  ReachDisc,
  crossingFraction,
  gateAcross,
  type ChallengeSample,
} from "../../engine/src/challenge/objectives.js";

const at = (p: Partial<ChallengeSample>): ChallengeSample => ({
  seconds: 0,
  eastM: 0,
  northM: 0,
  altitudeM: 1000,
  groundM: 0,
  headingRad: 0,
  groundSpeedKmPerMin: 43.33,
  clockMinutes: 600,
  ...p,
});

/** Fly a straight line as `steps` samples, feeding an objective as it goes. */
function fly(
  objective: { advance(a: ChallengeSample, b: ChallengeSample): void },
  from: ChallengeSample,
  to: ChallengeSample,
  steps: number,
): void {
  let previous = from;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const next = at({
      ...to,
      seconds: from.seconds + (to.seconds - from.seconds) * t,
      eastM: from.eastM + (to.eastM - from.eastM) * t,
      northM: from.northM + (to.northM - from.northM) * t,
      altitudeM: from.altitudeM + (to.altitudeM - from.altitudeM) * t,
    });
    objective.advance(previous, next);
    previous = next;
  }
}

describe("ReachDisc", () => {
  const disc = () =>
    new ReachDisc({
      id: "field",
      label: "over the field",
      eastM: 10_000,
      northM: 0,
      radiusM: 2_000,
      maxAglM: 200,
    });

  it("is met by a sample inside it that meets the conditions", () => {
    const o = disc();
    fly(o, at({ eastM: 0, altitudeM: 150 }), at({ eastM: 12_000, altitudeM: 150 }), 40);
    expect(o.state).toBe("met");
    expect(o.progress).toBe(1);
  });

  it("is not met by flying over it too high", () => {
    const o = disc();
    fly(o, at({ eastM: 0, altitudeM: 900 }), at({ eastM: 12_000, altitudeM: 900 }), 40);
    expect(o.state).toBe("pending");
    // It did get there, and the progress says so - the bar is about the
    // place, because only the place is a distance. It stops short of 1
    // because no sample lands exactly on the centre.
    expect(o.progress).toBeGreaterThan(0.9);
  });

  it("makes no judgement where the ground is not resident", () => {
    // F42's rule: null is not zero. A coerced zero over the Hengduan would
    // read a 3,000 m fly-past as a landing.
    const o = disc();
    fly(
      o,
      at({ eastM: 0, altitudeM: 150, groundM: null }),
      at({ eastM: 12_000, altitudeM: 150, groundM: null }),
      40,
    );
    expect(o.state).toBe("pending");
  });

  it("counts a crossing with no sample inside it rather than scoring it", () => {
    // One 12 km step straight through a 2 km disc: the aircraft was never
    // measured inside, so nothing is known about its height there.
    const o = disc();
    o.advance(at({ eastM: 0 }), at({ eastM: 20_000 }));
    expect(o.state).toBe("pending");
    expect(o.clippedWithoutSample).toBe(1);
  });

  it("credits nothing for a jump", () => {
    const o = disc();
    o.jump(at({ eastM: 10_000, altitudeM: 100 }));
    expect(o.state).toBe("pending");
  });

  it("checks the pace when one is asked for", () => {
    const slow = new ReachDisc({
      id: "field",
      label: "slowly over the field",
      eastM: 10_000,
      northM: 0,
      radiusM: 2_000,
      maxGroundSpeedKmPerMin: 43.4,
    });
    fly(slow, at({ eastM: 0, groundSpeedKmPerMin: 130 }), at({ eastM: 12_000, groundSpeedKmPerMin: 130 }), 40);
    expect(slow.state).toBe("pending");
    fly(slow, at({ eastM: 0, groundSpeedKmPerMin: 43.33 }), at({ eastM: 12_000, groundSpeedKmPerMin: 43.33 }), 40);
    expect(slow.state).toBe("met");
  });

  it("knows the floor the flight model leaves under it", () => {
    // Not a tuning number: `flight.ts` bounces at ground + 25 (F43).
    expect(BOUNCE_FLOOR_M).toBe(25);
  });
});

describe("gates", () => {
  it("lies across the course through it", () => {
    // Flying due north, the posts are east and west.
    const g = gateAcross(0, 0, 0, 1000, 0, 5000);
    expect(g.ax).toBeCloseTo(-500, 6);
    expect(g.ay).toBeCloseTo(0, 6);
    expect(g.bx).toBeCloseTo(500, 6);
  });

  it("finds where a segment crosses another", () => {
    expect(crossingFraction(0, -10, 0, 10, -5, 0, 5, 0)).toBeCloseTo(0.5, 9);
    // Past the end of the posts is not through the gate.
    expect(crossingFraction(100, -10, 100, 10, -5, 0, 5, 0)).toBeNull();
    // Parallel.
    expect(crossingFraction(0, 1, 10, 1, 0, 0, 10, 0)).toBeNull();
  });

  const sequence = () =>
    new GateSequence({
      id: "gates",
      label: "three gates",
      gates: [
        gateAcross(0, 1000, 0, 2000, 500, 1500),
        gateAcross(0, 2000, 0, 2000, 500, 1500),
        gateAcross(0, 3000, 0, 2000, 500, 1500),
      ],
    });

  it("is met by crossing them in order", () => {
    const o = sequence();
    fly(o, at({ northM: 0 }), at({ northM: 4000 }), 40);
    expect(o.state).toBe("met");
    expect(o.taken).toBe(3);
  });

  it("takes more than one gate in a single update", () => {
    // At boost a frame is 144 m of ground; gates in a line can be closer.
    const o = sequence();
    o.advance(at({ northM: 0 }), at({ northM: 4000 }));
    expect(o.taken).toBe(3);
  });

  it("ignores a gate crossed out of turn", () => {
    const o = sequence();
    // Start beyond the first two and fly back through the third.
    fly(o, at({ northM: 4000 }), at({ northM: 2500 }), 20);
    expect(o.taken).toBe(0);
  });

  it("refuses a crossing outside the height band", () => {
    const o = sequence();
    fly(o, at({ northM: 0, altitudeM: 200 }), at({ northM: 4000, altitudeM: 200 }), 40);
    expect(o.taken).toBe(0);
  });

  it("credits nothing for a jump", () => {
    const o = sequence();
    o.jump(at({ northM: 4000 }));
    expect(o.taken).toBe(0);
  });
});

describe("HoldBand", () => {
  const band = (extra: Record<string, unknown> = {}) =>
    new HoldBand({
      id: "hold",
      label: "hold 1,000 to 1,200 for ten seconds",
      minM: 1000,
      maxM: 1200,
      seconds: 10,
      ...extra,
    });

  it("is met by ten unbroken seconds in the band", () => {
    const o = band();
    fly(o, at({ seconds: 0, altitudeM: 1100 }), at({ seconds: 12, altitudeM: 1100 }), 120);
    expect(o.state).toBe("met");
  });

  it("starts again when the band is left", () => {
    const o = band();
    fly(o, at({ seconds: 0, altitudeM: 1100 }), at({ seconds: 8, altitudeM: 1100 }), 80);
    // Out of the band for a moment, then back for another eight.
    o.advance(at({ seconds: 8, altitudeM: 1100 }), at({ seconds: 8.1, altitudeM: 1400 }));
    fly(o, at({ seconds: 8.1, altitudeM: 1100 }), at({ seconds: 16, altitudeM: 1100 }), 80);
    expect(o.state).toBe("pending");
    expect(o.heldS).toBeGreaterThan(7);
    expect(o.heldS).toBeLessThan(9);
  });

  it("holds a heading too, which is what on instruments means", () => {
    const o = band({ headingRad: 0, headingToleranceRad: 0.1 });
    fly(
      o,
      at({ seconds: 0, altitudeM: 1100, headingRad: 0.3 }),
      at({ seconds: 12, altitudeM: 1100, headingRad: 0.3 }),
      120,
    );
    expect(o.state).toBe("pending");
    fly(
      o,
      at({ seconds: 0, altitudeM: 1100, headingRad: 0.05 }),
      at({ seconds: 12, altitudeM: 1100, headingRad: 0.05 }),
      120,
    );
    expect(o.state).toBe("met");
  });

  it("wraps the heading rather than failing across north", () => {
    const o = band({ headingRad: 0, headingToleranceRad: 0.1 });
    const nearlyNorth = Math.PI * 2 - 0.05;
    fly(
      o,
      at({ seconds: 0, altitudeM: 1100, headingRad: nearlyNorth }),
      at({ seconds: 12, altitudeM: 1100, headingRad: nearlyNorth }),
      120,
    );
    expect(o.state).toBe("met");
  });

  it("makes no judgement above ground it cannot see", () => {
    const o = band({ aboveGround: true, minM: 100, maxM: 300 });
    fly(
      o,
      at({ seconds: 0, altitudeM: 1100, groundM: null }),
      at({ seconds: 12, altitudeM: 1100, groundM: null }),
      120,
    );
    expect(o.state).toBe("pending");
  });

  it("is broken by a jump", () => {
    const o = band();
    fly(o, at({ seconds: 0, altitudeM: 1100 }), at({ seconds: 8, altitudeM: 1100 }), 80);
    o.jump(at({ seconds: 8, altitudeM: 1100 }));
    expect(o.heldS).toBe(0);
  });
});

describe("FollowLine", () => {
  const line = () =>
    new FollowLine({
      id: "line",
      label: "follow the line",
      points: [
        { eastM: 0, northM: 0 },
        { eastM: 0, northM: 10_000 },
      ],
      corridorM: 1_000,
    });

  it("is met by flying it end to end inside the corridor", () => {
    const o = line();
    fly(o, at({ northM: 0 }), at({ northM: 10_000 }), 50);
    expect(o.state).toBe("met");
    expect(o.km).toBeCloseTo(10, 3);
  });

  it("is missed by leaving the corridor", () => {
    const o = line();
    fly(o, at({ northM: 0 }), at({ northM: 5000 }), 25);
    fly(o, at({ northM: 5000 }), at({ northM: 5000, eastM: 3000 }), 15);
    expect(o.state).toBe("missed");
  });

  it("does not fail before the line is joined", () => {
    const o = line();
    // Approaching from ten kilometres off is not leaving a corridor that has
    // not been entered - the same distinction the expedition runner draws.
    o.advance(at({ eastM: 10_000, northM: -5000 }), at({ eastM: 5000, northM: -2000 }));
    expect(o.state).toBe("pending");
  });

  it("does not un-fly the line when the player turns round", () => {
    const o = line();
    fly(o, at({ northM: 0 }), at({ northM: 8000 }), 40);
    fly(o, at({ northM: 8000 }), at({ northM: 4000 }), 20);
    expect(o.km).toBeCloseTo(8, 3);
  });

  it("records how far off the line the attempt went", () => {
    const o = line();
    fly(o, at({ northM: 0 }), at({ northM: 5000, eastM: 800 }), 25);
    expect(o.worstCrossTrackM).toBeGreaterThan(700);
    expect(o.worstCrossTrackM).toBeLessThanOrEqual(800);
  });
});
