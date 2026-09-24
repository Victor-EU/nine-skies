/**
 * Where a viewer can take the camera in a scene, and so which country tiles
 * the terrain can ask for there (plan v2, stage 4). The scene packs are cut
 * to this, and `test/film/packs.test.ts` flies the rail to hold them to it.
 *
 * The camera stands on the rail at some distance along it, plus a drift to
 * one side of at most `maxOffsetM` (`film/rail.ts`). The distance is at most
 * what the fastest viewer covers: double the authored speed for the whole
 * flight. Rail beyond that is slack no one reaches, and is not packed.
 */
import { DEFAULT_RAIL } from "./rail.js";
import { railAtKm, type BuiltRail } from "./scene.js";
import { FLIGHT_S } from "./timeline.js";
import { tilesInView } from "../terrain/view.js";

export interface ReachOptions {
  /** The fastest the viewer can fly, as a multiple of the authored speed. */
  readonly speedMax: number;
  /** The farthest the drift can carry the camera off the rail, real metres. */
  readonly maxOffsetM: number;
  /** Seconds of flight a scene gives the viewer. */
  readonly flightS: number;
}

export const DEFAULT_REACH: ReachOptions = {
  speedMax: DEFAULT_RAIL.speedMax,
  maxOffsetM: DEFAULT_RAIL.maxOffsetM,
  flightS: FLIGHT_S,
};

/** How far along its rail the fastest viewer gets, real km. */
export function reachKm(rail: BuiltRail, options: ReachOptions = DEFAULT_REACH): number {
  const dt = 0.25;
  let km = 0;
  for (let t = 0; t < options.flightS && km < rail.path.lengthKm; t += dt) {
    km += ((railAtKm(rail, km).kmPerMin * options.speedMax) / 60) * dt;
  }
  return Math.min(km, rail.path.lengthKm);
}

/** A tile's key in a set, and back. */
export const tileKey = (tx: number, ty: number): number => ty * 65_536 + tx;
export const tileOfKey = (key: number): [number, number] => [key % 65_536, Math.floor(key / 65_536)];

/**
 * Every tile the camera can stand in: those a disc of `maxOffsetM` touches,
 * swept along the rail to the reach. Sampled every kilometre, with the
 * sampling step added to the disc so nothing between samples is missed.
 */
export function cameraTiles(rail: BuiltRail, tileM: number, options: ReachOptions = DEFAULT_REACH): Set<number> {
  const out = new Set<number>();
  const far = reachKm(rail, options);
  const r = options.maxOffsetM + 1000;
  for (let km = 0; ; km = Math.min(far, km + 1)) {
    const p = railAtKm(rail, km);
    const x0 = Math.floor((p.eastM - r) / tileM);
    const x1 = Math.floor((p.eastM + r) / tileM);
    const y0 = Math.floor((p.northM - r) / tileM);
    const y1 = Math.floor((p.northM + r) / tileM);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (tx >= 0 && ty >= 0) out.add(tileKey(tx, ty));
    if (km >= far) break;
  }
  return out;
}

/** Every tile the terrain can ask for anywhere the camera can stand. */
export function sceneTiles(rail: BuiltRail, tileM: number, radius: number, options: ReachOptions = DEFAULT_REACH): Set<number> {
  const out = new Set<number>();
  for (const key of cameraTiles(rail, tileM, options)) {
    const [cx, cy] = tileOfKey(key);
    for (const [tx, ty] of tilesInView(cx, cy, radius)) out.add(tileKey(tx, ty));
  }
  return out;
}

/**
 * Every tile whose nearest point lies within `radiusM` of anywhere the
 * camera can stand: the tiles a pool reaching that far can ask for, such
 * as the relief's (F93). Sampled every kilometre, with the step added.
 */
export function nearTiles(rail: BuiltRail, tileM: number, radiusM: number, options: ReachOptions = DEFAULT_REACH): Set<number> {
  const out = new Set<number>();
  const far = reachKm(rail, options);
  const r = options.maxOffsetM + radiusM + 1000;
  for (let km = 0; ; km = Math.min(far, km + 1)) {
    const p = railAtKm(rail, km);
    const x0 = Math.floor((p.eastM - r) / tileM);
    const x1 = Math.floor((p.eastM + r) / tileM);
    const y0 = Math.floor((p.northM - r) / tileM);
    const y1 = Math.floor((p.northM + r) / tileM);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (tx < 0 || ty < 0) continue;
        const dx = Math.max(tx * tileM - p.eastM, 0, p.eastM - (tx + 1) * tileM);
        const dy = Math.max(ty * tileM - p.northM, 0, p.northM - (ty + 1) * tileM);
        if (Math.hypot(dx, dy) <= r) out.add(tileKey(tx, ty));
      }
    }
    if (km >= far) break;
  }
  return out;
}
