/**
 * Can the map be read - and by whom (F45).
 *
 * The map's colours were ten literals inside its draw calls, and a literal
 * cannot be tested. Moved into `map/palette.ts` they can be, and the test is
 * the same sentence for every mark: it clears 10 dE - `perceptual.ts`'s "a
 * different colour at a glance" - against every ground it can be drawn on,
 * through every eye `cvd.ts` can simulate.
 *
 * The threshold found one real failure and it was not a colour-blindness one.
 * That is the finding: nobody had ever computed this map's contrast at all,
 * so the check that was asked for as an accessibility item was the first
 * check of any kind.
 */
import { describe, expect, it } from "vitest";
import { simulate, VISION_TYPES } from "../../engine/src/gfx/cvd.js";
import { deltaE, JND } from "../../engine/src/gfx/perceptual.js";
import {
  AIRCRAFT,
  HEIHE_LINE,
  LAND_LIFT,
  NO_DATA,
  PANEL,
  PIN,
  PIN_CASING,
  PROFILE_GROUND,
  ROUTE_CASING,
  ROUTE_CORE,
  TRACK,
  baseSamples,
  baseShade,
  colorOf,
  css,
  landShade,
  over,
  strokeOver,
  type MapStroke,
  type Rgb,
} from "../../engine/src/map/palette.js";
import { elevationRampSrgb } from "../../engine/src/terrain/palette.js";

/** "A different colour at a glance", which is what a map mark has to be. */
const GLANCE = 10;
const worst = (a: Rgb, b: Rgb): number =>
  Math.min(...VISION_TYPES.map((v) => deltaE(simulate(colorOf(a), v), simulate(colorOf(b), v))));
const markOn = (s: MapStroke, base: Rgb): number =>
  Math.min(
    ...VISION_TYPES.map((v) =>
      deltaE(simulate(strokeOver(s, base), v), simulate(colorOf(base), v)),
    ),
  );

describe("every mark, on every ground, through every eye", () => {
  const grounds = baseSamples();

  it("covers the whole range the base can be, the gap included", () => {
    expect(grounds.map((g) => g.label)).toContain("no data");
    expect(grounds.length).toBeGreaterThan(7);
  });

  it("draws the track, the line, the pin and the aircraft clear of it", () => {
    for (const [name, mark] of [
      ["track", TRACK],
      ["Heihe line", HEIHE_LINE],
    ] as const) {
      for (const g of grounds) {
        expect(`${name} over ${g.label}: ${markOn(mark, g.rgb).toFixed(1)}`).toBe(
          `${name} over ${g.label}: ${Math.max(markOn(mark, g.rgb), GLANCE).toFixed(1)}`,
        );
      }
    }
  });

  it("cases the pale marks, because snow is as pale as they are", () => {
    const snow = landShade(6600);
    // Uncased, a pin on snow is 2.7 dE - inside the range where no reader
    // sees any difference at all, colour vision or not.
    expect(markOn(PIN, snow)).toBeLessThan(JND + 1);
    expect(markOn(AIRCRAFT, snow)).toBeLessThan(5);
    // Cased, both are unmissable, and the casing is what carries them.
    expect(markOn(PIN_CASING, snow)).toBeGreaterThan(60);
    for (const g of grounds) {
      expect(Math.max(markOn(PIN, g.rgb), markOn(PIN_CASING, g.rgb))).toBeGreaterThan(GLANCE);
    }
  });
});

describe("the route, which was the one mark that failed", () => {
  it("used to fade out exactly where Expedition 1 ends", () => {
    // The old route: pale ink at 30 %, over the old base ramp.
    const oldBase = (m: number): Rgb =>
      m <= 0
        ? [13, 27, 42]
        : [
            58 + 150 * Math.min(1, m / 6000),
            74 + 128 * Math.min(1, m / 6000),
            64 + 140 * Math.min(1, m / 6000),
          ];
    const oldRoute = (m: number) => worst(over([232, 238, 245], 0.3, oldBase(m)), oldBase(m));
    expect(oldRoute(0)).toBeGreaterThan(28);
    expect(oldRoute(3650)).toBeLessThan(GLANCE); // Lhasa
    expect(oldRoute(6000)).toBeLessThan(5);
  });

  it("is a cased line now, so its contrast does not depend on the ground", () => {
    for (const g of baseSamples()) {
      const better = Math.max(markOn(ROUTE_CASING, g.rgb), markOn(ROUTE_CORE, g.rgb));
      expect(better).toBeGreaterThan(40);
      // And the two strokes are legible against each other, or the line is a
      // smudge rather than a line.
      const pair = Math.min(
        ...VISION_TYPES.map((v) =>
          deltaE(
            simulate(strokeOver(ROUTE_CORE, g.rgb), v),
            simulate(strokeOver(ROUTE_CASING, g.rgb), v),
          ),
        ),
      );
      expect(pair).toBeGreaterThan(60);
    }
  });

  it("is drawn casing first, which is the only order that shows one", () => {
    expect(ROUTE_CASING.widthPx).toBeGreaterThan(ROUTE_CORE.widthPx);
  });
});

