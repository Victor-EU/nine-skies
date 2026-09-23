/**
 * Which built world the app flies, and which expedition over it.
 *
 * Phase 0 built one corridor per expedition and the app flew the one it was
 * written for, so a world's name and its expedition's id were one string and
 * the lookup was `p.id === manifest.corridor`. Phase 2 builds `china` and
 * serves every expedition from it - the offline tools already read it that
 * way (`CORRIDOR_FALLBACK` in `tools/expedition.ts`) - and a world that serves
 * nine expeditions names none of them.
 *
 * So the world and the expedition are two choices. Both come from the query
 * string until there is a menu: `?world=china&expedition=sea-to-sky`. With no
 * query the answer is what it always was, the corridor and its own
 * expedition, because that is what G1 flies and what every committed section
 * is signed against (D23).
 */

/** What the app flies with no query: phase 0's corridor. */
export const DEFAULT_WORLD = "sea-to-sky";

/** The one world that serves every expedition rather than its own. */
export const COUNTRY_WORLD = "china";

/**
 * A world or expedition name as the pipeline and the content tree spell them.
 * It becomes part of a URL path, so anything else is refused rather than
 * escaped.
 */
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface WorldChoice {
  /** The directory under `/world` to load. */
  readonly world: string;
  /** The expedition asked for by name, or null to take the world's own. */
  readonly expedition: string | null;
}

export function chooseWorld(search: string): WorldChoice {
  const query = new URLSearchParams(search);
  const world = query.get("world");
  const expedition = query.get("expedition");
  return {
    world: world !== null && NAME.test(world) ? world : DEFAULT_WORLD,
    expedition: expedition !== null && NAME.test(expedition) ? expedition : null,
  };
}

/**
 * The expedition flown over `world`, or null for free flight.
 *
 * A corridor serves its own expedition and nothing else, because it is a strip
 * cut to one route and outside it the ground reads as sea - which is exactly
 * the failure `corridorFor` refuses offline. The country serves any of them,
 * and names none by itself: with nothing asked for it is free flight, since
 * picking the first in the bundle would be a menu decision made by file order.
 */
export function expeditionFor<P extends { readonly id: string }>(
  plans: readonly P[],
  world: string,
  asked: string | null,
): P | null {
  const id = asked ?? world;
  if (id !== world && world !== COUNTRY_WORLD) return null;
  return plans.find((p) => p.id === id) ?? null;
}
