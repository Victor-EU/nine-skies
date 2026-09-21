/**
 * Every colour the map draws, in one place, with the number that says it can
 * be seen (F45).
 *
 * The map was ten colour literals scattered through its draw calls, which is
 * how it ended up with two faults nobody could see by reading it: a route
 * that fades out as the ground under it rises, and a base ramp of its own
 * invention that disagrees with the ground the aircraft is actually flying
 * over. Both are contrast questions, and a contrast question has an answer -
 * `deltaE` has been in the engine since F36 - so the colours are data here and
 * a test takes that answer.
 *
 * **The threshold is 10 dE**, which `perceptual.ts` gives as "a different
 * colour at a glance", against every elevation the base can be and through
 * every eye `cvd.ts` can simulate. The route failed it at 3.9; nothing else
 * did.
 *
 * **Alpha is composited in sRGB, not in light.** A 2D canvas blends bytes, so
 * a mark drawn at 30 % over the base lands where byte arithmetic puts it and
 * not where the physics would. Measuring in the wrong space here would have
 * reported the route as legible.
 */
import { Color } from "three";
import { elevationRampSrgb } from "../terrain/palette.js";
import type { TileCoverage } from "../terrain/coverage.js";

/** 0-255, the space a canvas composites in. */
export type Rgb = readonly [number, number, number];

/** `fg` at `alpha` over `bg`, the way a 2D canvas does it. */
export function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ];
}

/** An sRGB byte triple as a `three` Color, which holds linear light. */
export function colorOf(rgb: Rgb): Color {
  return new Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, "srgb");
}

