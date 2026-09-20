/**
 * Whether Expedition 1 can be *arrived at*, which is not what D17 checks.
 * (Finding F21.)
 *
 * The clearance check asks whether the aircraft can get over the ground.
 * F19 added the floor, which is how low it may be. Both are about staying up.
 * Nobody had asked the other half - whether it can get back down - and on a
 * route that ends at a city in a valley behind a wall, that is the half with
 * the answer in it.
 *
 * Runs everywhere: the ground under this route is committed beside it
 * (D21), so the findings below are checked on every commit rather than
 * only on a machine with the rasters.
 */
import { describe, expect, it } from "vitest";
import { hasGround, sea } from "./fixture.ts";
import {
  approachBand,
  arrivalCeilingM,
  arrivalShortfallM,
  climbFloor,
  floorProfile,
  flyRoute,
  followFloor,
  routeLengthKm,
  type GroundProfile,
  type Route,
} from "../../engine/src/sim/route.js";
import { MAX_DESCENT_MS } from "../../engine/src/sim/aircraft.js";
import { MODE_GROUND_KM_PER_MIN } from "../../engine/src/sim/scale.js";

/**
 * Twenty-five kilometres and ten of look-ahead, which is where the answer
 * stops moving. At fifty the probe is not converged and can fly into the
 * ridge it is measuring; the engine's own comments carry the sweep.
 */
const BASE = { strideKm: 25, toleranceM: 5, clearanceM: 300, arrivalM: 500 } as const;

let floorCache: GroundProfile | null = null;
function floor(): GroundProfile {
  if (floorCache === null) {
    floorCache = floorProfile(climbFloor(sea().route, sea().ground, BASE));
  }
  return floorCache;
}
const opts = () => ({ ...BASE, floor: floor() });

/** The shipped route with an approach waypoint at `splitKm` flown slowly. */
function withApproach(route: Route, splitKm: number): Route {
  return {
    name: route.name,
    legs: [
      ...route.legs.filter((leg) => leg.endKm < splitKm),
      { name: "to approach", endKm: splitKm, mode: "cruise" },
      { name: "to Lhasa", endKm: routeLengthKm(route), mode: "low" },
    ],
  };
}

