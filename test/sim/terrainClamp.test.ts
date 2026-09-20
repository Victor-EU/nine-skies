/**
 * What the terrain clamp does to the picture. (Finding F35.)
 *
 * The comfort pass went looking for something for camera smoothing to smooth
 * and found this instead, so the numbers that removed a GDD setting are
 * asserted rather than remembered.
 *
 * `step()` ends with `if (altitude < ground + 25) altitude = ground + 25`. It
 * reads as a safety net. It is not: horizontal motion is multiplied by the
 * mode's ground gain and vertical motion is not - the asymmetry `scale.ts`
 * exists to defend - so at cruise the aeroplane covers 2,167 m of ground a
 * second while climbing 6.5, and cannot out-climb a gradient of a third of
 * one per cent. Real ground is nearly two hundred times steeper than that. The clamp is
 * therefore not a net but the thing flying the aeroplane vertically for as
 * long as the ground rises, and every metre it adds is added in one frame.
 *
 * Runs everywhere: the ground under this route is committed beside it (D21).
 */
import { describe, expect, it } from "vitest";
import { hasGround, sea } from "../route/fixture.ts";
import { routeLengthKm } from "../../engine/src/sim/route.js";
import { createFlightState, step, STILL_AIR, type FlightInput } from "../../engine/src/sim/flight.js";
import { LIGHT_PISTON, maxClimbRateMs } from "../../engine/src/sim/aircraft.js";
import { DEFAULT_PACING, MODE_IAS_MS, groundGain } from "../../engine/src/sim/scale.js";

const HZ = 60;
const DT = 1 / HZ;

/**
 * Linear between the profile's kilometre samples.
 *
 * The fixture's own `ground` is `Math.round(km)`, a staircase, and a staircase
 * measured at 36 m a frame reports the sampling and not the world - it put the
 * worst frame at 462 m before this was noticed. The renderer reads its heights
 * bilinearly, so this does too.
 */
function interpolated(profile: readonly number[]) {
  return (km: number): number => {
    const x = Math.min(Math.max(0, km), profile.length - 1.0001);
    const i = Math.floor(x);
    return profile[i]! + (profile[i + 1]! - profile[i]!) * (x - i);
  };
}

/** Steepest rise across one kilometre of the route. */
function steepestClimbGradient(profile: readonly number[]): number {
  let steepest = 0;
  for (let i = 0; i < profile.length - 1; i++) {
    steepest = Math.max(steepest, (profile[i + 1]! - profile[i]!) / 1000);
  }
  return steepest;
}

describe.skipIf(!hasGround)("the terrain clamp, over real ground", () => {
  it("is out-climbed by the route by two orders of magnitude", () => {
    const profile = sea().profiled.profileM;
    // At sea level, which is the aeroplane's best case: the climb rate falls
    // with density and the finding only gets worse with height.
    const flyable = maxClimbRateMs(LIGHT_PISTON, 0) /
      (MODE_IAS_MS.cruise * groundGain("cruise", DEFAULT_PACING));
    // A third of one per cent - a fifth of a degree - and it only falls.
    expect(flyable).toBeCloseTo(0.0033, 4);
    // And the route's steepest kilometre is a third of a gradient: 2,271 m to
    // 2,899 m, thirty-two degrees, on the way onto the plateau.
    const steepest = steepestClimbGradient(profile);
    expect(steepest).toBeCloseTo(0.628, 3);
    expect(steepest / flyable).toBeGreaterThan(190);
  });

  it("flies the aeroplane vertically, in single-frame steps, for seconds at a time", () => {
    const { profiled, route } = sea();
    const ground = interpolated(profiled.profileM);
    const lengthKm = routeLengthKm(route);
    const state = createFlightState({
      altitudeM: 1200,
      mode: "cruise",
      iasMs: MODE_IAS_MS.cruise,
      headingRad: 0,
      northM: 0,
    });
    const input: FlightInput = { pitch: 0, roll: 0, mode: "cruise" };

    let km = 0;
    let frames = 0;
    let shoved = 0;
    let worstShoveM = 0;
    let run = 0;
    let longestRun = 0;
    while (km < lengthKm - 1 && frames < 90 * 60 * HZ) {
      const groundM = ground(km);
      // An autopilot holding 600 m above the ground, which is the friendliest
      // policy a player could fly and so the weakest case for the finding.
      input.pitch = Math.max(-1, Math.min(1, (groundM + 600 - state.altitudeM) / 300));
      const north = state.northM;
      const was = state.altitudeM;
      const rate = state.verticalRateMs;
      step(state, input, { ...STILL_AIR, groundElevationM: groundM }, DT, LIGHT_PISTON);
      km += Math.abs(state.northM - north) / 1000;
      // What the clamp added over what the aeroplane would have done unaided.
      const shove = state.altitudeM - (was + rate * DT);
      if (shove > 0.01) {
        shoved++;
        worstShoveM = Math.max(worstShoveM, shove);
        longestRun = Math.max(longestRun, ++run);
      } else {
        run = 0;
      }
      frames++;
    }

    // Twenty metres of altitude in a sixtieth of a second is 1,250 m/s of
    // camera, and it is not once: one frame in forty-five over the whole
    // route, and a whole second without a break at its worst.
    expect(worstShoveM).toBeCloseTo(20.8, 1);
    expect(shoved / frames).toBeGreaterThan(0.02);
    expect(longestRun).toBeGreaterThanOrEqual(60);
  });

  it("is not something a lag on the camera can take out", () => {
    // The rejected setting, built here rather than shipped. A first-order lag
    // has unity gain at DC, so against a ramp it delays and does not reduce;
    // what it has to work on is the corners, and the corners are one frame
    // wide. Over the real route it moves the peak vertical acceleration of
    // the camera by less than a factor of two in either direction - including
    // the wrong one, which is the reason there is no such setting (F35).
    const { profiled, route } = sea();
    const ground = interpolated(profiled.profileM);
    const lengthKm = routeLengthKm(route);

    const peakAccel = (tauS: number): number => {
      const state = createFlightState({
        altitudeM: 1200,
        mode: "cruise",
        iasMs: MODE_IAS_MS.cruise,
        headingRad: 0,
        northM: 0,
      });
      const input: FlightInput = { pitch: 0, roll: 0, mode: "cruise" };
      let km = 0;
      let frames = 0;
      let camera = state.altitudeM;
      let previous = camera;
      let speed = 0;
      let peak = 0;
      while (km < lengthKm - 1 && frames < 90 * 60 * HZ) {
        const groundM = ground(km);
        input.pitch = Math.max(-1, Math.min(1, (groundM + 600 - state.altitudeM) / 300));
        const north = state.northM;
        step(state, input, { ...STILL_AIR, groundElevationM: groundM }, DT, LIGHT_PISTON);
        km += Math.abs(state.northM - north) / 1000;
        camera =
          tauS > 0
            ? camera + (state.altitudeM - camera) * (1 - Math.exp(-DT / tauS))
            : state.altitudeM;
        // Clamped, because an unbounded lag ends up inside the hill.
        camera = Math.min(state.altitudeM + 60, Math.max(state.altitudeM - 60, camera));
        const next = (camera - previous) / DT;
        previous = camera;
        peak = Math.max(peak, Math.abs((next - speed) / DT));
        speed = next;
        frames++;
      }
      return peak;
    };

    const rigid = peakAccel(0);
    const smoothed = peakAccel(0.25);
    expect(rigid).toBeGreaterThan(40_000); // m/s^2 - thousands of g
    expect(smoothed / rigid).toBeGreaterThan(0.5);
    expect(smoothed / rigid).toBeLessThan(2);
  });
});
