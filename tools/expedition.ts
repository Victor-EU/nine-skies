/**
 * Load an authored expedition and turn it into something flyable.
 *
 * Node-only, like `corridor.ts`: it reads YAML off disk. At phase 2 the
 * runtime will read a bundle the content step builds rather than the source
 * files, but the thing being checked is the same either way - the route as
 * authored, projected into the world the simulation flies in.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { Expedition } from "../content/schema.ts";
import { projectAlbers } from "../engine/src/terrain/worldGrid.ts";
import type { Route, RouteLeg } from "../engine/src/sim/route.ts";
import { DEFAULT_PACING, type SpeedMode } from "../engine/src/sim/scale.ts";
import type { ExpeditionPlan } from "../engine/src/expedition/runner.ts";
import {
  firstUncoveredKm,
  measureAlong,
  profileAlong,
  type Corridor,
  type ProfiledRoute,
  type Waypoint,
} from "./corridor.ts";

export function loadExpedition(path: string): Expedition {
  return parse(readFileSync(path, "utf8")) as Expedition;
}

export function loadExpeditions(dir: string): Expedition[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => loadExpedition(join(dir, f)));
}

export function projectedWaypoints(expedition: Expedition): Waypoint[] {
  return expedition.route.map((p) => projectAlbers(p.lat, p.lon));
}

/**
 * Which built world an expedition can be flown over.
 *
 * Its own corridor first, then the full country, because phase 0 builds one
 * corridor per expedition and phase 2 builds `china` and serves all nine from
 * it. Checked in that order rather than the other way round so that a
 * corridor rebuilt for the route being edited is the one the check reads.
 */
export const CORRIDOR_FALLBACK = "china";

export interface CorridorPick {
  readonly name: string;
  readonly corridor: Corridor;
}

export interface CorridorSearch {
  readonly chosen: CorridorPick | null;
  readonly looked: readonly string[];
  /** Corridors that are built but that this route flies out of, and where. */
  readonly leaves: readonly { name: string; km: number }[];
}

/**
 * Pick a corridor that is built *and* has tiles under the whole route.
 *
 * The coverage half matters more than it looks. A corridor is a strip cut to
 * one expedition, and outside it the reader answers zero, which is the East
 * China Sea. Fly a route off the end of its strip and every check passes with
 * room to spare, which is the one failure mode a gate must not have.
 */
export function corridorFor(expedition: Expedition, open: (n: string) => Corridor | null): CorridorSearch {
  const looked = [expedition.id, CORRIDOR_FALLBACK];
  const waypoints = projectedWaypoints(expedition);
  const leaves: { name: string; km: number }[] = [];
  for (const name of looked) {
    const corridor = open(name);
    if (!corridor) continue;
    const km = firstUncoveredKm(corridor, waypoints);
    if (km < 0) return { chosen: { name, corridor }, looked, leaves };
    leaves.push({ name, km });
  }
  return { chosen: null, looked, leaves };
}

export interface FlyableExpedition {
  readonly expedition: Expedition;
  readonly route: Route;
  readonly profiled: ProfiledRoute;
  readonly ground: (km: number) => number;
}

/**
 * Cut an authored route into legs and hang a ground profile under it.
 *
 * The legs come from the authored waypoints and the current projection every
 * time; only the elevations come from `profiled`. That is what lets a
 * committed section stand in for a built world without the flight changing
 * shape: the section supplies ground, and nothing else.
 */
export function flyableFrom(expedition: Expedition, groundM: readonly number[]): FlyableExpedition {
  const metrics = measureAlong(projectedWaypoints(expedition));
  const profiled: ProfiledRoute = { ...metrics, profileM: [...groundM] };

  return {
    expedition,
    profiled,
    route: { name: expedition.name, legs: legsFor(expedition) },
    ground: (km) =>
      profiled.profileM[Math.min(Math.max(0, Math.round(km)), profiled.profileM.length - 1)]!,
  };
}

/**
 * The legs an authored route is flown in, with no ground involved.
 *
 * Shared by the offline check and the runtime plan on purpose: a bundle that
 * described different legs from the ones the content gate flew would be a
 * guarantee about a different flight (D21's argument, in a smaller place).
 */
export function legsFor(expedition: Expedition): RouteLeg[] {
  const metrics = measureAlong(projectedWaypoints(expedition));
  const legs: RouteLeg[] = metrics.legEndKm.map((endKm, i) => ({
    name: `to ${expedition.route[i + 1]!.name}`,
    endKm,
    mode: expedition.route[i + 1]!.speed as SpeedMode,
  }));

  // An authored approach splits the last leg rather than adding a waypoint.
  // Two reasons, and the second is the one that matters: a waypoint would be
  // a place, and there is no place forty-five kilometres east of Lhasa that
  // this route is about - and a waypoint changes the route's geometry, which
  // invalidates the committed section and its signature (D21, D23) for a
  // change that moves no elevation at all.
  const approachKm = expedition.arrival?.approach_km;
  const last = legs[legs.length - 1];
  if (approachKm !== undefined && last) {
    const legStartKm = legs.length > 1 ? legs[legs.length - 2]!.endKm : 0;
    const from = last.endKm - approachKm;
    if (from > legStartKm) {
      legs.splice(legs.length - 1, 1,
        { ...last, name: `${last.name} (cruise)`, endKm: from },
        { ...last, name: `${last.name} (approach)`, mode: "approach" as SpeedMode },
      );
    }
  }
  return legs;
}

/**
 * An authored expedition in the form the runtime flies it (F38).
 *
 * Waypoints are beats without anyone authoring one: passing Wuhan is an event
 * the route already knows about, and a beat is a kilometre rather than a disc
 * because on a route there is something to measure along. Narration text
 * joins the schema when there is a writer to put it there; what the runner
 * needs is an id and a kilometre, and both are in the file already.
 *
 * The pacing is the one number here that nobody authored: it is the shipped
 * default, which is what the content gate flies and therefore what the
 * route's clearance and arrival have actually been checked at.
 */
export function planFor(expedition: Expedition): ExpeditionPlan {
  const points = projectedWaypoints(expedition);
  const { legEndKm } = measureAlong(points);
  return {
    id: expedition.id,
    name: expedition.name,
    points,
    legs: legsFor(expedition),
    beats: expedition.route.slice(1).map((point, i) => ({
      id: point.id,
      km: +legEndKm[i]!.toFixed(3),
      name: point.name,
    })),
    cruiseKmPerMin: DEFAULT_PACING.cruiseKmPerMin,
    startAltitudeM: expedition.start_altitude_m,
  };
}

/** Project an authored route onto a built corridor and cut it into legs. */
export function flyable(expedition: Expedition, corridor: Corridor): FlyableExpedition {
  return flyableFrom(expedition, profileAlong(corridor, projectedWaypoints(expedition)).profileM);
}
