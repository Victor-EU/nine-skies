/** Which built world the film flies: the country, unless the query names another. */
import { describe, expect, it } from "vitest";
import { DEFAULT_WORLD, chooseWorld } from "../../app/src/worldChoice.js";

describe("the world in the query string", () => {
  it("is the country by default", () => {
    expect(DEFAULT_WORLD).toBe("china");
    expect(chooseWorld("")).toBe("china");
    expect(chooseWorld("?expedition=sea-to-sky")).toBe("china");
  });

  it("takes a plain slug and refuses anything that is not one", () => {
    expect(chooseWorld("?world=sea-to-sky")).toBe("sea-to-sky");
    expect(chooseWorld("?world=../secrets")).toBe("china");
    expect(chooseWorld("?world=China")).toBe("china");
  });
});
