/**
 * Altitude is automatic: the camera holds the rail's height above the
 * ground, climbs for a ridge before it arrives, moves smoothly, and can never
 * leave the scene's band.
 */
import { describe, expect, it } from "vitest";
import { AltitudeController, DEFAULT_ALTITUDE, lookAheadSamplesKm } from "../../engine/src/film/altitude.js";

const band = { minM: 100, maxM: 2000 };
const north = 0;

describe("the altitude controller", () => {
  it("places at the wanted height on its first frame", () => {
    const c = new AltitudeController();
    expect(c.update(0, 0, 0, north, 300, band, () => 100)).toBe(400);
  });

  it("climbs for the highest ground it can see ahead, not the ground under it", () => {
    const c = new AltitudeController();
    // Placed over flat ground at 100 m; then a 1,000 m ridge 4 km to the north.
    c.update(0, 0, 0, north, 300, band, () => 100);
    const ground = (_e: number, n: number) => (n >= 3_500 && n <= 4_500 ? 1000 : 100);
    const after = c.update(1, 0, 0, north, 300, band, ground);
    expect(after).toBeGreaterThan(400);
    expect(after).toBeLessThan(1300);
    let a = after;
    for (let i = 0; i < 20; i++) a = c.update(1, 0, 0, north, 300, band, ground);
    expect(a).toBeCloseTo(1300, 0);
  });

  it("reads only as far ahead as the scene says, so a short look-ahead flies among peaks a long one flies over", () => {
    const ridge = (_e: number, n: number) => (n >= 3_500 && n <= 4_500 ? 1000 : 100);
    const far = new AltitudeController();
    expect(far.update(0, 0, 0, north, 300, band, ridge, 8)).toBe(1300);
    const near = new AltitudeController();
    expect(near.update(0, 0, 0, north, 300, band, ridge, 1.5)).toBe(400);
    // Reads under the camera and at even steps out to the distance.
    expect(lookAheadSamplesKm(8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("never moves faster than the rate cap", () => {
    const c = new AltitudeController();
    c.update(0, 0, 0, north, 300, band, () => 0);
    const step = c.update(0.5, 0, 0, north, 1900, band, () => 0) - 300;
    expect(step).toBeLessThanOrEqual(DEFAULT_ALTITUDE.maxRateMs * 0.5 + 1e-9);
  });

  it("is clamped to the band above the ground directly below, whatever the smoothing wants", () => {
    const c = new AltitudeController();
    c.update(0, 0, 0, north, 300, band, () => 0);
    // The ground under the camera jumps 2,500 m: the floor applies at once.
    expect(c.update(1 / 60, 0, 0, north, 300, band, () => 2500)).toBeGreaterThanOrEqual(2600);
    // And the ceiling: asking for 5,000 m above flat ground gets the band's top.
    const d = new AltitudeController();
    expect(d.update(0, 0, 0, north, 5000, band, () => 0)).toBe(2000);
  });

  it("holds the last ground it read where a tile has not landed", () => {
    const c = new AltitudeController();
    c.update(0, 0, 0, north, 300, band, () => 800);
    expect(c.update(1, 0, 0, north, 300, band, () => null)).toBeCloseTo(1100, 6);
  });

  it("forgets on reset so the next scene places rather than eases", () => {
    const c = new AltitudeController();
    c.update(0, 0, 0, north, 300, band, () => 0);
    c.reset();
    expect(c.current).toBeNull();
    expect(c.update(1 / 60, 0, 0, north, 300, band, () => 4000)).toBe(4300);
  });
});
