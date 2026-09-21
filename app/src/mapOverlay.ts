/**
 * The map overlay, drawn on a 2D canvas over the world (F42).
 *
 * Every colour it uses now comes from `engine/src/map/palette.ts` and is
 * checked there against a contrast threshold rather than picked here (F45).
 * Three of them were wrong in ways reading the code could not show: the route
 * faded from 28.7 dE over the sea to 3.9 over high ground, the base invented a
 * second elevation ramp that disagreed with the terrain the aircraft was
 * flying over, and zero-elevation cells were painted as ocean - which is the
 * sea near Shanghai, China's lowest exposed land at Ayding, and every cell
 * the pipeline has not published, all as one blue. Five in six of this map's
 * blue cells were not water.
 *
 * Deliberately small. Everything it draws is already in world metres and
 * already loaded, so this is a transform, six passes and no new data:
 *
 *   - the **base** is the horizon field, the 8 km country reduction the
 *     impostor already reads (D15). Its own comment asks for this: *"having
 *     the map and the horizon read the same array is the point: the wall you
 *     fly towards and the wall drawn on the map cannot disagree."*
 *   - the **route** is the plan's projected waypoints, the ones the content
 *     gate flew;
 *   - the **pins** are the card catchments, and only the ones the atlas says
 *     have been found - a pin for a card nobody has met would be the exact
 *     pin the GDD refuses to give (*"never an exact pin"*, F40);
 *   - the **track** is where the aircraft has actually been, with the pen
 *     lifted across teleports (D30);
 *   - the **line** is Heihe-Tengchong, off by default;
 *   - the **profile** is the last 200 km of ground under the track, on a
 *     fixed vertical scale.
 *
 * What the base cannot do yet is be a country: the corridor fills 11.6 % of
 * the country grid, so most of this map is empty until phase 2 builds the
 * rest. That was called a data gap and not a drawing one, and half of it was
 * a drawing one: the gap was being drawn, as an ocean. It is drawn as a gap
 * now.
 */
import type { HorizonField } from "../../engine/src/terrain/horizonField.js";
import { MapView, HEIHE_TENGCHONG, type MapBounds } from "../../engine/src/map/view.js";
import { bandOf, type FlownTrack } from "../../engine/src/map/track.js";
import { projectAlbers } from "../../engine/src/terrain/worldGrid.js";
import {
  AIRCRAFT,
  HEIHE_LINE,
  PIN,
  PIN_CASING,
  PROFILE_ALTITUDE,
  PROFILE_GROUND,
  ROUTE_CASING,
  ROUTE_CORE,
  TRACK,
  baseShade,
  css,
  type MapStroke,
} from "../../engine/src/map/palette.js";
import {
  formatAltitude,
  formatDistance,
  scaleBar,
  type UnitSystem,
} from "../../engine/src/hud/units.js";

export interface MapPin {
  readonly eastM: number;
  readonly northM: number;
  readonly radiusM: number;
  readonly name: string;
}

export interface MapScene {
  readonly bounds: MapBounds;
  readonly route: readonly { eastM: number; northM: number }[];
  readonly pins: readonly MapPin[];
  readonly track: FlownTrack;
  readonly aircraft: { eastM: number; northM: number; headingRad: number };
  readonly showLine: boolean;
  /**
   * One line across the top of the panel. The GDD puts the local solar time
   * here rather than on the HUD - "the map overlay adds local solar time
   * beside it so the Kashgar surprise can be understood on the spot" - and
   * the map is where a player can see the longitude that causes it (F47).
   * Empty draws nothing.
   */
  readonly caption: string;
}

/**
 * The vertical scale the profile is drawn at, metres.
 *
 * Fixed rather than fitted, and F42 is why: the relief inside a 200 km window
 * of Expedition 1 runs from 57 m over the eastern plain to 4,464 m through
 * the Hengduan, seventy-eight times. An axis fitted to the window would draw
 * the plain's 57 m at full height and make farmland look like the Hengduan -
 * F14's mistake, on a different instrument. 6,000 m covers the aircraft's
 * ceiling and every metre of ground this world has under a route.
 */
export const PROFILE_CEILING_M = 6000;

/** Set a stroke from the palette, dash included. */
function useStroke(ctx: CanvasRenderingContext2D, s: MapStroke): void {
  ctx.strokeStyle = css(s.rgb, s.alpha);
  ctx.lineWidth = s.widthPx;
  ctx.setLineDash(s.dash ? [...s.dash] : []);
}

