/**
 * A challenge: some objectives, a deadline that may not exist, and a retry
 * that costs nothing. (Build plan, workstream D, the *Challenges* row.)
 *
 * Two clocks live here and the GDD's one sentence about timing only makes
 * sense once they are separated. *"Each is done or not done; no medals or
 * leaderboards, and the timer is off by default with a toggle for players who
 * want it."* — but one of the twelve is *race the sunset along the Great
 * Wall*, whose entire content is a deadline. A timer that can be switched off
 * cannot be that deadline.
 *
 *   The **deadline** is part of the challenge. It is authored, it is always
 *   shown, and running past it ends the attempt. Only some challenges have
 *   one.
 *
 *   The **stopwatch** is how long *this* attempt has taken. It is scored
 *   against nothing, it is off by default, and turning it on changes no
 *   outcome — which is what makes "no medals or leaderboards" true.
 *
 * With those apart, *reach-before-time* stops being a primitive: it is
 * `ReachDisc` with a deadline over it, and the plan's six become five and a
 * modifier (F43).
 *
 * **Retry is a rewind, not a reload.** `retry()` resets every objective and
 * hands back the state the attempt started from, so the caller can put the
 * aircraft there. Nothing about the world changes — the same month, the same
 * start hour, the same ground — because a challenge that reshuffled anything
 * would not be the same challenge twice and "instant retry from the start"
 * would be a different flight each time.
 */
import type { ChallengeSample, Objective } from "./objectives.js";

export type ChallengeState = "flying" | "done" | "failed";

/**
 * Where an attempt begins, and what the world is doing when it does.
 *
 * The clock is here rather than derived because a challenge fixes its own
 * time of day the way an expedition does (D35): *race the sunset* is not a
 * challenge at eleven in the morning, and a retry that started a few minutes
 * later each time would move the sun out from under the player.
 */
export interface ChallengeStart {
  readonly eastM: number;
  readonly northM: number;
  readonly altitudeM: number;
  readonly headingRad: number;
  /** 1–12. Fixed, like an expedition's. */
  readonly month: number;
  /** Beijing minutes after midnight at the moment the attempt begins. */
  readonly clockMinutes: number;
}

export interface Deadline {
  /**
   * Beijing minutes after midnight by which the objectives must be met.
   *
   * A clock time rather than a duration, because the deadlines that exist in
   * this game are events in the sky: sunset at the far end of the Great Wall
   * is a fact about longitude and the date, not a stopwatch someone chose.
   * `tools/challengeCheck.ts` computes the solar ones; an author may also
   * just write a time.
   */
  readonly clockMinutes: number;
  /** What the deadline is, in words: "sunset over Jiayuguan". */
  readonly label: string;
}

export interface ChallengeSpec {
  readonly id: string;
  readonly name: string;
  readonly start: ChallengeStart;
  readonly objectives: readonly Objective[];
  readonly deadline?: Deadline | undefined;
}

/**
 * One attempt at a challenge.
 *
 * Fed the same two verbs as everything else that watches the aircraft move:
 * `advance` for flying and `jump` for arriving without having flown. The run
 * keeps the previous sample so callers hand it one sample per frame rather
 * than a pair.
 */
export class ChallengeRun {
  readonly spec: ChallengeSpec;
  private previous: ChallengeSample | null = null;
  private elapsed = 0;
  private clock: number;
  private failedByDeadline = false;

  constructor(spec: ChallengeSpec) {
    this.spec = spec;
    this.clock = spec.start.clockMinutes;
  }

  get objectives(): readonly Objective[] {
    return this.spec.objectives;
  }

  /** Seconds this attempt has run. The stopwatch's number, always measured. */
  get seconds(): number {
    return this.elapsed;
  }

  /** Beijing minutes now. */
  get clockMinutes(): number {
    return this.clock;
  }

  /** Minutes left before the deadline, or null when there is no deadline. */
  get minutesRemaining(): number | null {
    return this.spec.deadline ? this.spec.deadline.clockMinutes - this.clock : null;
  }

  get state(): ChallengeState {
    if (this.failedByDeadline) return "failed";
    if (this.spec.objectives.some((o) => o.state === "missed")) return "failed";
    return this.spec.objectives.every((o) => o.state === "met") ? "done" : "flying";
  }

  /** How much of the challenge is done, averaged over its objectives. */
  get progress(): number {
    const n = this.spec.objectives.length;
    if (n === 0) return 1;
    return this.spec.objectives.reduce((sum, o) => sum + o.progress, 0) / n;
  }

  /**
   * The aircraft flew to here. `sample` carries its own seconds and clock.
   *
   * The deadline is checked *after* the objectives, so an attempt that meets
   * the last objective on the same sample the deadline passes is a win. A
   * photo finish should go to the player: the alternative is losing a race by
   * a frame, and at boost a frame is 144 m of a 1,802 km run.
   */
  advance(sample: ChallengeSample): void {
    if (this.state !== "flying") return;
    const from = this.previous;
    this.elapsed = sample.seconds;
    this.clock = sample.clockMinutes;
    if (from) for (const o of this.spec.objectives) o.advance(from, sample);
    else for (const o of this.spec.objectives) o.jump(sample);
    this.previous = sample;
    const deadline = this.spec.deadline;
    if (deadline && this.state === "flying" && sample.clockMinutes > deadline.clockMinutes)
      this.failedByDeadline = true;
  }

  /** The aircraft is here without having flown. Credits nothing. */
  jump(sample: ChallengeSample): void {
    this.elapsed = sample.seconds;
    this.clock = sample.clockMinutes;
    for (const o of this.spec.objectives) o.jump(sample);
    this.previous = sample;
  }

  /**
   * Start again. Returns the state to put the aircraft back into.
   *
   * Instant, and it costs nothing — there is no attempt counter here on
   * purpose. Counting attempts is the first half of a medal.
   */
  retry(): ChallengeStart {
    for (const o of this.spec.objectives) o.reset();
    this.previous = null;
    this.elapsed = 0;
    this.clock = this.spec.start.clockMinutes;
    this.failedByDeadline = false;
    return this.spec.start;
  }
}

/** `2:05`, from seconds. The stopwatch's face. */
export function stopwatchString(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
