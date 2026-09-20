/**
 * Does Expedition 1 clear the ground it crosses? (Findings F17 and F18.)
 *
 * The build plan's test table asks for an autopilot replay of all nine routes
 * once they exist. This is the first of them, one phase early, because the
 * route that does not exist yet was not the one that needed checking: the one
 * the GDD has carried in its own text since the first draft was.
 *
 * It flies `content/expeditions/sea-to-sky.yaml` - the authored file, not a
 * copy of its numbers - so D17 means what it says: a route is not data until
 * an autopilot has flown it over the ground.
 *
 * Runs everywhere. The ground under this route is committed beside it (D21),
 * so what used to be the normal state of a fresh checkout - every assertion
 * here skipped - is now one test, the straight-line comparison, which samples
 * the world off the route and so still needs a built corridor.
 */
import { describe, expect, it } from "vitest";
import { loadCorridor, profileAlong, type ProfiledRoute } from "../../tools/corridor.ts";
import { hasGround, sea } from "./fixture.ts";
import {
  climbDemandMs,
  flyRoute,
  groundSpeedForGradient,
  steepestRise,
  type Route,
} from "../../engine/src/sim/route.js";
import { ceilingM, LIGHT_PISTON, maxClimbRateMs } from "../../engine/src/sim/aircraft.js";
import { EXPEDITION_RULES } from "../../content/schema.ts";
import {
  MODE_GROUND_KM_PER_MIN,
  TERRAIN_LIMITED_CRUISE_KM_PER_MIN,
  minutesForKm,
  type SpeedMode,
} from "../../engine/src/sim/scale.js";

const corridor = loadCorridor("dist-world/sea-to-sky");

/**
 * The great-circle line Shanghai to Lhasa, which is not the authored route.
 *
 * The one thing in this suite a section cannot supply: a section is the
 * ground under one authored polyline, and this is deliberately a different
 * polyline. Sampling it needs the world.
 */
let cachedDirect: ProfiledRoute | null = null;
function direct(): ProfiledRoute {
  if (cachedDirect === null) {
    const anchors = corridor!.manifest.anchors;
    cachedDirect = profileAlong(corridor!, [anchors["shanghai"]!, anchors["lhasa"]!]);
  }
  return cachedDirect;
}

const atSpeed = (route: Route, mode: SpeedMode): Route => ({
  ...route,
  legs: route.legs.map((l) => ({ ...l, mode })),
});

