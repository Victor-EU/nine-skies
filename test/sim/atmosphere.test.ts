import { describe, expect, it } from "vitest";
import {
  BOOST_MIN_SIGMA,
  boostAvailable,
  boostCeilingM,
  densityAt,
  densityRatio,
  humidityProxy,
  outsideAirTemperatureC,
  pistonPowerFraction,
} from "../../engine/src/sim/atmosphere.js";

/**
 * Reference table. Values computed independently from the ISA and Gagg-Farrar
 * definitions, not captured from this implementation's output.
 */
const REFERENCE = [
  // altitude m, density kg/m3, sigma, P/P0
  [-154, 1.24321, 1.01487, 1.01683], // Ayding Lake, Turpan
  [0, 1.225, 1.0, 1.0],
  [500, 1.16727, 0.95287, 0.94665],
  [1000, 1.11164, 0.90746, 0.89525],
  [2000, 1.00649, 0.82162, 0.79808],
  [3000, 0.90912, 0.74214, 0.7081],
  [3564, 0.85748, 0.69999, 0.66038], // boost cut-out
  [4500, 0.77677, 0.6341, 0.5858], // Tibetan Plateau cruise
  [5500, 0.6971, 0.56906, 0.51218],
] as const;

describe("ISA atmosphere", () => {
  it.each(REFERENCE)(
    "at %i m: density, sigma and piston power match the reference",
    (alt, rho, sigma, power) => {
      expect(densityAt(alt)).toBeCloseTo(rho, 4);
      expect(densityRatio(alt)).toBeCloseTo(sigma, 4);
      expect(pistonPowerFraction(alt)).toBeCloseTo(power, 4);
    },
  );

  it("is denser than sea level below sea level", () => {
    // Turpan's whole point: the engine is eager down there.
    expect(densityRatio(-154)).toBeGreaterThan(1);
    expect(pistonPowerFraction(-154)).toBeGreaterThan(1);
  });

  it("clamps above the tropopause instead of going negative", () => {
    // The ISA polynomial crosses zero at 44,331 m; nothing should ever see that.
    expect(densityAt(50_000)).toBeGreaterThan(0);
    expect(densityAt(50_000)).toBe(densityAt(11_000));
  });
});

describe("boost lockout", () => {
  it("is stated in density, and lands where the GDD says", () => {
    // The GDD says "above 3,500 m". We assert density, not altitude - the
    // altitude is a consequence, and this test is what proves it.
    expect(boostCeilingM()).toBeCloseTo(3563.8, 0);
  });

  it("is available at the coast and dead over the plateau", () => {
    expect(boostAvailable(0)).toBe(true);
    expect(boostAvailable(-154)).toBe(true); // Turpan
    expect(boostAvailable(3000)).toBe(true);
    expect(boostAvailable(3650)).toBe(false); // Lhasa
    expect(boostAvailable(4500)).toBe(false); // plateau
  });

  it("switches exactly at the density threshold", () => {
    const h = boostCeilingM();
    expect(densityRatio(h)).toBeCloseTo(BOOST_MIN_SIGMA, 6);
    expect(boostAvailable(h - 1)).toBe(true);
    expect(boostAvailable(h + 1)).toBe(false);
  });
});

describe("temperature", () => {
  /**
   * Ground temperatures are monthly normals; the sim composes them with the
   * lapse from ground to aircraft. The atlas supplies the first number, this
   * function supplies the rest, and the HUD shows the result.
   */
  const CITIES = [
    // name, ground elev m, monthly mean C, aircraft alt m, expected OAT C
    ["Harbin, January", 150, -18.4, 3000, -18.4 - 6.5 * 2.85],
    ["Harbin, July", 150, 23.2, 3000, 23.2 - 6.5 * 2.85],
    ["Turpan, July", -50, 32.7, 1000, 32.7 - 6.5 * 1.05],
    ["Lhasa, July", 3650, 15.5, 5000, 15.5 - 6.5 * 1.35],
    ["Sanya, January", 10, 21.6, 2000, 21.6 - 6.5 * 1.99],
    ["Shanghai, July", 4, 28.6, 2000, 28.6 - 6.5 * 1.996],
  ] as const;

  it.each(CITIES)("%s", (_name, ground, groundTemp, alt, expected) => {
    expect(outsideAirTemperatureC(groundTemp, ground, alt)).toBeCloseTo(expected, 3);
  });

  it("reads ground temperature when sitting on the ground", () => {
    expect(outsideAirTemperatureC(32.7, -50, -50)).toBeCloseTo(32.7, 6);
  });

  it("warms as you descend into a depression", () => {
    const atSeaLevel = outsideAirTemperatureC(32.7, -154, 0);
    const inTheHole = outsideAirTemperatureC(32.7, -154, -154);
    expect(inTheHole).toBeGreaterThan(atSeaLevel);
  });
});

describe("humidity proxy", () => {
  it("saturates in the monsoon and bottoms out in the desert", () => {
    expect(humidityProxy(0)).toBe(0); // Taklamakan
    expect(humidityProxy(100)).toBeCloseTo(0.5, 6);
    expect(humidityProxy(400)).toBe(1); // southeast coast in July
  });
});
