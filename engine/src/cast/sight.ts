/**
 * Where a place in the world shows in the picture at a second of the
 * flight (D93), for the director: the rail flown on auto at its authored
 * speed, through the film's usual view. A viewer who steers or hurries
 * sees otherwise. This is where the film means the viewer to be looking,
 * so a monument timed by it comes up where the flight is looking, and not
 * behind the lens, where the dice alone would put three risings out of four.
 */
import { buildRail, railAtKm, type Scene } from "../film/scene.js";
import { projectAlbers } from "../terrain/worldGrid.js";
import { DEFAULT_VIEW, type View } from "./motion.js";

/** A place seen: across the picture in its own -1..1 (past 1 is off it), and real metres ahead of the lens. */
export interface Seen {
  readonly x: number;
  readonly aheadM: number;
}

/** Where a place shows at a second of the flight; null when it is behind the lens. */
export type Sight = (at: { readonly lat: number; readonly lon: number }, flightS: number) => Seen | null;

/** The scene's sight, or null for a scene with no rail to fly. */
export function sightOf(scene: Pick<Scene, "rail">, view: View = DEFAULT_VIEW): Sight | null {
  if (!scene.rail || scene.rail.length < 2) return null;
  const rail = buildRail(scene.rail);
  // The second each key is reached at the authored speeds.
  const at: number[] = [0];
  for (let k = 0; k + 1 < rail.keys.length; k++) {
    const segKm = (rail.path.cumM[k + 1]! - rail.path.cumM[k]!) / 1000;
    const kmPerMin = rail.keys[k]!.kmPerMin;
    at.push(at[k]! + (kmPerMin > 0 ? (segKm / kmPerMin) * 60 : Infinity));
  }
  const kmAt = (s: number): number => {
    let k = 0;
    while (k + 2 < at.length && s > at[k + 1]!) k++;
    const into = Math.max(0, Math.min(s, at[k + 1] ?? s) - at[k]!);
    return rail.path.cumM[k]! / 1000 + (into / 60) * rail.keys[k]!.kmPerMin;
  };
  const places = new Map<string, { eastM: number; northM: number }>();
  return (place, flightS) => {
    const key = `${place.lat},${place.lon}`;
    let p = places.get(key);
    if (!p) places.set(key, (p = projectAlbers(place.lat, place.lon)));
    const fix = railAtKm(rail, kmAt(flightS));
    const dE = p.eastM - fix.eastM;
    const dN = p.northM - fix.northM;
    const s = Math.sin(fix.headingRad);
    const c = Math.cos(fix.headingRad);
    const aheadM = dE * s + dN * c;
    if (aheadM <= 0) return null;
    return { x: (dE * c - dN * s) / (aheadM * view.tanHalfX), aheadM };
  };
}
