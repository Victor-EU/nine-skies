/**
 * What a playtest session contains (F28).
 *
 * G1 is the project's go/no-go and its protocol is written in minutes, so the
 * conversion from minutes to kilometres is a gate criterion in disguise. It
 * had never been made. These run on the committed section, with no world,
 * because the protocol has to be arguable about from anywhere.
 */
import { describe, expect, it } from "vitest";
import { steepestRise } from "../../engine/src/sim/route.ts";
import { profileOf, session, startsContainingRim, trackOf } from "../../tools/session.ts";
import { hasGround, sea } from "./fixture.ts";

const flown = () => {
  const { route, ground } = sea();
  const whole = trackOf(route, ground, sea().expedition.start_altitude_m);
  return { route, ground, whole, wall: steepestRise(profileOf(ground, whole.length)) };
};

describe.skipIf(!hasGround)("the wall Expedition 1 is about", () => {
  it("is the one F17 measured, found without being told where to look", () => {
    // 37 m/km west of Chengdu is F17's number for the gradient that made the
    // route unflyable at cruise. `steepestRise` is given a bare profile and
    // no hint, so agreement here is two independent routes to one landform.
    const { wall } = flown();
    expect(wall.gradientMPerKm).toBeCloseTo(36.7, 1);
    expect(wall.footKm).toBeGreaterThan(1692); // west of Chengdu
    expect(wall.riseM).toBeGreaterThan(3500);
  });

  it("is crossed at minute 29.4 of 35.5", () => {
    const { whole, wall } = flown();
    const rim = whole.find((s) => s.km >= wall.rimKm)!;
    expect(rim.seconds / 60).toBeCloseTo(29.4, 1);
    expect(whole[whole.length - 1]!.seconds / 60).toBeCloseTo(35.5, 1);
  });
});

describe.skipIf(!hasGround)("G1's twelve minutes", () => {
  it("ends seventeen minutes before the thing the gate is about", () => {
    // The finding. G1 asks a cohort whether boredom sets in after the plateau
    // edge; the plateau edge is 17.4 minutes past the end of their session,
    // so every participant's answer falls before it whatever they feel.
    const { route, ground, whole, wall } = flown();
    const s = session(route, ground, whole, { minutes: 12, startKm: 0, escarpment: wall });
    expect(s.rimAtMinute).toBeNull();
    const rim = whole.find((x) => x.km >= wall.rimKm)!;
    expect(rim.seconds / 60 - 12).toBeGreaterThan(17);
  });

  it("does contain a climb, over ground that never explains it", () => {
    // Criterion 1 is served and criterion 2 is not, which is why the protocol
    // reads as nearly right. 2,806 m of climb is real; so is the fact that
    // the ground under it goes from 10 m to 69 m (F19).
    const { route, ground, whole, wall } = flown();
    const s = session(route, ground, whole, { minutes: 12, startKm: 0, escarpment: wall });
    expect(s.climbM).toBeGreaterThan(2500);
    expect(s.groundEndM).toBeLessThan(200);
    expect(s.lowestSigma).toBeLessThan(0.7); // the HUD calls this thin
  });

  it("needs to start at km 900 to contain the wall at all", () => {
    const { route, ground, whole } = flown();
    const found = startsContainingRim(route, ground, whole, 12);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]!.startKm).toBe(900);
    // And by then the player begins at 4,747 m, so the session that contains
    // the wall is not a session that contains the climb.
    expect(found[0]!.startAltitudeM).toBeGreaterThan(4500);
  });
});

describe.skipIf(!hasGround)("a session is flown rather than sliced", () => {
  it("defaults to the altitude the expedition would have there", () => {
    const { route, ground, whole, wall } = flown();
    const s = session(route, ground, whole, { minutes: 12, startKm: 1400, escarpment: wall });
    const there = whole.find((x) => x.km >= 1400)!;
    expect(s.startAltitudeM).toBeCloseTo(there.altitudeM, 0);
    expect(s.clears).toBe(true);
  });

  it("reports a drop-in that cannot survive its own session", () => {
    // Why the default matters. Put a player in front of the Hengduan at the
    // altitude Expedition 1 starts with and the session is not a shorter
    // Expedition 1, it is a crash — and a protocol has to know that before a
    // cohort is booked, not after.
    const { route, ground, whole, wall } = flown();
    const s = session(route, ground, whole, {
      minutes: 12,
      startKm: 1400,
      startAltitudeM: 1200,
      escarpment: wall,
    });
    expect(s.clears).toBe(false);
  });

  it("cuts by time, so the same minutes buy more ground on the plateau", () => {
    // The reason minutes and kilometres cannot be converted by arithmetic:
    // true airspeed rises as the air thins, so the back half goes past
    // faster. A protocol reasoning in distance is describing two sessions.
    const { route, ground, whole, wall } = flown();
    const east = session(route, ground, whole, { minutes: 12, startKm: 0, escarpment: wall });
    const west = session(route, ground, whole, { minutes: 12, startKm: 1375, escarpment: wall });
    expect(west.endKm - west.startKm).toBeGreaterThan((east.endKm - east.startKm) * 2);
  });
});
