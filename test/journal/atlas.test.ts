import { describe, expect, it } from "vitest";
import { Atlas, type AtlasEntry, type RegionInfo } from "../../engine/src/journal/atlas.js";

const regions: RegionInfo[] = [
  { id: "xinjiang", name: "Xinjiang" },
  { id: "qinghai-tibet", name: "Qinghai–Tibet Plateau" },
  { id: "dongbei", name: "Northeast (Dongbei)" },
];

const entry = (over: Partial<AtlasEntry> & { id: string }): AtlasEntry => ({
  type: "hero-landmark",
  region: "xinjiang",
  name: over.id,
  zh: "",
  hint: null,
  ...over,
});

const entries: AtlasEntry[] = [
  entry({ id: "ayding-lake", name: "Ayding Lake" }),
  entry({ id: "tian-shan", name: "Tian Shan", hint: "somewhere along the Tian Shan" }),
  entry({ id: "plateau", region: "qinghai-tibet", type: "region" }),
];

describe("Atlas", () => {
  it("counts every region, including the ones with nothing in them", () => {
    const atlas = new Atlas(regions, entries);
    expect(atlas.counts().map((c) => `${c.name} ${c.seen}/${c.total}`)).toEqual([
      "Xinjiang 0/2",
      "Qinghai–Tibet Plateau 0/1",
      "Northeast (Dongbei) 0/0",
    ]);
    expect(atlas.total).toBe(3);
  });

  it("an empty region is not complete", () => {
    // The guard that matters: "both regions complete" is one of the two ways
    // a comparison spread unlocks, and on today's content six of the nine
    // regions hold nothing. The vacuous reading opens them to a player who
    // has found nothing at all.
    const atlas = new Atlas(regions, entries);
    expect(atlas.complete("dongbei")).toBe(false);
    expect(atlas.complete("qinghai-tibet")).toBe(false);
    atlas.see("plateau");
    expect(atlas.complete("qinghai-tibet")).toBe(true);
  });

  it("sees an entry once", () => {
    const atlas = new Atlas(regions, entries);
    expect(atlas.see("ayding-lake")).toBe(true);
    expect(atlas.see("ayding-lake")).toBe(false);
    expect(atlas.seenCount).toBe(1);
    // An id this build does not have is not a discovery.
    expect(atlas.see("nothing-here")).toBe(false);
  });

  it("drops entries a saved profile names but this build no longer has", () => {
    const atlas = new Atlas(regions, entries, ["ayding-lake", "cut-from-the-game"]);
    expect(atlas.seen).toEqual(["ayding-lake"]);
    expect(atlas.seenCount).toBe(1);
  });

  it("saves its seen set sorted, so two equal profiles serialise equal", () => {
    const a = new Atlas(regions, entries, ["plateau", "ayding-lake"]);
    const b = new Atlas(regions, entries, ["ayding-lake", "plateau"]);
    expect(a.seen).toEqual(b.seen);
  });

  it("hints with the authored line, or the region, and never for a found entry", () => {
    const atlas = new Atlas(regions, entries);
    expect(atlas.hintFor("tian-shan")).toBe("somewhere along the Tian Shan");
    expect(atlas.hintFor("ayding-lake")).toBe("somewhere in Xinjiang");
    atlas.see("ayding-lake");
    expect(atlas.hintFor("ayding-lake")).toBeNull();
    expect(atlas.hintFor("not-an-entry")).toBeNull();
  });

  it("lists what is still missing in a region", () => {
    const atlas = new Atlas(regions, entries, ["ayding-lake"]);
    expect(atlas.missing("xinjiang").map((e) => e.id)).toEqual(["tian-shan"]);
    expect(atlas.missing("dongbei")).toEqual([]);
  });
});
