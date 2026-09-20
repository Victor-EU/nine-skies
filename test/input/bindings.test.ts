import { describe, expect, it } from "vitest";
import {
  ACTION_BINDINGS,
  AXIS_BINDINGS,
  boundKeys,
  helpLines,
  padButtonName,
} from "../../engine/src/input/bindings.js";

/**
 * The table is the one place a control is defined, and these are the checks
 * that keep it one place: nothing bound twice, nothing bound and not shown.
 */
describe("the binding table", () => {
  it("binds every key at most once", () => {
    const keys = [
      ...AXIS_BINDINGS.flatMap((b) => [b.plus, b.minus]),
      ...ACTION_BINDINGS.map((b) => b.key),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    expect(boundKeys().size).toBe(keys.length);
  });

  it("binds every gamepad button at most once, and every stick axis once", () => {
    const buttons = ACTION_BINDINGS.map((b) => b.padButton).filter((b) => b !== null);
    expect(new Set(buttons).size).toBe(buttons.length);
    const axes = AXIS_BINDINGS.map((b) => b.padAxis);
    expect(new Set(axes).size).toBe(axes.length);
  });

  it("keeps keys lower case, because that is how the keyboard source compares them", () => {
    for (const k of boundKeys()) expect(k).toBe(k.toLowerCase());
  });

  it("puts every bound key and button in the help, and nothing else", () => {
    const shown = helpLines();
    const keysShown = shown.flatMap((l) => l.keys.split("/").map((k) => k.toLowerCase()));
    expect(new Set(keysShown)).toEqual(new Set(boundKeys()));
    const padShown = shown.flatMap((l) => (l.pad ? l.pad.split("/") : []));
    const padBound = [
      ...AXIS_BINDINGS.map((b) => `stick ${b.padAxis === 0 ? "↔" : "↕"}`),
      ...ACTION_BINDINGS.filter((b) => b.padButton !== null).map((b) => padButtonName(b.padButton!)),
    ];
    expect(new Set(padShown)).toEqual(new Set(padBound));
  });

  it("collapses a group to one line and carries its note", () => {
    const mode = helpLines().find((l) => l.keys === "1/2/3");
    expect(mode).toBeDefined();
    expect(mode!.label).toBe("low / cruise / boost");
    expect(mode!.pad).toBe("X/A/Y");
    const drama = helpLines().find((l) => l.keys === "V");
    expect(drama!.note).toBe("the G1 question");
  });

  it("names the stick with the sign the help promises: forward climbs", () => {
    const pitch = AXIS_BINDINGS.find((b) => b.axis === "pitch")!;
    // Standard mapping: a stick pushed forward reads negative on axis 1.
    expect(pitch.padAxis).toBe(1);
    expect(pitch.padInvert).toBe(true);
    expect(pitch.plus).toBe("w");
  });
});
