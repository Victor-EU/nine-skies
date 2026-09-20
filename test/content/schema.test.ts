import { describe, expect, it } from "vitest";
import {
  RULES,
  haversineKm,
  validateCards,
  validateExpeditions,
  wordCount,
  type Card,
  type Expedition,
} from "../../content/schema.js";

function card(over: Partial<Card> = {}): Card {
  return {
    id: "test-card",
    type: "hero-landmark",
    region: "xinjiang",
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

function expedition(over: Partial<Expedition> = {}): Expedition {
  return {
    id: "test-run",
    name: "Test Run",
    contrast: "Low to high",
    teaches: "That the west is higher",
    month: 11,
    start_hour: 7,
    start_altitude_m: 1200,
    route: [
      { id: "shanghai", name: "Shanghai", lat: 31.23, lon: 121.47 },
      { id: "wuhan", name: "Wuhan", lat: 30.59, lon: 114.31, speed: "low" },
      { id: "lhasa", name: "Lhasa", lat: 29.65, lon: 91.1, speed: "cruise" },
    ],
    ...over,
  };
}

const expeditionFields = (list: Expedition[]) =>
  validateExpeditions(list).map((i) => i.field);

describe("expedition validation", () => {
  it("passes a well-formed expedition", () => {
    expect(validateExpeditions([expedition()])).toEqual([]);
  });

  it("insists every leg names its speed", () => {
    const route = expedition().route.map((p, i) => {
      if (i !== 2) return p;
      const { speed: _dropped, ...withoutSpeed } = p;
      return withoutSpeed;
    });
    expect(expeditionFields([expedition({ route })])).toContain("route[2] lhasa.speed");
  });

  it("rejects a speed on the first waypoint, where there is no leg", () => {
    // Not pedantry: it would read as "fly the first leg at low" and do
    // nothing at all, which is the kind of silence that survives review.
    const route = expedition().route.map((p, i) =>
      i === 0 ? { ...p, speed: "low" as const } : p,
    );
    expect(expeditionFields([expedition({ route })])).toContain("route[0] shanghai.speed");
  });

  it("rejects a speed that is not a mode", () => {
    const route = expedition().route.map((p, i) =>
      i === 1 ? { ...p, speed: "fast" as never } : p,
    );
    expect(expeditionFields([expedition({ route })])).toContain("route[1] wuhan.speed");
  });

  it("rejects a waypoint outside China", () => {
    const route = expedition().route.map((p, i) => (i === 1 ? { ...p, lon: 10 } : p));
    expect(expeditionFields([expedition({ route })])).toContain("route[1] wuhan.lon");
  });

  it("rejects two waypoints close enough to be a corner", () => {
    const route = [
      ...expedition().route,
      { id: "lhasa-again", name: "Lhasa again", lat: 29.66, lon: 91.11, speed: "low" as const },
    ];
    expect(expeditionFields([expedition({ route })])).toContain("route[3] lhasa-again");
  });

  it("rejects a route with nowhere to go", () => {
    expect(expeditionFields([expedition({ route: [expedition().route[0]!] })])).toContain("route");
  });

  it("rejects an impossible month, hour or start altitude", () => {
    expect(expeditionFields([expedition({ month: 13 })])).toContain("month");
    expect(expeditionFields([expedition({ start_hour: 24 })])).toContain("start_hour");
    expect(expeditionFields([expedition({ start_altitude_m: 9000 })])).toContain(
      "start_altitude_m",
    );
  });

  it("insists an expedition says what it is for", () => {
    expect(expeditionFields([expedition({ contrast: "" })])).toContain("contrast");
    expect(expeditionFields([expedition({ teaches: "" })])).toContain("teaches");
  });

  it("catches duplicate ids", () => {
    expect(expeditionFields([expedition(), expedition()])).toContain("id");
  });
});

describe("an arrival is a claim, and the schema checks the ones a parser can", () => {
  it("accepts an expedition with no arrival at all", () => {
    // Absent is the honest state until somebody has measured one. The flown
    // check prints the height it reaches; it does not invent a claim.
    expect(validateExpeditions([expedition()])).toEqual([]);
  });

  it("accepts an arrival above the clearance the route keeps", () => {
    expect(
      validateExpeditions([expedition({ arrival: { altitude_m: 1600 } })]),
    ).toEqual([]);
  });

  it("accepts an arrival below the clearance, which is what a landing is", () => {
    // This was rejected until D20, on F21's identity: the floor kept its full
    // margin to the last kilometre, so nothing satisfied both. The floor now
    // tapers to the arrival height as the destination comes within descending
    // distance, and the flown check prices what that costs (F23).
    expect(validateExpeditions([expedition({ arrival: { altitude_m: 100 } })])).toEqual([]);
    expect(validateExpeditions([expedition({ arrival: { altitude_m: 50 } })])).toEqual([]);
  });

  it("rejects an arrival finer than the flown check can resolve", () => {
    // Not a rule about routes. The probe steps eighteen metres of altitude a
    // second, so below that it cannot tell arriving from flying into the
    // ground, and zero is the ground itself.
    expect(expeditionFields([expedition({ arrival: { altitude_m: 5 } })])).toContain(
      "arrival.altitude_m",
    );
    expect(expeditionFields([expedition({ arrival: { altitude_m: 0 } })])).toContain(
      "arrival.altitude_m",
    );
  });

  it("lets a route lower its own clearance", () => {
    expect(
      validateExpeditions([expedition({ arrival: { altitude_m: 100, clearance_m: 50 } })]),
    ).toEqual([]);
  });

  it("rejects a negative arrival or clearance", () => {
    expect(expeditionFields([expedition({ arrival: { altitude_m: -1 } })])).toContain(
      "arrival.altitude_m",
    );
    expect(
      expeditionFields([expedition({ arrival: { altitude_m: 500, clearance_m: -1 } })]),
    ).toContain("arrival.clearance_m");
  });
});
