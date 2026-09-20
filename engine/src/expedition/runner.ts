/**
 * Flying an authored expedition. (Workstream D, the expedition runner.)
 *
 * The plan's line is "route polyline, per-leg speed mode, per-leg altitude
 * floor, an arrival height the route has been shown to reach, location-
 * triggered beats so detours cannot desync narration, resume-at-last-beat".
 * The route half of that is built and flown offline already - `flyRoute`,
 * `climbFloor`, `validateRoute`, the content gate - and what is here is the
 * part that runs while somebody is holding the stick.
 *
 * **The gate's guarantee is a statement about a pacing, and the runtime lets
 * the player change it.** `P` cycles cruise through 80, 130 and 190 km/min,
 * and Expedition 1 was validated at 130. Flown at 190 it flies into the
 * ground at km 2,359 and is 210 m inside the Nyainqentanglha at the worst of
 * it; at 160 it clears by 13 m and
 * then cannot get down onto Lhasa, arriving 292 m above the height it is
 * authored to reach. Below 130 both halves hold all the way down to 60. So
 * the guarantee is one-sided, and an expedition is flown at or below the
 * pacing it was checked at (D31, F38). Free flight keeps all three.
 *
 * **A beat is a kilometre, not a disc.** A discovery card is a catchment
 * because free flight has no route to measure against (F37); a narration beat
 * has one, and asking "has progress passed this kilometre" cannot miss at any
 * frame rate or any speed, needs no radius an author has to guess, and fires
 * in route order by construction. Progress only advances while the aircraft
 * is on the route, so a detour delays narration rather than desyncing it -
 * which is what the plan asked for.
 */
import type { Trigger } from "../discovery/triggers.js";
import type { AtlasEntry, RegionInfo } from "../journal/atlas.js";
import type { SpreadPlan } from "../journal/spread.js";
import { modeAtKm, type Route, type RouteLeg } from "../sim/route.js";
import { DEFAULT_PACING, type Pacing, type SpeedMode } from "../sim/scale.js";
import type { AltitudeFloor } from "./resume.js";
import {
  pathFrom,
  RouteProgress,
  type PathPoint,
  type ProgressOptions,
  type RoutePath,
} from "./path.js";

/** A narration beat: a place on the route, by distance along it. */
export interface Beat {
  readonly id: string;
  readonly km: number;
  /** What the beat is about. Authored; the runner never reads it. */
  readonly name?: string;
}

/**
 * An authored expedition, in the form the runtime flies it.
 *
 * This is exactly what `npm run content:expeditions` writes and the app
 * fetches - there is no adapter between the file and the runner, because the
 * one thing a bundle must not do is describe a different route from the one
 * the content gate flew (D21's argument, in a smaller place).
 */
export interface ExpeditionPlan {
  readonly id: string;
  readonly name: string;
  /** The route's waypoints, projected. The path is derived, never stored. */
  readonly points: readonly PathPoint[];
  readonly legs: readonly RouteLeg[];
  /** Ordered by km. Waypoint passages are beats unless an author says more. */
  readonly beats: readonly Beat[];
  /** The cruise pacing the route was validated at, km/min. */
  readonly cruiseKmPerMin: number;
  readonly startAltitudeM: number;
  /**
   * The altitude floor the route demands, sampled along it (D18).
   *
   * Shipped rather than computed because computing one sample means flying
   * the rest of the route, and the runtime needs the answer in a frame -
   * for a resume, and for a player who has spent altitude on a detour and
   * wants to know whether the route is still theirs to finish (F39).
   */
  readonly floor: AltitudeFloor;
}

/**
 * Bumped when the plan shape changes, so a stale bundle is refused rather
 * than flown: a runtime reading last week's legs would be enforcing a
 * guarantee about a route that no longer exists.
 */
export const BUNDLE_VERSION = 2;

/** A discovery catchment with the name a HUD can print (F37). */
export interface CardTrigger extends Trigger {
  readonly name: string;
}

/**
 * The journal's side of the bundle (F40).
 *
 * `cards` above is the subset of `entries` that can be flown into. They are
 * separate lists because most of the atlas is not: of the GDD's 228 planned
 * entries, 33 have no place at all - nine regions, twelve weather events and
 * twelve comparison spreads - and a catchment list that pretended otherwise
 * would be a plan to lose them.
 */
export interface AtlasBundle {
  readonly regions: readonly RegionInfo[];
  readonly entries: readonly AtlasEntry[];
  readonly spreads: readonly SpreadPlan[];
}

export interface ExpeditionBundle {
  readonly version: number;
  readonly expeditions: readonly ExpeditionPlan[];
  /**
   * The card catchments, which belong to the world rather than to any one
   * route - a free flight passes them too, and that is most of what free
   * flight is for.
   */
  readonly cards: readonly CardTrigger[];
  readonly atlas: AtlasBundle;
}

