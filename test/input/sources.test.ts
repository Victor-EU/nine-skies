import { describe, expect, it } from "vitest";
import { KeyboardSource, axesFromHeld } from "../../engine/src/input/keyboard.js";
import {
  DEAD_ZONE,
  GamepadSource,
  axesFromPad,
  deadZone,
  type PadSnapshot,
} from "../../engine/src/input/gamepad.js";
import { mergeAxes } from "../../engine/src/input/axes.js";
import { Input } from "../../engine/src/input/input.js";
import { createFlightState, step, STILL_AIR } from "../../engine/src/sim/flight.js";
import { LIGHT_PISTON } from "../../engine/src/sim/aircraft.js";

function pad(axes: number[], down: number[] = []): PadSnapshot {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i) }));
  return { axes, buttons };
}

describe("keyboard", () => {
  it("reads held keys as whole axes, and opposing keys as nothing", () => {
    expect(axesFromHeld(new Set(["w"]))).toEqual({ pitch: 1, roll: 0 });
    expect(axesFromHeld(new Set(["s", "a"]))).toEqual({ pitch: -1, roll: -1 });
    expect(axesFromHeld(new Set(["w", "s"]))).toEqual({ pitch: 0, roll: 0 });
  });

  it("claims its own keys and no others", () => {
    const kb = new KeyboardSource();
    expect(kb.keyDown("w")).toBe(true);
    expect(kb.keyDown("f")).toBe(false);
    expect(kb.keyDown("arrowup")).toBe(false);
  });

  it("fires an action once per press, however many keydowns auto-repeat sends", () => {
    const kb = new KeyboardSource();
    kb.keyDown("v");
    kb.keyDown("v");
    kb.keyDown("v");
    expect(kb.drain()).toEqual(["cycleDrama"]);
    expect(kb.drain()).toEqual([]);
    kb.keyUp("v");
    kb.keyDown("v");
    expect(kb.drain()).toEqual(["cycleDrama"]);
  });

  it("lets go of everything when told the window did", () => {
    const kb = new KeyboardSource();
    kb.keyDown("w");
    kb.keyDown("d");
    expect(kb.active()).toBe(true);
    kb.releaseAll();
    expect(kb.active()).toBe(false);
    expect(kb.axes()).toEqual({ pitch: 0, roll: 0 });
  });
});

describe("gamepad", () => {
  it("has a dead zone that rescales rather than steps", () => {
    expect(deadZone(0)).toBe(0);
    expect(deadZone(DEAD_ZONE)).toBe(0);
    expect(deadZone(-DEAD_ZONE)).toBe(0);
    // Just past the zone the output is just past zero - no jump.
    expect(deadZone(DEAD_ZONE + 0.001)).toBeCloseTo(0.001 / (1 - DEAD_ZONE), 5);
    expect(deadZone(1)).toBe(1);
    expect(deadZone(-1)).toBe(-1);
    expect(deadZone(1.2)).toBe(1);
  });

  it("reads the left stick as pitch and roll, forward climbing", () => {
    expect(axesFromPad(pad([0, -1]))).toEqual({ pitch: 1, roll: 0 });
    expect(axesFromPad(pad([0, 1]))).toEqual({ pitch: -1, roll: 0 });
    expect(axesFromPad(pad([1, 0]))).toEqual({ pitch: 0, roll: 1 });
    expect(axesFromPad(pad([0, -1], []), true)).toEqual({ pitch: -1, roll: 0 });
  });

  it("reads a resting stick as silence", () => {
    expect(axesFromPad(pad([0.04, -0.09]))).toEqual({ pitch: 0, roll: 0 });
  });

  it("fires a button on the frame it goes down and not again until it comes up", () => {
    const gp = new GamepadSource();
    expect(gp.read(pad([0, 0], [12])).actions).toEqual(["cycleDrama"]);
    expect(gp.read(pad([0, 0], [12])).actions).toEqual([]);
    expect(gp.read(pad([0, 0], [])).actions).toEqual([]);
    expect(gp.read(pad([0, 0], [12, 2])).actions).toEqual(["low", "cycleDrama"]);
  });

  it("forgets held buttons when the pad goes away, so a reconnect cannot replay them", () => {
    const gp = new GamepadSource();
    gp.read(pad([0, 0], [9]));
    expect(gp.read(null)).toEqual({ axes: { pitch: 0, roll: 0 }, actions: [], active: false });
    expect(gp.read(pad([0, 0], [9])).actions).toEqual(["reset"]);
  });
});

describe("both at once", () => {
  it("adds the two devices and saturates", () => {
    expect(mergeAxes({ pitch: 1, roll: 0 }, { pitch: 0.5, roll: -0.25 })).toEqual({
      pitch: 1,
      roll: -0.25,
    });
    expect(mergeAxes({ pitch: -1, roll: 0.5 }, { pitch: 0.5, roll: 0.5 })).toEqual({
      pitch: -0.5,
      roll: 1,
    });
  });

  it("records which device spoke last, for the session notes", () => {
    const input = new Input();
    expect(input.lastDevice).toBe("keyboard");
    input.poll(pad([0, -0.8]));
    expect(input.lastDevice).toBe("gamepad");
    input.keyboard.keyDown("w");
    const intent = input.poll(pad([0, 0]));
    expect(input.lastDevice).toBe("keyboard");
    expect(intent.pitch).toBe(1);
    input.keyboard.keyUp("w");
    // Silence changes nothing: the last device to speak is still the answer.
    input.poll(null);
    expect(input.lastDevice).toBe("keyboard");
  });

  it("delivers keyboard presses and pad presses in one list", () => {
    const input = new Input();
    input.keyboard.keyDown("3");
    expect(input.poll(pad([0, 0], [15])).actions).toEqual(["boost", "cycleCompression"]);
  });
});

/**
 * F33: why the keyboard has no input ramp. The flight model's own lag is the
 * only smoothing a key needs - measured, not assumed.
 */
describe("a digital key through the flight model", () => {
  const DT = 1 / 120;
  function climb(altitudeM: number, pitchAt: (t: number) => number, seconds: number): number {
    const s = createFlightState({ altitudeM, iasMs: 60 });
    const input = { pitch: 0, roll: 0, mode: "cruise" as const };
    for (let t = 0; t < seconds; t += DT) {
      input.pitch = pitchAt(t);
      step(s, input, STILL_AIR, DT, LIGHT_PISTON);
    }
    return s.altitudeM - altitudeM;
  }

  it("gains less than a metre from a half-second ramp, so none is built", () => {
    const stepGain = climb(500, () => 1, 3);
    const rampGain = climb(500, (t) => Math.min(1, t / 0.5), 3);
    expect(stepGain).toBeGreaterThan(5);
    expect(stepGain - rampGain).toBeLessThan(1);
  });

  it("gains two metres from a one-second tap on the plateau, which is the heaviness", () => {
    const low = climb(500, (t) => (t < 1 ? 1 : 0), 20);
    const high = climb(4500, (t) => (t < 1 ? 1 : 0), 20);
    expect(low).toBeGreaterThan(5);
    expect(high).toBeLessThan(2.5);
    expect(high).toBeGreaterThan(1.5);
  });
});
