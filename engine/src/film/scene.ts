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
  /** How far below level the camera looks here, degrees; the scene's unless the key says. */
  readonly pitchDeg: number;
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

/**
 * One figure of the cast in a scene's sky (D91): what appears, where it is
 * held, and for which seconds of the flight. A monument is anchored in the
 * world at a place and a height over the ground; a companion rides in the
 * camera's own frame, so many metres ahead, to the right and up. Sizes and
 * offsets are real metres, converted by the world's scale where they are
 * used, so a cue reads the way a rail key does.
 */
export interface CastCue {
  /** A registered figure kind (`engine/src/cast/kinds.ts`). */
  readonly figure: string;
  /** A variant the builder understands, or null for its default. */
  readonly variant: string | null;
  readonly role: "monument" | "companion";
  /** Where a monument stands. */
  readonly at: { readonly lat: number; readonly lon: number; readonly aboveGroundM: number } | null;
  /** Where a companion rides, in the camera's frame. */
  readonly offset: { readonly aheadM: number; readonly rightM: number; readonly upM: number } | null;
  /** The figure's longest extent, real metres. */
  readonly sizeM: number;
  /**
   * Which way the figure faces, degrees: a companion's from the way the
   * camera flies (90 its right, 180 the camera), a monument's a bearing
   * (0 north, 90 east). The doll is built facing the way it is turned.
   */
  readonly facingDeg: number;
  /** Seconds into the flight it is in play. */
  readonly fromS: number;
  readonly untilS: number;
  /** The layer's own line for the figure, or null: the cast's register, not the film's count. */
  readonly line: string | null;
  /** The figure's name in characters, over the line, or null. */
  readonly nameZh: string | null;
  /** Seconds into the flight the line shows: the cue's `fromS` unless it says. */
  readonly lineAtS: number;
  /**
   * The ways it may move (D92), named in `engine/src/cast/moves.ts`; null
   * for its figure's own temperament. The director draws each visit's from
   * these, so a viewing never knows where it will come from.
   */
  readonly motions: readonly string[] | null;
  /** How often it is cast at all, 0 to 1: under 1, some viewings never see it. */
  readonly chance: number;
  /**
   * The pictures of it this scene draws it in by turns (F139): views of its
   * painting (`engine/src/cast/poses.ts`), the one it goes in and, in
   * `paused`, the ones it takes when it stops; absent, or for a figure made
   * in code, it is drawn as its variant alone.
   */
  readonly poses?: readonly string[] | null;
  readonly paused?: readonly string[] | null;
}

/** Seconds a line of the cast stays, as a caption does. */
export const CAST_LINE_SHOW_S = 6;

/** The cue whose line is on at this second of the flight, or null. */
export function castLineAt(scene: Pick<Scene, "cast">, flightS: number): CastCue | null {
  for (const c of scene.cast) if (c.line && flightS >= c.lineAtS && flightS < c.lineAtS + CAST_LINE_SHOW_S) return c;
  return null;
}

export interface Scene {
  readonly id: string;
  readonly title: SceneTitle;
  /**
   * The scene's sky in the Huainanzi's nine fields of heaven (D91): a
   * name in characters, pinyin and English, on the card when the cast is
   * on, or null for a scene that has not taken one.
   */
  readonly heaven: SceneTitle | null;
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
  /**
   * How far below level the camera looks, degrees. Six is the film's
   * default; a slot canyon flown from its rim wants more, since at six
   * times relief the river is under the frame's bottom edge otherwise.
   */
  readonly pitchDeg: number;
  /**
   * How far ahead along the heading the altitude controller reads the
   * ground, real km. Eight is the film's default; a massif of spires wants
   * one or two, so the camera flies among its peaks rather than over the
   * highest of them (F81).
   */
  readonly lookAheadKm: number;
  /**
   * How near the camera may come to ground as high as it, real metres:
   * the altitude reads the ground round it out to this, as it reads the
   * ground ahead (F143). Nought, the film's, reads the heading line only,
   * so a gorge's walls stand beside the camera; a scene flown among spires
   * names one, or the horizontal compression draws a face it passes as the
   * camera flying into it.
   */
  readonly clearM: number;
  /**
   * The relief's apparent exaggeration, `A` (`sim/scale.ts`): six, the
   * film's, unless the scene says otherwise. Six was measured on the 1 km
   * country grid, whose samples flatten real slopes (F14). Ground seen on a
   * finer grid shows its slopes as they are, and six times Everest's is a
   * field of needles, so a scene flown mostly over it may ask for less (F97).
   */
  readonly exaggeration: number;
  readonly look: SceneLook;
  readonly captions: readonly Caption[];
  readonly music: string | null;
  /** The figures in this scene's sky when the viewer has the cast on; empty for none (D91). */
  readonly cast: readonly CastCue[];
  /**
   * When each monument's place is behind the ground, seen from the camera
   * flown at the rail's authored speed (F133): spans of flight seconds, by
   * the place (`placeKey` in `cast/sight.ts`). Worked out from the built
   * world by `tools/sightlines.ts` into `content/scenes/sightlines.json`;
   * absent where it has not been.
   */
  readonly behind?: Readonly<Record<string, readonly (readonly [number, number])[]>>;
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
  readonly pitchDeg: number;
}