describe.skipIf(!hasGround)("Sea to Sky, flown over its own ground", () => {
  it("reads the route from the authored file", () => {
    expect(sea().expedition.id).toBe("sea-to-sky");
    // The GDD's own waypoints, in the GDD's own order.
    expect(sea().expedition.route.map((p) => p.id)).toEqual([
      "shanghai",
      "wuhan",
      "chongqing",
      "chengdu",
      "lhasa",
    ]);
    expect(sea().profiled.lengthKm).toBeCloseTo(2931, 0);
    // Four authored legs, and a fifth the file does not write: the arrival's
    // `approach_km` splits the last one so the final 45 km into Lhasa are
    // flown at approach pace (F31). Same waypoints, same length.
    expect(sea().route.legs).toHaveLength(5);
    expect(sea().route.legs[4]!.mode).toBe("approach");
  });

  /**
   * The number F16 should have been measured against. It checked arrival
   * altitude at Lhasa against the 4,500 m the GDD calls plateau cruise; the
   * route crosses ground more than a kilometre higher than that, two hundred
   * kilometres short of the destination.
   */
  it("crosses ground a kilometre above the rim it was checked against", () => {
    const highest = Math.max(...sea().profiled.profileM);
    expect(highest).toBeCloseTo(5558, -2);
    expect(sea().profiled.profileM.indexOf(highest)).toBeGreaterThan(2700);
    expect(highest - 4500).toBeGreaterThan(1000);
    // Still inside the aircraft's reach, so this is a pacing problem rather
    // than an impossible one - but only by twelve hundred metres.
    expect(highest).toBeLessThan(ceilingM(LIGHT_PISTON, 0));
  });

  it("asks for a climb rate an order of magnitude past the aircraft", () => {
    const wall = steepestRise(sea().profiled.profileM);
    expect(wall.gradientMPerKm).toBeGreaterThan(35);
    expect(wall.riseM).toBeGreaterThan(3500);

    // The whole of F17 in two numbers. The wall is not climbed at the wall,
    // at any pacing the GDD proposes; it is climbed over the thousand
    // kilometres before it, or it is flown into.
    const demanded = climbDemandMs(wall.gradientMPerKm, 130);
    const available = maxClimbRateMs(LIGHT_PISTON, sea().profiled.profileM[wall.footKm]!);
    expect(demanded / available).toBeGreaterThan(10);
    expect(groundSpeedForGradient(wall.gradientMPerKm, available)).toBeLessThan(
      MODE_GROUND_KM_PER_MIN.low,
    );
  });

  describe("at a single speed, which is what the GDD assumes", () => {
    it("flies into a ridge west of Chengdu at the shipped pacing", () => {
        const flight = flyRoute(atSpeed(sea().route, "cruise"), sea().ground, {
        startAltitudeM: sea().expedition.start_altitude_m,
      });
      expect(flight.clears).toBe(false);
      expect(flight.contact!.km).toBeCloseTo(1846, -2);
      expect(flight.contact!.shortfallM).toBeLessThan(-300);
      expect(flight.minutes).toBeCloseTo(12.3, 0);
      // Sixty-three per cent of the way. Not a near miss at the destination.
      expect(flight.reachedKm / sea().profiled.lengthKm).toBeCloseTo(0.63, 1);
    });

    it("clears at 73 km/min and not at 74", () => {
        const single = atSpeed(sea().route, "cruise");
      const clears = (cruiseKmPerMin: number) =>
        flyRoute(single, sea().ground, {
          pacing: { cruiseKmPerMin },
          startAltitudeM: sea().expedition.start_altitude_m,
        }).clears;
      // Every pacing below it, not merely the one below it: near the boundary
      // the answer can alternate, because the deciding crossing is a ridge
      // the aircraft passes with tens of metres in hand.
      for (let v = 50; v <= TERRAIN_LIMITED_CRUISE_KM_PER_MIN; v++) expect(clears(v)).toBe(true);
      expect(clears(TERRAIN_LIMITED_CRUISE_KM_PER_MIN + 1)).toBe(false);
    });

    it("cannot be both flyable and a fifteen-to-thirty-five minute trip", () => {
        const slowEnough = flyRoute(atSpeed(sea().route, "cruise"), sea().ground, {
        pacing: { cruiseKmPerMin: TERRAIN_LIMITED_CRUISE_KM_PER_MIN },
        startAltitudeM: sea().expedition.start_altitude_m,
      });
      expect(slowEnough.clears).toBe(true);
      expect(slowEnough.minutes).toBeCloseTo(32.3, 0);
      // The nominal arithmetic the HUD and the GDD's table both use is longer
      // still, which is the other half of the trap: it says forty minutes for
      // a flight that takes thirty-two.
      expect(
        minutesForKm(sea().profiled.lengthKm, "cruise", {
          cruiseKmPerMin: TERRAIN_LIMITED_CRUISE_KM_PER_MIN,
        }),
      ).toBeCloseTo(40.2, 0);
    });

    it.skipIf(corridor === null)("does not spare the straight line either", () => {
      // F16 used the direct line as its worst case because it gives the least
      // ground to climb over. Against terrain it is worse still, and it fails
      // eleven and a half minutes in - inside the twelve the G1 protocol asks
      // a playtester to fly, along the heading the corridor starts on.
      const ground = (km: number) =>
        direct().profileM[Math.min(Math.max(0, Math.round(km)), direct().profileM.length - 1)]!;
      const route: Route = {
        name: "direct",
        legs: [{ name: "to Lhasa", endKm: direct().lengthKm, mode: "cruise" }],
      };
      const flight = flyRoute(route, ground, { startAltitudeM: 1200 });
      expect(flight.clears).toBe(false);
      expect(flight.minutes).toBeLessThan(12);
      expect(flight.contact!.km).toBeCloseTo(1704, -2);
    });
  });

  describe("as authored, with a speed per leg", () => {
    const flyAuthored = () => {
        return flyRoute(sea().route, sea().ground, {
        startAltitudeM: sea().expedition.start_altitude_m,
      });
    };

    it("clears the ground, by a margin that is actually a margin", () => {
      const flight = flyAuthored();
      expect(flight.clears).toBe(true);
      expect(flight.worstClearanceM).toBeGreaterThan(300);
      expect(flight.worstClearanceM).toBeCloseTo(333, -1);
      expect(flight.worstKm).toBeCloseTo(2366, -2);
      expect(flight.arrivalAltitudeM).toBeCloseTo(6010, -2);
    });

    it("is the fastest profile that does, and it is now well past the band", () => {
      // 36.7 against the GDD's own fifteen-to-thirty-five minute band. Two
      // decisions put it there and both were taken deliberately: the climb
      // was kept rather than the twenty-five minutes, and the route was made
      // to arrive at Lhasa, which costs 1.2 minutes of approach (F31). Kept
      // as an assertion rather than quietly rounded, because the next person
      // to trim a minute off this will do it by making the route unflyable,
      // and this is where that gets caught.
      const flight = flyAuthored();
      expect(flight.minutes).toBeCloseTo(36.7, 1);
      expect(flight.minutes).toBeGreaterThan(EXPEDITION_RULES.maxMinutes);
      expect(flight.minutes).toBeLessThan(EXPEDITION_RULES.maxMinutes + 2);
    });

    it("is slow where the ground is flat, which is the counter-intuitive part", () => {
      // The two low legs are the eastern plain. Climbing costs minutes, not
      // kilometres, and the only place to buy them is where nothing is in the
      // way. Anyone reading this file will want to swap these round.
      expect(sea().route.legs.slice(0, 2).map((l) => l.mode)).toEqual(["low", "low"]);
      expect(sea().route.legs.slice(2).map((l) => l.mode)).toEqual([
        "cruise",
        "cruise",
        "approach",
      ]);

      // Reversing them is not slower. It is a crash.
      const reversed: Route = {
        ...sea().route,
        legs: sea().route.legs.map((l, i) => ({ ...l, mode: (i < 2 ? "cruise" : "low") as SpeedMode })),
      };
      expect(
        flyRoute(reversed, sea().ground, { startAltitudeM: sea().expedition.start_altitude_m }).clears,
      ).toBe(false);
    });

    it("spends three quarters of itself climbing, which is the lesson", () => {
      // Chongqing is 1,427 km of 2,931 - not half the route, and 76 % of the
      // time. That is the asymmetry the GDD is about, arriving as a pacing
      // consequence rather than as a line of narration.
        const through = (n: number) =>
        flyRoute({ ...sea().route, legs: sea().route.legs.slice(0, n) }, sea().ground, {
          startAltitudeM: sea().expedition.start_altitude_m,
        });
      const toChongqing = through(2);
      const whole = flyAuthored();
      expect(toChongqing.minutes / whole.minutes).toBeGreaterThan(0.7);
      expect(toChongqing.arrivalAltitudeM).toBeGreaterThan(5000);
    });

    it("gains nothing from asking for boost west of Chongqing", () => {
      // Boost is gated on air density and cuts out at 3,564 m, which by the
      // third leg is below the aircraft. An author writing `boost` there
      // would get cruise and no warning, so the equality is pinned here.
      // Only the cruise legs. The approach leg is left alone: swapping it for
      // boost would not be testing a no-op, it would be deleting the pace
      // change the arrival depends on, and the equality below would fail for
      // a reason that has nothing to do with air density.
      const boosted: Route = {
        ...sea().route,
        legs: sea().route.legs.map((l) =>
          l.mode === "cruise" ? { ...l, mode: "boost" as SpeedMode } : l,
        ),
      };
      const a = flyAuthored();
      const b = flyRoute(boosted, sea().ground, {
        startAltitudeM: sea().expedition.start_altitude_m,
      });
      expect(b.minutes).toBeCloseTo(a.minutes, 5);
      expect(b.worstClearanceM).toBeCloseTo(a.worstClearanceM, 5);
    });
  });
});
