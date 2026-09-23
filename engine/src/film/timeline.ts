/**
 * The clock the film is built on (design v2, D73).
 *
 * A scene is 120 seconds: a lead-in of 6 for the map jump and the title
 * card, then 114 of flight. The scene ends at 120 wherever the camera is. A
 * viewer who slows down sees less of the rail; one who speeds up sees more;
 * neither moves the cut. Nine scenes make exactly eighteen minutes.
 */

export const SCENE_S = 120;
export const LEAD_IN_S = 6;
export const FLIGHT_S = SCENE_S - LEAD_IN_S;

export type Phase = "lead-in" | "flight" | "end";

export interface TimelinePosition {
  /** Index of the scene on screen. After the last cut it stays on the last one. */
  readonly scene: number;
  /** Seconds into that scene, 0 .. 120. */
  readonly t: number;
  readonly phase: Phase;
  /** Seconds into the flight, 0 during the lead-in, 0 .. 114 in flight. */
  readonly flightS: number;
  /** Seconds into the whole film. */
  readonly filmS: number;
}

export function filmLengthS(sceneCount: number): number {
  return sceneCount * SCENE_S;
}

/** Where a film-second lands, for any number of scenes. */
export function positionAt(filmS: number, sceneCount: number): TimelinePosition {
  const total = filmLengthS(sceneCount);
  if (sceneCount <= 0 || filmS >= total) {
    return { scene: Math.max(0, sceneCount - 1), t: SCENE_S, phase: "end", flightS: FLIGHT_S, filmS: total };
  }
  const clamped = Math.max(0, filmS);
  const scene = Math.floor(clamped / SCENE_S);
  const t = clamped - scene * SCENE_S;
  const phase: Phase = t < LEAD_IN_S ? "lead-in" : "flight";
  return { scene, t, phase, flightS: Math.max(0, t - LEAD_IN_S), filmS: clamped };
}

/**
 * The running clock. It only ever advances by the frame's own seconds, or
 * jumps to the start of a chapter; nothing the viewer does with the four
 * flight inputs reaches it.
 */
export class Timeline {
  private filmS = 0;
  paused = false;

  constructor(readonly sceneCount: number) {}

  get totalS(): number {
    return filmLengthS(this.sceneCount);
  }

  get ended(): boolean {
    return this.filmS >= this.totalS;
  }

  at(): TimelinePosition {
    return positionAt(this.filmS, this.sceneCount);
  }

  advance(dt: number): TimelinePosition {
    if (!this.paused && dt > 0) this.filmS = Math.min(this.totalS, this.filmS + dt);
    return this.at();
  }

  /** Start a chapter from its lead-in. Out-of-range indices clamp. */
  jumpTo(scene: number): TimelinePosition {
    const i = Math.max(0, Math.min(this.sceneCount - 1, Math.floor(scene)));
    this.filmS = i * SCENE_S;
    return this.at();
  }

  restart(): void {
    this.filmS = 0;
  }
}
