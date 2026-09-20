/**
 * When to write a profile. (Build plan, workstream D: "autosave every 15 s
 * and on every beat".)
 *
 * Fifteen seconds is a clock rather than a distance, which is the property
 * that matters: the aircraft covers 10.8 km in that time at `low`, 32.5 at
 * cruise and 65.0 at boost, and what the player loses is a quarter of a
 * minute in all three. A save keyed to distance would cost four minutes of
 * plateau crawling to buy the same fifteen seconds over the coast.
 *
 * A beat saves as well, so the last thing a player was told is never ahead of
 * the last thing that was written down.
 */
export const AUTOSAVE_INTERVAL_S = 15;

/** Why the caller is asking. Only a tick is ever refused. */
export type SaveReason = "tick" | "beat" | "leaving";

export class Autosave {
  private readonly intervalS: number;
  private writtenAtS = Number.NEGATIVE_INFINITY;

  constructor(intervalS = AUTOSAVE_INTERVAL_S) {
    this.intervalS = intervalS;
  }

  /** Seconds since the last write, or Infinity before the first. */
  sinceS(nowS: number): number {
    return nowS - this.writtenAtS;
  }

  /**
   * Whether to write now, and mark it written if so.
   *
   * Marking here rather than in a second call because the two can never be
   * allowed to disagree: a `due` that said yes and a write that never
   * recorded itself is an autosave every frame, which is the one way a 5 kB
   * write becomes a frame-rate problem.
   */
  due(nowS: number, reason: SaveReason = "tick"): boolean {
    if (reason === "tick" && nowS - this.writtenAtS < this.intervalS) return false;
    this.writtenAtS = nowS;
    return true;
  }
}
