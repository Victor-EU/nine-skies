/**
 * What the atlas is made of, pinned so it changes on purpose (F40).
 *
 * These are content-truth tests in the sense F24 uses: they read the files
 * that ship, not fixtures, so a card filed under a region that does not exist
 * or a bundle cut without its journal fails here rather than in a browser.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CARD_TYPES,
  ENTRY_PLAN,
  REGION_IDS,
  validateCards,
  type Card,
} from "../../content/schema.ts";
import { atlasBundle, groundUnder, loadCards, loadSpreads } from "../../tools/journal.ts";
import { Atlas } from "../../engine/src/journal/atlas.js";
import { BUNDLE_VERSION, type ExpeditionBundle } from "../../engine/src/expedition/runner.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const contentDir = join(root, "content");
const cards = loadCards(join(contentDir, "cards"));
const spreads = loadSpreads(join(contentDir, "spreads"));

describe("the authored atlas", () => {
  it("files every card under one of the nine regions", () => {
    // Two of the three used to name a region that is not one of them, by one
    // character: a hyphen where the GDD's table has an en dash. A journal
    // grouping by that string showed eleven regions for a nine-region game.
    for (const c of cards) expect(REGION_IDS).toContain(c.region);
  });

  it("has no comparison card, because a spread is not a card", () => {
    expect(CARD_TYPES).not.toContain("comparison");
    expect(cards.map((c) => c.type)).not.toContain("comparison");
  });

  it("carries the twelve spreads the GDD plans, or says how many are missing", () => {
    // Zero of twelve today. This asserts the count is *reported*, not that it
    // is twelve: the page is a writing job, and G2 scores whether one is read.
    const planned = ENTRY_PLAN.find((p) => p.type === "comparison")!.target;
    expect(planned).toBe(12);
    expect(spreads.length).toBeLessThanOrEqual(planned);
  });
});

describe("the planned atlas against the trigger that exists", () => {
  it("is 228 entries, of which 195 are a circle on the ground", () => {
    const total = ENTRY_PLAN.reduce((n, p) => n + p.target, 0);
    const sum = (kind: string) =>
      ENTRY_PLAN.filter((p) => p.trigger === kind).reduce((n, p) => n + p.target, 0);
    expect(total).toBe(228);
    expect(sum("disc") + sum("on-entry")).toBe(195);
    // Nine regions, twelve weather events, twelve spreads: not places at all.
    expect(sum("boundary") + sum("condition") + sum("progress")).toBe(33);
  });

  it("plans 45 entries at another entry's place, which the schema rejects", () => {
    const onEntry = ENTRY_PLAN.filter((p) => p.trigger === "on-entry").reduce(
      (n, p) => n + p.target,
      0,
    );
    expect(onEntry).toBe(45);

    // The GDD's own trigger for a food card: "overflying the city that owns
    // it". Written that way it is rejected by the rule against two cards
    // stacking - a rule the single-card queue has made unnecessary (F37).
    const at = (id: string, type: Card["type"]): Card => ({
      id,
      type,
      region: "sichuan-hengduan",
      names: { zh: "重庆", en: id },
      trigger: { lat: 29.56, lon: 106.55, radius_km: 15 },
      one_liner: "x",
      read_more: Array(100).fill("word").join(" "),
      figure: { value: 1, unit: "m", label: "x" },
      illustration_id: "x",
      sources: ["x"],
    });
    const issues = validateCards([at("chongqing", "city"), at("chongqing-hotpot", "food")]);
    expect(issues.map((i) => i.field)).toContain("trigger");
    expect(issues[0]!.message).toMatch(/cards would stack/);
  });
});

describe("the shipped bundle", () => {
  const bundle = JSON.parse(
    readFileSync(join(root, "app", "public", "expeditions.json"), "utf8"),
  ) as ExpeditionBundle;

  it("carries the journal beside the routes", () => {
    expect(bundle.version).toBe(BUNDLE_VERSION);
    expect(bundle.atlas.regions).toHaveLength(9);
    expect(bundle.atlas.entries.map((e) => e.id).sort()).toEqual(cards.map((c) => c.id).sort());
    expect(bundle.atlas.spreads).toHaveLength(spreads.length);
  });

  it("is what `content:expeditions` would cut today", () => {
    expect(bundle.atlas).toEqual(atlasBundle(cards, spreads));
  });

  it("has an atlas nobody has found any of, in three of nine regions", () => {
    const atlas = new Atlas(bundle.atlas.regions, bundle.atlas.entries);
    expect(atlas.seenCount).toBe(0);
    expect(atlas.counts().filter((c) => c.total > 0)).toHaveLength(3);
    expect(atlas.counts().filter((c) => atlas.complete(c.region))).toHaveLength(0);
  });

  it("gives every entry a hint, even the ones with none authored", () => {
    const atlas = new Atlas(bundle.atlas.regions, bundle.atlas.entries);
    expect(bundle.atlas.entries.filter((e) => e.hint !== null)).toHaveLength(0);
    for (const e of bundle.atlas.entries)
      expect(atlas.hintFor(e.id)).toMatch(/^somewhere in /);
  });
});

describe("the one spread measure this repository owns", () => {
  it("reads the ground under a route's endpoints out of the committed section", () => {
    // Elevation is the first row of a comparison spread and the only one of
    // its five numbers that is already here: the section is the ground the
    // route was flown over, signed by the machine that cut it (D21, D23).
    const sections = join(contentDir, "sections");
    const shanghai = groundUnder("shanghai", sections);
    const lhasa = groundUnder("lhasa", sections);
    expect(shanghai).toMatchObject({ expedition: "sea-to-sky", km: 0 });
    expect(shanghai!.groundM).toBeCloseTo(9.9, 1);
    expect(lhasa!.groundM).toBeCloseTo(3651.8, 1);
    // Within the golden probe's own tolerance for Lhasa, 3,650 +/- 30 m.
    expect(Math.abs(lhasa!.groundM - 3650)).toBeLessThan(30);
    expect(groundUnder("kashgar", sections)).toBeNull();
  });
});
