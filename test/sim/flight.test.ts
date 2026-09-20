import { describe, expect, it } from "vitest";
import {
  STILL_AIR,
  createFlightState,
  step,
  telemetry,
  wrapAngle,
  type Environment,
  type FlightInput,
} from "../../engine/src/sim/flight.js";
import { MODE_IAS_MS } from "../../engine/src/sim/scale.js";

const CLIMB: FlightInput = { pitch: 1, roll: 0, mode: "cruise" };
const LEVEL: FlightInput = { pitch: 0, roll: 0, mode: "cruise" };

function run(
  state: ReturnType<typeof createFlightState>,
  input: FlightInput,
  env: Environment,
  seconds: number,
  dt = 0.5,
) {
  for (let t = 0; t < seconds; t += dt) step(state, input, env, dt);
  return state;
}

describe("boost", () => {
  it("falls back to cruise instead of failing when the air is too thin", () => {
    const s = createFlightState({ altitudeM: 4500 });
    step(s, { pitch: 0, roll: 0, mode: "boost" }, STILL_AIR, 0.1);
    expect(s.mode).toBe("cruise");
  });

  it("works down low", () => {
    const s = createFlightState({ altitudeM: 500 });
    step(s, { pitch: 0, roll: 0, mode: "boost" }, STILL_AIR, 0.1);
    expect(s.mode).toBe("boost");
  });
});

describe("terrain contact", () => {
  it("bounces clear instead of crashing", () => {
    const env: Environment = { ...STILL_AIR, groundElevationM: 1200 };
    const s = createFlightState({ altitudeM: 1205, verticalRateMs: -10 });
    step(s, { pitch: -1, roll: 0, mode: "cruise" }, env, 0.5);
    expect(s.altitudeM).toBeGreaterThanOrEqual(1200);
    expect(s.verticalRateMs).toBeGreaterThanOrEqual(0);
  });
});

describe("thin air is felt in the controls", () => {
  it("takes longer to spin up to speed on the plateau", () => {
    const low = createFlightState({ altitudeM: 0, iasMs: MODE_IAS_MS.low });
    const high = createFlightState({ altitudeM: 4500, iasMs: MODE_IAS_MS.low });
    run(low, LEVEL, STILL_AIR, 8);
    run(high, LEVEL, STILL_AIR, 8);
    const target = MODE_IAS_MS.cruise;
    // Both are accelerating toward cruise; the high one lags behind.
    expect(high.iasMs).toBeLessThan(low.iasMs);
    expect(low.iasMs).toBeLessThan(target);
  });

  it("climbs far more slowly up high for the same stick input", () => {
    const low = createFlightState({ altitudeM: 0 });
    const high = createFlightState({ altitudeM: 4500 });
    const before = { low: low.altitudeM, high: high.altitudeM };
    run(low, CLIMB, STILL_AIR, 60);
    run(high, CLIMB, STILL_AIR, 60);
    const gainLow = low.altitudeM - before.low;
    const gainHigh = high.altitudeM - before.high;
    expect(gainHigh).toBeLessThan(gainLow * 0.4);
  });

  it("reports power-limited when the player asks for climb the air cannot give", () => {
    const s = createFlightState({ altitudeM: 6000 });
    expect(telemetry(s, STILL_AIR, CLIMB).powerLimited).toBe(true);
    const lowDown = createFlightState({ altitudeM: 500 });
    expect(telemetry(lowDown, STILL_AIR, CLIMB).powerLimited).toBe(false);
  });
});

describe("wind", () => {
  it("pushes the aircraft sideways", () => {
    const env: Environment = { ...STILL_AIR, windEastMs: 20 };
    const s = createFlightState();
    const still = createFlightState();
    run(s, LEVEL, env, 10);
    run(still, LEVEL, STILL_AIR, 10);
    expect(s.eastM - still.eastM).toBeCloseTo(200, 0);
  });
});

describe("heading", () => {
  it("wraps into 0..2pi", () => {
    expect(wrapAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2, 6);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 6);
  });

  it("turns right on right roll", () => {
    const s = createFlightState({ headingRad: 0 });
    run(s, { pitch: 0, roll: 1, mode: "cruise" }, STILL_AIR, 10);
    expect(s.headingRad).toBeGreaterThan(0);
    expect(s.headingRad).toBeLessThan(Math.PI);
  });
});

/**
 * Expedition 1, Sea to Sky, as a climb budget.
 *
 * This is the test that keeps the whole tuning honest. The aircraft's real
 * climb rate has to get it onto the plateau within the route's real distance,
 * and nothing about the horizontal compression helps - altitude is the one
 * axis that is not compressed.
 */
describe("Sea to Sky climb budget", () => {
  // Real great-circle legs, km.
  const SHANGHAI_TO_LHASA = 2980;
  const CHONGQING_TO_LHASA = 1540;
  const PLATEAU_CRUISE_M = 4500;

  /** Fly flat out uphill and report where we get to after `km` of ground. */
  function climbOver(km: number, startAltM: number) {
    const s = createFlightState({ altitudeM: startAltM });
    const targetM = km * 1000;
    let travelled = 0;
    let elapsed = 0;
    const dt = 1;
    // Cap the loop so a tuning regression fails rather than hangs.
    for (let i = 0; i < 20_000 && travelled < targetM; i++) {
      const before = s.northM;
      step(s, CLIMB, STILL_AIR, dt);
      travelled += s.northM - before;
      elapsed += dt;
    }
    return { altitudeM: s.altitudeM, seconds: elapsed, travelledM: travelled };
  }

  it("reaches plateau height if the climb starts at Shanghai", () => {
    const { altitudeM } = climbOver(SHANGHAI_TO_LHASA, 0);
    expect(altitudeM).toBeGreaterThan(PLATEAU_CRUISE_M);
  });

  it("does NOT reach plateau height if the climb starts at Chongqing", () => {
    // Characterisation, not a wish. The autopilot must begin the climb on the
    // eastern plain, and a player who dawdles over the Three Gorges arrives
    // below the plateau rim. Route design has to account for this - see the
    // tuning note in docs/.
    const { altitudeM } = climbOver(CHONGQING_TO_LHASA, 1000);
    expect(altitudeM).toBeLessThan(PLATEAU_CRUISE_M);
  });

  it("spends most of the expedition climbing, which is the lesson", () => {
    const whole = climbOver(SHANGHAI_TO_LHASA, 0);
    const toPlateau = (() => {
      const s = createFlightState({ altitudeM: 0 });
      let seconds = 0;
      for (let i = 0; i < 20_000 && s.altitudeM < PLATEAU_CRUISE_M; i++) {
        step(s, CLIMB, STILL_AIR, 1);
        seconds += 1;
      }
      return seconds;
    })();
    expect(toPlateau / whole.seconds).toBeGreaterThan(0.6);
  });
});
