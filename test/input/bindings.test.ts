/**
 * Four inputs and no others (D74): the table is the fact, and everything
 * else is derived from it.
 */
import { describe, expect, it } from "vitest";
import {
  ACTION_BINDINGS,
  AXIS_BINDINGS,
  boundKeys,
  helpCaps,
  helpLines,
} from "../../engine/src/input/bindings.js";

describe("the binding table", () => {
  it("has the two axes and the one action, and nothing else", () => {
    expect(AXIS_BINDINGS.map((b) => b.axis)).toEqual(["speed", "heading"]);
    expect(ACTION_BINDINGS.map((b) => b.action)).toEqual(["auto"]);
  });

  it("claims the arrows, WASD and space, and no key twice", () => {
    const keys = boundKeys();
    for (const k of ["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", " "])
      expect(keys.has(k)).toBe(true);
    const all = [
      ...AXIS_BINDINGS.flatMap((b) => [...b.plus, ...b.minus]),
      ...ACTION_BINDINGS.flatMap((b) => [...b.keys]),
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  it("gives every axis a pad reading, by stick or by a pair of buttons", () => {
    for (const b of AXIS_BINDINGS)
      expect(b.padAxis !== null || (b.padPlus !== null && b.padMinus !== null)).toBe(true);
    const buttons = [
      ...AXIS_BINDINGS.flatMap((b) => [b.padPlus, b.padMinus]).filter((x) => x !== null),
      ...ACTION_BINDINGS.map((b) => b.padButton),
    ];
    expect(new Set(buttons).size).toBe(buttons.length);
  });

  it("derives one help line per axis and per action", () => {
    const lines = helpLines();
    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatchObject({ keys: "Space", pad: "A", label: "auto" });
    expect(lines[0]!.keys).toContain("up arrow");
  });

  it("derives the keys as keycaps, left before right and faster before slower", () => {
    expect(helpCaps()).toEqual([
      { caps: [["W", "S"], ["↑", "↓"]], label: "faster / slower" },
      { caps: [["A", "D"], ["←", "→"]], label: "direction" },
      { caps: [["Space"]], label: "auto" },
    ]);
  });
});
