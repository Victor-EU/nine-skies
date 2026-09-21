/**
 * The two stand-ins that feed two of the five readouts (Finding F46).
 *
 * They had no test at all, which is how one of them ran backwards for as long
 * as it existed. `standInPrecipMm`'s first argument was called `inlandKm` and
 * the app passed a projected *easting* - measured from a false origin 3,456
 * km west of the central meridian, so it grows toward the sea - and the
 * saturation at 3,200 km then flattened every populated place in the east to
 * zero. Six of the nine places below read 0 % humidity in every month of the
 * year, and Kashgar, in the Taklamakan, read the wettest of them.
 *
 * Neither function is a climate model and the atlas replaces both (workstream
 * A, stage 8). What is asserted here is only what their own docstrings claim:
 * wet southeast and dry northwest, colder as you go north, colder as you go
 * up, and a monsoon that arrives in summer. An ordering, not a forecast.
 */
import { describe, expect, it } from "vitest";
import {
  standInGroundTempC,
  standInPrecipMm,
} from "../../engine/src/terrain/syntheticTiles.js";
import { projectAlbers } from "../../engine/src/terrain/worldGrid.js";
import { humidityProxy } from "../../engine/src/sim/atmosphere.js";

const PLACES = {
  shanghai: { lat: 31.23, lon: 121.47 },
  wuhan: { lat: 30.59, lon: 114.31 },
  chongqing: { lat: 29.57, lon: 106.55 },
  chengdu: { lat: 30.66, lon: 104.07 },
  lhasa: { lat: 29.65, lon: 91.1 },
  kashgar: { lat: 39.47, lon: 75.99 },
  harbin: { lat: 45.8, lon: 126.53 },
  sanya: { lat: 18.25, lon: 109.51 },
  turpan: { lat: 42.68, lon: 89.26 },
};
type Place = keyof typeof PLACES;

const precip = (p: Place, month: number): number =>
  standInPrecipMm({ latDeg: PLACES[p].lat, lonDeg: PLACES[p].lon }, month);
const humidity = (p: Place, month: number): number => humidityProxy(precip(p, month));

describe("the stand-in's rain", () => {
  it("falls on the southeast and not on the northwest, which is what it says", () => {
    for (const month of [1, 4, 7, 11]) {
      expect(precip("sanya", month)).toBeGreaterThan(precip("shanghai", month));
      expect(precip("shanghai", month)).toBeGreaterThan(precip("chongqing", month));
      expect(precip("chongqing", month)).toBeGreaterThan(precip("lhasa", month));
      expect(precip("lhasa", month)).toBeGreaterThan(precip("kashgar", month));
    }
  });

  it("does not hand the driest desert in China the wettest reading", () => {
    // The defect, stated as the thing that must never be true again.
    const wettest = (Object.keys(PLACES) as Place[]).reduce((a, b) =>
      precip(a, 11) >= precip(b, 11) ? a : b,
    );
    expect(wettest).not.toBe("kashgar");
    expect(wettest).toBe("sanya");
  });

  it("is a function of longitude, monotonically, along one latitude", () => {
    // The old defect cannot be written any more - it takes a named place, so
    // handing it grid metres is a type error rather than a plausible number.
    // What is left to assert is the shape: at one latitude, rain falls away
    // as you go west, with no step and no reversal.
    let previous = Infinity;
    for (let lonDeg = 125; lonDeg >= 75; lonDeg -= 5) {
      const mm = standInPrecipMm({ latDeg: 31, lonDeg }, 7);
      expect(mm).toBeLessThanOrEqual(previous);
      previous = mm;
    }
    // Longitude alone is worth a factor of four and a half at this latitude;
    // the rest of the Taklamakan's dryness comes from how far north it is,
    // which is why the stand-in weighs both and not one.
    const coast = standInPrecipMm({ latDeg: 31, lonDeg: 121 }, 7);
    expect(standInPrecipMm({ latDeg: 31, lonDeg: 75 }, 7)).toBeLessThan(coast / 4);
    // And the same longitude is drier the further north it is: Kashgar is
    // slightly east of that point and still reads half its rain.
    expect(precip("kashgar", 7)).toBeLessThan(standInPrecipMm({ latDeg: 31, lonDeg: 75 }, 7));
  });

  it("gives the GDD's wet row somewhere to happen", () => {
    // "This is wet - humidity 90 %" is one of the five sensations the HUD is
    // there to confirm, and before this there was nowhere in China it could
    // be read. It is a summer coast, which is where it should be.
    expect(humidity("sanya", 7)).toBeGreaterThanOrEqual(0.9);
    expect(humidity("kashgar", 7)).toBeLessThan(0.2);
  });

  it("arrives in summer and leaves in winter, everywhere at once", () => {
    for (const p of ["shanghai", "chongqing", "harbin"] as Place[]) {
      expect(precip(p, 7)).toBeGreaterThan(precip(p, 11));
      expect(precip(p, 7)).toBeGreaterThan(precip(p, 1));
    }
  });

  it("stays a stand-in, and the residual is Turpan", () => {
    // Longitude and latitude cannot tell a basin from its surroundings, so
    // the driest place in China reads wetter than Kashgar. Recorded rather
    // than hidden: the atlas is what fixes it, not another term here.
    expect(precip("turpan", 11)).toBeGreaterThan(precip("kashgar", 11));
  });
});

describe("the stand-in's thermometer, which was already the right way round", () => {
  it("gets colder going north in winter and stays warm in the south", () => {
    const north = (p: Place) => projectAlbers(PLACES[p].lat, PLACES[p].lon).northM / 1000;
    const at = (p: Place, month: number) => standInGroundTempC(north(p), 0, month);
    expect(at("harbin", 1)).toBeLessThan(at("shanghai", 1));
    expect(at("shanghai", 1)).toBeLessThan(at("sanya", 1));
    expect(at("harbin", 1)).toBeLessThan(-20);
  });

  it("loses 6.5 degrees a kilometre, which is the lapse rate the HUD claims", () => {
    const sea = standInGroundTempC(1400, 0, 7);
    const up = standInGroundTempC(1400, 1000, 7);
    expect(sea - up).toBeCloseTo(6.5, 6);
  });

  it("has no gradient left north of Harbin, which is the atlas's problem", () => {
    // `/ 3400` is the synthetic world's north extent; the real grid is 4,416
    // km tall. Everything above 3,400 km north reads the same. Left alone
    // because re-anchoring it moves Harbin away from the -25 C the GDD's Ice
    // to Coconuts is built on.
    expect(standInGroundTempC(3400, 0, 1)).toBe(standInGroundTempC(4416, 0, 1));
  });
});
