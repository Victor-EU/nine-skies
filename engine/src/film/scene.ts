/**
 * A scene as the film flies it: the shape `content/scenes.ts` validates and
 * the shell reads from `/film.json`, plus the rail projected onto the grid.
 *
 * Rails are authored in latitude, longitude, height above ground and speed
 * (D83); the projection happens here, at load, with the engine's own
 * `projectAlbers`. Speed is real kilometres of ground per minute, chosen per
 * scene for the picture and unrealistic on purpose (D74).
 */
import { projectAlbers } from "../terrain/worldGrid.js";
import { pathFrom, pointAtKm, type RoutePath } from "./path.js";

export interface SceneTitle {
  readonly zh: string;
  readonly pinyin: string;
  readonly en: string;
}

export interface RailKey {
  readonly lat: number;
  readonly lon: number;
  /** The height the camera wants here, metres above the ground under it. */
  readonly aboveGroundM: number;
  /** Real kilometres of ground per minute, from this key to the next. */
  readonly kmPerMin: number;
}

export interface Caption {
  /** Seconds into the flight (not the scene) it appears. */
  readonly at: number;
  readonly text: string;
}

export interface Band {
  /** The least and most the controller may hold the camera above the ground. */
  readonly minM: number;
  readonly maxM: number;
}

export interface SceneLook {
  readonly sky: string;
  readonly palette: string;
  readonly cloud: string;
  readonly grade: string;
}

export interface Scene {
  readonly id: string;
  readonly title: SceneTitle;
  /** The one line under the title. */
  readonly line: string;
  /** The hero grid to draw over this scene, or null for the country grid alone. */
  readonly hero: string | null;
  readonly month: number;
  /** Beijing time, decimal hours. */
  readonly hour: number;
  readonly rail: readonly RailKey[];
  readonly band: Band;
  /** How far off the rail's heading the viewer may turn, degrees. */
  readonly corridorDeg: number;
  readonly look: SceneLook;
  readonly captions: readonly Caption[];
  readonly music: string | null;
}

export interface Film {
  readonly version: number;
  readonly scenes: readonly Scene[];
}

export const FILM_VERSION = 1;

/** A rail key on the grid. */
export interface RailPoint {
  readonly eastM: number;
  readonly northM: number;
  readonly aboveGroundM: number;
  readonly kmPerMin: number;
}

export interface BuiltRail {
  readonly path: RoutePath;
  readonly keys: readonly RailPoint[];
}

export function buildRail(keys: readonly RailKey[]): BuiltRail {
  const points: RailPoint[] = keys.map((k) => {
    const p = projectAlbers(k.lat, k.lon);
    return { eastM: p.eastM, northM: p.northM, aboveGroundM: k.aboveGroundM, kmPerMin: k.kmPerMin };
  });
  return { path: pathFrom(points), keys: points };
}

export interface RailFix {
  readonly eastM: number;
  readonly northM: number;
  readonly headingRad: number;
  /** Interpolated between the keys either side. */
  readonly aboveGroundM: number;
  /** The speed of the segment this point is on. */
  readonly kmPerMin: number;
}

export function railAtKm(rail: BuiltRail, km: number): RailFix {
  const at = pointAtKm(rail.path, km);
  const a = rail.keys[at.segment] ?? rail.keys[0]!;
  const b = rail.keys[at.segment + 1] ?? a;
  return {
    eastM: at.eastM,
    northM: at.northM,
    headingRad: at.headingRad,
    aboveGroundM: a.aboveGroundM + at.t * (b.aboveGroundM - a.aboveGroundM),
    kmPerMin: a.kmPerMin,
  };
}

/** How long the whole rail takes at its authored speeds, seconds. */
export function railSecondsAtAuthoredSpeed(rail: BuiltRail): number {
  let seconds = 0;
  for (let i = 0; i + 1 < rail.keys.length; i++) {
    const segKm = (rail.path.cumM[i + 1]! - rail.path.cumM[i]!) / 1000;
    const kmPerMin = rail.keys[i]!.kmPerMin;
    if (kmPerMin <= 0) return Infinity;
    seconds += (segKm / kmPerMin) * 60;
  }
  return seconds;
}
