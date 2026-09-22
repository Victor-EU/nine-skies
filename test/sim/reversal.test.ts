/**
 * How wide the aeroplane's own turn is, on the ground (F43).
 *
 * The number matters twice over: it is the floor under any corridor a route
 * or a challenge may ask to be flown, and it is why *thread a gorge*, read as
 * turning round inside one, is not a challenge this flight model can express
 * in either gorge the world has (F55). Read as flying through, it is -- a
 * pass needs the bends followed, not a reversal, and both are flown (F57).
 */
import { describe, expect, it } from "vitest";
import { reversalWidthM } from "../../engine/src/sim/flight.js";
import { MODE_IAS_MS } from "../../engine/src/sim/scale.js";

describe("a full-bank reversal", () => {
  it("reproduces F38's table to the decimal", () => {
    // F38 measured these by turning immediately after changing speed mode,
    // which is what a player does; indicated airspeed takes six seconds to
    // come off, and the turn happens during the decay.
    const from = { fromIasMs: MODE_IAS_MS.cruise };
    const km = (alt: number, mode: "low" | "cruise" | "boost") =>
      +(reversalWidthM(alt, mode, from) / 1000).toFixed(1);
    expect(km(1200, "low")).toBe(5.3);
    expect(km(4500, "low")).toBe(7.8);
    expect(km(1200, "cruise")).toBe(16.2);
    expect(km(4500, "cruise")).toBe(23.3);
    expect(km(1200, "boost")).toBe(36.0);
    // Boost is locked out this high and falls back to cruise (F16), which is
    // why the two right-hand figures are the same number.
    expect(km(4500, "boost")).toBe(23.3);
  });

  it("is narrower when the aeroplane has settled at the slow mode", () => {
    const settled = reversalWidthM(1200, "low");
    const arriving = reversalWidthM(1200, "low", { fromIasMs: MODE_IAS_MS.cruise });
    expect(settled).toBeLessThan(arriving);
    expect(settled / 1000).toBeCloseTo(4.4, 1);
  });

  it("widens with altitude, because true airspeed does", () => {
    for (const mode of ["low", "cruise"] as const)
      expect(reversalWidthM(4500, mode)).toBeGreaterThan(reversalWidthM(1200, mode));
  });

  it("is kilometres wide at every mode, which no gorge is", () => {
    // The aeroplane turns in about 200 m of air at `low` and kilometres of
    // ground, because the compression multiplies the turn by the mode's ground
    // gain. This comment used to say Tiger Leaping Gorge is "roughly 2 km
    // between its walls", which was F43's channel width -- measured 71 km from
    // the gorge (F49) on the grid that fills a gorge in (F50). Measured where
    // the gorge is, on the 90 m grid, the aeroplane has 0.36 km of room to
    // turn a hundred metres over the water and 1.15 km at four hundred (F55).
    expect(reversalWidthM(2500, "low")).toBeGreaterThan(2_000);
    expect(reversalWidthM(2500, "approach")).toBeGreaterThan(2_000);
  });
});
