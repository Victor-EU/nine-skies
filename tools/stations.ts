/**
 * Where to stand when measuring the frame (build plan, workstream B).
 *
 * The budget table is denominated in milliseconds per pass on a named device,
 * and the only way to fill it in is to put the camera somewhere and ask the
 * GPU what it spent. Which somewhere matters: terrain cost is driven by how
 * many tiles are in view, at what level of detail, and how much of the screen
 * they cover, and all three change by a factor of several between the coast
 * and the plateau. A capture taken at one place is not a frame budget.
 *
 * Two reasons this writes a file instead of choosing stations in the browser:
 *
 *  - **A capture is only worth taking if it can be compared to the last one.**
 *    Stations that move when somebody re-authors a leg make two milestones
 *    incomparable while looking like a clean improvement or regression.
 *  - The places worth standing are properties of the route - its named
 *    waypoints, and the foot and rim of the wall `steepestRise` finds - and
 *    the route lives here, with the projection and the flown altitude.
 *
 * Regenerating is a decision, not a build step. `make stations`.
 */
import { join } from "node:path";
import { measureAlong, pointAtKm } from "./corridor.ts";
import { flyableFrom, loadExpedition, projectedWaypoints } from "./expedition.ts";
import { resolveGround } from "./ground.ts";
import { sectionsDir } from "./routeCheck.ts";
import { profileOf, trackOf } from "./session.ts";
import { steepestRise } from "../engine/src/sim/route.ts";

export const STATIONS_VERSION = 1;

export interface CaptureStation {
  readonly id: string;
  /** Distance along the route, km. */
  readonly km: number;
  readonly eastM: number;
  readonly northM: number;
  /**
   * The altitude the full-climb proof reaches here (F20), not the altitude
   * the shipped autopilot flies. That is deliberate for a frame budget: it is
   * the highest the route ever legitimately gets, so it is the most terrain
   * in view, and a budget measured anywhere lower would flatter itself.
   */
  readonly altitudeM: number;
  /**
   * The heading the route is on here, in the simulation's own convention
   * (`eastM += sin h`, `northM += cos h`). What is in front of the camera is
   * half of what a frame costs, so a station without one is under-specified.
   */
  readonly headingRad: number;
  readonly groundM: number;
  /** Why this station is in the set. */
  readonly why: string;
}

export interface CaptureStations {
  readonly version: number;
  readonly expedition: string;
  readonly lengthKm: number;
  readonly stations: readonly CaptureStation[];
}

export function stationsFor(root: string, expeditionId: string): CaptureStations {
  const contentDir = join(root, "content");
  const expedition = loadExpedition(join(contentDir, "expeditions", `${expeditionId}.yaml`));
  const ground = resolveGround(expedition, join(root, "dist-world"), sectionsDir(contentDir));
  if (!ground.groundM) {
    throw new Error(`${expeditionId}: ${ground.skipReason}`);
  }
  const { route, ground: profile } = flyableFrom(expedition, ground.groundM);
  const track = trackOf(route, profile, expedition.start_altitude_m);
  const waypoints = projectedWaypoints(expedition);
  const metrics = measureAlong(waypoints);
  const wall = steepestRise(profileOf(profile, track.length));

  const altitudeAt = (km: number): number =>
    (track.find((s) => s.km >= km) ?? track[track.length - 1]!).altitudeM;

  const at = (id: string, km: number, why: string): CaptureStation => {
    const p = pointAtKm(waypoints, metrics, km);
    // Bearing along the route, taken a kilometre ahead - or a kilometre
    // behind at the very end, where there is no ahead.
    const ahead = Math.min(km + 1, metrics.lengthKm);
    const behind = Math.max(0, ahead - 1);
    const a = pointAtKm(waypoints, metrics, behind);
    const b = pointAtKm(waypoints, metrics, ahead);
    return {
      id,
      km: Math.round(km * 10) / 10,
      eastM: Math.round(p.eastM),
      northM: Math.round(p.northM),
      altitudeM: Math.round(altitudeAt(km)),
      headingRad: Math.round(Math.atan2(b.eastM - a.eastM, b.northM - a.northM) * 1e6) / 1e6,
      groundM: Math.round(profile(km)),
      why,
    };
  };

  // Leg starts are the named places; the wall is where the terrain is worst.
  const legStartKm = [0, ...metrics.legEndKm];
  const named = expedition.route.map((p, i) =>
    at(String(p.id ?? `waypoint-${i}`), legStartKm[i]!, "a named waypoint on the route"),
  );
  const stations = [
    ...named,
    at("wall-foot", wall.footKm, "the foot of the steepest rise on the route"),
    at("wall-rim", wall.rimKm, "its rim - the most relief in one view"),
  ].sort((a, b) => a.km - b.km);

  return {
    version: STATIONS_VERSION,
    expedition: expeditionId,
    lengthKm: Math.round(metrics.lengthKm * 10) / 10,
    stations,
  };
}
