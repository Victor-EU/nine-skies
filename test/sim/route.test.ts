import { describe, expect, it } from "vitest";
import {
  altitudeFloorM,
  climbDemandMs,
  climbFloor,
  floorProfile,
  followFloor,
  flyRoute,
  groundFrom,
  groundSpeedForGradient,
  handOff,
  longestHoldS,
  modeAtKm,
  routeFrom,
  routeLengthKm,
  steepestRise,
  type Route,
} from "../../engine/src/sim/route.js";
import {
  LIGHT_PISTON,
  MAX_DESCENT_MS,
  ceilingM,
  climbRecoveryRatio,
  maxClimbRateMs,
} from "../../engine/src/sim/aircraft.js";

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

describe("the altitude a route demands before it demands anything else", () => {
  /**
   * A wall a long way off, over ground that gives no hint of it. This is the
   * shape of every route from the Chinese coast to the plateau, and the whole
   * point of the floor: the number the aircraft is flying against is not the
   * ground under it.
   */
  const distantWall = escarpment(100, 1200, 1500, 3400);
  const route = oneLeg(1600, "cruise");

  it("renumbers the remainder of a route so it is just another route", () => {
    const full: Route = {
      name: "three legs",
      legs: [
        { name: "a", endKm: 300, mode: "low" },
        { name: "b", endKm: 800, mode: "cruise" },
        { name: "c", endKm: 1000, mode: "boost" },
      ],
    };
    const rest = routeFrom(full, 500);
    expect(rest.legs.map((l) => l.endKm)).toEqual([300, 500]);
    expect(modeAtKm(rest, 0)).toBe("cruise");
    expect(routeLengthKm(rest)).toBe(500);
    expect(groundFrom((km) => km * 2, 500)(10)).toBe(1020);
  });

  it("records where the aircraft was, one sample per kilometre", () => {
    const flight = flyRoute(oneLeg(40), () => 0, { track: true });
    const kms = flight.track.map((t) => t.km);
    expect(kms).toEqual([...new Set(kms)]); // no duplicates at step boundaries
    expect(kms[0]).toBe(0);
    expect(kms[kms.length - 1]).toBeGreaterThanOrEqual(40);
    expect(flight.track[10]!.clearanceM).toBeCloseTo(flight.track[10]!.altitudeM, 6);
  });

  it("costs nothing when it is not asked for", () => {
    expect(flyRoute(oneLeg(40), () => 0).track).toEqual([]);
  });

  it("is far above the ground where the ground is flat", () => {
    // 800 km short of the wall, over a 100 m plain, the aircraft already has
    // to be a kilometre and a half up or it will not make the rim in time.
    // Nothing within sight of it says so, which is the whole finding.
    const floor = altitudeFloorM(route, distantWall, 400);
    expect(distantWall(400)).toBe(100);
    expect(floor).toBeGreaterThan(1400);
    // And by then it is above the altitude the route started at.
    expect(floor).toBeGreaterThan(1200);
  });

  it("rises along the route even where the ground does not", () => {
    const path = climbFloor(route, distantWall, { strideKm: 200 });
    const onThePlain = path.filter((p) => p.km <= 1000);
    expect(onThePlain.every((p) => p.groundM === 100)).toBe(true);
    for (let i = 1; i < onThePlain.length; i++) {
      expect(onThePlain[i]!.floorM).toBeGreaterThan(onThePlain[i - 1]!.floorM);
    }
  });

  it("is the altitude the flight actually turns on, to the metre", () => {
    const floor = altitudeFloorM(route, distantWall, 600);
    const rest = routeFrom(route, 600);
    const ground = groundFrom(distantWall, 600);
    expect(flyRoute(rest, ground, { startAltitudeM: floor + 5 }).clears).toBe(true);
    expect(flyRoute(rest, ground, { startAltitudeM: floor - 5 }).clears).toBe(false);
  });

  it("is infinite where even the ceiling does not save the route", () => {
    const tooHigh = escarpment(100, 100, 200, 7000);
    expect(altitudeFloorM(oneLeg(400), tooHigh, 0)).toBe(Infinity);
  });
});

describe("how long the player may have the stick", () => {
  const distantWall = escarpment(100, 1200, 1500, 3400);
  const route = oneLeg(1600, "cruise");

  it("hands the stick back at the end of the window", () => {
    const policy = handOff(100, 50, -0.4);
    expect(policy(0, 99, 0)).toBe(1);
    expect(policy(0, 100, 0)).toBe(-0.4);
    expect(policy(0, 149.9, 0)).toBe(-0.4);
    expect(policy(0, 150, 0)).toBe(1);
    expect(handOff(0, 10)(0, 5, 0)).toBe(0); // level by default
  });

  it("is a real budget, and a smaller one the harder the player pushes", () => {
    const level = longestHoldS(route, distantWall, 0, { probeS: 30 });
    const noseDown = longestHoldS(route, distantWall, -1, { probeS: 30 });
    expect(level).toBeGreaterThan(0);
    expect(noseDown).toBeGreaterThan(0);
    expect(noseDown).toBeLessThan(level);
  });

  it("is zero on a route that does not clear even untouched", () => {
    const tooHigh = escarpment(100, 100, 200, 7000);
    expect(longestHoldS(oneLeg(400), tooHigh, 0)).toBe(0);
  });

  it("is bounded by the altitude there is to spend when nothing is in the way", () => {
    // A route over the sea asks nothing of the aircraft, so what limits a
    // full nose-down is the 1,200 m it starts with at 18 m/s - about 67
    // seconds - and not the terrain.
    const budget = longestHoldS(oneLeg(200, "cruise"), () => 0, -1, { probeS: 30 });
    expect(budget).toBeGreaterThan(60);
    expect(budget).toBeLessThan(75);
  });
});

