/**
 * The painted figures (D94): which view a cue is drawn from and at what
 * size, when the card mirrors, how the scene's light tints it, what a
 * painting must say about itself, that a painting is drawn in its
 * figure's place and the code-made figure where it has no view, and that
 * every one registered has its picture.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Color } from "three";
import { describe, expect, it } from "vitest";
import "../../engine/src/cast/figures/index.js";
import { figureBuilder, madeBuilder } from "../../engine/src/cast/figure.js";
import { heldTo, MIRROR_AT, MOST_TALL_RAD, mirrored, paintedHeight, paintedLight, registerPainting, registeredPaintings, sideOfTurn, TURNED_WIDTH, viewFor, viewHeight, viewSize, type Painting, type PaintingView } from "../../engine/src/cast/painting.js";
import { lanternSkin } from "../../engine/src/cast/skin.js";
import { DEFAULT_SCALE } from "../../engine/src/sim/scale.js";

const stand: PaintingView = { name: "default", url: "cast/a.webp", faces: "right", aspect: 0.5, feet: 0.1, size: { crown: 0.9 } };
const fly: PaintingView = { name: "fly", url: "cast/b.webp", faces: "left", aspect: 1.5, feet: 0.5, size: { across: 0.8 } };
const two: Painting = { views: [stand, fly] };

describe("a painting's view", () => {
  it("is the one the cue's variant names, else the default, else none", () => {
    expect(viewFor(two, "fly")?.url).toBe("cast/b.webp");
    expect(viewFor(two, "still")?.url).toBe("cast/a.webp");
    expect(viewFor(two, null)?.url).toBe("cast/a.webp");
    expect(viewFor({ views: [fly] }, "lantern")).toBeNull();
  });

  it("measures a cue's size feet to crown, or across the picture", () => {
    expect(viewSize(stand)).toBeCloseTo(0.8, 9);
    expect(viewSize(fly)).toBeCloseTo(1.2, 9);
  });

  it("stands as high over its feet as the picture goes, of a cue's size (F130)", () => {
    expect(viewHeight(stand)).toBeCloseTo(0.9 / 0.8, 9);
    expect(viewHeight(fly)).toBeCloseTo(0.5 / 1.2, 9);
  });
});

describe("the card's mirror", () => {
  it("shows the figure facing the way it heads across the picture", () => {
    expect(mirrored(0.9, "right", true)).toBe(false);
    expect(mirrored(-0.9, "right", false)).toBe(true);
    expect(mirrored(0.9, "left", false)).toBe(true);
    expect(mirrored(-0.9, "left", true)).toBe(false);
  });

  it("keeps the side it had while the figure comes nearly straight at the camera", () => {
    const near = MIRROR_AT * 0.9;
    expect(mirrored(near, "right", true)).toBe(true);
    expect(mirrored(-near, "right", false)).toBe(false);
  });
});

describe("a card turning round", () => {
  it("is one side or the other at either end of its turn", () => {
    expect(sideOfTurn(-1, -1)).toEqual({ width: 1, show: 1 });
    expect(sideOfTurn(-1, 1).show).toBe(0);
    expect(sideOfTurn(1, 1)).toEqual({ width: 1, show: 1 });
    expect(sideOfTurn(1, -1).show).toBe(0);
  });

  it("narrows as it turns but is never a picture edge on, nor seen through as the one side gives way to the other", () => {
    for (let turn = -1; turn <= 1; turn += 0.01) {
      const painted = sideOfTurn(turn, -1);
      const mirror = sideOfTurn(turn, 1);
      // Where the two overlap, drawn one over the other: never less than 95 per cent there.
      expect(1 - (1 - painted.show) * (1 - mirror.show)).toBeGreaterThan(0.95);
      for (const side of [painted, mirror]) expect(side.width).toBeGreaterThanOrEqual(TURNED_WIDTH);
      if (turn > -0.95 && turn < 0.95) expect(Math.max(painted.width, mirror.width)).toBeLessThan(1);
    }
    const middle = sideOfTurn(0, 1);
    expect(middle.width).toBe(TURNED_WIDTH);
    expect(middle.show).toBeGreaterThan(0.75);
    expect(middle.show).toBe(sideOfTurn(0, -1).show);
    // Either side drawn only near the middle of the turn.
    expect(sideOfTurn(-0.3, 1).show).toBe(0);
    expect(sideOfTurn(0.3, -1).show).toBe(0);
  });
});

describe("a painting passing close", () => {
  it("is shrunk to fill no more of the view than it may, and left alone further off", () => {
    expect(heldTo(100, 150, 1000)).toBe(1);
    const k = heldTo(100, 150, 100);
    expect(k).toBeLessThan(1);
    expect((100 * k) / 100).toBeCloseTo(MOST_TALL_RAD, 9);
  });
});

describe("the scene's light on a painting", () => {
  it("dims it as the sun goes, and never lifts it far past as painted", () => {
    const day = paintedLight({ sunColor: new Color(1, 0.97, 0.92), ambientZenith: new Color(0.4, 0.45, 0.55) }, new Color());
    const dusk = paintedLight({ sunColor: new Color(0.15, 0.06, 0.02), ambientZenith: new Color(0.12, 0.12, 0.16) }, new Color());
    expect(dusk.r).toBeLessThan(day.r);
    expect(dusk.g).toBeLessThan(day.g);
    for (const c of [day.r, day.g, day.b]) expect(c).toBeLessThanOrEqual(1.1);
  });

  it("is the painting as painted at the film's noon", () => {
    const noon = paintedLight({ sunColor: new Color(0.999, 0.998, 0.995), ambientZenith: new Color(0.326, 0.371, 0.467) }, new Color());
    for (const c of [noon.r, noon.g, noon.b]) expect(c).toBeCloseTo(1, 2);
  });
});

describe("registering a painting", () => {
  it("refuses one with no views, feet not below the crown, or no size", () => {
    expect(() => registerPainting("wukong", { views: [] })).toThrow();
    expect(() => registerPainting("wukong", { views: [{ ...stand, feet: 0.8, size: { crown: 0.2 } }] })).toThrow();
    expect(() => registerPainting("wukong", { views: [{ ...stand, size: { crown: 2.2 } }] })).toThrow();
    expect(() => registerPainting("wukong", { views: [{ ...fly, size: { across: 0 } }] })).toThrow();
    expect(() => registerPainting("wukong", { views: [{ ...stand, aspect: 0 }] })).toThrow();
  });

  it("refuses a figure the film does not know", () => {
    expect(() => registerPainting("unicorn", two)).toThrow();
  });

  it("draws the painting in place of the figure made in code, and the figure made in code where it has no view", () => {
    const made = madeBuilder("dragon");
    registerPainting("dragon", { views: [{ ...fly, name: "east-king" }] });
    expect(figureBuilder("dragon")).not.toBe(made);
    expect(madeBuilder("dragon")).toBe(made);
    // No view for the lantern: the builder hands it to the figure made in code, which needs no browser to build.
    const lantern = figureBuilder("dragon")!({ skin: lanternSkin(), variant: "lantern", scale: DEFAULT_SCALE });
    expect(lantern.triangles).toBeGreaterThan(2);
  });
});

describe("the film's paintings", () => {
  it("each have their picture in the app", async () => {
    await import("../../engine/src/cast/paintings/index.js");
    const views = [...registeredPaintings().values()].flatMap((p) => p.views).filter((v) => v !== fly && !v.url.endsWith("/b.webp"));
    expect(views.length).toBeGreaterThan(0);
    for (const v of views) expect(existsSync(join("app/public", v.url)), v.url).toBe(true);
  });

  it("stand as high as the figures cut out of them: Nezha to his topknot, Wukong to his plumes, the Bull to his horns (F130)", async () => {
    await import("../../engine/src/cast/paintings/index.js");
    // Measured from the pictures' alpha, top row over the feet, of a cue's size.
    expect(paintedHeight("nezha", "still")).toBeCloseTo(1.033, 2);
    expect(paintedHeight("wukong", "still")).toBeCloseTo(1.178, 2);
    expect(paintedHeight("niumowang", "still")).toBeCloseTo(0.639, 2);
    expect(paintedHeight("pilgrims", "still")).toBeCloseTo(0.525, 2);
  });
});
