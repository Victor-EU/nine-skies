/**
 * Which card catchments the aircraft has flown into. (Build plan, workstream D.)
 *
 * The plan's line is "uniform spatial grid over the ~150 point triggers,
 * polled at 4 Hz, per-entry radius". Two of those four turned out to need
 * changing, and the measurement is in F37.
 *
 * **A point poll misses crossings, and the fast modes make it worse.** At
 * 4 Hz the aircraft moves 181 m per poll at `low`, 542 at cruise and 1,083 at
 * boost, because horizontal motion carries the mode's ground gain. Ask "am I
 * inside a circle?" four times a second and a 500 m trigger flown straight
 * through is never reported 27.5 % of the time at boost and 5.3 % at cruise -
 * a discovery that silently does not happen, which is the worst failure this
 * system has. So the question asked here is not where the aircraft *is* but
 * where it has *been*: the distance from each trigger to the segment since the
 * last update. That makes the poll rate a cost decision rather than a
 * correctness one, and any radius works at any speed.
 *
 * **The poll rate is therefore free, and 4 Hz is not why.** A linear scan over
 * 230 triggers is nothing; see the timing in F37 before reaching for a grid.
 *
 * Triggers are authored as a latitude, a longitude and a radius in kilometres,
 * and are projected once here. The circle then lives in the plane the aircraft
 * flies in, which is not quite the circle on the sphere: Albers is equal-area
 * and not conformal, so 15 km walked in every direction comes back 14.58 to
 * 15.38 km at Hainan, the worst place in the country. That is 2.5 % of a
 * radius an author picked by feel, against a segment test that removes a 27 %
 * miss - and it costs one projection at load instead of a haversine per
 * trigger per poll.
 */
import { projectAlbers } from "../terrain/worldGrid.js";

export interface Trigger {
  readonly id: string;
  /** Real metres east and north of the projection origin. */
  readonly eastM: number;
  readonly northM: number;
  readonly radiusM: number;
}

/** Project an authored trigger into the plane the aircraft flies in. */
export function triggerAt(
  id: string,
  latDeg: number,
  lonDeg: number,
  radiusKm: number,
): Trigger {
  const { eastM, northM } = projectAlbers(latDeg, lonDeg);
  return { id, eastM, northM, radiusM: radiusKm * 1000 };
}

/**
 * Where along `A -> B` the path first enters a circle, as a fraction of the
 * segment, or `null` if it never does.
 *
 * The fraction rather than a yes/no because one update can cross several
 * catchments and the player should meet them in the order they were flown
 * into, not in whatever order the array happens to hold.
 */
export function entryFraction(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  radius: number,
): number | null {
  const fx = ax - cx;
  const fy = ay - cy;
  // Already inside at the start of the segment: entered at once.
  if (fx * fx + fy * fy <= radius * radius) return 0;

  const dx = bx - ax;
  const dy = by - ay;
  const a = dx * dx + dy * dy;
  if (a === 0) return null; // standing still, and outside

  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

/**
 * The catchments, and which of them the player has met.
 *
 * The seen set is the whole persistence surface: a profile's discoveries are
 * this set, and nothing else here is worth saving.
 */
export class TriggerField {
  private readonly triggers: readonly Trigger[];
  private readonly met = new Set<string>();
  private eastM = 0;
  private northM = 0;
  private placed = false;

  constructor(triggers: readonly Trigger[]) {
    this.triggers = triggers;
  }

  /** Ids the player has met, in no particular order. */
  get seen(): ReadonlySet<string> {
    return this.met;
  }

  /** Restore a profile. Ids this field does not know are kept, not dropped. */
  restore(ids: Iterable<string>): void {
    for (const id of ids) this.met.add(id);
  }

  /** A fresh profile. */
  forget(): void {
    this.met.clear();
  }

  /**
   * The aircraft has *flown* to here. Returns what it entered on the way, in
   * the order it entered them.
   */
  advance(eastM: number, northM: number): string[] {
    if (!this.placed) return this.moveTo(eastM, northM);
    const hits: Array<{ id: string; at: number }> = [];
    for (const t of this.triggers) {
      if (this.met.has(t.id)) continue;
      const at = entryFraction(
        this.eastM,
        this.northM,
        eastM,
        northM,
        t.eastM,
        t.northM,
        t.radiusM,
      );
      if (at !== null) hits.push({ id: t.id, at });
    }
    this.eastM = eastM;
    this.northM = northM;
    hits.sort((p, q) => p.at - q.at);
    const ids = hits.map((h) => h.id);
    for (const id of ids) this.met.add(id);
    return ids;
  }

  /**
   * The aircraft is *now* here, without having flown the distance - a map
   * jump, a reset, the first frame after loading.
   *
   * It exists because the swept test needs it to. A jump from Shanghai to
   * Lhasa is a 2,900 km segment, and asked as a flight it would hand back
   * every catchment within radius of that line at once - the player would
   * collect a quarter of China for pressing a button. What lands under the
   * aircraft still fires, because the player really is there.
   */
  moveTo(eastM: number, northM: number): string[] {
    this.eastM = eastM;
    this.northM = northM;
    this.placed = true;
    const ids: string[] = [];
    for (const t of this.triggers) {
      if (this.met.has(t.id)) continue;
      const dx = eastM - t.eastM;
      const dy = northM - t.northM;
      if (dx * dx + dy * dy <= t.radiusM * t.radiusM) ids.push(t.id);
    }
    for (const id of ids) this.met.add(id);
    return ids;
  }
}
