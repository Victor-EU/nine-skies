import { describe, expect, it } from "vitest";
import { Atlas, type AtlasEntry, type RegionInfo } from "../../engine/src/journal/atlas.js";
import { spreadState, spreadsToOpen, type SpreadPlan } from "../../engine/src/journal/spread.js";

const regions: RegionInfo[] = [
  { id: "yangtze-coast", name: "Yangtze & East coast" },
  { id: "qinghai-tibet", name: "Qinghai–Tibet Plateau" },
  { id: "dongbei", name: "Northeast (Dongbei)" },
];

const entries: AtlasEntry[] = [
  { id: "shanghai", type: "city", region: "yangtze-coast", name: "Shanghai", zh: "上海", hint: null },
  { id: "lhasa", type: "city", region: "qinghai-tibet", name: "Lhasa", zh: "拉萨", hint: null },
  { id: "shanghai-lhasa", type: "comparison", region: "yangtze-coast", name: "Shanghai vs Lhasa", zh: "", hint: null },
  { id: "harbin-sanya", type: "comparison", region: "dongbei", name: "Harbin vs Sanya", zh: "", hint: null },
];

const spread: SpreadPlan = {
  id: "shanghai-lhasa",
  name: "Shanghai vs Lhasa",
  zh: "",
  after: "sea-to-sky",
  left: { entry: "shanghai", region: "yangtze-coast", measures: {}, dish: null, sketch: null },
  right: { entry: "lhasa", region: "qinghai-tibet", measures: {}, dish: null, sketch: null },
};

/** No linking expedition: the collection arm is the only way in. */
const unlinked: SpreadPlan = { ...spread, id: "harbin-sanya", after: null };

describe("comparison spread unlock", () => {
  it("is locked until something has happened", () => {
    const atlas = new Atlas(regions, entries);
    expect(spreadState(spread, atlas, new Set())).toMatchObject({ unlocked: false, by: "locked" });
  });

  it("opens at the end of the expedition that links its pair", () => {
    const atlas = new Atlas(regions, entries);
    expect(spreadState(spread, atlas, new Set(["sea-to-sky"]))).toMatchObject({
      unlocked: true,
      by: "expedition",
    });
  });

  it("opens in free flight once both regions are complete", () => {
    const atlas = new Atlas(regions, entries);
    atlas.see("shanghai");
    expect(spreadState(spread, atlas, new Set())).toMatchObject({ unlocked: false });
    atlas.see("lhasa");
    // The spread itself is an entry in the left region, so completing that
    // region is what the spread being unopened prevents - which is the point:
    // the unlock reads the cards, and the spread is what it produces.
    expect(spreadState(spread, atlas, new Set())).toMatchObject({ unlocked: false });
    atlas.see("shanghai-lhasa");
    expect(spreadState(spread, atlas, new Set())).toMatchObject({ unlocked: true, by: "regions" });
  });

  it("never opens a spread whose regions are empty", () => {
    // `harbin-sanya` points at two regions with no cards in them at all.
    const empty = new Atlas(regions, [entries[3]!]);
    expect(spreadState(unlinked, empty, new Set())).toMatchObject({ unlocked: false });
  });

  it("prefers the expedition arm, because that is the moment the player is in", () => {
    const atlas = new Atlas(regions, entries, ["shanghai", "lhasa", "shanghai-lhasa"]);
    expect(spreadState(spread, atlas, new Set(["sea-to-sky"])).by).toBe("expedition");
  });

  it("opens full-screen once and is a journal page afterwards", () => {
    const atlas = new Atlas(regions, entries);
    const finished = new Set(["sea-to-sky"]);
    expect(spreadsToOpen([spread, unlinked], atlas, finished).map((s) => s.id)).toEqual([
      "shanghai-lhasa",
    ]);
    atlas.see("shanghai-lhasa");
    expect(spreadsToOpen([spread, unlinked], atlas, finished)).toEqual([]);
    expect(spreadState(spread, atlas, finished).opened).toBe(true);
  });
});