describe.skipIf(!hasGround)("Expedition 1 does not arrive at Lhasa", () => {
  it("cannot be landed, and the lowest trajectory that exists is a mile up", () => {
    const { route, ground } = sea();
    const shortfallM = arrivalShortfallM(route, ground, { ...opts(), arrivalM: 0 });
    // Not the autopilot being cautious. This is full forward stick wherever
    // the aircraft is above the floor, which is the lowest line any policy
    // can fly, and it still ends up here.
    expect(shortfallM).toBeGreaterThan(1500);
    expect(shortfallM).toBeCloseTo(1588, -2);
  });

  it("offers the policy knob about a fifth of what is missing", () => {
    const { route, ground } = sea();
    const lengthKm = routeLengthKm(route);
    const gentle = flyRoute(route, ground, {
      policy: followFloor(floor(), { maxDescent: 0.25, bandM: 200 }),
    });
    const shipped = gentle.arrivalAltitudeM - ground(lengthKm);
    const lowest = arrivalShortfallM(route, ground, { ...opts(), arrivalM: 0 });
    expect(shipped).toBeCloseTo(1959, -2);
    // 371 m between the gentlest autopilot and the most violent one. The
    // deficit is 1,588, so tuning the policy is not a way out of this.
    expect(shipped - lowest).toBeGreaterThan(300);
    expect(shipped - lowest).toBeLessThan(500);
  });

  it("can arrive at sixteen hundred metres over the city and nothing lower", () => {
    const { route, ground } = sea();
    const short = (arrivalM: number) => arrivalShortfallM(route, ground, { ...opts(), arrivalM });
    expect(short(1600)).toBeLessThanOrEqual(0);
    expect(short(1000)).toBeGreaterThan(400);
    expect(short(500)).toBeGreaterThan(900);
  });

  it("leaves no altitude open at all until thirty-one kilometres out", () => {
    const { route, ground } = sea();
    const lengthKm = routeLengthKm(route);
    // Every 250 km of a 2,931 km route: twelve samples, none of them landable.
    const band = approachBand(route, ground, { ...opts(), strideKm: 250 });
    expect(band.length).toBeGreaterThan(10);
    for (const sample of band) {
      expect(sample.ceilingM).toBe(-Infinity);
    }
    // And then it opens, two hundred metres wide, with thirty-one kilometres
    // left to use it in.
    const opensKm = 2_900;
    expect(lengthKm - opensKm).toBeCloseTo(31, 0);
    expect(arrivalCeilingM(route, ground, 2_895, opts())).toBe(-Infinity);
    const at2900 = arrivalCeilingM(route, ground, opensKm, opts());
    expect(at2900).toBeGreaterThan(0);
    expect(at2900 - floor()(opensKm)).toBeGreaterThan(150);
    expect(at2900 - floor()(opensKm)).toBeLessThan(300);
  });

  it("is too high to enter the band by the time the band exists", () => {
    const { route, ground } = sea();
    const ceiling = arrivalCeilingM(route, ground, 2_900, opts());
    const gentle = flyRoute(route, ground, {
      track: true,
      policy: followFloor(floor(), { maxDescent: 0.25, bandM: 200 }),
    });
    const at2900 = gentle.track.find((s) => s.km === 2_900)!;
    expect(at2900.altitudeM).toBeGreaterThan(ceiling + 1_000);
  });

  it("is one ridge, ninety-three kilometres from a city in a hole", () => {
    const { route, ground } = sea();
    const lengthKm = routeLengthKm(route);
    const lhasaM = ground(lengthKm);
    let peakM = 0;
    let peakKm = 0;
    for (let km = Math.floor(lengthKm) - 100; km <= Math.floor(lengthKm); km++) {
      if (ground(km) > peakM) {
        peakM = ground(km);
        peakKm = km;
      }
    }
    expect(peakM).toBeCloseTo(5_223, -2);
    expect(lengthKm - peakKm).toBeCloseTo(93, 0);
    expect(peakM - lhasaM).toBeGreaterThan(1_500);

    // The arithmetic, which is the whole finding in three numbers. The
    // aircraft has to be at the ridge plus its margin; the city is 1,871 m
    // below that; and cruise leaves forty-three seconds to spend at eighteen
    // metres a second, which is seven hundred of them.
    const mustHoldM = peakM + BASE.clearanceM - lhasaM;
    const secondsLeft = ((lengthKm - peakKm) / MODE_GROUND_KM_PER_MIN.cruise) * 60;
    expect(mustHoldM).toBeCloseTo(1_871, -2);
    expect(secondsLeft).toBeCloseTo(43, 0);
    expect(secondsLeft * MAX_DESCENT_MS).toBeLessThan(mustHoldM);
  });
});

describe.skipIf(!hasGround)("and none of the cheap fixes close it", () => {
  it("a slow final leg buys half of it, wherever it is put", () => {
    const { route, ground } = sea();
    const shipped = arrivalShortfallM(route, ground, opts());
    expect(shipped).toBeCloseTo(1_088, -2);
    for (const splitKm of [2_800, 2_850]) {
      const short = arrivalShortfallM(withApproach(route, splitKm), ground, BASE);
      expect(short).toBeGreaterThan(400);
      expect(short).toBeLessThan(700);
    }
  });

  it("slowing the whole route instead buys almost nothing", () => {
    const { route, ground } = sea();
    // Thirty-three extra minutes of trip - 73 km/min is F17's clear-at-cruise
    // number - for a seventh of the deficit. What binds is ninety-three
    // kilometres long, and slowing everything slows those ninety-three too.
    const slow = arrivalShortfallM(route, ground, { ...BASE, pacing: { cruiseKmPerMin: 73 } });
    expect(slow).toBeGreaterThan(850);
    expect(1_088 - slow).toBeLessThan(250);
  });

  it("what does land it is an hour and a quarter", () => {
    const { route, ground } = sea();
    const approach = withApproach(route, 2_850);
    const pacing = { cruiseKmPerMin: 70 };
    const short = arrivalShortfallM(approach, ground, { ...BASE, pacing });
    expect(short).toBeLessThanOrEqual(0);
    const flown = flyRoute(approach, ground, {
      pacing,
      policy: followFloor(
        floorProfile(climbFloor(approach, ground, { ...BASE, pacing })),
        { maxDescent: 0.25, bandM: 200 },
      ),
    });
    expect(flown.clears).toBe(true);
    // The GDD's band is fifteen to thirty-five minutes. This is not in it.
    expect(flown.minutes).toBeGreaterThan(70);
  });
});
