/**
 * Which world the app flies, and which expedition over it (F67).
 *
 * The lookup this replaces was `p.id === manifest.corridor`, which is only
 * true of a world cut to one expedition. It held for as long as the corridor
 * was the only world, and the country serves every expedition and names none.
 */
import { describe, expect, it } from "vitest";
import {
  COUNTRY_WORLD,
  DEFAULT_WORLD,
  chooseWorld,
  expeditionFor,
} from "../../app/src/worldChoice.js";

const PLANS = [{ id: "sea-to-sky" }, { id: "silk-road" }] as const;

describe("choosing a world", () => {
  it("flies the corridor when nothing is asked for, as G1 does", () => {
    expect(chooseWorld("")).toEqual({ world: DEFAULT_WORLD, expedition: null });
    expect(DEFAULT_WORLD).toBe("sea-to-sky");
  });

  it("reads both from the query", () => {
    expect(chooseWorld("?world=china&expedition=sea-to-sky")).toEqual({
      world: "china",
      expedition: "sea-to-sky",
    });
  });

  it("refuses a name that could leave /world rather than escaping it", () => {
    for (const bad of ["../secrets", "china/../..", "China", "", "a b", "-x", "x".repeat(65)]) {
      expect(chooseWorld(`?world=${encodeURIComponent(bad)}`).world).toBe(DEFAULT_WORLD);
      expect(chooseWorld(`?expedition=${encodeURIComponent(bad)}`).expedition).toBeNull();
    }
  });
});

describe("choosing the expedition a world flies", () => {
  it("gives a corridor its own expedition", () => {
    expect(expeditionFor(PLANS, "sea-to-sky", null)?.id).toBe("sea-to-sky");
  });

  it("gives a corridor nothing else, because outside its strip the ground reads as sea", () => {
    expect(expeditionFor(PLANS, "sea-to-sky", "silk-road")).toBeNull();
  });

  it("gives the country whichever expedition is named", () => {
    expect(expeditionFor(PLANS, COUNTRY_WORLD, "sea-to-sky")?.id).toBe("sea-to-sky");
    expect(expeditionFor(PLANS, COUNTRY_WORLD, "silk-road")?.id).toBe("silk-road");
  });

  it("flies the country free when none is named, rather than the first in the bundle", () => {
    expect(expeditionFor(PLANS, COUNTRY_WORLD, null)).toBeNull();
  });

  it("flies free when the name is not an expedition", () => {
    expect(expeditionFor(PLANS, COUNTRY_WORLD, "atlantis")).toBeNull();
  });
});
