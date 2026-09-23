/**
 * The film's content format: one YAML file per scene, parsed and checked here
 * (design v2, "The scene file"; D76, D81).
 *
 * Runs in Node, in the browser and in tests alike: nothing here reads a
 * file. `tools/film.ts` reads the directory and hands each document in.
 *
 * What is refused, and why:
 * - a rail shorter than a fast viewer can fly in the 114 s of flight, because
 *   the design promises the path never runs out;
 * - more text than the budget, or a line longer than twelve words, because
 *   the whole film says fewer than forty lines;
 * - an hour with no sun at the scene's first key, because the look is lit by
 *   the sun the hour gives it;
 * - a hero grid the world has not built, when the world is there to ask;
 * - a look that names a sky, palette, cloud or grade preset that does not
 *   exist, because the look is the film and a typo there is a dull scene;
 * - a metric figure in the text without its braces (`{1800 m}`), because
 *   the film shows every figure in feet, miles or Fahrenheit as well
 *   (`content/units.ts`), and one left bare would be metric alone.
 */
import {
  buildRail,
  railSecondsAtAuthoredSpeed,
  type Caption,
  type Film,
  type RailKey,
  type Scene,
} from "../engine/src/film/scene.js";
import { DEFAULT_LOOK_AHEAD_KM } from "../engine/src/film/altitude.js";
import { DEFAULT_RAIL } from "../engine/src/film/rail.js";
import { FLIGHT_S } from "../engine/src/film/timeline.js";
import { dayOfYear, sunPosition } from "../engine/src/gfx/solar.js";
import { lookProblems } from "../engine/src/look/presets.js";
import { bareFigures, figuresAsWords, showUnits } from "./units.ts";

/** The whole film says fewer than this many lines. */
export const TEXT_LINE_BUDGET = 40;
export const WORDS_PER_LINE = 12;
export const CAPTIONS_PER_SCENE = 3;
/** Seconds a caption stays on screen; two may not overlap. */
export const CAPTION_SHOW_S = 6;
/** The film is nine scenes when it is finished. */
export const SCENES_IN_A_FILM = 9;
/** How far below level the camera looks unless the scene says otherwise. */
export const DEFAULT_PITCH_DEG = 6;
/** The look-ahead a scene may ask for, real km: shorter reads as a wall, longer as a map. */
export const LOOK_AHEAD_RANGE_KM = [0.5, 30] as const;
/** The sun may be this far below the horizon at the scene's first key: civil twilight. */
export const MIN_SUN_ELEVATION_DEG = -6;

/** Where the world is. A key outside this is a typo, not a scene. */
const LAT_RANGE = [15, 55] as const;
const LON_RANGE = [70, 140] as const;

export interface Problem {
  readonly scene: string;
  readonly field: string;
  readonly message: string;
}

