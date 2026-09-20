/**
 * The collection layer: what has been found, and what is still out there.
 * (GDD, "Journal / Atlas"; build plan workstream D.)
 *
 * The journal *is* the progression -- the GDD says so in as many words -- and
 * everything it shows is a count over two sets: the entries that exist and the
 * entries this profile has met. So this holds no state of its own beyond that
 * second set, and it is the same set the save layer writes (F39).
 *
 * Two things here are deliberately weaker than they could be, and both are
 * waiting on something outside this file.
 *
 * **The region is the card's, not the aircraft's.** Grouping by
 * `entry.region` is a fact about where an entry was filed. The GDD also wants
 * the count for where the player *is* ("first discovery in each of the nine
 * regions"), and nothing in the build can answer that: the only position ->
 * region map is the three-way stand-in that blends the air, whose middle
 * region has zero weight over every kilometre of Expedition 1 including the
 * 265 km between Chongqing and Chengdu (F40). That is D14's region raster,
 * and the journal is now a second thing waiting on it.
 *
 * **A hint is a fallback, not a pin.** The GDD asks for "a soft hint for each
 * missing entry ... never an exact pin", and no authored card has one. The
 * region name is the weakest sentence that can be said about an entry and is
 * a pin for nobody, so an entry with no hint gets that rather than nothing --
 * and `npm run content:atlas` counts how many are living on it.
 */

export interface RegionInfo {
  readonly id: string;
  readonly name: string;
}

export interface AtlasEntry {
  readonly id: string;
  readonly type: string;
  /** A region id from the same bundle. */
  readonly region: string;
  readonly name: string;
  readonly zh: string;
  /** The authored soft hint, or null to fall back to the region. */
  readonly hint: string | null;
}

export interface RegionCount {
  readonly region: string;
  readonly name: string;
  readonly seen: number;
  readonly total: number;
}

export class Atlas {
  private readonly regions: readonly RegionInfo[];
  private readonly entries: readonly AtlasEntry[];
  private readonly byId: ReadonlyMap<string, AtlasEntry>;
  private readonly found = new Set<string>();

  constructor(
    regions: readonly RegionInfo[],
    entries: readonly AtlasEntry[],
    seen: Iterable<string> = [],
  ) {
    this.regions = regions;
    this.entries = entries;
    this.byId = new Map(entries.map((e) => [e.id, e]));
    // A profile can name an entry this build no longer has - content moves,
    // and a save outlives it. Dropping it here keeps `seenCount` a count of
    // things that exist, which is what the journal prints.
    for (const id of seen) if (this.byId.has(id)) this.found.add(id);
  }

  get total(): number {
    return this.entries.length;
  }

  get seenCount(): number {
    return this.found.size;
  }

  /** What to save. Sorted so two equal profiles serialise equal. */
  get seen(): readonly string[] {
    return [...this.found].sort();
  }

  has(id: string): boolean {
    return this.found.has(id);
  }

  entry(id: string): AtlasEntry | null {
    return this.byId.get(id) ?? null;
  }

  /** Mark one found. Returns whether it was new, which is what a HUD wants. */
  see(id: string): boolean {
    if (!this.byId.has(id) || this.found.has(id)) return false;
    this.found.add(id);
    return true;
  }

  /**
   * Every region, in the bundle's order, including the ones with nothing in
   * them. A journal that hides empty regions hides the shape of the game.
   */
  counts(): readonly RegionCount[] {
    return this.regions.map((r) => this.countFor(r.id));
  }

  countFor(region: string): RegionCount {
    const mine = this.entries.filter((e) => e.region === region);
    return {
      region,
      name: this.regions.find((r) => r.id === region)?.name ?? region,
      seen: mine.filter((e) => this.found.has(e.id)).length,
      total: mine.length,
    };
  }

  /**
   * Every entry in this region has been found.
   *
   * A region with nothing in it is **not** complete, and that guard is the
   * whole reason this is a method. "Both regions complete" is one of the two
   * ways a comparison spread unlocks (GDD), and on today's content set every
   * region but three is empty -- so the vacuous reading opens nine of the
   * twelve spreads to a player who has found nothing at all. A condition that
   * passes because nothing can fail it is the same defect as a check that
   * silently skips (F24, F28).
   */
  complete(region: string): boolean {
    const { seen, total } = this.countFor(region);
    return total > 0 && seen === total;
  }

  /** What is still missing in a region, in bundle order. */
  missing(region: string): readonly AtlasEntry[] {
    return this.entries.filter((e) => e.region === region && !this.found.has(e.id));
  }

  /**
   * What the journal says about an entry the player has not found yet, or
   * null if they have found it and the card itself is what to show.
   */
  hintFor(id: string): string | null {
    const entry = this.byId.get(id);
    if (!entry || this.found.has(entry.id)) return null;
    if (entry.hint) return entry.hint;
    const name = this.regions.find((r) => r.id === entry.region)?.name ?? entry.region;
    return `somewhere in ${name}`;
  }
}
