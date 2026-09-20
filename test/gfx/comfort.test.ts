/**
 * The comfort pass, and the one number in it that is not arithmetic.
 *
 * `cameraRollRad` is a multiplication and needs little defending. The sign
 * does: it passes through `applyAxisAngle`, `lookAt` and a projection matrix
 * before it reaches a pixel, and a flipped one is a camera that rolls the
 * wrong way in every turn - wrong in a way that looks deliberate, reads as
 * "this feels bad" in a G1 note, and cannot be found by reading the number.
 * So it is asserted where it ends up: on screen.
 */
import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import {
  BANK_FOLLOW_CANDIDATES,
  DEFAULT_COMFORT,
  FOV_CANDIDATES,
  bankFollowLabel,
  cameraRollRad,
} from "../../engine/src/gfx/comfort.js";
import { createFlightState, step, STILL_AIR } from "../../engine/src/sim/flight.js";
import { LIGHT_PISTON } from "../../engine/src/sim/aircraft.js";
import { MODE_IAS_MS } from "../../engine/src/sim/scale.js";

const DEG = 180 / Math.PI;

/**
 * `placeAt`'s rig, in world units at 1:8, reduced to the three lines the sign
 * lives in. Returns the screen y of a point `eastM` to the side of a level
 * flight path, `northM` ahead of it - which is what a horizon is made of.
 */
function screenY(rollRad: number, east: number): number {
  const camera = new PerspectiveCamera(62, 16 / 9, 1, 1e7);
  const fwd = new Vector3(0, 0, 1); // heading 0 is north, as in `placeAt`
  camera.position.set(0, 95, -260); // CAMERA_UP / CAMERA_BACK at 1:8
  camera.up.set(0, 1, 0);
  if (rollRad !== 0) camera.up.applyAxisAngle(fwd, -rollRad);
  camera.lookAt(new Vector3(0, 10, 416)); // CAMERA_AIM_AHEAD * back, aim-up
  camera.updateMatrixWorld(true);
  return new Vector3(east, 0, 40_000).project(camera).y;
}

describe("the camera's horizon roll", () => {
  it("is the bank times the setting, and the setting's ends are the honest ones", () => {
    const bank = 58.7 / DEG;
    expect(cameraRollRad(bank, { ...DEFAULT_COMFORT, bankFollow: 0 })).toBe(0);
    expect(cameraRollRad(bank, { ...DEFAULT_COMFORT, bankFollow: 1 })).toBeCloseTo(bank, 12);
    expect(cameraRollRad(bank, DEFAULT_COMFORT) * DEG).toBeCloseTo(20.5, 1);
    // 0 is the GDD's horizon lock and is what the prototype did before this.
    expect(BANK_FOLLOW_CANDIDATES[0]).toBe(0);
    expect(BANK_FOLLOW_CANDIDATES).toContain(DEFAULT_COMFORT.bankFollow);
    expect(FOV_CANDIDATES).toContain(DEFAULT_COMFORT.fovDeg);
  });

  it("rolls the right way: right wing down lifts the right-hand horizon", () => {
    // In a right bank the camera's up tilts east, so a point off the right
    // wing projects above one off the left and the ground fills the right of
    // the screen - which is what a right turn looks like out of a windscreen.
    const right = screenY(20 / DEG, 20_000);
    const left = screenY(20 / DEG, -20_000);
    expect(right).toBeGreaterThan(left);
    // ...and a locked horizon has no side at all.
    expect(screenY(0, 20_000)).toBeCloseTo(screenY(0, -20_000), 12);
  });

  it("labels the three settings the way the HUD prints them", () => {
    expect(bankFollowLabel(0)).toBe("horizon locked");
    expect(bankFollowLabel(1)).toBe("with the wing");
    expect(bankFollowLabel(0.35)).toBe("eased 0.35");
  });
});

describe("what the setting is worth (F35)", () => {
  /** Peak horizon roll rate over six seconds of full stick, deg/s. */
  function peakRollRateDegS(bankFollow: number): number {
    const s = createFlightState({ altitudeM: 500, mode: "cruise", iasMs: MODE_IAS_MS.cruise });
    const comfort = { ...DEFAULT_COMFORT, bankFollow };
    const env = { ...STILL_AIR, groundElevationM: -20_000 };
    let peak = 0;
    let prev = 0;
    for (let i = 0; i < 360; i++) {
      step(s, { pitch: 0, roll: 1, mode: "cruise" }, env, 1 / 60, LIGHT_PISTON);
      const roll = cameraRollRad(s.bankRad, comfort);
      peak = Math.max(peak, Math.abs(roll - prev) * 60);
      prev = roll;
    }
    return peak * DEG;
  }

  it("holds the peak roll rate to a third of the wing's", () => {
    // The whole of the 0.35 argument: the roll reaches the screen, and the
    // rate it reaches it at is 13 deg/s rather than 38.
    expect(peakRollRateDegS(0)).toBe(0);
    expect(peakRollRateDegS(0.35)).toBeCloseTo(13.3, 1);
    expect(peakRollRateDegS(1)).toBeCloseTo(37.9, 1);
  });
});
