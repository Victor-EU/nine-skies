/**
 * A scene's cast (D91): the `cast:` block of a scene file, read and held to
 * its rules. Absent, a scene has no cast and the film is as it was.
 *
 * What is refused, and why:
 * - a figure the film cannot build, because a typo would be an empty sky;
 * - a monument without a place, or a companion without an offset, because
 *   the layer would have nowhere to put it;
 * - a companion behind the camera, since nothing there is seen;
 * - a cue outside the flight, or one that ends before it starts;
 * - a size the world's scale would make invisible or absurd;
 * - a facing that is not a number of degrees;
 * - a line over the budget, since the layer's lines are lines.
 */
import type { CastCue } from "../engine/src/film/scene.js";
import { FLIGHT_S } from "../engine/src/film/timeline.js";
import { FIGURE_KINDS, isFigureKind } from "../engine/src/cast/kinds.js";

/** The figure's longest extent, real metres: a crane to a Peng. */
export const SIZE_RANGE_M = [10, 30_000] as const;
const LAT_RANGE = [15, 55] as const;
const LON_RANGE = [70, 140] as const;

type Add = (field: string, message: string) => void;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Read one cue; `add` receives every problem, prefixed by the caller's field. */
export function cueFromRaw(raw: unknown, add: Add): CastCue | null {
  if (!isRecord(raw)) {
    add("", "not a mapping");
    return null;
  }
  let ok = true;
  const fail = (field: string, message: string) => {
    ok = false;
    add(field, message);
  };
  const figure = isStr(raw.figure) ? raw.figure.trim() : "";
  if (!isFigureKind(figure)) fail("figure", `"${figure}" is not a figure; one of ${FIGURE_KINDS.join(", ")}`);
  const variant = isStr(raw.variant) ? raw.variant.trim() : null;
  if (raw.variant !== undefined && variant === null) fail("variant", "a name, or absent");

  const role = raw.role === "monument" || raw.role === "companion" ? raw.role : null;
  if (!role) fail("role", "monument (a place in the world) or companion (rides with the camera)");

  let at: CastCue["at"] = null;
  if (raw.at !== undefined) {
    const a = raw.at;
    if (!isRecord(a) || !isNum(a.lat) || !isNum(a.lon) || !isNum(a.above_ground_m)) fail("at", "needs lat, lon and above_ground_m");
    else {
      if (a.lat < LAT_RANGE[0] || a.lat > LAT_RANGE[1]) fail("at.lat", `${a.lat} is not in China`);
      if (a.lon < LON_RANGE[0] || a.lon > LON_RANGE[1]) fail("at.lon", `${a.lon} is not in China`);
      if (a.above_ground_m < 0 || a.above_ground_m > 20_000) fail("at.above_ground_m", "metres over the ground, 0 to 20,000");
      at = { lat: a.lat, lon: a.lon, aboveGroundM: a.above_ground_m };
    }
  }
  let offset: CastCue["offset"] = null;
  if (raw.offset !== undefined) {
    const o = raw.offset;
    if (!isRecord(o) || !isNum(o.ahead_m) || !isNum(o.right_m) || !isNum(o.up_m)) fail("offset", "needs ahead_m, right_m and up_m");
    else {
      if (o.ahead_m <= 0) fail("offset.ahead_m", "a companion rides ahead of the camera, so above zero");
      offset = { aheadM: o.ahead_m, rightM: o.right_m, upM: o.up_m };
    }
  }
  if (role === "monument" && !at) fail("at", "a monument needs a place");
  if (role === "companion" && !offset) fail("offset", "a companion needs an offset from the camera");

  const sizeM = isNum(raw.size_m) ? raw.size_m : NaN;
  if (!(sizeM >= SIZE_RANGE_M[0] && sizeM <= SIZE_RANGE_M[1])) fail("size_m", `the figure's longest extent, real metres, ${SIZE_RANGE_M[0]} to ${SIZE_RANGE_M[1]}`);

  let facingDeg = 0;
  if (raw.facing_deg !== undefined) {
    if (isNum(raw.facing_deg)) facingDeg = raw.facing_deg;
    else fail("facing_deg", "degrees: a companion's from the way the camera flies, a monument's a bearing");
  }

  const fromS = isNum(raw.from) ? raw.from : 0;
  const untilS = isNum(raw.until) ? raw.until : FLIGHT_S;
  if (raw.from !== undefined && !isNum(raw.from)) fail("from", "seconds into the flight");
  if (raw.until !== undefined && !isNum(raw.until)) fail("until", "seconds into the flight");
  if (fromS < 0 || fromS > FLIGHT_S) fail("from", `${fromS} s is outside the flight's 0–${FLIGHT_S}`);
  if (untilS < 0 || untilS > FLIGHT_S) fail("until", `${untilS} s is outside the flight's 0–${FLIGHT_S}`);
  if (untilS <= fromS) fail("until", "after from");

  let line: string | null = null;
  if (raw.line !== undefined && raw.line !== null) {
    if (isStr(raw.line)) line = raw.line.trim();
    else fail("line", "a line, or absent");
  }
  if (!ok) return null;
  return { figure, variant, role: role!, at, offset, sizeM, facingDeg, fromS, untilS, line };
}

/** Read a scene's `cast:` block: a list of cues, or nothing. */
export function castFromRaw(raw: unknown, add: Add): CastCue[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    add("cast", "a list of cues");
    return [];
  }
  const cues: CastCue[] = [];
  raw.forEach((r, i) => {
    const cue = cueFromRaw(r, (field, message) => add(`cast[${i}]${field ? "." + field : ""}`, message));
    if (cue) cues.push(cue);
  });
  return cues;
}
