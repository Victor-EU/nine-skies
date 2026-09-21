/**
 * The map overlay, drawn on a 2D canvas over the world (F42).
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
 * rest. That is a data gap and not a drawing one.
 */
import type { HorizonField } from "../../engine/src/terrain/horizonField.js";
import { MapView, HEIHE_TENGCHONG, type MapBounds } from "../../engine/src/map/view.js";
import { bandOf, type FlownTrack } from "../../engine/src/map/track.js";
import { projectAlbers } from "../../engine/src/terrain/worldGrid.js";

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

const INK = "rgba(232,238,245,0.92)";
const DIM = "rgba(232,238,245,0.30)";

/** A palette for the base: water dark, plain green-grey, plateau pale. */
function shade(m: number): [number, number, number] {
  if (m <= 0) return [13, 27, 42];
  const t = Math.min(1, m / 6000);
  return [Math.round(58 + 150 * t), Math.round(74 + 128 * t), Math.round(64 + 140 * t)];
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
        const [r, g, b] = shade(field.sampleM(bounds.eastM0 + x * cell, northM));
        const i = (y * w + x) * 4;
        image.data[i] = r;
        image.data[i + 1] = g;
        image.data[i + 2] = b;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    this.key = key;
    return this.canvas;
  }
}

export function drawMap(
  ctx: CanvasRenderingContext2D,
  field: HorizonField,
  base: MapBase,
  scene: MapScene,
): void {
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
    ctx.strokeStyle = "rgba(255,214,140,0.55)";
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const pa = view.project(a.eastM, a.northM);
    const pb = view.project(b.eastM, b.northM);
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Route.
  if (scene.route.length > 1) {
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    scene.route.forEach((w, i) => {
      const p = view.project(w.eastM, w.northM);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }

  // Track, pen up across teleports.
  const points = scene.track.recent();
  ctx.strokeStyle = "rgba(255,196,92,0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  let down = false;
  for (const t of points) {
    const p = view.project(t.eastM, t.northM);
    if (!t.joined || !down) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
    down = true;
  }
  ctx.stroke();

  // Pins - found entries only.
  ctx.fillStyle = INK;
  ctx.font = "10px ui-monospace, monospace";
  for (const pin of scene.pins) {
    const p = view.project(pin.eastM, pin.northM);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(pin.name, p.x + 6, p.y + 3);
  }

  // The aircraft, pointing where it is going.
  const a = view.project(scene.aircraft.eastM, scene.aircraft.northM);
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(-scene.aircraft.headingRad);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4, 5);
  ctx.lineTo(0, 2);
  ctx.lineTo(-4, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Scale bar, from the view's own metres per pixel.
  const barKm = 500;
  const barPx = barKm / view.kmPerPx;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(16, canvas.height - 16);
  ctx.lineTo(16 + barPx, canvas.height - 16);
  ctx.stroke();
  ctx.fillText(`${barKm} km`, 16, canvas.height - 22);
}

/** The last 200 km of ground and altitude, on a fixed vertical scale. */
export function drawProfile(ctx: CanvasRenderingContext2D, track: FlownTrack): void {
  const { canvas } = ctx;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const points = track.recent();
  const band = bandOf(points);
  if (!band || points.length < 2) return;

  const x = (km: number) =>
    ((km - points[0]!.km) / Math.max(1, track.windowKm)) * canvas.width;
  const y = (m: number) => canvas.height - (Math.min(m, PROFILE_CEILING_M) / PROFILE_CEILING_M) * canvas.height;

  ctx.fillStyle = "rgba(88,110,96,0.85)";
  ctx.beginPath();
  ctx.moveTo(x(points[0]!.km), canvas.height);
  for (const p of points) ctx.lineTo(x(p.km), y(p.groundM));
  ctx.lineTo(x(points[points.length - 1]!.km), canvas.height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,196,92,0.95)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(x(p.km), y(p.altitudeM)) : ctx.lineTo(x(p.km), y(p.altitudeM))));
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillText(
    `last ${band.spanKm.toFixed(0)} km · ground ${band.minGroundM.toFixed(0)}–${band.maxGroundM.toFixed(0)} m · ` +
      `full scale ${PROFILE_CEILING_M.toLocaleString()} m`,
    8,
    12,
  );
}