export interface BuiltRail {
  readonly path: RoutePath;
  readonly keys: readonly RailPoint[];
}

export function buildRail(keys: readonly RailKey[]): BuiltRail {
  const points: RailPoint[] = keys.map((k) => {
    const p = projectAlbers(k.lat, k.lon);
    return { eastM: p.eastM, northM: p.northM, aboveGroundM: k.aboveGroundM, kmPerMin: k.kmPerMin, pitchDeg: k.pitchDeg };
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
  /** Interpolated between the keys either side. */
  readonly pitchDeg: number;
}

/**
 * Seconds of flight at the authored speed that a key's corner is turned
 * through, half before the key and half after. The rail is straight lines
 * between its keys, and a heading taken from the line it is on turned the
 * camera through a whole corner in one frame: 74 degrees over Huangshan's
 * cloud sea, 104 into Tiger Leaping Gorge.
 */
export const TURN_S = 5;

/** Where the rail is `seconds` of authored flight on from `km`, or back when negative; held to its ends. */
function kmAfter(rail: BuiltRail, km: number, seconds: number): number {
  const { cumM } = rail.path;
  const last = cumM.length - 1;
  if (last < 1) return 0;
  let m = Math.max(0, Math.min(km * 1000, cumM[last]!));
  let i = 0;
  while (i + 1 < last && m > cumM[i + 1]!) i++;
  let left = Math.abs(seconds);
  while (left > 0) {
    const ms = ((rail.keys[i]?.kmPerMin ?? 0) * 1000) / 60;
    if (ms <= 0) break;
    const room = seconds > 0 ? cumM[i + 1]! - m : m - cumM[i]!;
    const go = Math.min(room, left * ms);
    m += seconds > 0 ? go : -go;
    left -= go / ms;
    if (left <= 1e-9) break;
    if (seconds > 0 ? i + 1 >= last : i <= 0) break;
    i += seconds > 0 ? 1 : -1;
  }
  return m / 1000;
}

export function railAtKm(rail: BuiltRail, km: number): RailFix {
  const at = pointAtKm(rail.path, km);
  const a = rail.keys[at.segment] ?? rail.keys[0]!;
  const b = rail.keys[at.segment + 1] ?? a;
  // The heading is the rail's chord across the turn, from half of it
  // behind to half ahead: the line's own on a straight, and through a
  // corner a turn that begins before the key and ends after it.
  const from = pointAtKm(rail.path, kmAfter(rail, km, -TURN_S / 2));
  const to = pointAtKm(rail.path, kmAfter(rail, km, TURN_S / 2));
  const chord = Math.hypot(to.eastM - from.eastM, to.northM - from.northM) > 1;
  return {
    eastM: at.eastM,
    northM: at.northM,
    headingRad: chord ? Math.atan2(to.eastM - from.eastM, to.northM - from.northM) : at.headingRad,
    aboveGroundM: a.aboveGroundM + at.t * (b.aboveGroundM - a.aboveGroundM),
    kmPerMin: a.kmPerMin,
    pitchDeg: a.pitchDeg + at.t * (b.pitchDeg - a.pitchDeg),
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
