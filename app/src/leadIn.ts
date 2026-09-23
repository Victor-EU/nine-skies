/**
 * The map between scenes (design v2, "Between scenes"): the country from the
 * horizon field, the rails flown so far, and a line jumping from where the
 * last scene ended to where this one begins, with the distance on it. Six
 * seconds a scene, and the only place the geography is stated.
 */
import type { HorizonField } from "../../engine/src/terrain/horizonField.js";
import type { WorldCoverage } from "../../engine/src/terrain/coverage.js";
import { MapView, type MapBounds } from "../../engine/src/map/view.js";
import { MapBase } from "./mapOverlay.js";
import type { BuiltRail } from "../../engine/src/film/scene.js";

const INK = "#f2ede4";
const CASING = "rgba(6,10,16,0.85)";

export interface LeadInScene {
  readonly rails: readonly BuiltRail[];
  /** Index of the scene about to play. */
  readonly next: number;
  /** 0 at the start of the lead-in, 1 at its end: the jump line draws itself. */
  readonly progress: number;
}

export class LeadInMap {
  private readonly base = new MapBase();

  constructor(
    private readonly field: HorizonField,
    private readonly bounds: MapBounds,
    private readonly coverage: WorldCoverage | null,
  ) {}

  draw(ctx: CanvasRenderingContext2D, scene: LeadInScene): void {
    const { canvas } = ctx;
    const view = new MapView(this.bounds, canvas.width, canvas.height, 12);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const topLeft = view.project(this.bounds.eastM0, this.bounds.northM1);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      this.base.imageFor(this.field, this.bounds, this.coverage),
      topLeft.x,
      topLeft.y,
      (this.bounds.eastM1 - this.bounds.eastM0) * view.scale,
      (this.bounds.northM1 - this.bounds.northM0) * view.scale,
    );

    const px = (e: number, n: number) => view.project(e, n);
    const stroke = (points: readonly { eastM: number; northM: number }[], width: number, colour: string, dash: number[] = []) => {
      if (points.length < 2) return;
      ctx.beginPath();
      for (const [i, p] of points.entries()) {
        const q = px(p.eastM, p.northM);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      }
      ctx.lineWidth = width;
      ctx.strokeStyle = colour;
      ctx.setLineDash(dash);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.setLineDash([]);
    };

    // The rails already flown, cased so they read over any ground.
    for (const [i, rail] of scene.rails.entries()) {
      if (i >= scene.next) break;
      stroke(rail.path.points, 4, CASING);
      stroke(rail.path.points, 2, INK);
    }

    // The jump: from the end of the last rail to the start of this one.
    const to = scene.rails[scene.next];
    const from = scene.next > 0 ? scene.rails[scene.next - 1] : null;
    if (to) {
      const start = to.path.points[0]!;
      if (from) {
        const end = from.path.points[from.path.points.length - 1]!;
        const t = Math.max(0, Math.min(1, scene.progress));
        const tip = { eastM: end.eastM + (start.eastM - end.eastM) * t, northM: end.northM + (start.northM - end.northM) * t };
        stroke([end, tip], 3.5, CASING, [8, 6]);
        stroke([end, tip], 1.5, INK, [8, 6]);
        const km = Math.hypot(start.eastM - end.eastM, start.northM - end.northM) / 1000;
        const mid = px((end.eastM + start.eastM) / 2, (end.northM + start.northM) / 2);
        const label = `${km.toLocaleString("en", { maximumFractionDigits: 0 })} km`;
        ctx.font = `${Math.max(12, Math.round(canvas.height / 40))}px -apple-system, "Helvetica Neue", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.lineWidth = 4;
        ctx.strokeStyle = CASING;
        ctx.strokeText(label, mid.x, mid.y - 6);
        ctx.fillStyle = INK;
        ctx.fillText(label, mid.x, mid.y - 6);
      }
      // Where this scene begins.
      const q = px(start.eastM, start.northM);
      ctx.beginPath();
      ctx.arc(q.x, q.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.strokeStyle = CASING;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fill();
    }
  }
}
