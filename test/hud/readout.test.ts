/**
 * Can the five readouts be read? (Finding F46.)
 *
 * The GDD's HUD paragraph is one sentence and its second half is the
 * requirement: *"Numbers are there to confirm what the player already feels,
 * not to be read first."* Nothing had ever checked that, and when it was
 * checked the answer was no - the ground readout changed on sixty frames out
 * of sixty in its worst second, and the altimeter in feet was over the HUD's
 * own two-a-second ceiling in 97 % of the flight.
 *
 * So the assertion here is the ceiling itself, flown: no readout may change
 * more than twice in any one second of Expedition 1, in either unit system.
 * The flight is the real one - the authored route over the ground committed
 * beside it (D21) - at sixty frames a second, which is the rate the screen
 * actually asks these questions at.
 */
import { describe, expect, it } from "vitest";
import { hasGround, sea } from "../route/fixture.ts";
import {
  METRIC_STEPS,
  SteadyReadout,
  createReadouts,
  formatStep,
  quantise,
  readoutStep,
  stepDecimals,
  type ReadoutName,
} from "../../engine/src/hud/readout.js";
import { HUD_HOLD_S } from "../../engine/src/hud/steady.js";
import {
  FEET_PER_METRE,
  altitudeValue,
  climbValue,
  ladderAtLeast,
  ladderAtMost,
  temperatureValue,
  type UnitSystem,
} from "../../engine/src/hud/units.js";
import { createFlightState, step, telemetry, type Environment } from "../../engine/src/sim/flight.js";
import { LIGHT_PISTON } from "../../engine/src/sim/aircraft.js";
import {
  climbFloor,
  floorProfile,
  followFloor,
  modeAtKm,
  routeLengthKm,
} from "../../engine/src/sim/route.js";
import {
  standInGroundTempC,
  standInPrecipMm,
} from "../../engine/src/terrain/syntheticTiles.js";
import { unprojectAlbers } from "../../engine/src/terrain/worldGrid.js";
import { loadExpedition } from "../../tools/expedition.ts";
import { measureAlong, pointAtKm } from "../../tools/corridor.ts";
import { projectAlbers } from "../../engine/src/terrain/worldGrid.js";

describe("the 1-2-5 ladder, which both the scale bar and the steps pick from", () => {
  it("rounds down for a bar that has to fit and up for a step that has to be legible", () => {
    expect(ladderAtMost(7)).toBe(5);
    expect(ladderAtMost(5)).toBe(5);
    expect(ladderAtLeast(2.54)).toBe(5);
    expect(ladderAtLeast(5)).toBe(5);
    expect(ladderAtLeast(16.4)).toBe(20);
  });
});

describe("how coarsely each readout is shown", () => {
  it("takes the metric step from the measurement and never shows finer", () => {
    // 5.08 m/s at the route's 95th percentile, half a second between
    // updates: 2.54 m, and the ladder's next step up is 5.
    expect(METRIC_STEPS.altitude).toBe(5);
    expect(METRIC_STEPS.altitude).toBeGreaterThanOrEqual(5.08 * HUD_HOLD_S);
  });

  it("makes imperial follow metric rather than measuring it again", () => {
    // F45's line is that the toggle changes the units, not the reading. A
    // step measured separately in feet would be 10 ft - finer than 5 m - and
    // the player would be told the world is known more precisely in one
    // system than the other.
    for (const name of ["altitude", "ground", "temperature", "climb"] as ReadoutName[]) {
      const metric = readoutStep(name, "metric");
      const imperial = readoutStep(name, "imperial");
      const perMetric = name === "temperature" ? 1.8 : name === "climb" ? FEET_PER_METRE * 60 : FEET_PER_METRE;
      expect(imperial).toBeGreaterThanOrEqual(metric * perMetric);
    }
    expect(readoutStep("altitude", "imperial")).toBe(20);
    expect(readoutStep("ground", "imperial")).toBe(50);
    expect(readoutStep("climb", "imperial")).toBe(20);
    expect(readoutStep("temperature", "imperial")).toBe(0.2);
  });

  it("reads the same in both systems where the quantity has no units", () => {
    expect(readoutStep("humidity", "imperial")).toBe(readoutStep("humidity", "metric"));
    expect(readoutStep("density", "imperial")).toBe(readoutStep("density", "metric"));
  });

  it("keeps ground fine enough to show a hole, which the rule alone would not", () => {
    // The rule's own answer for ground is 500 m, because the ground under a
    // 1:8 aircraft moves at up to 1.9 km/s. The GDD's "this is a hole" row is
    // written against Turpan's -154 m, and a 500 m step cannot show it.
    expect(quantise(-154, METRIC_STEPS.ground)).toBe(-150);
    expect(quantise(-154, 500)).toBe(0);
  });
});

