/**
 * The sun, and the clock China keeps regardless of it (F41).
 *
 * The numbers below are checkable against any ephemeris; the ones that matter
 * to the game are the offsets, which are arithmetic on longitude and need no
 * ephemeris at all.
 */
import { describe, expect, it } from "vitest";
import {
  AIRCRAFT_TIME_RATE,
  BEIJING_MERIDIAN_DEG,
  DEFAULT_TIME_RATE,
  WorldClock,
  clockString,
  dayOfYear,
  declinationRad,
  equationOfTimeMinutes,
  meridianOffsetMinutes,
  solarTimeMinutes,
  sunPosition,
} from "../../engine/src/gfx/solar.js";

const NOVEMBER = dayOfYear(11);

describe("one time zone across sixty-two degrees", () => {
  it("puts Shanghai six minutes ahead of the clock and Lhasa nearly two hours behind", () => {
    expect(meridianOffsetMinutes(121.47)).toBeCloseTo(5.88, 2);
    expect(meridianOffsetMinutes(91.1)).toBeCloseTo(-115.6, 1);
    expect(meridianOffsetMinutes(BEIJING_MERIDIAN_DEG)).toBe(0);
  });

  it("spans 3.9 hours from the Ussuri to the Pamirs", () => {
    // Fuyuan in Heilongjiang to Kashgar in Xinjiang, both on Beijing time.
    const span = meridianOffsetMinutes(134.29) - meridianOffsetMinutes(75.99);
    expect(span / 60).toBeCloseTo(3.89, 2);
  });

  it("crosses two hours of it on Expedition 1 alone", () => {
    const span = meridianOffsetMinutes(121.47) - meridianOffsetMinutes(91.1);
    expect(span).toBeCloseTo(121.5, 1);
  });
});

describe("the sun is not a clock", () => {
  it("runs about a quarter of an hour fast in November and slow in February", () => {
    expect(equationOfTimeMinutes(NOVEMBER)).toBeCloseTo(15.1, 1);
    expect(equationOfTimeMinutes(dayOfYear(2, 11))).toBeLessThan(-13);
    // Four zero crossings a year; mid-April is one of them.
    expect(Math.abs(equationOfTimeMinutes(dayOfYear(4, 16)))).toBeLessThan(1.5);
  });

  it("leans the Earth 23.4 degrees either way at the solstices", () => {
    const june = (declinationRad(dayOfYear(6, 21)) * 180) / Math.PI;
    const december = (declinationRad(dayOfYear(12, 21)) * 180) / Math.PI;
    expect(june).toBeCloseTo(23.4, 0);
    expect(december).toBeCloseTo(-23.4, 0);
  });

  it("puts solar noon at Lhasa at twenty to two, Beijing time", () => {
    // 115.6 minutes of longitude, less 15.1 of equation of time.
    const noon = 720 - meridianOffsetMinutes(91.1) - equationOfTimeMinutes(NOVEMBER);
    expect(clockString(noon)).toBe("13:40");
    expect(clockString(720 - meridianOffsetMinutes(75.99) - equationOfTimeMinutes(NOVEMBER))).toBe(
      "14:41",
    );
  });
});

describe("where the sun actually is", () => {
  it("is just up over Shanghai at seven in the morning in November", () => {
    const sun = sunPosition(7 * 60, 31.23, 121.47, NOVEMBER);
    expect(sun.elevationDeg).toBeCloseTo(6.8, 0);
    // Rising in the southeast at this time of year.
    expect(sun.azimuthDeg).toBeGreaterThan(110);
    expect(sun.azimuthDeg).toBeLessThan(125);
  });

  it("is still below the horizon at Lhasa at the same moment", () => {
    // The whole finding in one assertion: one clock, two places, and the sun
    // has not reached the western one yet.
    expect(sunPosition(7 * 60, 29.65, 91.1, NOVEMBER).elevationDeg).toBeLessThan(-15);
  });

  it("is highest at each place's own solar noon", () => {
    for (const [lat, lon] of [
      [31.23, 121.47],
      [29.65, 91.1],
      [39.47, 75.99],
    ] as const) {
      const noon = 720 - meridianOffsetMinutes(lon) - equationOfTimeMinutes(NOVEMBER);
      const peak = sunPosition(noon, lat, lon, NOVEMBER).elevationDeg;
      expect(peak).toBeGreaterThan(sunPosition(noon - 60, lat, lon, NOVEMBER).elevationDeg);
      expect(peak).toBeGreaterThan(sunPosition(noon + 60, lat, lon, NOVEMBER).elevationDeg);
      // And solar noon is where the sundial reads twelve.
      expect(solarTimeMinutes(noon, lon, NOVEMBER)).toBeCloseTo(720, 0);
    }
  });
});

describe("WorldClock", () => {
  const clock = new WorldClock(7 * 60, NOVEMBER);

  it("runs with the session by default", () => {
    expect(DEFAULT_TIME_RATE).toBe(1);
    expect(clockString(clock.minutesAt(0))).toBe("07:00");
    expect(clockString(clock.minutesAt(36.7 * 60))).toBe("07:37");
  });

  it("wraps past midnight rather than reading twenty-six o'clock", () => {
    const fast = new WorldClock(23 * 60, NOVEMBER, AIRCRAFT_TIME_RATE);
    // 30 minutes of session at 23.8x is 11.9 hours: 23:00 becomes 10:54 the
    // next morning, which is the whole reason this wraps.
    expect(clockString(fast.minutesAt(30 * 60))).toBe("10:54");
  });

  it("reads the sundial under the aircraft, not under the meridian", () => {
    expect(clockString(clock.solarMinutesAt(0, 121.47))).toBe("07:21");
    expect(clockString(clock.solarMinutesAt(0, 91.1))).toBe("05:20");
  });
});
