/**
 * What time it is on Expedition 1, and what the file claims (F41).
 *
 * The expedition authors a month and a start hour, and says in a comment what
 * they are for: *"Leaving Shanghai just after sunrise puts Lhasa in the early
 * afternoon by the clock and mid-morning by the sun, which is the lesson the
 * HUD clock is there to teach."* Nothing had ever evaluated it. These run on
 * the committed section, so they need no world.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { flyableFrom, loadExpeditions } from "../../tools/expedition.ts";
import { resolveGround } from "../../tools/ground.ts";
import { flyRoute, modeAtKm } from "../../engine/src/sim/route.ts";
import { MODE_IAS_MS } from "../../engine/src/sim/scale.ts";
import { densityRatio } from "../../engine/src/sim/atmosphere.ts";
import {
  AIRCRAFT_TIME_RATE,
  WorldClock,
  clockString,
  dayOfYear,
  equationOfTimeMinutes,
  meridianOffsetMinutes,
} from "../../engine/src/sim/solar.ts";

const expedition = loadExpeditions(join("content", "expeditions")).find(
  (e) => e.id === "sea-to-sky",
)!;
const ground = resolveGround(expedition, "dist-world", join("content", "sections"));
const flyable = flyableFrom(expedition, ground.groundM!);
const flight = flyRoute(flyable.route, flyable.ground, {
  startAltitudeM: expedition.start_altitude_m,
  track: true,
});

const SHANGHAI = { lat: 31.23, lon: 121.47 };
const LHASA = { lat: 29.65, lon: 91.1 };
const day = dayOfYear(expedition.month);
const clock = new WorldClock(expedition.start_hour * 60, day);

describe("Expedition 1 leaves just after sunrise", () => {
  it("is authored for November at seven in the morning", () => {
    expect(expedition.month).toBe(11);
    expect(expedition.start_hour).toBe(7);
  });

  it("has the sun up over Shanghai when it leaves", () => {
    expect(clock.sunAt(0, SHANGHAI.lat, SHANGHAI.lon).elevationDeg).toBeGreaterThan(5);
  });
});

describe("and outruns it", () => {
  const arrivalS = flight.minutes * 60;

  it("arrives thirty-seven minutes later by the clock", () => {
    expect(flight.minutes).toBeCloseTo(36.7, 1);
    expect(clockString(clock.minutesAt(arrivalS))).toBe("07:37");
  });

  it("and finds Lhasa still in the dark", () => {
    // Flying west crosses two hours of sun in thirty-seven minutes of clock,
    // so the aeroplane lands before a sunrise it took off after.
    const sun = clock.sunAt(arrivalS, LHASA.lat, LHASA.lon);
    expect(sun.elevationDeg).toBeLessThan(-5);
    expect(clockString(clock.solarMinutesAt(arrivalS, LHASA.lon))).toBe("05:56");
  });

  it("because the route crosses 121 minutes of solar time", () => {
    const span =
      clock.solarMinutesAt(0, SHANGHAI.lon) - clock.solarMinutesAt(0, LHASA.lon);
    expect(span).toBeCloseTo(121.5, 0);
  });
});

describe("the claim in the file", () => {
  it("asks for a gap of about three hours, and the geography gives 1 h 40 m", () => {
    // "Early afternoon by the clock" is about 13:30; "mid-morning by the sun"
    // about 10:00. That is a gap of three and a half hours. The gap at Lhasa
    // is fixed by longitude and the equation of time and cannot be moved by
    // any clock rate: no start hour and no time compression makes the
    // sentence true.
    const gapMin = -meridianOffsetMinutes(LHASA.lon) - equationOfTimeMinutes(day);
    expect(gapMin).toBeCloseTo(100.5, 0);
    expect(gapMin).toBeLessThan(3 * 60);
  });
});

describe("the clock rate is a decision, and the candidates are 24x apart", () => {
  it("costs 14.6 hours to fly this route at the airspeed the aircraft has", () => {
    // Horizontal distance is compressed by a large gain (scale.ts, THE
    // ASYMMETRY). A clock that followed the aeroplane rather than the session
    // would run at this ratio - and it is not constant, because true airspeed
    // rises as the air thins.
    let aircraftMin = 0;
    for (const s of flight.track) {
      const tas = MODE_IAS_MS[modeAtKm(flyable.route, s.km)] / Math.sqrt(densityRatio(s.altitudeM));
      aircraftMin += 1000 / (tas * 60);
    }
    expect(aircraftMin / 60).toBeCloseTo(14.6, 1);
    expect(aircraftMin / flight.minutes).toBeCloseTo(AIRCRAFT_TIME_RATE, 0);
  });

  it("and would land the player at Lhasa after dark either way", () => {
    const fast = new WorldClock(expedition.start_hour * 60, day, AIRCRAFT_TIME_RATE);
    const sun = fast.sunAt(flight.minutes * 60, LHASA.lat, LHASA.lon);
    expect(clockString(fast.minutesAt(flight.minutes * 60))).toBe("21:33");
    expect(sun.elevationDeg).toBeLessThan(0);
  });
});
