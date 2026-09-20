/**
 * The comparison spread: two entries on one page, the same measures on both.
 * (GDD, "Comparison spreads"; build plan D34.)
 *
 * The GDD calls these the payoff -- *the comparison spreads are where the
 * game's thesis lands explicitly* -- and gate G2 scores one of them: "the
 * full-screen comparison spread is read rather than dismissed by a majority".
 * So the unlock rule is a gate criterion's instrument, and it is worth being
 * exact about it.
 *
 * It has two arms, and they are different kinds of thing:
 *
 *   *opens full-screen at the end of the expedition that links its pair* --
 *   an event, one arrival, and the runner already knows when it happens
 *   (`RunState.arrived`, F38).
 *
 *   *or in free flight once both regions' entries are complete* -- a state,
 *   re-evaluated whenever a card is found, and the one that needs the empty
 *   region guarded (see `Atlas.complete`).
 *
 * A spread carries no catchment and no coordinates, which is why it is not a
 * card. It is authored as its own file and cut into the bundle beside the
 * entries it pairs.
 */
import type { Atlas } from "./atlas.js";

export interface SpreadSidePlan {
  readonly entry: string;
  /** The region of that entry, denormalised so the unlock needs no lookup. */
  readonly region: string;
  readonly measures: Readonly<Record<string, number>>;
  readonly dish: string | null;
  readonly sketch: string | null;
}

export interface SpreadPlan {
  readonly id: string;
  readonly name: string;
  readonly zh: string;
  /** The expedition whose arrival opens it, or null. */
  readonly after: string | null;
  readonly left: SpreadSidePlan;
  readonly right: SpreadSidePlan;
}

/** Why a spread is open, or `locked` if it is not. */
export type SpreadUnlock = "locked" | "expedition" | "regions";

export interface SpreadState {
  readonly id: string;
  readonly unlocked: boolean;
  readonly by: SpreadUnlock;
  /** True once it has been shown; a spread opens full-screen only once. */
  readonly opened: boolean;
}

/**
 * Whether a spread is open, and by which of the GDD's two routes.
 *
 * The expedition arm wins when both hold, because it is the one the player
 * will have just experienced: arriving at Lhasa is why the page is on screen.
 */
export function spreadState(
  spread: SpreadPlan,
  atlas: Atlas,
  finished: ReadonlySet<string>,
): SpreadState {
  const opened = atlas.has(spread.id);
  if (spread.after !== null && finished.has(spread.after))
    return { id: spread.id, unlocked: true, by: "expedition", opened };
  if (atlas.complete(spread.left.region) && atlas.complete(spread.right.region))
    return { id: spread.id, unlocked: true, by: "regions", opened };
  return { id: spread.id, unlocked: false, by: "locked", opened };
}

/**
 * The spreads that should open full-screen now, in bundle order.
 *
 * "Now" is after any change to what the player has done: an arrival, or a
 * card found. Already-opened spreads are not returned - a spread is a beat
 * the first time and a journal page every time after, which is the same rule
 * the discovery queue applies to a card it has already shown (F37).
 */
export function spreadsToOpen(
  spreads: readonly SpreadPlan[],
  atlas: Atlas,
  finished: ReadonlySet<string>,
): readonly SpreadPlan[] {
  return spreads.filter((s) => {
    const state = spreadState(s, atlas, finished);
    return state.unlocked && !state.opened;
  });
}
