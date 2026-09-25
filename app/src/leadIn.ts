/**
 * The map between scenes (design v2, "Between scenes"): the country from the
 * horizon field, the rails flown so far, and a line jumping from where the
 * last scene ended to where this one begins, with the distance on it. Six
 * seconds a scene, and the only place the geography is stated.
 *
 * It is drawn as an atlas sheet: the box of latitude and longitude the build
 * holds, which Albers draws as a fan, with a graticule every ten degrees and
 * the land on it, shaded by its own relief. A zero in the field is the sea, a
 * hole or ground the build never fetched, and the lead-in has no need to tell
 * those apart, so it paints none of them (F54's rule, kept by drawing no blue
 * at all): what shows there is the sheet.
 */
import type { HorizonField } from "../../engine/src/terrain/horizonField.js";
import { MapView, type MapBounds } from "../../engine/src/map/view.js";
import { landShade } from "../../engine/src/map/palette.js";
import { projectAlbers, unprojectAlbers } from "../../engine/src/terrain/worldGrid.js";
import type { BuiltRail } from "../../engine/src/film/scene.js";

const INK = "#f2ede4";
const CASING = "rgba(6,10,16,0.85)";
const FONT = `-apple-system, "Helvetica Neue", "Segoe UI", "Noto Sans", sans-serif`;

export interface LeadInScene {
  readonly rails: readonly BuiltRail[];
  /** Index of the scene about to play; `rails.length` draws the whole route, numbered. */
  readonly next: number;
  /** 0 at the start of the lead-in, 1 at its end: the jump line draws itself. */
  readonly progress: number;
  /** Device pixels per CSS pixel on this canvas. */
  readonly ratio: number;
  /** Seconds, for the beat of the marker where this scene begins. */
  readonly timeS: number;
}

const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

/** The way from one point to another, in eight words: the grid's north is near enough true north for this. */
export function compassWord(dEastM: number, dNorthM: number): string {
  const bearing = (Math.atan2(dEastM, dNorthM) * 180) / Math.PI;
  return COMPASS[Math.round(((bearing + 360) % 360) / 45) % 8]!;
}

/** "1,021 km (634 mi) west": the jump as the captions write a distance. */
export function jumpLabel(dEastM: number, dNorthM: number): string {
  const km = Math.hypot(dEastM, dNorthM) / 1000;
  const f = (v: number) => v.toLocaleString("en", { maximumFractionDigits: 0 });
  return `${f(km)} km (${f(km / 1.609344)} mi) ${compassWord(dEastM, dNorthM)}`;
}

/** The build's box in latitude and longitude, whole degrees. */
interface Box {
  readonly latMin: number;
  readonly latMax: number;
  readonly lonMin: number;
  readonly lonMax: number;
}

export class LeadInMap {
  private base: HTMLCanvasElement | null = null;
  private box: Box | null = null;

  constructor(
    private readonly field: HorizonField,
    private readonly bounds: MapBounds,
  ) {}

  /** The box of the ground the build holds, in latitude and longitude. */
  private sheet(): Box {
    if (this.box) return this.box;
    const { field } = this;
    const cell = field.sampleKm * 1000;
    let latMin = 90;
    let latMax = -90;
    let lonMin = 180;
    let lonMax = -180;
    for (let j = 0; j < field.height; j += 2) {
      for (let i = 0; i < field.width; i += 2) {
        if (field.data[j * field.width + i] === 0) continue;
        const { latDeg, lonDeg } = unprojectAlbers(i * cell, j * cell);
        latMin = Math.min(latMin, latDeg);
        latMax = Math.max(latMax, latDeg);
        lonMin = Math.min(lonMin, lonDeg);
        lonMax = Math.max(lonMax, lonDeg);
      }
    }
    this.box = latMin < latMax
      ? { latMin: Math.floor(latMin), latMax: Math.ceil(latMax), lonMin: Math.floor(lonMin), lonMax: Math.ceil(lonMax) }
      : { latMin: 18, latMax: 54, lonMin: 73, lonMax: 135 };
    return this.box;
  }

