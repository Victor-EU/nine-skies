import { describe, expect, it } from "vitest";
import { RULES, haversineKm, validateCards, wordCount, type Card } from "../../content/schema.js";

function card(over: Partial<Card> = {}): Card {
  return {
    id: "test-card",
    type: "hero-landmark",
    region: "Xinjiang",
    names: { zh: "测试", en: "Test" },
    trigger: { lat: 40, lon: 90, radius_km: 15 },
    one_liner: "A short line well under the limit.",
    read_more: Array.from({ length: 100 }, (_, i) => `word${i}`).join(" "),
    figure: { value: 1, unit: "m", label: "height" },
    illustration_id: "test",
    sources: ["A source"],
    ...over,
  };
}

const fields = (cards: Card[]) => validateCards(cards).map((i) => i.field);

describe("card validation catches what it is meant to", () => {
  it("passes a well-formed card", () => {
    expect(validateCards([card()])).toEqual([]);
  });

  it("rejects a one-liner over 25 words", () => {
    const long = Array.from({ length: 26 }, (_, i) => `w${i}`).join(" ");
    expect(fields([card({ one_liner: long })])).toContain("one_liner");
  });

  it("rejects read-more outside 80-120 words", () => {
    const short = Array.from({ length: 79 }, (_, i) => `w${i}`).join(" ");
    const long = Array.from({ length: 121 }, (_, i) => `w${i}`).join(" ");
    expect(fields([card({ read_more: short })])).toContain("read_more");
    expect(fields([card({ read_more: long })])).toContain("read_more");
    expect(validateCards([card({ read_more: Array.from({ length: 80 }, (_, i) => `w${i}`).join(" ") })])).toEqual([]);
  });

  it("rejects coordinates outside China", () => {
    // Tokyo.
    expect(fields([card({ trigger: { lat: 35.6, lon: 139.7, radius_km: 5 } })])).toContain("trigger.lon");
    // Somewhere in the Indian Ocean.
    expect(fields([card({ trigger: { lat: -10, lon: 90, radius_km: 5 } })])).toContain("trigger.lat");
  });

  it("rejects a card with no source note", () => {
    expect(fields([card({ sources: [] })])).toContain("sources");
    expect(fields([card({ sources: [""] })])).toContain("sources");
  });

  it("requires a Chinese name as well as English", () => {
    expect(fields([card({ names: { zh: "", en: "Test" } })])).toContain("names.zh");
  });

  it("catches duplicate ids", () => {
    expect(fields([card(), card()])).toContain("id");
  });

  it("catches triggers close enough to stack", () => {
    const a = card({ id: "a", trigger: { lat: 40, lon: 90, radius_km: 5 } });
    const b = card({ id: "b", trigger: { lat: 40.005, lon: 90, radius_km: 5 } });
    const issues = validateCards([a, b]);
    expect(issues.some((i) => i.field === "trigger" && /stack/.test(i.message))).toBe(true);
  });

  it("allows triggers further apart than the separation rule", () => {
    const a = card({ id: "a", trigger: { lat: 40, lon: 90, radius_km: 5 } });
    const b = card({ id: "b", trigger: { lat: 40.5, lon: 90, radius_km: 5 } });
    expect(validateCards([a, b])).toEqual([]);
  });

  it("insists on kebab-case ids", () => {
    expect(fields([card({ id: "Test_Card" })])).toContain("id");
  });
});

describe("helpers", () => {
  it("counts words, treating hyphenated terms as one", () => {
    expect(wordCount("quartz-sandstone pillars in mist")).toBe(4);
    expect(wordCount("   ")).toBe(0);
  });

  it("measures distance well enough for a 3 km rule", () => {
    // Beijing to Shanghai, ~1,070 km.
    expect(haversineKm(39.9, 116.4, 31.2, 121.5)).toBeCloseTo(1067, -2);
    expect(haversineKm(40, 90, 40, 90)).toBe(0);
  });

  it("keeps the bbox around mainland China plus Hainan", () => {
    expect(RULES.bbox.minLat).toBeLessThan(18.4); // Sanya
    expect(RULES.bbox.maxLat).toBeGreaterThan(53.5); // Mohe
    expect(RULES.bbox.minLon).toBeLessThan(73.6); // Pamirs
    expect(RULES.bbox.maxLon).toBeGreaterThan(135.0); // Heilongjiang
  });
});
