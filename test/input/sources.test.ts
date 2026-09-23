/**
 * Keyboard, gamepad and touch behind the one table, merged into one intent.
 */
import { describe, expect, it } from "vitest";
import { mergeAxes } from "../../engine/src/input/axes.js";
import { GamepadSource, axesFromPad, deadZone, type PadSnapshot } from "../../engine/src/input/gamepad.js";
import { Input } from "../../engine/src/input/input.js";
import { KeyboardSource, axesFromHeld } from "../../engine/src/input/keyboard.js";

function pad(over: Partial<{ axes: number[]; down: number[] }> = {}): PadSnapshot {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: (over.down ?? []).includes(i) }));
  return { axes: over.axes ?? [0, 0, 0, 0], buttons };
}

describe("the keyboard", () => {
  it("reads a held key as the whole axis, either spelling", () => {
    expect(axesFromHeld(new Set(["arrowleft"]))).toEqual({ speed: 0, heading: -1 });
    expect(axesFromHeld(new Set(["d"]))).toEqual({ speed: 0, heading: 1 });
    expect(axesFromHeld(new Set(["w", "s"]))).toEqual({ speed: 0, heading: 0 });
    expect(axesFromHeld(new Set(["arrowup"]))).toEqual({ speed: 1, heading: 0 });
  });

  it("fires auto once per press however long the key repeats, and claims only its keys", () => {
    const kb = new KeyboardSource();
    expect(kb.keyDown(" ")).toBe(true);
    expect(kb.keyDown(" ")).toBe(true);
    expect(kb.drain()).toEqual(["auto"]);
    expect(kb.drain()).toEqual([]);
    kb.keyUp(" ");
    kb.keyDown(" ");
    expect(kb.drain()).toEqual(["auto"]);
    expect(kb.keyDown("f5")).toBe(false);
    expect(kb.keyDown("m")).toBe(false);
  });

  it("releases everything when the window loses focus", () => {
    const kb = new KeyboardSource();
    kb.keyDown("w");
    expect(kb.active()).toBe(true);
    kb.releaseAll();
    expect(kb.active()).toBe(false);
    expect(kb.axes()).toEqual({ speed: 0, heading: 0 });
  });
});

describe("the gamepad", () => {
  it("has a dead zone that rescales rather than steps", () => {
    expect(deadZone(0.1)).toBe(0);
    expect(deadZone(0.15)).toBe(0);
    expect(deadZone(1)).toBe(1);
    expect(deadZone(-1)).toBe(-1);
    expect(deadZone(0.575)).toBeCloseTo(0.5, 9);
  });

  it("reads direction from the stick and speed from the triggers", () => {
    expect(axesFromPad(pad({ axes: [1, 0] }))).toEqual({ speed: 0, heading: 1 });
    expect(axesFromPad(pad({ down: [7] }))).toEqual({ speed: 1, heading: 0 });
    expect(axesFromPad(pad({ down: [6] }))).toEqual({ speed: -1, heading: 0 });
    expect(axesFromPad(pad({ down: [6, 7] }))).toEqual({ speed: 0, heading: 0 });
  });

  it("fires auto on the frame the button goes down, once", () => {
    const gp = new GamepadSource();
    expect(gp.read(pad({ down: [0] })).actions).toEqual(["auto"]);
    expect(gp.read(pad({ down: [0] })).actions).toEqual([]);
    expect(gp.read(pad()).actions).toEqual([]);
    expect(gp.read(pad({ down: [0] })).actions).toEqual(["auto"]);
    expect(gp.read(null)).toEqual({ axes: { speed: 0, heading: 0 }, actions: [], active: false });
  });
});

describe("one intent", () => {
  it("sums the devices and saturates", () => {
    expect(mergeAxes({ speed: 1, heading: 0.5 }, { speed: 1, heading: -1 })).toEqual({ speed: 1, heading: -0.5 });
  });

  it("hears every device and remembers which spoke last", () => {
    const input = new Input();
    input.keyboard.keyDown("a");
    input.touch.set({ speed: 1 });
    input.touch.press("auto");
    const intent = input.poll(pad({ down: [0] }));
    expect(intent).toEqual({ speed: 1, heading: -1, actions: ["auto", "auto"] });
    expect(input.lastDevice).toBe("touch");
    input.touch.set({ speed: 0 });
    input.poll(null);
    expect(input.lastDevice).toBe("keyboard");
  });
});
