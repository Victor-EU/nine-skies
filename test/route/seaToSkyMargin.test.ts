/**
 * How much of Expedition 1 is the player allowed to fly? (Finding F19.)
 *
 * F17 asked whether the route clears the ground and F18 authored the speed
 * profile that makes it. Both flew the same autopilot: full up-elevator from
 * Shanghai to Lhasa, which is the *most favourable* policy and therefore the
 * right one for a clearance proof. It is not a flight. Nobody would take it -
 * it arrives over Lhasa two and a third kilometres in the air, a hundred and
 * eighty-seven metres under the aircraft's own ceiling, having climbed
 * without pause for thirty-five minutes.
 *
 * So this suite asks the question the clearance check cannot: what does the
 * route have left over? The answer is the margin between the altitude the
 * aircraft reaches and the altitude the rest of the route demands - the
 * floor - and it is the same quantity as "how long may the autopilot give the
 * stick back", because a player who is not climbing is spending it.
 *
 * Skips without a built corridor, like its neighbour.
 */
import { describe, expect, it } from "vitest";
import { loadCorridor, type Corridor } from "../../tools/corridor.ts";
import { flyable, loadExpedition, type FlyableExpedition } from "../../tools/expedition.ts";
import {
  altitudeFloorM,
  climbFloor,
  flyRoute,
  handOff,
  longestHoldS,
  routeLengthKm,
} from "../../engine/src/sim/route.js";
import {
  LIGHT_PISTON,
  MAX_DESCENT_MS,
  ceilingM,
  climbRecoveryRatio,
} from "../../engine/src/sim/aircraft.js";

const corridor = loadCorridor("dist-world/sea-to-sky");

let cached: FlyableExpedition | null = null;
/** Lazy for the same reason as the clearance suite: `skipIf` still collects. */
function sea(): FlyableExpedition {
  if (cached === null) {
    cached = flyable(
      loadExpedition("content/expeditions/sea-to-sky.yaml"),
      corridor as Corridor,
    );
  }
  return cached;
}

