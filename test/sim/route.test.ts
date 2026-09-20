import { describe, expect, it } from "vitest";
import {
  climbDemandMs,
  flyRoute,
  groundSpeedForGradient,
  modeAtKm,
  routeLengthKm,
  steepestRise,
  type Route,
} from "../../engine/src/sim/route.js";
import { LIGHT_PISTON, ceilingM, maxClimbRateMs } from "../../engine/src/sim/aircraft.js";

/** A plain, a ramp, then a plateau - the corridor with everything else off. */
function escarpment(
  plainM: number,
  footKm: number,
  rimKm: number,
  plateauM: number,
) {
  return (km: number): number => {
    if (km <= footKm) return plainM;
    if (km >= rimKm) return plateauM;
    return plainM + ((plateauM - plainM) * (km - footKm)) / (rimKm - footKm);
  };
}

const oneLeg = (km: number, mode: Route["legs"][number]["mode"] = "cruise"): Route => ({
  name: "test",
  legs: [{ name: "only", endKm: km, mode }],
});

describe("a route is a polyline with a speed per leg", () => {
  const route: Route = {
    name: "sea to sky",
    legs: [
      { name: "delta", endKm: 679, mode: "cruise" },
      { name: "gorges", endKm: 1433, mode: "cruise" },
      { name: "approach", endKm: 3220, mode: "low" },
    ],
  };

  it("is as long as its last leg's end", () => {
    expect(routeLengthKm(route)).toBe(3220);
  });

  it("reads the mode at a distance, and holds the last one past the end", () => {
    expect(modeAtKm(route, 0)).toBe("cruise");
    expect(modeAtKm(route, 678.9)).toBe("cruise");
    expect(modeAtKm(route, 1500)).toBe("low");
    expect(modeAtKm(route, 99_999)).toBe("low");
  });
});

describe("the gradient arithmetic that F17 turns on", () => {
  /**
   * The Longmen Shan wall, as the 1 km grid reads it: 4,418 m of rise in
   * 100 km of ground. These two functions are inverses of each other and both
   * numbers are quoted in the finding, so they are pinned here rather than
   * recomputed in prose.
   */
  const LONGMEN_SHAN_M_PER_KM = 44.2;

  it("asks for ninety-six metres a second at the shipped pacing", () => {
    expect(climbDemandMs(LONGMEN_SHAN_M_PER_KM, 130)).toBeCloseTo(95.8, 1);
  });

  it("is a property of speed, not of the hill", () => {
    // Halve the ground speed and the same hill asks for half the climb. This
    // is why per-leg speed is the only lever that works on a wall.
    expect(climbDemandMs(LONGMEN_SHAN_M_PER_KM, 65)).toBeCloseTo(
      climbDemandMs(LONGMEN_SHAN_M_PER_KM, 130) / 2,
      6,
    );
  });

  it("would have to be crossed at eleven kilometres a minute to be climbed in place", () => {
    const seaLevelClimb = maxClimbRateMs(LIGHT_PISTON, 0);
    expect(seaLevelClimb).toBeCloseTo(7.1, 1);
    expect(groundSpeedForGradient(LONGMEN_SHAN_M_PER_KM, seaLevelClimb)).toBeCloseTo(9.7, 1);
  });

  it("round-trips against the demand", () => {
    const speed = groundSpeedForGradient(LONGMEN_SHAN_M_PER_KM, 5);
    expect(climbDemandMs(LONGMEN_SHAN_M_PER_KM, speed)).toBeCloseTo(5, 9);
  });

  it("has no answer for flat ground, which is the right answer", () => {
    expect(groundSpeedForGradient(0, 5)).toBe(Infinity);
  });
});

describe("steepestRise finds the wall rather than the peak", () => {
  it("picks the ramp out of a plain and a plateau", () => {
    const ground = escarpment(500, 600, 700, 4900);
    const profile = Array.from({ length: 1200 }, (_, km) => ground(km));
    const wall = steepestRise(profile, 100);
    expect(wall.footKm).toBe(600);
    expect(wall.rimKm).toBe(700);
    expect(wall.riseM).toBeCloseTo(4400, 0);
    expect(wall.gradientMPerKm).toBeCloseTo(44, 0);
  });

  it("ignores a lone spike taller than the wall", () => {
    // A 6,000 m needle one kilometre wide is a mountain, not an escarpment,
    // and a route crosses it in half a second. The window is what tells them
    // apart, and it is why this is not a max() over the profile.
    const ground = escarpment(500, 600, 700, 4900);
    const profile = Array.from({ length: 1200 }, (_, km) => ground(km));
    profile[200] = 6000;
    expect(steepestRise(profile, 100).footKm).toBe(600);
  });
});