export interface RunState {
  readonly km: number;
  readonly remainingKm: number;
  /** How far the aircraft is from the line it is being measured against. */
  readonly crossTrackM: number;
  readonly onRoute: boolean;
  /** The speed mode this leg is authored at. */
  readonly mode: SpeedMode;
  readonly leg: string;
  /** Beats crossed by this update, in route order. Usually empty. */
  readonly beats: readonly string[];
  /**
   * Beats the aircraft got past without flying past them - a jump, or a
   * detour that rejoined the route beyond them. Marked heard so they cannot
   * play later over the wrong ground, and reported so a journal can say the
   * player went round rather than through.
   */
  readonly skipped: readonly string[];
  readonly arrived: boolean;
}

/** Everything a resumed expedition needs, and nothing else. */
export interface SavedRun {
  readonly km: number;
  readonly beats: readonly string[];
}

/** The kilometre at which the route counts as flown. */
export const ARRIVAL_TOLERANCE_KM = 0.5;

export class ExpeditionRun {
  readonly plan: ExpeditionPlan;
  readonly path: RoutePath;
  private readonly progress: RouteProgress;
  private readonly heard = new Set<string>();
  private arrivedAt = false;

  constructor(plan: ExpeditionPlan, options: Partial<ProgressOptions> = {}) {
    this.plan = plan;
    this.path = pathFrom(plan.points);
    this.progress = new RouteProgress(this.path, options);
  }

  get fired(): ReadonlySet<string> {
    return this.heard;
  }

  get arrived(): boolean {
    return this.arrivedAt;
  }

  /** The aircraft has flown to here. */
  advance(eastM: number, northM: number): RunState {
    const before = this.progress.km;
    const fix = this.progress.advance(eastM, northM);
    return this.state(before, fix.rejoined);
  }

  /**
   * The aircraft is now here without having flown - a jump, a reset, a
   * resume. Beats between the old kilometre and the new one are marked heard
   * rather than played: the player did not fly past them (F37's seam, in the
   * coordinate a route has).
   */
  moveTo(eastM: number, northM: number): RunState {
    this.progress.moveTo(eastM, northM);
    return this.state(0, true);
  }

  snapshot(): SavedRun {
    return { km: this.progress.km, beats: [...this.heard] };
  }

  /**
   * Resume a saved expedition. Position comes from the first `moveTo` after
   * this, which is why the saved kilometre is kept rather than re-derived:
   * the aircraft is put back where it was, and a projection of that position
   * would round to whatever is nearest rather than to where the player was.
   */
  restore(saved: SavedRun): void {
    this.progress.restore(saved.km);
    for (const id of saved.beats) this.heard.add(id);
    this.arrivedAt = this.progress.km >= this.path.lengthKm - ARRIVAL_TOLERANCE_KM;
  }

  private state(fromKm: number, skipping: boolean): RunState {
    const km = this.progress.km;
    this.arrivedAt = this.arrivedAt || km >= this.path.lengthKm - ARRIVAL_TOLERANCE_KM;

    // Arriving is passing the last beat. Without this a beat authored at the
    // destination - which is where every route's last waypoint is - needs the
    // final metre of a 2,931 km route to fire, and never gets it.
    const reachedKm = this.arrivedAt ? this.path.lengthKm : km;
    const beats: string[] = [];
    const skipped: string[] = [];
    for (const beat of this.plan.beats) {
      if (this.heard.has(beat.id)) continue;
      if (beat.km > fromKm && beat.km <= reachedKm) {
        this.heard.add(beat.id);
        (skipping ? skipped : beats).push(beat.id);
      }
    }
    const route: Route = { name: this.plan.name, legs: this.plan.legs };
    const leg = this.plan.legs.find((l) => km < l.endKm) ?? this.plan.legs[this.plan.legs.length - 1];
    return {
      km,
      remainingKm: this.progress.remainingKm,
      crossTrackM: this.progress.crossTrackM,
      onRoute: this.progress.onRoute,
      mode: modeAtKm(route, km),
      leg: leg?.name ?? "",
      beats,
      skipped,
      arrived: this.arrivedAt,
    };
  }
}

/**
 * Whether the route's checked numbers still describe a flight at this pacing.
 *
 * One-sided on purpose, and measured rather than assumed: slower always
 * clears the ground by more, and on Expedition 1 it still gets down onto
 * Lhasa at every pacing from 60 km/min up to the authored 130. Faster fails,
 * and fails at the arrival before it fails at the ground (F38).
 */
export function pacingHolds(plan: ExpeditionPlan, pacing: Pacing): boolean {
  return pacing.cruiseKmPerMin <= plan.cruiseKmPerMin;
}

/** The fastest pacing this expedition may be flown at, given a request. */
export function cappedPacing(plan: ExpeditionPlan, pacing: Pacing = DEFAULT_PACING): Pacing {
  return pacingHolds(plan, pacing)
    ? pacing
    : { ...pacing, cruiseKmPerMin: plan.cruiseKmPerMin };
}
