/**
 * The comfort pass, and the one number in it that is not arithmetic.
 *
 * The row's last item - *no strobing* - is at the bottom of this file, and it
 * is a measurement rather than a setting: the fastest anything on this HUD
 * can change appearance, driven by an adversary trying to make it flash
 * (F45).
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
import { BOOST_MIN_SIGMA, boostCeilingM, densityRatio } from "../../engine/src/sim/atmosphere.js";
import { HUD_HOLD_S, SteadyFlag } from "../../engine/src/hud/steady.js";
import { KeyboardSource } from "../../engine/src/input/keyboard.js";
import { GamepadSource } from "../../engine/src/input/gamepad.js";
import { ACTION_BINDINGS } from "../../engine/src/input/bindings.js";

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

/**
 * *No strobing*, the fourth item on the comfort row.
 *
 * Not a setting and not a promise: a property of the build, which means it
 * can be measured and can also stop being true. Two ways a screen flashes -
 * an input repeating, and a state that chatters - and both are checked
 * against WCAG 2.3.1's threshold, which is more than three flashes in any
 * one second.
 */
describe("nothing on the HUD can flash", () => {
  it("fires an action once per press, however long the key is held", () => {
    const keys = new KeyboardSource();
    const map = ACTION_BINDINGS.find((b) => b.action === "toggleMap")!;
    // Auto-repeat re-fires keydown at the operating system's rate, which is
    // about thirty a second - and the map is a full-screen panel.
    for (let i = 0; i < 100; i++) keys.keyDown(map.key);
    expect(keys.drain()).toEqual(["toggleMap"]);
    keys.keyUp(map.key);
    keys.keyDown(map.key);
    expect(keys.drain()).toEqual(["toggleMap"]);
  });

  it("does the same for a pad button held down across frames", () => {
    const pad = new GamepadSource();
    const map = ACTION_BINDINGS.find((b) => b.action === "toggleMap")!;
    const held = {
      axes: [0, 0],
      buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === map.padButton })),
    };
    expect(pad.read(held).actions).toEqual(["toggleMap"]);
    for (let frame = 0; frame < 60; frame++) expect(pad.read(held).actions).toEqual([]);
  });

  /**
   * WCAG 2.3.1 counts flashes in any one second rather than on average, and
   * the two answers are not the same here: the limit cycle is uneven, so the
   * mean is two a second and its worst second is eight.
   */
  const worstSecond = (changes: readonly number[]): number => {
    let worst = 0;
    for (let i = 0; i < changes.length; i++) {
      let j = i;
      while (j < changes.length && changes[j]! - changes[i]! < 1) j++;
      worst = Math.max(worst, j - i);
    }
    return worst / 2;
  };

  /**
   * An aeroplane holding altitude at the boost ceiling, which is what a
   * player testing boost does. A relay on the threshold is the fastest limit
   * cycle a lagged system has, and faster than a hand - but the state it
   * chatters is the same one a steady hand produces, because the quantity is
   * sitting on the line either way.
   */
  const flyTheThreshold = (flag: SteadyFlag | null): { changes: number[]; swingM: number } => {
    const ceiling = boostCeilingM();
    const state = createFlightState({ altitudeM: ceiling, iasMs: 60, mode: "cruise" });
    const dt = 1 / 60;
    const changes: number[] = [];
    let lo = Infinity;
    let hi = -Infinity;
    let shown = densityRatio(state.altitudeM) < BOOST_MIN_SIGMA;
    for (let i = 0; i < 120 / dt; i++) {
      const pitch = state.altitudeM < ceiling ? 1 : -1;
      step(state, { pitch, roll: 0, mode: "cruise" }, { ...STILL_AIR, groundElevationM: 0 }, dt);
      const t = i * dt;
      const raw = densityRatio(state.altitudeM) < BOOST_MIN_SIGMA;
      const now = flag ? flag.update(raw, t) : raw;
      if (now !== shown) changes.push(t);
      shown = now;
      if (t > 10) {
        lo = Math.min(lo, state.altitudeM);
        hi = Math.max(hi, state.altitudeM);
      }
    }
    return { changes, swingM: hi - lo };
  };

  it("would flash eight times a second without a rate limit on it", () => {
    // The density bar changes colour at sigma 0.70, which is 3,564 m, and
    // there is no hysteresis on it by decision: the boost lockout comes out
    // of the density formula rather than out of a pair of altitudes.
    const { changes, swingM } = flyTheThreshold(null);
    expect(changes.length).toBe(508);
    expect(worstSecond(changes)).toBeGreaterThan(3);
    // And it is not a manoeuvre. The aeroplane moves seven centimetres.
    expect(swingM).toBeLessThan(0.1);
  });

  it("changes once a second at the most once it goes through the HUD's flag", () => {
    const { changes } = flyTheThreshold(new SteadyFlag(false));
    expect(worstSecond(changes)).toBeLessThanOrEqual(1);
    // Under the threshold by construction rather than by luck: a change
    // cannot be committed within half a second of the last one.
    for (let i = 1; i < changes.length; i++) {
      expect(changes[i]! - changes[i - 1]!).toBeGreaterThanOrEqual(HUD_HOLD_S - 1e-9);
    }
  });

  it("never delays a change that is not chatter", () => {
    const flag = new SteadyFlag(false);
    // A flag that has been still commits the moment the world changes.
    expect(flag.update(true, 100)).toBe(true);
    // A second change inside the window waits, and then arrives.
    expect(flag.update(false, 100.1)).toBe(true);
    expect(flag.update(false, 100.4)).toBe(true);
    expect(flag.update(false, 100.5)).toBe(false);
  });

  it("says the same thing in words at the same threshold", () => {
    // Which is the other half of why the bar is safe: it is not carrying the
    // fact on its own. Both readouts are driven from one constant, and now
    // from one flag, so they cannot disagree at any altitude.
    expect(BOOST_MIN_SIGMA).toBe(0.7);
    expect(boostCeilingM()).toBeCloseTo(3564, 0);
  });
});