describe("flying a route over its own ground", () => {
  it("clears a flat world easily, and climbs while it does", () => {
    const flight = flyRoute(oneLeg(1000), () => 0);
    expect(flight.clears).toBe(true);
    expect(flight.contact).toBeNull();
    expect(flight.reachedKm).toBeGreaterThan(999);
    expect(flight.arrivalAltitudeM).toBeGreaterThan(1200);
    expect(flight.worstClearanceM).toBeCloseTo(1200, 0);
  });

  it("reports where the ground won, not merely that it did", () => {
    // 4,400 m of rise in 100 km, met at cruise: the aircraft is asked for
    // 95 m/s and has 5. The contact is in the ramp, and saying so is the
    // whole point - a verdict of "does not close" sends a route designer
    // nowhere.
    const flight = flyRoute(oneLeg(1500), escarpment(500, 600, 700, 4900));
    expect(flight.clears).toBe(false);
    expect(flight.contact).not.toBeNull();
    expect(flight.contact!.km).toBeGreaterThan(600);
    expect(flight.contact!.km).toBeLessThan(700);
    expect(flight.worstClearanceM).toBeLessThan(0);
  });

  it("stops where it hit, and says how far it got", () => {
    // Not a partial credit score. The rest of the route was never flown, and
    // a check that keeps walking reports clearances for an aircraft that is
    // inside a mountain.
    const flight = flyRoute(oneLeg(1500), escarpment(500, 600, 700, 4900));
    expect(flight.reachedKm).toBeLessThan(750);
    expect(flight.reachedKm).toBeCloseTo(flight.contact!.km, 6);
  });

  it("clears the same wall when the leg is flown slowly", () => {
    // The lever is not the climb rate, which is unchanged. It is the 800 km
    // of approach, which at low speed is 18.6 minutes of climbing instead of
    // 6.2. This is F3's per-leg speed mode doing the only thing that works on
    // a wall: arriving at it higher.
    const ground = escarpment(500, 800, 900, 4200);
    expect(flyRoute(oneLeg(1400, "cruise"), ground).clears).toBe(false);
    expect(flyRoute(oneLeg(1400, "low"), ground).clears).toBe(true);
  });

  it("cannot clear ground above the aircraft's reach, at any speed", () => {
    // Not a pacing problem and not a route problem. The aircraft's absolute
    // ceiling is 6,750 m, set deliberately so the player looks up at Everest
    // rather than over it; ground above that is not overflyable and a route
    // crossing it is a design error no tuning fixes.
    expect(ceilingM(LIGHT_PISTON, 0)).toBeCloseTo(6750, -1);
    const everest = escarpment(500, 200, 1200, 8849);
    for (const mode of ["low", "cruise"] as const) {
      expect(flyRoute(oneLeg(4000, mode), everest).clears).toBe(false);
    }
  });

  it("does not let the arcade bounce carry it up a hill", () => {
    // `step` lifts an aircraft that touches down to 25 m above the ground.
    // On a slope gentle enough that the ground gains less than that per
    // step, a clearance check that leaves the bounce on watches the terrain
    // escalator the aircraft over a 7,000 m ridge and calls it a flight.
    // This ramp is exactly that gentle: 6.7 m of rise per km of ground.
    const escalator = escarpment(500, 200, 1200, 7150);
    const flight = flyRoute(oneLeg(4000), escalator);
    expect(flight.clears).toBe(false);
    expect(flight.peakAltitudeM).toBeLessThan(ceilingM(LIGHT_PISTON, 0));
  });

  it("is a lower bound: the autopilot climbs harder than any player will", () => {
    // Full up-elevator the whole way. If this cannot clear it, nothing can -
    // which is the only direction of inference the check has to support.
    const ground = escarpment(500, 600, 700, 4900);
    const flat = flyRoute(oneLeg(600), ground);
    expect(flat.peakAltitudeM).toBeCloseTo(flat.arrivalAltitudeM, 0);
  });

  it("counts the true airspeed a climbing aircraft gains", () => {
    // Nominal ground speed would put 1,300 km at exactly ten minutes. It is
    // not, because TAS rises with altitude and the ground goes under a
    // climbing aircraft faster than the pacing says. Thirteen per cent is
    // not a rounding error: it is thirteen per cent less climbing done
    // before the wall arrives.
    const flight = flyRoute(oneLeg(1300), () => 0, { pacing: { cruiseKmPerMin: 130 } });
    expect(flight.minutes).toBeCloseTo(8.9, 1);
    expect(1300 / 130 / flight.minutes - 1).toBeCloseTo(0.128, 2);
  });
});
