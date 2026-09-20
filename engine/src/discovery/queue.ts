/**
 * One card at a time, and the rest waiting. (GDD, "Discovery trigger".)
 *
 * The rule is the GDD's and it is short: *cards never stack; a queue holds
 * them until the player is ready.* Everything here follows from taking that
 * literally, plus one number the plan adds - a cooldown, so two catchments
 * entered within a second of each other do not read as one card flickering
 * into another.
 *
 * Why it is a queue and not a "show the nearest" rule: entering a catchment is
 * a fact about where the aircraft has been, and it does not stop being true
 * because the player was reading something else. A card dropped for being
 * second is a discovery that silently did not happen, which is the same defect
 * the segment test exists to prevent one layer down.
 *
 * Time is passed in rather than read, so a test can run a session in a
 * microsecond and a replay is reproducible.
 */

export interface CardQueueOptions {
  /**
   * Seconds a card stays up on its own.
   *
   * A default and not a finding. The GDD caps a one-liner at 25 words, which
   * is about eight seconds of reading at a normal pace; twelve gives a player
   * who looked away time to come back. Anyone who wants to keep reading opens
   * "read more", which pauses the flight, so this only decides how long an
   * *ignored* card lingers.
   */
  holdS: number;
  /** Seconds of clear air after one card before the next may appear. */
  cooldownS: number;
}

export const DEFAULT_CARD_QUEUE: CardQueueOptions = { holdS: 12, cooldownS: 2 };

export interface QueueState {
  /** The card on screen, or null. */
  readonly showing: string | null;
  /** How long it has been up, seconds. */
  readonly shownForS: number;
  /** How many are still waiting behind it. */
  readonly waiting: number;
}

export class CardQueue {
  private readonly options: CardQueueOptions;
  private readonly pending: string[] = [];
  private current: string | null = null;
  private shownAtS = 0;
  private freeAtS = -Infinity;
  private nowS = 0;

  constructor(options: CardQueueOptions = DEFAULT_CARD_QUEUE) {
    this.options = options;
  }

  /** Queue what the player just flew into, in the order they flew into it. */
  offer(ids: readonly string[]): void {
    for (const id of ids) if (!this.pending.includes(id) && id !== this.current) this.pending.push(id);
  }

  /** Advance to `nowS` and return what should be on screen. */
  update(nowS: number): QueueState {
    this.nowS = nowS;
    if (this.current !== null && nowS - this.shownAtS >= this.options.holdS) {
      this.dismiss();
    }
    if (this.current === null && this.pending.length > 0 && nowS >= this.freeAtS) {
      this.current = this.pending.shift()!;
      this.shownAtS = nowS;
    }
    return {
      showing: this.current,
      shownForS: this.current === null ? 0 : nowS - this.shownAtS,
      waiting: this.pending.length,
    };
  }

  /**
   * The player put it away. The GDD's "any card can be dismissed", and the
   * only way a queue that holds cards until the player is ready can move.
   */
  dismiss(): void {
    if (this.current === null) return;
    this.current = null;
    this.freeAtS = this.nowS + this.options.cooldownS;
  }

  /** Nothing showing and nothing waiting. */
  get idle(): boolean {
    return this.current === null && this.pending.length === 0;
  }
}
