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
import {
  CLIMB_LIMITED_CRUISE_KM_PER_MIN,
  CRUISE_CANDIDATES,
  MODE_IAS_MS,
} from "../../engine/src/sim/scale.js";
import { LIGHT_PISTON } from "../../engine/src/sim/aircraft.js";

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
  function climbOver(km: number, startAltM: number, cruiseKmPerMin?: number) {
    const pacing =
      cruiseKmPerMin === undefined ? undefined : { cruiseKmPerMin };
    const s = createFlightState({ altitudeM: startAltM });
    const targetM = km * 1000;
    let travelled = 0;
    let elapsed = 0;
    const dt = 1;
    // Cap the loop so a tuning regression fails rather than hangs.
    for (let i = 0; i < 40_000 && travelled < targetM; i++) {
      const before = s.northM;
      step(s, CLIMB, STILL_AIR, dt, LIGHT_PISTON, pacing);
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

  /**
   * The climb budget is what bounds the pacing question (F16). Reaching the
   * rim costs a fixed number of *minutes*, so the faster cruise is, the more
   * ground goes under the aircraft before it arrives - and past a point it
   * arrives too low. These are characterisations, not wishes: two of the
   * three candidates the GDD's trip-length spread implies do not close.
   *
   * Every assertion below is still true and none of them is the constraint
   * that matters. They compare one altitude at the destination against the
   * plateau rim, over still air with no ground in it; the route crosses
   * terrain a kilometre higher than Lhasa, and at the shipped pacing the
   * aircraft is inside the Hengduan long before the arithmetic here gets to
   * have an opinion. See `test/route/seaToSkyClearance.test.ts` and F17. They
   * are kept rather than deleted because "the climb costs 18.6 minutes
   * whatever the pacing" is the reason F17 comes out the way it does.
   */
  describe("the climb budget bounds the pacing candidates", () => {
    it("costs the same minutes of flying whatever the pacing", () => {
      const minutesTo = (cruiseKmPerMin: number) => {
        const s = createFlightState({ altitudeM: 0 });
        let sec = 0;
        while (s.altitudeM < PLATEAU_CRUISE_M && sec < 40_000) {
          step(s, CLIMB, STILL_AIR, 1, LIGHT_PISTON, { cruiseKmPerMin });
          sec += 1;
        }
        return sec / 60;
      };
      for (const c of CRUISE_CANDIDATES) expect(minutesTo(c)).toBeCloseTo(18.6, 1);
    });

    /**
     * On the straight line rather than F3's 2,980 km, because it is the worst
     * case: fly direct and there is less ground to climb over. The ceiling is
     * 135 there, 140 over F3's figure and 151 over the published waypoint
     * route, and 190 fails on all three.
     */
    const STRAIGHT_TO_LHASA = 2874.3;

    it.each([
      // cruise km/min, arrival altitude flying direct, does the budget close
      [80, 5555, true],
      [130, 4584, true],
      [190, 3761, false],
    ])("at %d km/min the aircraft arrives at %d m", (cruise, arrivalM, closes) => {
      const { altitudeM } = climbOver(STRAIGHT_TO_LHASA, 0, cruise);
      expect(altitudeM).toBeCloseTo(arrivalM, -1);
      expect(altitudeM > PLATEAU_CRUISE_M).toBe(closes);
    });

    it("clears the rim by only 84 m at the shipped pacing", () => {
      // Worth its own assertion because F3's "~15 % margin" reads like room
      // and this does not: one tuning change to the climb rate spends it.
      const { altitudeM } = climbOver(STRAIGHT_TO_LHASA, 0, 130);
      expect(altitudeM - PLATEAU_CRUISE_M).toBeGreaterThan(50);
      expect(altitudeM - PLATEAU_CRUISE_M).toBeLessThan(150);
    });

    it("puts the ceiling where the named constant says it is", () => {
      // Re-measured through the sim so the constant cannot go stale behind a
      // tuning change to the aircraft.
      const closes = (c: number) => climbOver(STRAIGHT_TO_LHASA, 0, c).altitudeM > PLATEAU_CRUISE_M;
      expect(closes(CLIMB_LIMITED_CRUISE_KM_PER_MIN)).toBe(true);
      expect(closes(CLIMB_LIMITED_CRUISE_KM_PER_MIN + 1)).toBe(false);
    });

    it("reopens at 190 if the route drops to low speed, as F3 suggested", () => {
      // The per-leg speed mode the GDD already allows is the lever: flown at
      // low, the same direct route arrives 1,437 m above the rim.
      const s = createFlightState({ altitudeM: 0 });
      let travelled = 0;
      const pacing = { cruiseKmPerMin: 190 };
      const LOW: FlightInput = { pitch: 1, roll: 0, mode: "low" };
      for (let i = 0; i < 60_000 && travelled < STRAIGHT_TO_LHASA * 1000; i++) {
        const before = s.northM;
        step(s, LOW, STILL_AIR, 1, LIGHT_PISTON, pacing);
        travelled += s.northM - before;
      }
      expect(s.altitudeM).toBeGreaterThan(PLATEAU_CRUISE_M);
    });
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