  /** The land, shaded, one pixel to a cell of the field; built once. */
  private baseImage(): HTMLCanvasElement {
    if (this.base) return this.base;
    const { field, bounds } = this;
    const cell = field.sampleKm * 1000;
    const w = Math.max(1, Math.round((bounds.eastM1 - bounds.eastM0) / cell));
    const h = Math.max(1, Math.round((bounds.northM1 - bounds.northM0) / cell));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(w, h);
    // Light from the north-west, as maps are lit; the relief exaggerated
    // enough that the plains keep a grain.
    const light = [-0.55, 0.55, 0.63];
    const relief = 14;
    for (let y = 0; y < h; y++) {
      const northM = bounds.northM0 + (h - 1 - y) * cell;
      for (let x = 0; x < w; x++) {
        const eastM = bounds.eastM0 + x * cell;
        const m = field.sampleM(eastM, northM);
        if (m === 0) continue;
        const dzdx = (field.sampleM(eastM + cell, northM) - field.sampleM(eastM - cell, northM)) / (2 * cell);
        const dzdy = (field.sampleM(eastM, northM + cell) - field.sampleM(eastM, northM - cell)) / (2 * cell);
        const nx = -dzdx * relief;
        const ny = -dzdy * relief;
        const len = Math.hypot(nx, ny, 1);
        const lit = (nx * light[0]! + ny * light[1]! + light[2]!) / len / light[2]!;
        const shade = Math.max(0.5, Math.min(1.35, 0.35 + 0.65 * lit));
        const [r, g, b] = landShade(m);
        const i = (y * w + x) * 4;
        image.data[i] = Math.min(255, r * shade);
        image.data[i + 1] = Math.min(255, g * shade);
        image.data[i + 2] = Math.min(255, b * shade);
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    this.base = canvas;
    return canvas;
  }

  draw(ctx: CanvasRenderingContext2D, scene: LeadInScene): void {
    const { canvas } = ctx;
    const ratio = scene.ratio;
    const width = canvas.width / ratio;
    const height = canvas.height / ratio;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const view = new MapView(this.bounds, width, height, Math.round(Math.min(width, height) * 0.02));
    const topLeft = view.project(this.bounds.eastM0, this.bounds.northM1);

    // The sheet: the build's box, a parallel and a meridian at a time, with its graticule.
    const box = this.sheet();
    const at = (lat: number, lon: number) => {
      const p = projectAlbers(lat, lon);
      return view.project(p.eastM, p.northM);
    };
    const edge = (lat0: number, lon0: number, lat1: number, lon1: number, first: boolean) => {
      for (let k = first ? 0 : 1; k <= 24; k++) {
        const q = at(lat0 + ((lat1 - lat0) * k) / 24, lon0 + ((lon1 - lon0) * k) / 24);
        if (first && k === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      }
    };
    const { latMin, latMax, lonMin, lonMax } = box;
    const outline = () => {
      ctx.beginPath();
      edge(latMin, lonMin, latMin, lonMax, true);
      edge(latMin, lonMax, latMax, lonMax, false);
      edge(latMax, lonMax, latMax, lonMin, false);
      edge(latMax, lonMin, latMin, lonMin, false);
      ctx.closePath();
    };
    outline();
    ctx.fillStyle = "rgba(10,15,22,0.82)";
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    for (let lon = Math.ceil(lonMin / 10) * 10; lon <= lonMax; lon += 10) edge(latMin, lon, latMax, lon, true);
    for (let lat = Math.ceil(latMin / 10) * 10; lat <= latMax; lat += 10) edge(lat, lonMin, lat, lonMax, true);
    ctx.strokeStyle = "rgba(242,237,228,0.09)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      this.baseImage(),
      topLeft.x,
      topLeft.y,
      (this.bounds.eastM1 - this.bounds.eastM0) * view.scale,
      (this.bounds.northM1 - this.bounds.northM0) * view.scale,
    );
    ctx.restore();
    outline();
    ctx.strokeStyle = "rgba(242,237,228,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const px = (e: number, n: number) => view.project(e, n);
    const stroke = (points: readonly { eastM: number; northM: number }[], lineWidth: number, colour: string, dash: number[] = []) => {
      if (points.length < 2) return;
      ctx.beginPath();
      for (const [i, p] of points.entries()) {
        const q = px(p.eastM, p.northM);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      }
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = colour;
      ctx.setLineDash(dash);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const label = (text: string, x: number, y: number, align: CanvasTextAlign, baseline: CanvasTextBaseline) => {
      ctx.textAlign = align;
      ctx.textBaseline = baseline;
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = CASING;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = INK;
      ctx.fillText(text, x, y);
    };
    const dot = (x: number, y: number, r: number) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.strokeStyle = CASING;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fill();
    };

    // The rails already flown, cased so they read over any ground.
    const flown = Math.min(scene.next, scene.rails.length);
    for (let i = 0; i < flown; i++) {
      const rail = scene.rails[i]!;
      stroke(rail.path.points, 4, CASING);
      stroke(rail.path.points, 2, INK);
    }

    // The whole route: each scene numbered where it begins.
    if (scene.next >= scene.rails.length) {
      const size = Math.max(10, Math.round(height / 42));
      for (const [i, rail] of scene.rails.entries()) {
        const q = px(rail.path.points[0]!.eastM, rail.path.points[0]!.northM);
        ctx.beginPath();
        ctx.arc(q.x, q.y, size * 0.85, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(6,10,16,0.8)";
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.25;
        ctx.fill();
        ctx.stroke();
        ctx.font = `600 ${size}px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = INK;
        ctx.fillText(String(i + 1), q.x, q.y + 0.5);
      }
      return;
    }

    // The jump: from the end of the last rail to the start of this one.
    const to = scene.rails[scene.next];
    const from = scene.next > 0 ? scene.rails[scene.next - 1] : null;
    if (!to) return;
    const start = to.path.points[0]!;
    const t = Math.max(0, Math.min(1, scene.progress));
    const eased = 1 - (1 - t) ** 3;
    if (from) {
      const end = from.path.points[from.path.points.length - 1]!;
      const tip = { eastM: end.eastM + (start.eastM - end.eastM) * eased, northM: end.northM + (start.northM - end.northM) * eased };
      stroke([end, tip], 3.5, CASING, [7, 6]);
      stroke([end, tip], 1.5, INK, [7, 6]);
      // The distance sits at the line's tail, on the far side from where it
      // lands, so it covers neither the line nor the mark; kept on the sheet.
      const a = px(end.eastM, end.northM);
      const b = px(start.eastM, start.northM);
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const dx = (b.x - a.x) / len;
      const dy = (b.y - a.y) / len;
      const text = jumpLabel(start.eastM - end.eastM, start.northM - end.northM);
      ctx.font = `500 ${Math.max(11, Math.min(15, Math.round(height / 28)))}px ${FONT}`;
      const tw = ctx.measureText(text).width;
      const th = Math.max(11, Math.min(15, Math.round(height / 28)));
      const gap = 9;
      let x: number;
      let y: number;
      if (Math.abs(dx) >= Math.abs(dy)) {
        // Mostly east or west: beside the tail, reading away from the jump.
        x = dx < 0 ? a.x + gap : a.x - gap - tw;
        y = a.y - th / 2;
      } else {
        // Mostly north or south: under or over the tail.
        x = a.x - tw / 2;
        y = dy < 0 ? a.y + gap : a.y - gap - th;
      }
      x = Math.max(6, Math.min(width - 6 - tw, x));
      y = Math.max(6, Math.min(height - 6 - th, y));
      ctx.globalAlpha = Math.max(0, Math.min(1, (t - 0.15) / 0.35));
      label(text, x, y, "left", "top");
      ctx.globalAlpha = 1;
    }
    // Where this scene begins: a mark that beats while the title is up.
    const q = px(start.eastM, start.northM);
    const landed = from ? Math.max(0, Math.min(1, (t - 0.85) / 0.15)) : 1;
    if (landed > 0) {
      const beat = (scene.timeS % 1.6) / 1.6;
      ctx.beginPath();
      ctx.arc(q.x, q.y, 5 + 14 * beat, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(242,237,228,${(0.7 * (1 - beat) * landed).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    dot(q.x, q.y, 4.5);
  }
}