export function css(rgb: Rgb, alpha = 1): string {
  const [r, g, b] = rgb.map((v) => Math.round(v));
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Ground the pipeline has published no elevation for.
 *
 * The map used to paint this blue and call it the sea, and the measurement
 * that followed is why the sea colour was taken out of this file (F45).
 * **39.2 % of the frame the map draws was blue, and five cells in six of it
 * were not water.** Three different things were arriving as one colour:
 *
 *   - the East China Sea, which the DEM writes as exactly zero;
 *   - the 15,168 cells outside the built window, which read zero because
 *     nothing was ever written there;
 *   - and 13,888 cells *inside* the window - 70 % of its zeros - which are
 *     the corners of a rectangle drawn around a corridor, where no source
 *     raster was ever fetched.
 *
 * **Two of the three are separated now** (F54): the mirror publishes a
 * one-degree cell only where there is something to publish, so a cell absent
 * from it is open ocean, and `coverage.py` puts one character per tile in the
 * manifest. `SEA` below is that claim and nothing else; this stays the colour
 * for everything the pipeline cannot vouch for, which is still every zero
 * inside a fetched raster.
 *
 * The tone is measured away from all three of the things it can touch:
 * 11.3 dE from the panel behind the map, 39.2 from the lowest land, and
 * further from every stop above that.
 *
 * Land that genuinely reads zero would be painted this too. At the 8 km
 * silhouette reduction the base is drawn from, a block with any land in it
 * takes a high quantile of its samples and comes out above zero, so the case
 * is the shoreline itself rather than anywhere a player flies.
 */
export const NO_DATA: Rgb = [40, 43, 48];

/**
 * Water the source itself says is water.
 *
 * Drawn only where the mirror has no one-degree cell at all, which for GLO-30
 * is open ocean and is the publisher's statement rather than our inference -
 * 45 of this corridor's 1,155 tiles, every one of which the built heightfield
 * agrees has no land in it. It is deliberately not drawn for a zero inside a
 * fetched raster: the ocean and a sea-level field are the same number there,
 * and separating them needs the water mask phase 2's rivers and lakes brings.
 * So the shore this draws is a one-degree shore, and the coastline a player
 * reads is still the edge of the land.
 *
 * Measured like everything else here: it clears 10 dE from `NO_DATA`, from
 * the panel behind the map and from every stop of the land ramp, through all
 * four eyes `cvd.ts` simulates. A blue that a protanope could not tell from
 * the no-data grey would put the fault back where F45 found it.
 */
export const SEA: Rgb = [22, 58, 96];

/**
 * The land, from the shared elevation ramp - lifted toward the map's dark
 * ground so the low stops do not disappear into it.
 *
 * `LAND_LIFT` is the one number here chosen by eye rather than measured, and
 * it is a lightening of the shared ramp rather than a second ramp: the hues
 * and the stops are the terrain's, so the wall on the map and the wall ahead
 * agree about colour as well as about shape. At 0 it is the terrain exactly;
 * the value below keeps the 0 m stop clear of the panel behind it while
 * leaving every step of the ramp where the shader puts it.
 */
export const LAND_LIFT = 0.12;

export function landShade(elevationM: number): Rgb {
  const srgb = elevationRampSrgb(elevationM);
  return srgb.map((c) => Math.round(255 * (c + (1 - c) * LAND_LIFT))) as unknown as Rgb;
}

/**
 * What a cell of the base is painted.
 *
 * Zero is still not an elevation - everything else is land, including
 * everything below sea level, because Ayding Lake is -154 m, has a card
 * written for it and a golden probe pointed at it, and the old base tested
 * `m <= 0` and drew China's lowest exposed land as ocean.
 *
 * What decides between the two readings of zero is the tile's coverage and
 * never the number itself (F54). `ocean` is the one state that licenses blue,
 * and a world with no coverage record gets none: `unrecorded` is not `ocean`
 * and must never be allowed to become it by default.
 *
 * An `ocean` tile that somehow holds an elevation is drawn as land. That is a
 * contradiction between the mirror and the warp rather than a case to handle,
 * and it should be visible if it ever happens instead of being painted over.
 */
export function baseShade(elevationM: number, coverage: TileCoverage = "unrecorded"): Rgb {
  if (elevationM !== 0) return landShade(elevationM);
  return coverage === "ocean" ? SEA : NO_DATA;
}

/**
 * A line on the map: a colour, a width, and - where it matters - a dash.
 *
 * The dash is not decoration. Two of these are amber and a tritanope sees
 * them 2.2 dE apart over high ground, which is below the threshold at which
 * any difference is noticed at all; they stay legible because one of them is
 * dashed. A mark distinguished by colour alone is one eye away from not being
 * distinguished.
 */
export interface MapStroke {
  readonly rgb: Rgb;
  readonly alpha: number;
  readonly widthPx: number;
  readonly dash?: readonly number[];
}

/**
 * The route, drawn as a cased line.
 *
 * A single pale stroke at 30 % was the old route, and its contrast against
 * the base ran from 28.7 dE over the sea to 3.9 dE over 6,000 m - faintest
 * exactly where Expedition 1 ends, at Lhasa's 3,650 m, where it measured 9.8.
 * The fault is structural rather than a bad colour: any translucent mark over
 * a base that changes lightness has a contrast that changes with it.
 *
 * So the route is two strokes, the cartographer's answer: a dark casing wide
 * enough to show at the edges and a near-opaque core on top of it. The core
 * carries the line over dark ground, the casing carries it over pale ground,
 * and the pair is legible on both because they no longer depend on what is
 * underneath.
 */
export const ROUTE_CASING: MapStroke = { rgb: [10, 14, 20], alpha: 0.85, widthPx: 4 };
export const ROUTE_CORE: MapStroke = { rgb: [226, 232, 240], alpha: 0.9, widthPx: 1.6 };

/** Where the aircraft has actually been (D30). Solid, and the brightest line. */
export const TRACK: MapStroke = { rgb: [255, 196, 92], alpha: 0.95, widthPx: 2 };

/** Heihe-Tengchong: the same amber family, kept apart by the dash. */
export const HEIHE_LINE: MapStroke = {
  rgb: [255, 214, 140],
  alpha: 0.55,
  widthPx: 1,
  dash: [6, 5],
};

/** Pins and their labels - found entries only (F40). */
export const PIN: MapStroke = { rgb: [232, 238, 245], alpha: 0.92, widthPx: 1 };
export const PIN_CASING: MapStroke = { rgb: [10, 14, 20], alpha: 0.8, widthPx: 1 };

/** The aircraft itself, which is a shape rather than a line. */
export const AIRCRAFT: MapStroke = { rgb: [255, 255, 255], alpha: 1, widthPx: 1 };

/** The profile panel: ground under the track, and the altitude flown over it. */
export const PROFILE_GROUND: MapStroke = { rgb: [104, 126, 112], alpha: 0.9, widthPx: 1 };
export const PROFILE_ALTITUDE: MapStroke = TRACK;

/**
 * The panel the map sits on, which is what the base contrasts with at the
 * edge. Opaque in the stylesheet, so this is the colour rather than an
 * approximation of it over whatever sky happens to be behind.
 */
export const PANEL: Rgb = [8, 12, 18];

/**
 * Every elevation the base can be, for a legibility sweep.
 *
 * The no-data tone and the sea are both in it, because a mark has to be
 * visible over those too - and two cells in five of this map are one or the
 * other. Adding a ground here is how a new colour gets checked against every
 * mark without anybody remembering to: `SEA` arrived that way (F54).
 */
export function baseSamples(): { label: string; rgb: Rgb }[] {
  const out = [
    { label: "no data", rgb: NO_DATA },
    { label: "sea", rgb: SEA },
  ];
  for (const m of [1, 500, 1000, 2000, 3650, 5000, 6600]) {
    out.push({ label: `${m.toLocaleString()} m`, rgb: landShade(m) });
  }
  return out;
}

/** What the reader actually sees where a stroke meets its ground. */
export function strokeOver(stroke: MapStroke, base: Rgb): Color {
  return colorOf(over(stroke.rgb, stroke.alpha, base));
}
