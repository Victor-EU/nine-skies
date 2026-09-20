/**
 * Does Expedition 1 clear the ground it crosses? (Finding F17.)
 *
 * The build plan's test table asks for an autopilot replay of all nine routes
 * once they exist. This is the first of them, one phase early, because the
 * route that does not exist yet was not the one that needed checking: the one
 * the GDD has carried in its own text since the first draft was.
 *
 * Skips without a built corridor, which is the normal state of a fresh
 * checkout and of CI. A green tick for a check that silently ran on no data
 * would be worse than the gap it is filling.
 */
import { describe, expect, it } from "vitest";
import { loadCorridor, profileAlong, type Corridor, type ProfiledRoute } from "./corridorProfile.js";
import {
  climbDemandMs,
  flyRoute,
  groundSpeedForGradient,
  steepestRise,
  type Route,
} from "../../engine/src/sim/route.js";
import { ceilingM, LIGHT_PISTON, maxClimbRateMs } from "../../engine/src/sim/aircraft.js";
import {
  MODE_GROUND_KM_PER_MIN,
  TERRAIN_LIMITED_CRUISE_KM_PER_MIN,
  minutesForKm,
  type SpeedMode,
} from "../../engine/src/sim/scale.js";

const corridor = loadCorridor("dist-world/sea-to-sky");

interface Fixture {
  readonly built: Corridor;
  readonly published: ProfiledRoute;
  readonly direct: ProfiledRoute;
}

/**
 * Built on first use, not at collection time. Vitest runs a skipped suite's
 * body to find out what tests are in it, so anything at suite level runs even
 * where `skipIf` is true - and a fresh checkout has no corridor to read.
 */
let cached: Fixture | null = null;
function fixture(): Fixture {
  if (cached === null) {
    const built = corridor!;
    const waypoints = Object.values(built.manifest.anchors);
    cached = {
      built,
      published: profileAlong(built, waypoints),
      direct: profileAlong(built, [waypoints[0]!, waypoints[waypoints.length - 1]!]),
    };
  }
  return cached;
}

const groundOf = (p: ProfiledRoute) => (km: number) =>
  p.profileM[Math.min(Math.max(0, Math.round(km)), p.profileM.length - 1)]!;

/** The waypoints as a route, with a speed mode per leg. */
const asRoute = (p: ProfiledRoute, modes: SpeedMode[]): Route => ({
  name: "sea to sky",
  legs: p.legEndKm.map((endKm, i) => ({
    name: `leg ${i + 1}`,
    endKm,
    mode: modes[i] ?? modes[modes.length - 1]!,
  })),
});
const everyLeg = (mode: SpeedMode, p: ProfiledRoute) =>
  Array<SpeedMode>(p.legEndKm.length).fill(mode);

function fly(p: ProfiledRoute, modes: SpeedMode[], cruiseKmPerMin: number) {
  return flyRoute(asRoute(p, modes), groundOf(p), {
    pacing: { cruiseKmPerMin },
    startAltitudeM: fixture().built.manifest.start.altitudeM,
  });
}

