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
import type { Route } from "../engine/src/sim/route.ts";
import type { SpeedMode } from "../engine/src/sim/scale.ts";
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
    route: {
      name: expedition.name,
      legs: metrics.legEndKm.map((endKm, i) => ({
        name: `to ${expedition.route[i + 1]!.name}`,
        endKm,
        mode: expedition.route[i + 1]!.speed as SpeedMode,
      })),
    },
    ground: (km) =>
      profiled.profileM[Math.min(Math.max(0, Math.round(km)), profiled.profileM.length - 1)]!,
  };
}

/** Project an authored route onto a built corridor and cut it into legs. */
export function flyable(expedition: Expedition, corridor: Corridor): FlyableExpedition {
  return flyableFrom(expedition, profileAlong(corridor, projectedWaypoints(expedition)).profileM);
}