describe("what the base says", () => {
  it("is the terrain's own ramp, lifted, and not a second set of stops", () => {
    for (const m of [1, 200, 800, 2000, 3800, 5400, 6600]) {
      const lifted = landShade(m);
      const shader = elevationRampSrgb(m);
      for (let i = 0; i < 3; i++) {
        const expected = 255 * (shader[i]! + (1 - shader[i]!) * LAND_LIFT);
        expect(lifted[i]).toBeCloseTo(Math.round(expected), 0);
      }
    }
  });

  it("keeps the gap clear of the lowest land and of the panel behind it", () => {
    expect(worst(NO_DATA, landShade(1))).toBeGreaterThan(GLANCE);
    expect(worst(NO_DATA, PANEL)).toBeGreaterThan(GLANCE);
  });

  it("says nothing about water, because nothing published knows", () => {
    // Zero is the DEM's ocean and also its absent data, and five in six of
    // the map's zero cells were the second one. So zero is a gap.
    expect(baseShade(0)).toEqual(NO_DATA);
    expect(baseShade(1)).not.toEqual(NO_DATA);
  });

  it("draws Ayding Lake as land, which the old base drew as ocean", () => {
    // -154 m, China's lowest exposed land, a written card and a golden probe
    // in the pipeline. The old base tested `m <= 0`.
    const ayding = baseShade(-154);
    expect(ayding).not.toEqual(NO_DATA);
    expect(worst(ayding, NO_DATA)).toBeGreaterThan(40);
    // And it is the salt pan the ramp names, not the plain green the shader
    // used to paint it before the stops were data (F45).
    expect(ayding[0]).toBeGreaterThan(ayding[1]!);
  });
});

describe("colour is never the only difference", () => {
  it("dashes the one pair a rare eye cannot tell apart", () => {
    // The track and the Heihe-Tengchong line are both amber. For most
    // readers they are 23 to 44 dE apart wherever they are drawn; for a
    // tritanope the gap closes as the ground pales, to 4.8 over snow - above
    // the threshold at which a difference exists and well under the one at
    // which it is noticed at a glance.
    const snow = landShade(6600);
    const seen = (v: "normal" | "tritan") =>
      deltaE(simulate(strokeOver(TRACK, snow), v), simulate(strokeOver(HEIHE_LINE, snow), v));
    expect(seen("normal")).toBeGreaterThan(30);
    expect(seen("tritan")).toBeGreaterThan(JND);
    expect(seen("tritan")).toBeLessThan(GLANCE);
    // So one of them is dashed, and that is what the reader is left with.
    expect(HEIHE_LINE.dash).toBeDefined();
    expect(TRACK.dash).toBeUndefined();
  });

  it("keeps the profile's ground and its altitude line apart", () => {
    expect(markOn(PROFILE_GROUND, PANEL)).toBeGreaterThan(GLANCE);
    expect(markOn(TRACK, PROFILE_GROUND.rgb)).toBeGreaterThan(GLANCE);
  });
});

describe("the canvas arithmetic", () => {
  it("composites alpha in bytes, because that is where a canvas does it", () => {
    expect(over([255, 255, 255], 0.5, [0, 0, 0])).toEqual([127.5, 127.5, 127.5]);
    expect(over([10, 20, 30], 1, [200, 200, 200])).toEqual([10, 20, 30]);
  });

  it("writes css a canvas will accept", () => {
    expect(css([10, 20, 30])).toBe("rgb(10,20,30)");
    expect(css([10, 20, 30], 0.5)).toBe("rgba(10,20,30,0.5)");
    expect(css([10.4, 20.6, 30])).toBe("rgb(10,21,30)");
  });
});