describe("a quantised value", () => {
  it("prints as many decimals as its step has and no more", () => {
    expect(stepDecimals(5)).toBe(0);
    expect(stepDecimals(0.2)).toBe(1);
    expect(stepDecimals(0.01)).toBe(2);
    expect(formatStep(4006.3, 5)).toBe("4,005");
    expect(formatStep(-19.47, 0.2)).toBe("-19.4");
    expect(formatStep(0.7013, 0.01)).toBe("0.70");
  });

  it("never prints a negative zero", () => {
    expect(quantise(-0.3, 5)).toBe(0);
    expect(formatStep(-0.3, 5)).toBe("0");
  });
});

describe("a readout held to the HUD's own rate", () => {
  it("shows the first frame at once rather than a dash for half a second", () => {
    const r = new SteadyReadout(5);
    expect(r.text()).toBe("—");
    expect(r.update(4006, 0)).toBe(4005);
    expect(r.text()).toBe("4,005");
  });

  it("changes at most twice a second however fast the value moves", () => {
    const r = new SteadyReadout(5);
    let changes = 0;
    let last = r.update(0, 0);
    // Twenty metres a second, which is four steps: without the hold this
    // would change four times a second and with a finer step, sixty.
    for (let i = 1; i <= 600; i++) {
      const t = i / 60;
      const now = r.update(20 * t, t);
      if (now !== last) changes++;
      last = now;
    }
    expect(changes).toBeLessThanOrEqual(Math.ceil(10 / HUD_HOLD_S));
  });

  it("is never more than one hold behind the world", () => {
    const r = new SteadyReadout(METRIC_STEPS.altitude);
    r.update(0, 0);
    let worst = 0;
    for (let i = 1; i <= 600; i++) {
      const t = i / 60;
      // The fastest this aircraft climbs at sea level.
      const truth = 7 * t;
      worst = Math.max(worst, Math.abs(r.update(truth, t) - truth));
    }
    // The hold costs less than the step already does, which is the whole
    // argument for holding rather than smoothing.
    expect(worst).toBeLessThanOrEqual(7 * HUD_HOLD_S + METRIC_STEPS.altitude / 2);
  });

  it("gives every readout of a system its own step", () => {
    const metric = createReadouts("metric");
    const imperial = createReadouts("imperial");
    expect(metric.altitude.step).toBe(5);
    expect(imperial.altitude.step).toBe(20);
    expect(metric.climb.step).toBe(0.1);
    expect(imperial.climb.step).toBe(20);
  });
});

/** One frame of the HUD, as `main.ts` writes it. */
function hudText(
  units: UnitSystem,
  r: ReturnType<typeof createReadouts>,
  nowS: number,
  altM: number,
  groundM: number,
  tempC: number,
  humidity: number,
  sigma: number,
  climbMs: number,
): Record<ReadoutName, string> {
  const write = (name: ReadoutName, value: number) => {
    r[name].update(value, nowS);
    return r[name].text();
  };
  return {
    altitude: write("altitude", altitudeValue(altM, units)),
    ground: write("ground", altitudeValue(groundM, units)),
    temperature: write("temperature", temperatureValue(tempC, units)),
    humidity: write("humidity", humidity * 100),
    density: write("density", sigma),
    climb: write("climb", climbValue(climbMs, units)),
  };
}

