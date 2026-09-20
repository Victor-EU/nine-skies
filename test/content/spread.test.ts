import { describe, expect, it } from "vitest";
import {
  validateSpreads,
  type Card,
  type Spread,
} from "../../content/schema.ts";

const card = (id: string, region: string): Card => ({
  id,
  type: "city",
  region,
  names: { zh: "x", en: id },
  trigger: { lat: 31, lon: 121, radius_km: 15 },
  one_liner: "x",
  read_more: "x",
  figure: { value: 1, unit: "m", label: "x" },
  illustration_id: "x",
  sources: ["x"],
});

const cards = [card("shanghai", "yangtze-coast"), card("lhasa", "qinghai-tibet")];

const spread = (over: Partial<Spread> = {}): Spread => ({
  id: "shanghai-lhasa",
  names: { zh: "上海与拉萨", en: "Shanghai vs Lhasa" },
  after: "sea-to-sky",
  left: { entry: "shanghai", measures: { elevation_m: 4 } },
  right: { entry: "lhasa", measures: { elevation_m: 3650 } },
  sources: ["x"],
  ...over,
});

const fields = (s: Spread) => validateSpreads([s], cards, ["sea-to-sky"]).map((i) => i.field);

describe("validateSpreads", () => {
  it("accepts a spread with the same measures on both sides", () => {
    expect(validateSpreads([spread()], cards, ["sea-to-sky"])).toEqual([]);
  });

  it("rejects a measure that is on one side only", () => {
    // The rule that makes it a comparison rather than two cards side by side.
    expect(
      fields(
        spread({
          left: { entry: "shanghai", measures: { elevation_m: 4, july_mean_c: 28.6 } },
        }),
      ),
    ).toEqual(["measures.july_mean_c"]);
  });

  it("rejects a measure that is not one of the five", () => {
    expect(
      fields(spread({ left: { entry: "shanghai", measures: { humidity: 70 } as never } })),
    ).toContain("left.measures.humidity");
  });

  it("rejects a side pointing at a card that does not exist", () => {
    expect(fields(spread({ right: { entry: "kashgar", measures: { elevation_m: 1289 } } }))).toEqual(
      ["right.entry"],
    );
  });

  it("rejects one entry compared with itself", () => {
    expect(
      fields(spread({ right: { entry: "shanghai", measures: { elevation_m: 4 } } })),
    ).toContain("right.entry");
  });

  it("rejects two entries from the same region", () => {
    const local = [card("shanghai", "yangtze-coast"), card("wuhan", "yangtze-coast")];
    const issues = validateSpreads(
      [spread({ right: { entry: "wuhan", measures: { elevation_m: 20 } } })],
      local,
      ["sea-to-sky"],
    );
    expect(issues.map((i) => i.message).join(" ")).toContain("Yangtze & East coast");
  });

  it("rejects a link to an expedition that does not exist", () => {
    expect(fields(spread({ after: "ice-to-coconuts" }))).toEqual(["after"]);
  });

  it("allows no link at all: the collection is the other unlock", () => {
    const { after: _after, ...rest } = spread();
    expect(validateSpreads([rest as Spread], cards, ["sea-to-sky"])).toEqual([]);
  });

  it("requires a source, like every other claim in the content", () => {
    expect(fields(spread({ sources: [] }))).toEqual(["sources"]);
  });
});
