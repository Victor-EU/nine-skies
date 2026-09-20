/**
 * Read the authored atlas: cards as journal entries, and the spreads that
 * pair them (F40).
 *
 * Separate from `tools/expedition.ts` because these are the same files read
 * for a different purpose. `loadTriggers` asks a card where it is; this asks
 * what it is, which region it is filed under, and what the journal should say
 * about it before it has been found.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { REGIONS, type Card, type Spread } from "../content/schema.ts";
import type { AtlasEntry, RegionInfo } from "../engine/src/journal/atlas.ts";
import type { SpreadPlan, SpreadSidePlan } from "../engine/src/journal/spread.ts";
import type { AtlasBundle } from "../engine/src/expedition/runner.ts";

function yamlIn<T>(dir: string): T[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => parse(readFileSync(join(dir, f), "utf8")) as T);
}

export function loadCards(cardsDir: string): Card[] {
  return yamlIn<Card>(cardsDir);
}

export function loadSpreads(spreadsDir: string): Spread[] {
  try {
    return yamlIn<Spread>(spreadsDir);
  } catch {
    // No spreads directory yet. Zero of twelve is the honest answer and it is
    // the report's job to say so, not this function's to invent one.
    return [];
  }
}

export const REGION_INFO: readonly RegionInfo[] = REGIONS.map((r) => ({
  id: r.id,
  name: r.en,
}));

export function entryFor(card: Card): AtlasEntry {
  return {
    id: card.id,
    type: card.type,
    region: card.region,
    name: card.names?.en ?? card.id,
    zh: card.names?.zh ?? "",
    hint: card.hint ?? null,
  };
}

/**
 * A spread as the runtime sees it.
 *
 * The side's region is denormalised out of the card it points at, because the
 * unlock rule asks "are both regions complete?" every time a card is found
 * and should not have to walk the entry list to answer.
 */
export function spreadPlanFor(spread: Spread, cards: readonly Card[]): SpreadPlan {
  const side = (s: Spread["left"]): SpreadSidePlan => ({
    entry: s.entry,
    region: cards.find((c) => c.id === s.entry)?.region ?? "",
    measures: { ...(s.measures ?? {}) } as Record<string, number>,
    dish: s.dish ?? null,
    sketch: s.sketch ?? null,
  });
  return {
    id: spread.id,
    name: spread.names?.en ?? spread.id,
    zh: spread.names?.zh ?? "",
    after: spread.after ?? null,
    left: side(spread.left),
    right: side(spread.right),
  };
}

/**
 * The whole journal side of the bundle.
 *
 * A spread is an atlas entry as well as a page: the GDD lists it in the same
 * volume table as the cards, it counts toward the collection, and "opened
 * once already" is the same fact as "found", so it lives in the same seen set
 * the save layer writes (F39). It is filed under its left side's region,
 * which is arbitrary but has to be something for the per-region counts to add
 * up; the right side's region is what the unlock reads.
 */
export function atlasBundle(cards: readonly Card[], spreads: readonly Spread[]): AtlasBundle {
  const plans = spreads.map((s) => spreadPlanFor(s, cards));
  return {
    regions: REGION_INFO,
    entries: [
      ...cards.map(entryFor),
      ...plans.map((p) => ({
        id: p.id,
        type: "comparison",
        region: p.left.region,
        name: p.name,
        zh: p.zh,
        hint: null,
      })),
    ],
    spreads: plans,
  };
}

/**
 * The ground under a named place, out of a committed route section.
 *
 * A comparison spread's first row is elevation, and of the five numbers it
 * carries that is the only one this repository already knows: the sections
 * committed beside each route hold the ground at a kilometre's spacing along
 * it (D21), signed by the machine that cut them (D23). Where a spread pairs
 * the ends of an expedition -- which is the case the GDD names, Shanghai and
 * Lhasa after Sea to Sky -- the authored elevation can be checked against the
 * ground the route was actually flown over, in CI, with no world.
 *
 * Returns null when the place is not a waypoint of any sectioned route, which
 * is most places; the other four measures have no equivalent and are a
 * writer's with sources.
 */
export interface GroundUnder {
  readonly expedition: string;
  readonly km: number;
  readonly groundM: number;
}

export function groundUnder(entryId: string, sectionsDir: string): GroundUnder | null {
  let files: string[];
  try {
    files = readdirSync(sectionsDir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return null;
  }
  for (const file of files) {
    const section = JSON.parse(readFileSync(join(sectionsDir, file), "utf8")) as {
      expedition: string;
      waypoints: { id: string }[];
      legEndKm: number[];
      groundM: number[];
    };
    const i = section.waypoints.findIndex((w) => w.id === entryId);
    if (i < 0) continue;
    const km = i === 0 ? 0 : section.legEndKm[i - 1]!;
    return {
      expedition: section.expedition,
      km,
      groundM: section.groundM[Math.min(section.groundM.length - 1, Math.round(km))]!,
    };
  }
  return null;
}
