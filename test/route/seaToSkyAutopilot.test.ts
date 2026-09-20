/**
 * What the autopilot that ships would actually fly. (Finding F20.)
 *
 * D17 replays every route and asserts it clears. F19 pointed out that the
 * replay flies full up-elevator from end to end, which is a proof and not a
 * flight, so the guarantee is about a policy the game will never use. This
 * suite flies the policy the game *would* use - track the floor, which is the
 * lowest the aircraft may ever be - and asks what changes.
 *
 * Almost nothing changes, and that is the finding.
 *
 * Runs everywhere: the ground under this route is committed beside it
 * (D21), so the findings below are checked on every commit rather than
 * only on a machine with the rasters.
 */
import { describe, expect, it } from "vitest";
import { hasGround, sea } from "./fixture.ts";
import {
  altitudeFloorM,
  climbFloor,
  floorProfile,
  followFloor,
  flyRoute,
  longestHoldS,
  routeLengthKm,
  type ClimbPolicy,
  type GroundProfile,
} from "../../engine/src/sim/route.js";
import { MAX_DESCENT_MS } from "../../engine/src/sim/aircraft.js";

const floors = new Map<number, GroundProfile>();
/**
 * Memoised, and deliberately coarse: every sample is a dozen bisected
 * flights, and a floor read by an autopilot with a 200 m capture band does
 * not need to be known to the metre.
 */
function floorFor(clearanceM: number): GroundProfile {
  let floor = floors.get(clearanceM);
  if (floor === undefined) {
    floor = floorProfile(
      climbFloor(sea().route, sea().ground, {
        strideKm: 100,
        toleranceM: 5,
        clearanceM,
      }),
    );
    floors.set(clearanceM, floor);
  }
  return floor;
}
const autopilot = (clearanceM: number): ClimbPolicy => followFloor(floorFor(clearanceM));

describe.skipIf(!hasGround)("Sea to Sky, flown by an autopilot", () => {
  it("keeps very nearly the clearance the floor was built with", () => {
    // 300 asked for, 271 delivered. Twelve metres of that is the controller
    // lagging a rising target and seventeen is the 100 km stride chording
    // under a concave curve. Both are one-signed and small, and neither is
    // to be taken on argument: what a floor delivers is what the replay says
    // it delivers.
    const flight = flyRoute(sea().route, sea().ground, { policy: autopilot(300) });
    expect(flight.clears).toBe(true);
    expect(flight.worstClearanceM).toBeGreaterThan(260);
    expect(flight.worstClearanceM).toBeLessThan(300);
  });

  it("turns one metre of authored clearance into one second of player", () => {
    // The D18 dial, and it is very nearly linear because what burns the
    // margin is the climb forgone, which at plateau altitude is about a
    // metre a second.
    const budget = (clearanceM: number) =>
      longestHoldS(sea().route, sea().ground, 0, {
        probeS: 60,
        policy: autopilot(clearanceM),
      });
    expect(budget(150)).toBeCloseTo(143, -2);
    expect(budget(300)).toBeCloseTo(311, -2);
  });

  it("is the same flight as the proof, to within a hundred metres", () => {
    // This is the finding. The highest trajectory the aircraft has and the
    // lowest one that is safe are the same line for 2,700 km: there is no
    // altitude plan to make, because the route does not offer a choice.
    const { route, ground } = sea();
    const following = flyRoute(route, ground, { policy: autopilot(300), track: true });
    const full = flyRoute(route, ground, { track: true });
    const altAt = (f: typeof full, km: number) =>
      f.track.find((s) => s.km === km)!.altitudeM;

    for (const km of [800, 1427, 1692, 2000, 2366]) {
      expect(Math.abs(altAt(full, km) - altAt(following, km))).toBeLessThan(100);
    }
    expect(following.minutes).toBeCloseTo(full.minutes, 0);
  });

  it("is four kilometres above the Hubei plain and cannot be lower", () => {
    // Not the autopilot's doing and not fixable by it: the floor is 3,588 m
    // there. For the eastern 1,700 km of Expedition 1 the player is too high
    // to see anything, and no policy changes that.
    const flight = flyRoute(sea().route, sea().ground, {
      policy: autopilot(300),
      track: true,
    });
    const overHubei = flight.track.find((s) => s.km === 800)!;
    expect(overHubei.clearanceM).toBeGreaterThan(4000);
    expect(sea().ground(800)).toBeLessThan(100);
  });

  it("buys that altitude with trip time, which is the same knob twice", () => {
    // Slow the whole route down and the floor drops, because a climb that has
    // longer to happen can start later. At the terrain-limited 73 km/min of
    // F17 the floor over Hubei is the ground itself - the aircraft is free to
    // fly at any height - and the expedition takes sixty-nine minutes.
    const { route, ground } = sea();
    const at = (cruiseKmPerMin: number) =>
      altitudeFloorM(route, ground, 800, { pacing: { cruiseKmPerMin } });

    expect(at(130)).toBeCloseTo(3588, -2);
    expect(at(100)).toBeCloseTo(2354, -2);
    expect(at(73)).toBeLessThan(100); // the ground, and no constraint at all
  });

  it("cannot descend into Lhasa, whatever it does", () => {
    // The plateau falls 1,350 m in the last hundred kilometres and the last
    // leg is authored at cruise, which crosses them in well under a minute.
    // Arriving over the city needs 30 m/s of descent; the aircraft has 18 at
    // full forward stick, and a descent at full forward stick is not an
    // arrival. This is a route problem - a fifth waypoint - not a policy one.
    const { ground, route } = sea();
    const lhasaM = ground(Math.floor(routeLengthKm(route)));
    expect(ground(2800) - ground(2900)).toBeGreaterThan(1300);

    const flight = flyRoute(route, ground, { policy: autopilot(300) });
    expect(flight.arrivalAltitudeM - lhasaM).toBeGreaterThan(1800);

    const dropM = flight.peakAltitudeM - (lhasaM + 300);
    const secondsAvailable = (100 / (130 * 1.25)) * 60; // 100 km at plateau cruise
    expect(dropM / secondsAvailable).toBeGreaterThan(MAX_DESCENT_MS);
  });
});