/** Trace a polyline in world metres. The caller decides how to paint it. */
function tracePath(
  ctx: CanvasRenderingContext2D,
  view: MapView,
  points: readonly { eastM: number; northM: number }[],
): void {
  ctx.beginPath();
  points.forEach((w, i) => {
    const p = view.project(w.eastM, w.northM);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
}

/**
 * The base layer, painted once.
 *
 * It was painted every frame first, one `fillRect` per 8 km cell, and cost
 * **36.7 ms** - a whole frame budget of 33.3, for a picture that does not
 * change. 89,088 cells over the corridor window.
 *
 * So the field is rasterised at its own resolution - one pixel per cell,
 * 336 x 264 for this window - into an offscreen canvas, and the frame blits
 * it with a single scaled `drawImage`. Rebuilt only when the widget or the
 * bounds change, which is on open and on resize (F42).
 */
export class MapBase {
  private readonly canvas: HTMLCanvasElement;
  private key = "";

  constructor() {
    this.canvas = document.createElement("canvas");
  }

  /** The offscreen picture for these bounds, built if it is not current. */
  imageFor(field: HorizonField, bounds: MapBounds): HTMLCanvasElement {
    const cell = field.sampleKm * 1000;
    const w = Math.max(1, Math.round((bounds.eastM1 - bounds.eastM0) / cell));
    const h = Math.max(1, Math.round((bounds.northM1 - bounds.northM0) / cell));
    const key = `${w}x${h}@${bounds.eastM0},${bounds.northM0}`;
    if (key === this.key) return this.canvas;

    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.canvas.getContext("2d")!;
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      // North is up on screen and northing grows upward, so the rows flip.
      const northM = bounds.northM0 + (h - 1 - y) * cell;
      for (let x = 0; x < w; x++) {
        const [r, g, b] = baseShade(field.sampleM(bounds.eastM0 + x * cell, northM));
        const i = (y * w + x) * 4;
        image.data[i] = Math.round(r);
        image.data[i + 1] = Math.round(g);
        image.data[i + 2] = Math.round(b);
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    this.key = key;
    return this.canvas;
  }
}

/**
 * What the reader has chosen, as the map needs it: their units, and how big
 * their text is. Both are comfort settings, and both have to reach a canvas -
 * the HUD's own `--hud-scale` moves the DOM and stops at the canvas edge.
 */
export interface MapStyle {
  readonly units: UnitSystem;
  readonly labelPx: number;
}

export const DEFAULT_MAP_STYLE: MapStyle = { units: "metric", labelPx: 10 };

export function drawMap(
  ctx: CanvasRenderingContext2D,
  field: HorizonField,
  base: MapBase,
  scene: MapScene,
  style: MapStyle = DEFAULT_MAP_STYLE,
): void {
  const { units, labelPx } = style;
  const { canvas } = ctx;
  const view = new MapView(scene.bounds, canvas.width, canvas.height, 12);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Base: one scaled blit of a picture that does not change.
  const topLeft = view.project(scene.bounds.eastM0, scene.bounds.northM1);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    base.imageFor(field, scene.bounds),
    topLeft.x,
    topLeft.y,
    (scene.bounds.eastM1 - scene.bounds.eastM0) * view.scale,
    (scene.bounds.northM1 - scene.bounds.northM0) * view.scale,
  );

  if (scene.showLine) {
    const a = projectAlbers(HEIHE_TENGCHONG.north.latDeg, HEIHE_TENGCHONG.north.lonDeg);
    const b = projectAlbers(HEIHE_TENGCHONG.south.latDeg, HEIHE_TENGCHONG.south.lonDeg);
    useStroke(ctx, HEIHE_LINE);
    tracePath(ctx, view, [a, b]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Route, cased: a dark stroke carries it over pale ground and a light one
  // over dark, so its contrast no longer depends on the elevation underneath.
  if (scene.route.length > 1) {
    tracePath(ctx, view, scene.route);
    useStroke(ctx, ROUTE_CASING);
    ctx.stroke();
    useStroke(ctx, ROUTE_CORE);
    ctx.stroke();
  }

  // Track, pen up across teleports.
  const points = scene.track.recent();
  useStroke(ctx, TRACK);
  ctx.beginPath();
  let down = false;
  for (const t of points) {
    const p = view.project(t.eastM, t.northM);
    if (!t.joined || !down) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
    down = true;
  }
  ctx.stroke();

  // Pins - found entries only, and cased for the same reason the route is.
  // A pale pin on snow is 2.7 dE, which is inside the range where no reader
  // sees a difference at all.
  ctx.font = `${labelPx}px ui-monospace, monospace`;
  ctx.lineJoin = "round";
  for (const pin of scene.pins) {
    const p = view.project(pin.eastM, pin.northM);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = css(PIN.rgb, PIN.alpha);
    ctx.strokeStyle = css(PIN_CASING.rgb, PIN_CASING.alpha);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeText(pin.name, p.x + 6, p.y + 3);
    ctx.fillText(pin.name, p.x + 6, p.y + 3);
  }

  // The aircraft, pointing where it is going.
  const a = view.project(scene.aircraft.eastM, scene.aircraft.northM);
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(-scene.aircraft.headingRad);
  ctx.fillStyle = css(AIRCRAFT.rgb, AIRCRAFT.alpha);
  ctx.strokeStyle = css(PIN_CASING.rgb, PIN_CASING.alpha);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4, 5);
  ctx.lineTo(0, 2);
  ctx.lineTo(-4, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Scale bar, from the view's own metres per pixel.
  const bar = scaleBar(view.kmPerPx, canvas.width, units);
  const barPx = bar.km / view.kmPerPx;
  useStroke(ctx, PIN);
  ctx.beginPath();
  ctx.moveTo(16, canvas.height - 16);
  ctx.lineTo(16 + barPx, canvas.height - 16);
  ctx.lineWidth = 3;
  ctx.strokeStyle = css(PIN_CASING.rgb, PIN_CASING.alpha);
  ctx.stroke();
  useStroke(ctx, PIN);
  ctx.stroke();
  ctx.fillStyle = css(PIN.rgb, PIN.alpha);
  ctx.lineWidth = 3;
  ctx.strokeStyle = css(PIN_CASING.rgb, PIN_CASING.alpha);
  ctx.strokeText(bar.label, 16, canvas.height - 22);
  ctx.fillText(bar.label, 16, canvas.height - 22);

  // The caption, in the scale bar's casing and at the opposite corner: the
  // bar says how far, this says when, and neither has anything under it.
  if (scene.caption) {
    ctx.textAlign = "right";
    ctx.strokeText(scene.caption, canvas.width - 16, labelPx + 8);
    ctx.fillText(scene.caption, canvas.width - 16, labelPx + 8);
    ctx.textAlign = "left";
  }
}

/** The last 200 km of ground and altitude, on a fixed vertical scale. */
export function drawProfile(
  ctx: CanvasRenderingContext2D,
  track: FlownTrack,
  style: MapStyle = DEFAULT_MAP_STYLE,
): void {
  const { units, labelPx } = style;
  const { canvas } = ctx;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const points = track.recent();
  const band = bandOf(points);
  if (!band || points.length < 2) return;

  const x = (km: number) =>
    ((km - points[0]!.km) / Math.max(1, track.windowKm)) * canvas.width;
  const y = (m: number) => canvas.height - (Math.min(m, PROFILE_CEILING_M) / PROFILE_CEILING_M) * canvas.height;

  ctx.fillStyle = css(PROFILE_GROUND.rgb, PROFILE_GROUND.alpha);
  ctx.beginPath();
  ctx.moveTo(x(points[0]!.km), canvas.height);
  for (const p of points) ctx.lineTo(x(p.km), y(p.groundM));
  ctx.lineTo(x(points[points.length - 1]!.km), canvas.height);
  ctx.closePath();
  ctx.fill();

  useStroke(ctx, PROFILE_ALTITUDE);
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(x(p.km), y(p.altitudeM)) : ctx.lineTo(x(p.km), y(p.altitudeM))));
  ctx.stroke();

  ctx.fillStyle = css(PIN.rgb, PIN.alpha);
  ctx.font = `${labelPx}px ui-monospace, monospace`;
  ctx.fillText(
    `last ${formatDistance(band.spanKm, units)} · ` +
      `ground ${formatAltitude(band.minGroundM, units)}–${formatAltitude(band.maxGroundM, units)} · ` +
      `full scale ${formatAltitude(PROFILE_CEILING_M, units)}`,
    8,
    labelPx + 2,
  );
}