describe("the price of altitude, which is what thin air actually means", () => {
  it("is four seconds of climb per second of descent at the coast", () => {
    expect(climbRecoveryRatio(LIGHT_PISTON, 1200)).toBeCloseTo(4.2, 1);
  });

  it("is twenty-four at plateau cruise, from the same two numbers", () => {
    // Nothing here is a rule about the plateau. The descent rate is the same
    // 18 m/s it is at sea level; the climb rate has fallen to 0.80 m/s.
    expect(maxClimbRateMs(LIGHT_PISTON, 5868)).toBeCloseTo(0.8, 1);
    expect(MAX_DESCENT_MS).toBe(18);
    expect(climbRecoveryRatio(LIGHT_PISTON, 5868)).toBeCloseTo(23.4, 1);
  });

  it("rises monotonically with altitude and is unbounded at the ceiling", () => {
    const at = (m: number) => climbRecoveryRatio(LIGHT_PISTON, m);
    expect(at(0)).toBeLessThan(at(3000));
    expect(at(3000)).toBeLessThan(at(5000));
    expect(at(ceilingM(LIGHT_PISTON, 0) + 100)).toBe(Infinity);
  });
});

describe("an autopilot that flies the route instead of proving it", () => {
  const distantWall = escarpment(100, 1200, 1500, 3400);
  const route = oneLeg(1600, "cruise");
  const floorFor = (clearanceM: number) =>
    floorProfile(climbFloor(route, distantWall, { strideKm: 100, clearanceM }));

  it("interpolates a sampled floor and clamps past both ends", () => {
    const profile = floorProfile([
      { km: 0, groundM: 0, floorM: 100 },
      { km: 100, groundM: 0, floorM: 300 },
      { km: 200, groundM: 0, floorM: 400 },
    ]);
    expect(profile(-50)).toBe(100);
    expect(profile(0)).toBe(100);
    expect(profile(50)).toBe(200);
    expect(profile(150)).toBe(350);
    expect(profile(999)).toBe(400);
    expect(floorProfile([])(10)).toBe(0);
  });

  it("gives everything it has at or below the floor, and eases back down above it", () => {
    const policy = followFloor(() => 1000, { bandM: 200, maxDescent: 0.25 });
    expect(policy(0, 0, 1000)).toBe(1); // exactly on it
    expect(policy(0, 0, 900)).toBe(1); // under it
    expect(policy(0, 0, 1040)).toBeCloseTo(-0.2, 6); // 40 m high, easing down
    expect(policy(0, 0, 1100)).toBe(-0.25); // 100 m high, already at the cap
    expect(policy(0, 0, 5000)).toBe(-0.25); // and never a dive
  });

  it("keeps the clearance it was built with", () => {
    const flight = flyRoute(route, distantWall, { policy: followFloor(floorFor(250)) });
    expect(flight.clears).toBe(true);
    // Tracking lag is one-sided and small - tens of metres, not the band.
    expect(flight.worstClearanceM).toBeGreaterThan(200);
    expect(flight.worstClearanceM).toBeLessThan(250);
  });

  it("does not, if the margin is added to the floor afterwards", () => {
    // The wrong turn, kept as a test because it is the kind of mistake that
    // reads as correct. Climb rate falls with altitude, so an aircraft
    // holding station above a rising floor cannot climb as fast as the floor
    // does and slides back onto it. A margin has to be in the curve.
    const bare = floorFor(0);
    const flight = flyRoute(route, distantWall, {
      policy: followFloor((km) => bare(km) + 250),
    });
    expect(flight.worstClearanceM).toBeLessThan(200);
  });

  it("flies lower than full climb, and never below the floor", () => {
    const following = flyRoute(route, distantWall, {
      policy: followFloor(floorFor(250)),
      track: true,
    });
    const full = flyRoute(route, distantWall, { track: true });
    expect(following.peakAltitudeM).toBeLessThan(full.peakAltitudeM);
    expect(following.clears).toBe(true);
  });
});

describe("the hand-off budget belongs to the autopilot as well as the route", () => {
  const distantWall = escarpment(100, 1200, 1500, 3400);
  const route = oneLeg(1600, "cruise");

  it("interrupts whatever the autopilot was doing, and gives it back", () => {
    const base: ReturnType<typeof followFloor> = (_km, _s, altitudeM) =>
      altitudeM > 2000 ? -0.5 : 0.25;
    const policy = handOff(100, 50, 0, base);
    expect(policy(0, 99, 3000)).toBe(-0.5);
    expect(policy(0, 120, 3000)).toBe(0); // the player has it
    expect(policy(0, 200, 1000)).toBe(0.25); // and hands it back
  });

  it("is smaller for an autopilot that has already spent the altitude", () => {
    // Full climb banks every metre it can and so has the most to give away.
    // A floor-follower has deliberately spent the difference on flying low,
    // and the player feels that as a shorter leash.
    const floor = floorProfile(climbFloor(route, distantWall, { strideKm: 100, clearanceM: 150 }));
    const thrifty = longestHoldS(route, distantWall, 0, {
      probeS: 30,
      policy: followFloor(floor),
    });
    const spendthrift = longestHoldS(route, distantWall, 0, { probeS: 30 });
    expect(thrifty).toBeGreaterThan(0);
    expect(thrifty).toBeLessThan(spendthrift);
  });
});