describe.skipIf(corridor === null)("Sea to Sky, flown over its own ground", () => {
  it("reads the corridor the pipeline built", () => {
    const { built, published } = fixture();
    expect(built.manifest.corridor).toBe("sea-to-sky");
    expect(published.lengthKm).toBeCloseTo(3219.7, 0);
    expect(published.legEndKm).toHaveLength(6);
    expect(built.manifest.start.altitudeM).toBe(1200);
  });

  /**
   * The number F16 should have been measured against. It checked arrival
   * altitude at Lhasa against the 4,500 m the GDD calls plateau cruise; the
   * route crosses ground more than a kilometre higher than that, a hundred
   * and thirty kilometres short of the destination.
   */
  it("crosses ground a kilometre above the rim it was checked against", () => {
    const { published } = fixture();
    const highest = Math.max(...published.profileM);
    expect(highest).toBeGreaterThan(5500);
    expect(published.profileM.indexOf(highest)).toBeGreaterThan(3000);
    expect(highest - 4500).toBeGreaterThan(1000);
    // Still inside the aircraft's reach, so this is a pacing problem rather
    // than an impossible one - but only by six hundred metres.
    expect(highest).toBeLessThan(ceilingM(LIGHT_PISTON, 0));
  });

  it("asks for a climb rate an order of magnitude past the aircraft", () => {
    const { published } = fixture();
    const wall = steepestRise(published.profileM);
    expect(wall.gradientMPerKm).toBeGreaterThan(35);
    expect(wall.riseM).toBeGreaterThan(3500);

    // The whole of F17 in two numbers. The wall is not climbed at the wall,
    // at any pacing the GDD proposes; it is climbed over the thousand
    // kilometres before it, or it is flown into.
    const demanded = climbDemandMs(wall.gradientMPerKm, 130);
    const available = maxClimbRateMs(LIGHT_PISTON, published.profileM[wall.footKm]!);
    expect(demanded / available).toBeGreaterThan(10);
    expect(groundSpeedForGradient(wall.gradientMPerKm, available)).toBeLessThan(
      MODE_GROUND_KM_PER_MIN.low,
    );
  });

  /**
   * The finding itself. These are characterisations, not wishes: the shipped
   * pacing does not get an aircraft to Lhasa, and the failure is not subtle.
   */
  it("flies into the Hengduan at the shipped pacing", () => {
    const { published } = fixture();
    const flight = fly(published, everyLeg("cruise", published), 130);
    expect(flight.clears).toBe(false);
    expect(flight.contact!.km).toBeCloseTo(1954, -2);
    expect(flight.minutes).toBeCloseTo(13.0, 0);
    // Sixty-one per cent of the way. Not a near miss at the destination.
    expect(flight.reachedKm / published.lengthKm).toBeCloseTo(0.61, 1);
  });

  it("fails faster, not differently, at the top of the pacing range", () => {
    const { published } = fixture();
    const flight = fly(published, everyLeg("cruise", published), 190);
    expect(flight.clears).toBe(false);
    expect(flight.contact!.km).toBeCloseTo(1950, -2);
    expect(flight.contact!.shortfallM).toBeLessThan(-400);
  });

  it("clears at the bottom of the range, and only there", () => {
    const { published } = fixture();
    const flight = fly(published, everyLeg("cruise", published), 80);
    expect(flight.clears).toBe(true);
    expect(flight.worstClearanceM).toBeGreaterThan(200);
    expect(flight.worstKm).toBeGreaterThan(3000);
  });

  it("stops clearing the ground somewhere in the nineties", () => {
    // Scanned rather than bisected, because the boundary is not a boundary:
    // 95 clears and 96 does not. The deciding crossing is a 5,595 m ridge
    // that the aircraft passes with tens of metres in hand, so which
    // kilometre the integrator samples at which altitude decides it. The
    // useful number is therefore the last pacing below which *every* pacing
    // clears, not the last one that happens to.
    const { published } = fixture();
    const ceiling = TERRAIN_LIMITED_CRUISE_KM_PER_MIN;
    for (let cruise = 80; cruise <= ceiling; cruise++) {
      expect(fly(published, everyLeg("cruise", published), cruise).clears).toBe(true);
    }
    expect(fly(published, everyLeg("cruise", published), ceiling + 1).clears).toBe(false);

    // Even at the ceiling the margin is not a margin.
    expect(fly(published, everyLeg("cruise", published), ceiling).worstClearanceM)
      .toBeLessThan(100);

    // And what it costs, measured rather than divided: twenty-eight and a
    // half minutes of flying, against the GDD's twenty-five minute ceiling
    // for a narrated trip. The window F16 reported - 129 to 135 km/min - is
    // empty, and not narrowly.
    const atTheCeiling = fly(published, everyLeg("cruise", published), ceiling);
    expect(atTheCeiling.minutes).toBeCloseTo(28.5, 0);
    expect(atTheCeiling.minutes).toBeGreaterThan(25);
    // The nominal arithmetic the HUD shows is longer still, which is the
    // other half of the trap: it says 35 minutes for a flight that takes 28.
    expect(minutesForKm(published.lengthKm, "cruise", { cruiseKmPerMin: ceiling }))
      .toBeCloseTo(35, 0);
  });

  it("is rescued by per-leg speed, and by nothing else", () => {
    // F3's lever, and now not a lever but a requirement. Dropping only the
    // last leg changes nothing, because the aircraft never reaches it: the
    // contact is on the leg before, in the Hengduan.
    const { published } = fixture();
    const lastLegLow: SpeedMode[] = ["cruise", "cruise", "cruise", "cruise", "cruise", "low"];
    const lastTwoLow: SpeedMode[] = ["cruise", "cruise", "cruise", "cruise", "low", "low"];
    expect(fly(published, lastLegLow, 130).clears).toBe(false);

    const rescued = fly(published, lastTwoLow, 130);
    expect(rescued.clears).toBe(true);
    expect(rescued.worstClearanceM).toBeGreaterThan(150);
    // The cost is the GDD's whole narrative budget: thirty-eight minutes.
    expect(rescued.minutes).toBeGreaterThan(35);
  });

  it("does not spare the straight line either", () => {
    // F16 used the direct line as its worst case because it gives the least
    // ground to climb over. Against terrain it is worse still, and it fails
    // eleven and a half minutes in - inside the twelve the G1 protocol asks a
    // playtester to fly, and along the heading the corridor actually starts on.
    const { direct } = fixture();
    const flight = fly(direct, ["cruise"], 130);
    expect(flight.clears).toBe(false);
    expect(flight.minutes).toBeLessThan(12);
    expect(flight.contact!.km).toBeCloseTo(1705, -2);
  });

  it("takes a fifth less time than the HUD predicts", () => {
    // Ground speed is pinned to *indicated* airspeed, so true airspeed rising
    // with altitude carries the aircraft over the ground faster than the
    // pacing claims. `minutesForKm` is arithmetic on the nominal figure and
    // does not know. Worth recording because the trip length it shows is the
    // number a G2 operator writes down.
    const { published } = fixture();
    const flown = fly(published, everyLeg("low", published), 130);
    const predicted = minutesForKm(published.lengthKm, "low", { cruiseKmPerMin: 130 });
    expect(flown.clears).toBe(true);
    expect(predicted).toBeCloseTo(74.3, 0);
    expect(flown.minutes).toBeCloseTo(57.0, 0);
    expect(1 - flown.minutes / predicted).toBeGreaterThan(0.2);
  });
});