/** Words as a reader meets them: a figure shown in both systems is one. */
export function wordCount(text: string): number {
  return figuresAsWords(text).split(/\s+/).filter((w) => w.length > 0).length;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Read one YAML document (already parsed to a plain object) as a scene.
 * Returns the scene when the shape is right, and every problem found either
 * way; a scene with problems is still returned so a report can name them all.
 */
export function sceneFromRaw(raw: unknown, name: string): { scene: Scene | null; problems: Problem[] } {
  const problems: Problem[] = [];
  const add = (field: string, message: string) => problems.push({ scene: name, field, message });
  if (!isRecord(raw)) {
    add("", "not a mapping");
    return { scene: null, problems };
  }

  const id = raw.id;
  if (!isStr(id) || !SLUG.test(id)) add("id", "a slug is required");
  else if (id !== name) add("id", `"${id}" does not match the file name "${name}"`);

  const t = raw.title;
  const title = { zh: "", pinyin: "", en: "" };
  if (!isRecord(t)) add("title", "needs zh, pinyin and en");
  else {
    for (const k of ["zh", "pinyin", "en"] as const) {
      if (isStr(t[k])) title[k] = (t[k] as string).trim();
      else add(`title.${k}`, "required");
    }
    if (title.zh && !/[㐀-鿿]/.test(title.zh)) add("title.zh", "the characters, not a transliteration");
  }

  const rawLine = isStr(raw.line) ? raw.line.trim() : "";
  if (!rawLine) add("line", "the one line under the title is required");
  const bare = (field: string, text: string) => {
    for (const f of bareFigures(text)) add(field, `"${f}": mark it like {1800 m} so it is shown in feet or miles too`);
  };
  bare("line", rawLine);
  const line = showUnits(rawLine);

  let hero: string | null = null;
  if (raw.hero !== undefined && raw.hero !== null) {
    if (isStr(raw.hero) && SLUG.test(raw.hero)) hero = raw.hero;
    else add("hero", "a hero grid id, or absent");
  }

  const month = isNum(raw.month) ? raw.month : NaN;
  if (!(Number.isInteger(month) && month >= 1 && month <= 12)) add("month", "1 to 12");
  const hour = isNum(raw.hour) ? raw.hour : NaN;
  if (!(hour >= 0 && hour < 24)) add("hour", "Beijing time, 0 to 24");

  let pitchDeg = DEFAULT_PITCH_DEG;
  if (raw.pitch_deg !== undefined) {
    if (isNum(raw.pitch_deg) && raw.pitch_deg >= 0 && raw.pitch_deg <= 45) pitchDeg = raw.pitch_deg;
    else add("pitch_deg", "degrees below level, 0 to 45");
  }

  let lookAheadKm = DEFAULT_LOOK_AHEAD_KM;
  if (raw.look_ahead_km !== undefined) {
    if (isNum(raw.look_ahead_km) && raw.look_ahead_km >= LOOK_AHEAD_RANGE_KM[0] && raw.look_ahead_km <= LOOK_AHEAD_RANGE_KM[1])
      lookAheadKm = raw.look_ahead_km;
    else add("look_ahead_km", `real kilometres the altitude reads ahead, ${LOOK_AHEAD_RANGE_KM[0]} to ${LOOK_AHEAD_RANGE_KM[1]}`);
  }

  const rail: RailKey[] = [];
  if (!Array.isArray(raw.rail)) add("rail", "a list of keys is required");
  else
    raw.rail.forEach((k, i) => {
      if (!isRecord(k)) return add(`rail[${i}]`, "not a mapping");
      const lat = k.lat;
      const lon = k.lon;
      const above = k.above_ground_m;
      const speed = k.speed;
      if (!isNum(lat) || lat < LAT_RANGE[0] || lat > LAT_RANGE[1]) add(`rail[${i}].lat`, `${String(lat)} is not in China`);
      if (!isNum(lon) || lon < LON_RANGE[0] || lon > LON_RANGE[1]) add(`rail[${i}].lon`, `${String(lon)} is not in China`);
      if (!isNum(above) || above <= 0 || above > 10_000) add(`rail[${i}].above_ground_m`, "metres above the ground, 0 to 10,000");
      if (!isNum(speed) || speed <= 0) add(`rail[${i}].speed`, "real kilometres of ground a minute, above zero");
      let pitch = pitchDeg;
      if (k.pitch !== undefined) {
        if (isNum(k.pitch) && k.pitch >= 0 && k.pitch <= 45) pitch = k.pitch;
        else add(`rail[${i}].pitch`, "degrees below level, 0 to 45");
      }
      if (isNum(lat) && isNum(lon) && isNum(above) && isNum(speed))
        rail.push({ lat, lon, aboveGroundM: above, kmPerMin: speed, pitchDeg: pitch });
    });

  let band = { minM: 0, maxM: 0 };
  const b = isRecord(raw.band) ? raw.band.above_ground_m : undefined;
  if (Array.isArray(b) && b.length === 2 && isNum(b[0]) && isNum(b[1]) && b[0] >= 0 && b[1] > b[0])
    band = { minM: b[0], maxM: b[1] };
  else add("band.above_ground_m", "[min, max] metres above the ground, min below max");

  const corridorDeg = isNum(raw.corridor_deg) ? raw.corridor_deg : NaN;
  if (!(corridorDeg > 0 && corridorDeg <= 180)) add("corridor_deg", "degrees off the rail's heading, 0 to 180");

  const look = { sky: "default", palette: "default", cloud: "none", grade: "none" };
  if (raw.look !== undefined) {
    if (!isRecord(raw.look)) add("look", "a mapping of sky, palette, cloud and grade");
    else
      for (const k of ["sky", "palette", "cloud", "grade"] as const) {
        if (raw.look[k] === undefined) continue;
        if (isStr(raw.look[k])) look[k] = raw.look[k] as string;
        else add(`look.${k}`, "a name");
      }
  }

  const captions: Caption[] = [];
  if (raw.captions !== undefined) {
    if (!Array.isArray(raw.captions)) add("captions", "a list");
    else
      raw.captions.forEach((c, i) => {
        if (!isRecord(c) || !isNum(c.at) || !isStr(c.text)) return add(`captions[${i}]`, "needs at (seconds) and text");
        bare(`captions[${i}]`, c.text);
        captions.push({ at: c.at, text: showUnits(c.text.trim()) });
      });
  }

  let music: string | null = null;
  if (raw.music !== undefined && raw.music !== null) {
    if (isStr(raw.music)) music = raw.music;
    else add("music", "a cue name, or absent");
  }

  const scene: Scene = {
    id: isStr(id) ? id : name,
    title,
    line,
    hero,
    month,
    hour,
    rail,
    band,
    corridorDeg,
    pitchDeg,
    lookAheadKm,
    look,
    captions,
    music,
  };
  return { scene, problems };
}

export interface ValidateOptions {
  /** Whether a hero grid is built, or undefined when there is no world to ask. */
  readonly heroBuilt?: ((id: string) => boolean) | undefined;
}

/** The rules a single scene is held to. */
export function validateScene(scene: Scene, options: ValidateOptions = {}): Problem[] {
  const problems: Problem[] = [];
  const add = (field: string, message: string) => problems.push({ scene: scene.id, field, message });

  if (wordCount(scene.line) > WORDS_PER_LINE) add("line", `${wordCount(scene.line)} words; the budget is ${WORDS_PER_LINE}`);

  if (scene.rail.length < 2) add("rail", "at least two keys");
  else {
    const rail = buildRail(scene.rail);
    const seconds = railSecondsAtAuthoredSpeed(rail);
    const needed = FLIGHT_S * DEFAULT_RAIL.speedMax;
    if (seconds < needed)
      add(
        "rail",
        `${seconds.toFixed(0)} s at the authored speed; a viewer at ${DEFAULT_RAIL.speedMax}x needs ${needed} s, ` +
          `so the rail wants ${(rail.path.lengthKm * (needed / seconds) - rail.path.lengthKm).toFixed(0)} km more`,
      );
    scene.rail.forEach((k, i) => {
      if (k.aboveGroundM < scene.band.minM || k.aboveGroundM > scene.band.maxM)
        add(`rail[${i}].above_ground_m`, `${k.aboveGroundM} is outside the band ${scene.band.minM}–${scene.band.maxM}`);
    });
  }

  if (scene.captions.length > CAPTIONS_PER_SCENE) add("captions", `${scene.captions.length}; the budget is ${CAPTIONS_PER_SCENE}`);
  const sorted = [...scene.captions].sort((a, b) => a.at - b.at);
  sorted.forEach((c, i) => {
    const words = wordCount(c.text);
    if (words > WORDS_PER_LINE) add(`captions[${i}]`, `${words} words; the budget is ${WORDS_PER_LINE}`);
    if (c.at < 0 || c.at > FLIGHT_S - CAPTION_SHOW_S) add(`captions[${i}].at`, `${c.at} s is outside the flight's 0–${FLIGHT_S - CAPTION_SHOW_S}`);
    const next = sorted[i + 1];
    if (next && next.at < c.at + CAPTION_SHOW_S) add(`captions[${i + 1}].at`, `overlaps the caption before it; ${CAPTION_SHOW_S} s apart at least`);
  });

  const first = scene.rail[0];
  if (first && Number.isInteger(scene.month) && scene.hour >= 0 && scene.hour < 24) {
    const sun = sunPosition(scene.hour * 60, first.lat, first.lon, dayOfYear(scene.month));
    if (sun.elevationDeg < MIN_SUN_ELEVATION_DEG)
      add("hour", `the sun is ${sun.elevationDeg.toFixed(0)}° below the horizon at the first key in month ${scene.month}`);
  }

  if (scene.hero && options.heroBuilt && !options.heroBuilt(scene.hero))
    add("hero", `"${scene.hero}" is not a built hero grid`);

  for (const p of lookProblems(scene.look)) add(`look.${p.field}`, p.message);

  return problems;
}

export interface FilmOptions extends ValidateOptions {
  /** Hold the film to its finished shape: nine scenes. */
  readonly complete?: boolean | undefined;
}

/** Every line the film says, in order. */
export function textLines(film: Film): string[] {
  return film.scenes.flatMap((s) => [s.line, ...s.captions.map((c) => c.text)]);
}

export function validateFilm(film: Film, options: FilmOptions = {}): Problem[] {
  const problems = film.scenes.flatMap((s) => validateScene(s, options));
  const seen = new Set<string>();
  for (const s of film.scenes) {
    if (seen.has(s.id)) problems.push({ scene: s.id, field: "id", message: "two scenes share it" });
    seen.add(s.id);
  }
  const lines = textLines(film).length;
  if (lines >= TEXT_LINE_BUDGET)
    problems.push({ scene: "", field: "text", message: `${lines} lines; the film says fewer than ${TEXT_LINE_BUDGET}` });
  if (options.complete && film.scenes.length !== SCENES_IN_A_FILM)
    problems.push({ scene: "", field: "scenes", message: `${film.scenes.length}; a finished film has ${SCENES_IN_A_FILM}` });
  return problems;
}