/** Expedition 1 flown at sixty frames a second, counting what the HUD says. */
function flyTheHud(units: UnitSystem): Record<ReadoutName, number[]> {
  const expedition = loadExpedition("content/expeditions/sea-to-sky.yaml");
  const { route, ground: rawGround } = sea();
  // The app reads a bilinearly interpolated field; the profile is one sample
  // a kilometre, so interpolating between stations is what it actually sees.
  // Left as a step function the ground looks *steadier* than it is.
  const groundAt = (km: number): number => {
    const i = Math.floor(km);
    return rawGround(i) + (rawGround(i + 1) - rawGround(i)) * (km - i);
  };
  const waypoints = expedition.route.map((p) => projectAlbers(p.lat, p.lon));
  const metrics = measureAlong(waypoints);
  const policy = followFloor(
    floorProfile(
      climbFloor(route, groundAt, { strideKm: 25, toleranceM: 5, clearanceM: 300, arrivalM: 500 }),
    ),
  );

  const dt = 1 / 60;
  const state = createFlightState({ altitudeM: expedition.start_altitude_m });
  const readouts = createReadouts(units);
  const lengthKm = routeLengthKm(route);
  const perSecond: Record<ReadoutName, number[]> = {
    altitude: [], ground: [], temperature: [], humidity: [], density: [], climb: [],
  };
  const names = Object.keys(perSecond) as ReadoutName[];
  let travelledM = 0;
  let seconds = 0;
  let last: Record<ReadoutName, string> | null = null;

  while (travelledM < lengthKm * 1000 && seconds < 3600) {
    const km = travelledM / 1000;
    const p = pointAtKm(waypoints, metrics, km);
    const { latDeg, lonDeg } = unprojectAlbers(p.eastM, p.northM);
    const groundM = groundAt(km);
    const env: Environment = {
      groundElevationM: groundM,
      groundTempC: standInGroundTempC(p.northM / 1000, groundM, expedition.month),
      monthlyPrecipMm: standInPrecipMm({ latDeg, lonDeg }, expedition.month),
      windEastMs: 0,
      windNorthMs: 0,
    };
    const input = { pitch: policy(km, seconds, state.altitudeM), roll: 0, mode: modeAtKm(route, km) };
    const beforeM = state.northM;
    // Bounce off, like every other flown check in the repo: the clamp is a
    // kindness to a player and a lie to a measurement (route.ts).
    step(state, input, { ...env, groundElevationM: -1e9 }, dt, LIGHT_PISTON);
    travelledM += state.northM - beforeM;
    seconds += dt;

    const tm = telemetry(state, env, input, LIGHT_PISTON);
    const now = hudText(units, readouts, seconds, state.altitudeM, groundM,
      tm.outsideAirTempC, tm.humidity, tm.densityRatio, state.verticalRateMs);
    const s = Math.floor(seconds);
    for (const name of names) {
      while (perSecond[name].length <= s) perSecond[name].push(0);
      if (last && last[name] !== now[name]) perSecond[name][s]!++;
    }
    last = now;
  }
  return perSecond;
}

describe.skipIf(!hasGround)("the HUD, flown down Expedition 1 at sixty frames a second", () => {
  for (const units of ["metric", "imperial"] as const) {
    it(`changes no readout more than twice in any second, in ${units}`, () => {
      const perSecond = flyTheHud(units);
      for (const [name, xs] of Object.entries(perSecond)) {
        let worst = 0;
        for (const n of xs) if (n > worst) worst = n;
        expect(worst, `${name} in its worst second`).toBeLessThanOrEqual(2);
      }
    });
  }

  it("is what the unheld HUD could not do, which is why the hold exists", () => {
    // The shape of the defect, kept as an assertion rather than a sentence:
    // with no step and no hold, the ground readout changes at the frame rate.
    const { ground: rawGround } = sea();
    const raw = new SteadyReadout(1, 0);
    let changes = 0;
    let last = raw.update(rawGround(0), 0);
    for (let i = 1; i <= 60; i++) {
      // One kilometre of the Hengduan crossed in a second, which is slower
      // than cruise: 130 km/min crosses two.
      const km = 1800 + i / 60;
      const now = raw.update(rawGround(Math.floor(km)) +
        (rawGround(Math.floor(km) + 1) - rawGround(Math.floor(km))) * (km % 1), i / 60);
      if (now !== last) changes++;
      last = now;
    }
    expect(changes).toBeGreaterThan(2);
  });
});
