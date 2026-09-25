/**
 * The jump between scenes, as the lead-in map writes it: the distance the
 * way the captions write one, and the way it goes in a word (design v2,
 * "Between scenes": *1,900 km west*).
 */
import { describe, expect, it } from "vitest";
import { compassWord, jumpLabel } from "../../app/src/leadIn.js";

describe("the lead-in's jump label", () => {
  it("names the way in eight words, north up", () => {
    expect(compassWord(0, 1)).toBe("north");
    expect(compassWord(1, 1)).toBe("northeast");
    expect(compassWord(1, 0)).toBe("east");
    expect(compassWord(1, -1)).toBe("southeast");
    expect(compassWord(0, -1)).toBe("south");
    expect(compassWord(-1, -1)).toBe("southwest");
    expect(compassWord(-1, 0)).toBe("west");
    expect(compassWord(-1, 1)).toBe("northwest");
    expect(compassWord(-10, 2)).toBe("west");
  });

  it("writes kilometres with miles beside them, as every caption does", () => {
    expect(jumpLabel(-1_172_000, 0)).toBe("1,172 km (728 mi) west");
    expect(jumpLabel(0, 603_000)).toBe("603 km (375 mi) north");
  });
});
