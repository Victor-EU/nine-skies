/**
 * The sun over a scene (design v2, "A sun"): where it is in the world's axes
 * and what colour it is, from the scene's month and hour.
 */
import { describe, expect, it } from "vitest";
import { airMass, sunState, sunTransmittance } from "../../engine/src/look/sun.js";
import { luminance } from "../../engine/src/look/colour.js";

const LHASA = { lat: 29.65, lon: 91.1 };
const SHANGHAI = { lat: 31.23, lon: 121.47 };

describe("where the sun is", () => {
  it("is south and high at solar noon in June, in world axes: x east, y up, z north", () => {
    // Solar noon in Shanghai is about 11:54 Beijing time.
    const s = sunState(SHANGHAI.lat, SHANGHAI.lon, 6, 11.9);
    expect(s.elevationDeg).toBeGreaterThan(80);
    expect(s.direction[1]).toBeGreaterThan(0.98);
    expect(Math.abs(s.direction[0])).toBeLessThan(0.1);
    expect(s.direction[2]).toBeLessThan(0); // towards the south
  });

  it("sets in the west, and Lhasa's evening runs two hours behind the clock", () => {
    const s = sunState(LHASA.lat, LHASA.lon, 9, 19.5);
    expect(s.elevationDeg).toBeGreaterThan(5);
    expect(s.elevationDeg).toBeLessThan(15);
    expect(s.direction[0]).toBeLessThan(-0.8); // west
    // The same clock in Shanghai is after sunset.
    expect(sunState(SHANGHAI.lat, SHANGHAI.lon, 9, 19.5).elevationDeg).toBeLessThan(0);
  });

  it("is a unit vector", () => {
    for (const hour of [6, 9, 12, 15, 18]) {
      const d = sunState(LHASA.lat, LHASA.lon, 3, hour).direction;
      expect(Math.hypot(...d)).toBeCloseTo(1, 6);
    }
  });
});

describe("what colour it is", () => {
  it("crosses one air mass at the zenith and about thirty-eight at the horizon", () => {
    expect(airMass(90)).toBeCloseTo(1, 2);
    expect(airMass(0)).toBeGreaterThan(35);
    expect(airMass(0)).toBeLessThan(40);
    expect(airMass(-10)).toBe(airMass(0));
  });

  it("is white high up, gold at ten degrees and orange on the horizon", () => {
    const high = sunTransmittance(60);
    expect(Math.min(...high)).toBeGreaterThan(0.93);
    const gold = sunTransmittance(10);
    expect(gold[0]).toBeGreaterThan(gold[1]);
    expect(gold[1]).toBeGreaterThan(gold[2]);
    expect(gold[2]).toBeGreaterThan(0.4);
    const low = sunTransmittance(0);
    expect(low[0] / low[2]).toBeGreaterThan(10);
  });

  it("reddens more through dusty air", () => {
    const clear = sunTransmittance(8, 0.8);
    const dust = sunTransmittance(8, 1.7);
    expect(dust[2] / dust[0]).toBeLessThan(clear[2] / clear[0]);
  });

  it("lights nothing directly once it has set, and the sky ramps through twilight", () => {
    const set = sunState(LHASA.lat, LHASA.lon, 12, 19.3);
    expect(set.elevationDeg).toBeLessThan(-3);
    expect(luminance(set.light)).toBe(0);
    expect(set.daylight).toBeGreaterThan(0);
    expect(set.daylight).toBeLessThan(1);
    const noon = sunState(LHASA.lat, LHASA.lon, 6, 14);
    expect(noon.daylight).toBe(1);
    expect(noon.lowness).toBe(0);
  });
});