describe.skipIf(corridor === null)("what Expedition 1 has left over", () => {
  it("arrives over Lhasa in the wrong place entirely", () => {
    const { route, ground } = sea();
    const flight = flyRoute(route, ground);
    const lhasaGroundM = ground(Math.floor(routeLengthKm(route)));

    expect(flight.arrivalAltitudeM).toBeCloseTo(6010, -1);
    expect(lhasaGroundM).toBeCloseTo(3668, -1);
    // Two and a third kilometres above the city the expedition is about.
    expect(flight.arrivalAltitudeM - lhasaGroundM).toBeGreaterThan(2300);
    // And within 200 m of the aircraft's service ceiling - the altitude at
    // which it has half a metre a second of climb left. There is nothing to
    // give: the expedition ends with the aeroplane out of aeroplane.
    expect(ceilingM(LIGHT_PISTON) - flight.arrivalAltitudeM).toBeLessThan(200);
  });

  it("never levels off, because the profile never asks it to", () => {
    const flight = flyRoute(sea().route, sea().ground);
    expect(flight.peakAltitudeM).toBeCloseTo(flight.arrivalAltitudeM, 6);
  });

  it("demands 3.5 km of altitude over ground 32 m above the sea", () => {
    const { ground, route } = sea();
    // Hubei, 800 km inland, wet flat farmland. The floor is binding here and
    // the wall that makes it binding is 1,500 km further on.
    expect(ground(800)).toBeLessThan(100);
    expect(altitudeFloorM(route, ground, 800)).toBeCloseTo(3588, -2);
  });

  it("rises 3,577 m of floor over 800 km of ground that rises 22 m", () => {
    const { ground, route } = sea();
    const start = altitudeFloorM(route, ground, 0);
    const inland = altitudeFloorM(route, ground, 800);
    expect(ground(800) - ground(0)).toBeCloseTo(22, -1);
    expect(inland - start).toBeGreaterThan(3500);
  });

  it("rises without pause for 1,500 km of flat ground", () => {
    const path = climbFloor(sea().route, sea().ground, { strideKm: 100 }).filter(
      (p) => p.km >= 200 && p.km <= 1700,
    );
    for (let i = 1; i < path.length; i++) {
      expect(path[i]!.floorM).toBeGreaterThan(path[i - 1]!.floorM);
    }
    // And the ground under all of it stays in hill country while the floor
    // climbs past five kilometres. Nothing the player can see is doing this.
    expect(Math.max(...path.map((p) => p.groundM))).toBeLessThan(2000);
    expect(path[path.length - 1]!.floorM).toBeGreaterThan(5000);
  });

  it("is furthest from the ground over the Yangtze, not over the mountains", () => {
    // The floor is not a terrain-following curve. Where it stands highest
    // above the land is the middle of the eastern plain - 4.8 km of altitude
    // demanded over 300 m of riverside - because that is the last place the
    // climb can still be bought. At the wall it sits on the ground, which is
    // what being the binding constraint looks like.
    const path = climbFloor(sea().route, sea().ground, { strideKm: 100 });
    const widest = path.reduce((a, b) =>
      b.floorM - b.groundM > a.floorM - a.groundM ? b : a,
    );
    expect(widest.km).toBeGreaterThan(1200);
    expect(widest.km).toBeLessThan(1800);
    expect(widest.groundM).toBeLessThan(500);
    expect(widest.floorM - widest.groundM).toBeGreaterThan(4500);
  });

  it("costs about the same wherever the player takes it", () => {
    // The intuition is that an early hand-off is free and a late one is
    // fatal. It is not: a minute of level flight costs 39 m of final margin
    // leaving Shanghai and 50 m half an hour later. The power lapse does
    // discount an early loss - lower means climbing faster - but by a fifth,
    // not by an order of magnitude. Before the rim this is one budget,
    // spendable anywhere; past it, spending is free.
    const { route, ground } = sea();
    const base = flyRoute(route, ground);
    const cost = (startS: number) =>
      base.worstClearanceM -
      flyRoute(route, ground, { policy: handOff(startS, 60) }).worstClearanceM;

    const leaving = cost(0);
    const halfPast = cost(1800);
    expect(leaving).toBeCloseTo(39, -1);
    expect(halfPast).toBeCloseTo(50, -1);
    expect(halfPast / leaving).toBeLessThan(1.5);
    // And past the rim it costs nothing at all.
    expect(cost(2040)).toBeCloseTo(0, 1);
  });

  it("narrows all the way across the flight, which is backwards", () => {
    // The slack is widest over the delta, where there is nothing to look at,
    // and narrowest at the plateau rim, which is the thing the expedition is
    // for. A sightseeing game wants the opposite shape.
    const { route, ground } = sea();
    const flight = flyRoute(route, ground, { track: true });
    const altAt = new Map(flight.track.map((t) => [t.km, t.altitudeM]));
    const slack = (km: number) => altAt.get(km)! - altitudeFloorM(route, ground, km);

    // Widest 200 km out, over the delta, and narrowing at every hundred
    // kilometres after that without one exception.
    expect(slack(200)).toBeGreaterThan(2000);
    let previous = slack(200);
    for (let km = 300; km <= 2300; km += 100) {
      const here = slack(km);
      expect(here).toBeLessThan(previous);
      previous = here;
    }
    expect(slack(2366)).toBeCloseTo(333, -2);
  });

  it("gives the player six minutes of level flight, once, anywhere", () => {
    const budget = longestHoldS(sea().route, sea().ground, 0, { probeS: 15 });
    expect(budget).toBeGreaterThan(340);
    expect(budget).toBeLessThan(360);
  });

  it("gives eighteen seconds of nose-down, which is the same budget", () => {
    // Not a different limit - the same 333 m, spent at a rate the density
    // lapse sets. One quiet look at the ground costs twenty-three times its
    // own length to undo, so the whole margin of the expedition is a quarter
    // of a minute of the stick forward.
    const budget = longestHoldS(sea().route, sea().ground, -1, { probeS: 5 });
    expect(budget).toBe(18);
    expect(MAX_DESCENT_MS * budget).toBeGreaterThan(300);
  });

  it("puts the moment it cannot afford five kilometres above Chongqing", () => {
    // The tightest hand-off is not at the wall and not at the start: it is
    // the last one that cannot be repaid, and by 26 minutes the aircraft is
    // climbing at under a metre a second. The ground below is 254 m of
    // riverside city and nothing in the view says anything is at stake.
    const { route, ground } = sea();
    const totalS = Math.ceil(flyRoute(route, ground).minutes * 60);
    let tightestS = -1;
    let worstM = Infinity;
    for (let start = 0; start + 352 <= totalS; start += 5) {
      const flight = flyRoute(route, ground, { policy: handOff(start, 352) });
      if (flight.worstClearanceM < worstM) {
        worstM = flight.worstClearanceM;
        tightestS = start;
      }
    }
    expect(tightestS / 60).toBeCloseTo(26.1, 0);
    expect(worstM).toBeLessThan(5);
    // Nothing about Chongqing did this. That start is 352 s before the rim,
    // so it is the last hold still being paid for when the wall arrives.
    expect(tightestS + 352).toBeGreaterThan(1900);
    expect(tightestS + 352).toBeLessThan(1940);
  });

  it("has no forbidden region for a short hand-off, and one for a long one", () => {
    // What a beat author needs, and the only form of this that is usable:
    // two minutes of "you have control" is safe anywhere on the route, and
    // the six-minute version is unsafe for the six minutes before the rim.
    const { route, ground } = sea();
    const totalS = Math.ceil(flyRoute(route, ground).minutes * 60);
    const failingStarts = (durationS: number): number[] => {
      const out: number[] = [];
      for (let start = 0; start + durationS <= totalS; start += 20) {
        if (!flyRoute(route, ground, { policy: handOff(start, durationS) }).clears) {
          out.push(start);
        }
      }
      return out;
    };

    expect(failingStarts(120)).toEqual([]);
    const long = failingStarts(360);
    expect(long.length).toBeGreaterThan(0);
    expect(long[0]! / 60).toBeCloseTo(21, 0);
    expect(long[long.length - 1]! / 60).toBeCloseTo(26.3, 0);
  });

  it("buys freedom with start altitude, and cannot spend it twice", () => {
    // The same line of the authored file the trip-length question turns on.
    // F18 measured a 4,000 m start as ten minutes off the trip; it is also
    // nearly three times the player's freedom, and it is one gain.
    const { route, ground } = sea();
    const low = longestHoldS(route, ground, 0, { probeS: 30, startAltitudeM: 1200 });
    const high = longestHoldS(route, ground, 0, { probeS: 30, startAltitudeM: 4000 });
    expect(low).toBeCloseTo(352, -2);
    expect(high).toBeCloseTo(968, -2);
    expect(high / low).toBeGreaterThan(2.5);
  });

  it("prices that moment out of the density lapse and nothing else", () => {
    // 0.80 m/s of climb against 18 m/s of descent. Neither number knows where
    // it is; the ratio between them is what the plateau feels like.
    expect(climbRecoveryRatio(LIGHT_PISTON, 5868)).toBeCloseTo(23.4, 1);
    expect(climbRecoveryRatio(LIGHT_PISTON, 1200)).toBeCloseTo(4.2, 1);
  });
});
