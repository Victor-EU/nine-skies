/**
 * Metric by default, imperial by toggle - and the line about which numbers
 * move (F45).
 *
 * The conversions are the easy half and are pinned against places this build
 * already has numbers for. The half worth testing is the rule: a reading
 * about the world converts, a number the operator set does not, because the
 * second kind is what F16 to F19 are written in and a session log that
 * converted them could not be read against the plan that scheduled it.
 */
import { describe, expect, it } from "vitest";
import {
  FEET_PER_METRE,
  MILES_PER_KM,
  UNIT_SYSTEMS,
  altitudeUnit,
  altitudeValue,
  climbUnit,
  climbValue,
  distanceValue,
  formatAltitude,
  formatClimb,
  formatDistance,
  formatTemperature,
  scaleBar,
  temperatureValue,
  unitsLabel,
} from "../../engine/src/map/units.js";

describe("the conversions", () => {
  it("uses the international foot and mile, exactly", () => {
    expect(FEET_PER_METRE).toBeCloseTo(3.280839895, 9);
    expect(MILES_PER_KM).toBeCloseTo(0.6213711922, 9);
  });

  it("puts Lhasa at 11,975 ft and the aircraft's ceiling at 19,685", () => {
    expect(altitudeValue(3650, "metric")).toBe(3650);
    expect(altitudeValue(3650, "imperial")).toBe(11975);
    expect(altitudeValue(6000, "imperial")).toBe(19685);
    // Ayding Lake, which is the only place either system goes negative.
    expect(altitudeValue(-154, "imperial")).toBe(-505);
  });

  it("converts temperature about the freezing point rather than about zero", () => {
    expect(temperatureValue(0, "imperial")).toBe(32);
    expect(temperatureValue(15, "imperial")).toBe(59);
    expect(temperatureValue(-40, "imperial")).toBe(-40);
  });

  it("reads vertical speed in the unit its system actually uses", () => {
    expect(climbUnit("metric")).toBe("m/s");
    expect(climbUnit("imperial")).toBe("ft/min");
    // Metres per second reads in ones and feet per minute in hundreds, which
    // is why every altimeter that uses feet also uses minutes.
    expect(climbValue(5, "imperial")).toBeCloseTo(984.25, 2);
    expect(formatClimb(5, "metric")).toBe("5.0 m/s");
    expect(formatClimb(5, "imperial")).toBe("984 ft/min");
  });

  it("formats with the unit attached, so a number can never lose it", () => {
    expect(formatAltitude(3650, "metric")).toBe("3,650 m");
    expect(formatAltitude(3650, "imperial")).toBe("11,975 ft");
    expect(formatTemperature(15, "imperial")).toBe("59.0 °F");
    expect(formatDistance(200, "metric")).toBe("200 km");
    expect(formatDistance(200, "imperial")).toBe("124 mi");
    expect(formatDistance(2.5, "metric")).toBe("2.5 km");
  });

  it("names both systems and defaults to the one the build is written in", () => {
    expect(UNIT_SYSTEMS).toEqual(["metric", "imperial"]);
    expect(unitsLabel("imperial")).toBe("imperial");
    expect(altitudeUnit("metric")).toBe("m");
  });
});

describe("the scale bar", () => {
  it("picks a round number in the reader's own system", () => {
    // The map's own scale: 3,712 km across 760 px, so a quarter of the
    // widget is 928 km - and the bar is the largest 1-2-5 step inside it.
    const kmPerPx = 3712 / 760;
    expect(scaleBar(kmPerPx, 760, "metric").label).toBe("500 km");
    expect(scaleBar(kmPerPx, 760, "imperial").label).toBe("500 mi");
  });

  it("draws both bars at the length they claim", () => {
    const kmPerPx = 3712 / 760;
    const imperial = scaleBar(kmPerPx, 760, "imperial");
    expect(distanceValue(imperial.km, "imperial")).toBeCloseTo(500, 6);
    // And never wider than a quarter of the widget, or it is not a bar.
    for (const units of UNIT_SYSTEMS) {
      const bar = scaleBar(kmPerPx, 760, units);
      expect(bar.km / kmPerPx).toBeLessThanOrEqual(760 * 0.25);
    }
  });

  it("scales down with the map rather than keeping a fixed 500 km", () => {
    // A map of one leg, not of the corridor: 300 km across the same widget.
    const bar = scaleBar(300 / 760, 760, "metric");
    expect(bar.label).toBe("50 km");
  });
});
