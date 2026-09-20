/**
 * Is there room to fly this route from here? (D18, and the GDD's own demand
 * that a resume "has to be able to say it cannot".)
 *
 * The altitude floor is the minimum height from which the rest of the route
 * still clears the ground, and it is the same quantity F19 measured as the
 * hand-off budget. Until now it existed only offline, where `climbFloor`
 * computes it by flying the remainder of the route from a trial altitude -
 * about three and a half milliseconds a sample, which is not a thing to do in
 * a frame. So the route ships it (D18), sampled at one kilometre, which is
 * the resolution the route's own ground profile has and therefore the finest
 * one the number can honestly claim.
 *
 * Sampling coarser was measured and rejected: at 5 km the shipped floor reads
 * up to 129 m *below* the true floor over the body of Expedition 1 and 268 m
 * below inside the last hundred kilometres, where the approach taper moves
 * the floor 409 m in a single kilometre (D20). An optimistic floor is the one
 * error this table must not have - it tells a player they can finish when
 * they cannot (F39).
 */
import type { ExpeditionPlan } from "./runner.js";
import { fingerprint, type RunSave } from "../save/profile.js";

export interface AltitudeFloor {
  readonly strideKm: number;
  /** Metres, from km 0. Empty when the route shipped without a floor. */
  readonly m: readonly number[];
}

export const NO_FLOOR: AltitudeFloor = { strideKm: 1, m: [] };

/** The floor at a distance along the route, or null if none was shipped. */
export function floorAtKm(floor: AltitudeFloor, km: number): number | null {
  if (floor.m.length === 0) return null;
  const at = Math.max(0, km / floor.strideKm);
  const i = Math.min(floor.m.length - 1, Math.floor(at));
  const j = Math.min(floor.m.length - 1, i + 1);
  const t = at - i;
  return floor.m[i]! + t * (floor.m[j]! - floor.m[i]!);
}

export interface Room {
  readonly floorM: number;
  /** Metres above the floor. Negative means the route cannot be finished. */
  readonly marginM: number;
  readonly ok: boolean;
}

/** How much room the route still has, from a kilometre and an altitude. */
export function roomAt(
  plan: ExpeditionPlan,
  km: number,
  altitudeM: number,
): Room | null {
  const floorM = floorAtKm(plan.floor, km);
  if (floorM === null) return null;
  const marginM = altitudeM - floorM;
  return { floorM, marginM, ok: marginM >= 0 };
}

/**
 * A name for what a kilometre of this route means.
 *
 * The waypoints and the leg ends, because those are what distance is measured
 * along; the modes and the pacing, because those decide where the aircraft is
 * at a given moment of it. Move any of them and a saved kilometre is a
 * different place.
 */
export function planFingerprint(plan: ExpeditionPlan): string {
  return fingerprint([
    plan.id,
    ...plan.points.flatMap((p) => [p.eastM, p.northM]),
    ...plan.legs.flatMap((l) => [l.endKm, l.mode]),
    plan.cruiseKmPerMin,
  ]);
}

export type Resume =
  /** Nothing saved for this route, or nothing usable. */
  | { readonly kind: "start" }
  /**
   * The route has changed since this was saved. The kilometre is dropped,
   * because it measures along waypoints that have moved; the beats are kept,
   * because they are places the player was genuinely told about.
   */
  | { readonly kind: "moved"; readonly beats: readonly string[] }
  | {
      readonly kind: "resume";
      readonly km: number;
      readonly beats: readonly string[];
      readonly arrived: boolean;
    };

/** What a saved run is still worth against the route as it now stands. */
export function resumeRun(
  plan: ExpeditionPlan,
  run: RunSave | null,
  planFingerprint: string,
): Resume {
  if (!run || run.expeditionId !== plan.id) return { kind: "start" };
  if (run.fingerprint !== planFingerprint) return { kind: "moved", beats: run.beats };
  return { kind: "resume", km: run.km, beats: run.beats, arrived: run.arrived };
}
