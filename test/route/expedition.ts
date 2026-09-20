/**
 * Load an authored expedition and turn it into something flyable.
 *
 * Test-only, like `corridorProfile.ts`: it reads YAML off disk. At phase 2
 * the runtime will read a bundle the content step builds rather than the
 * source files, but the thing being checked is the same either way - the
 * route as authored, projected into the world the simulation flies in.
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { Expedition } from "../../content/schema.ts";
import { projectAlbers } from "../../engine/src/terrain/worldGrid.js";
import type { Route } from "../../engine/src/sim/route.js";
import type { SpeedMode } from "../../engine/src/sim/scale.js";
import { profileAlong, type Corridor, type ProfiledRoute, type Waypoint } from "./corridorProfile.js";

export function loadExpedition(path: string): Expedition {
  return parse(readFileSync(path, "utf8")) as Expedition;
}

export interface FlyableExpedition {
  readonly expedition: Expedition;
  readonly route: Route;
  readonly profiled: ProfiledRoute;
  readonly ground: (km: number) => number;
}

/** Project an authored route onto the corridor and cut it into legs. */
export function flyable(expedition: Expedition, corridor: Corridor): FlyableExpedition {
  const waypoints: Waypoint[] = expedition.route.map((p) => projectAlbers(p.lat, p.lon));
  const profiled = profileAlong(corridor, waypoints);
  return {
    expedition,
    profiled,
    route: {
      name: expedition.name,
      legs: profiled.legEndKm.map((endKm, i) => ({
        name: `to ${expedition.route[i + 1]!.name}`,
        endKm,
        mode: expedition.route[i + 1]!.speed as SpeedMode,
      })),
    },
    ground: (km) =>
      profiled.profileM[
        Math.min(Math.max(0, Math.round(km)), profiled.profileM.length - 1)
      ]!,
  };
}
