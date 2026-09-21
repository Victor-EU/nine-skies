/**
 * Discovery card schema (build plan D11).
 *
 * Cards are data, validated in CI, so that 230 of them are a content problem
 * rather than an engineering one. If authoring ever needs an engineer, the
 * content-volume risk quietly becomes a schedule risk.
 */

export const CARD_TYPES = [
  "region",
  "hero-landmark",
  "point-of-interest",
  "city",
  "weather",
  "food",
  "people",
] as const;

export type CardType = (typeof CARD_TYPES)[number];

/**
 * The nine skies, as a closed vocabulary with ids.
 *
 * `region` was a free string, and two of the three authored cards named a
 * region that is not one of the nine -- by one character, a hyphen where the
 * GDD's table has an en dash. Nothing could see it: a journal that groups by
 * that string shows eleven regions for a nine-region game, one of them empty
 * and one of them a near-duplicate sitting beside it (F40).
 *
 * So the id is ASCII kebab-case like every other id in this repository, and
 * the display name lives here rather than in 228 files. What this cannot
 * catch is a card filed under the wrong region, which is a reading of the map
 * rather than a spelling of it.
 *
 * There is no `zh` here yet, and that is a gap rather than an omission: the
 * GDD shows place names in characters and English everywhere, and a region is
 * a place name. Nine strings, and they are a writer's, not an engineer's.
 */
export const REGIONS = [
  { id: "dongbei", en: "Northeast (Dongbei)" },
  { id: "north-china-loess", en: "North China Plain & Loess" },
  { id: "inner-mongolia-gobi", en: "Inner Mongolia & Gobi" },
  { id: "xinjiang", en: "Xinjiang" },
  { id: "qinghai-tibet", en: "Qinghai\u2013Tibet Plateau" },
  { id: "sichuan-hengduan", en: "Sichuan Basin & Hengduan" },
  { id: "yunnan-guizhou", en: "Yunnan\u2013Guizhou" },
  { id: "southeast-karst", en: "Southeast & Guangxi karst" },
  { id: "yangtze-coast", en: "Yangtze & East coast" },
] as const;

export type RegionId = (typeof REGIONS)[number]["id"];

export const REGION_IDS: readonly string[] = REGIONS.map((r) => r.id);

export function regionName(id: string): string {
  return REGIONS.find((r) => r.id === id)?.en ?? id;
}

/**
 * How each entry type is meant to fire, from the GDD's own table.
 *
 * Written down because the discovery system has exactly one trigger shape --
 * a circle on the ground (D30) -- and the GDD's eight entry types name five
 * different ways of arriving at an entry. Recording the plan as data is what
 * lets `npm run content:atlas` count how much of the atlas the built trigger
 * can carry, instead of that being a paragraph somebody has to remember.
 *
 * - `disc`      a catchment at a place, which is what `TriggerField` tests
 * - `on-entry`  a catchment at *another entry's* place: the food of a city,
 *               the people of a landmark. Same shape, and the schema's
 *               anti-stacking rule currently rejects it (F40)
 * - `boundary`  crossing into a region, which is an area and not a point
 *               (F37, and an open schema question)
 * - `condition` experiencing weather, which is a state rather than a place
 * - `progress`  a rule about what the player has done, not where they are
 */
export const TRIGGER_KINDS = ["disc", "on-entry", "boundary", "condition", "progress"] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export interface EntryPlan {
  readonly type: CardType | "comparison";
  readonly target: number;
  readonly trigger: TriggerKind;
  /** The GDD's own words for how it fires. */
  readonly how: string;
}

/** GDD, "Entry types and volume targets". 228 entries. */
export const ENTRY_PLAN: readonly EntryPlan[] = [
  { type: "region", target: 9, trigger: "boundary", how: "crossing the region boundary" },
  { type: "hero-landmark", target: 40, trigger: "disc", how: "within 15 km" },
  { type: "point-of-interest", target: 80, trigger: "disc", how: "within 5 km" },
  { type: "city", target: 30, trigger: "disc", how: "overflight" },
  { type: "weather", target: 12, trigger: "condition", how: "experiencing it" },
  { type: "food", target: 25, trigger: "on-entry", how: "overflying the city that owns it" },
  { type: "people", target: 20, trigger: "on-entry", how: "region entry or landmark" },
  {
    type: "comparison",
    target: 12,
    trigger: "progress",
    how: "end of the linking expedition, or both regions complete",
  },
];

export interface Card {
  id: string;
  type: CardType;
  /** One of `REGIONS`, by id. */
  region: string;
  names: { zh: string; en: string; pinyin?: string };
  trigger: { lat: number; lon: number; radius_km: number };
  one_liner: string;
  read_more: string;
  figure: { value: number; unit: string; label: string };
  illustration_id: string;
  sources: string[];
  /**
   * What the journal says about an entry the player has not found.
   *
   * GDD: *a soft hint for each missing entry ("somewhere along the Tian
   * Shan"), never an exact pin.* Optional, because the journal has a hint
   * without one -- the entry's region, which is the weakest thing that can be
   * said and is a pin for nobody. `npm run content:atlas` counts how many
   * entries are relying on that.
   */
  hint?: string;
}

/** GDD rules, enforced rather than hoped for. */
export const RULES = {
  oneLinerMaxWords: 25,
  readMoreMinWords: 80,
  readMoreMaxWords: 120,
  /** Two cards closer than this would both fire and stack. */
  minTriggerSeparationKm: 3,
  /** Mainland China plus Hainan. */
  bbox: { minLon: 73.4, maxLon: 135.2, minLat: 18.0, maxLat: 53.7 },
} as const;

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Great-circle distance in km. */
export function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface Issue {
  /** The id of whatever is at fault - a card, an expedition, a waypoint. */
  subject: string;
  field: string;
  message: string;
}

export function validateCards(cards: Card[]): Issue[] {
  const issues: Issue[] = [];
  const seen = new Map<string, Card>();
  const add = (subject: string, field: string, message: string) =>
    issues.push({ subject, field, message });

  for (const c of cards) {
    const id = c.id ?? "(no id)";

    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.id ?? "")) {
      add(id, "id", "must be kebab-case");
    }
    if (seen.has(c.id)) add(id, "id", "duplicate id");
    seen.set(c.id, c);

    if (!CARD_TYPES.includes(c.type)) {
      add(id, "type", `must be one of ${CARD_TYPES.join(", ")}`);
    }
    if (!c.names?.zh) add(id, "names.zh", "Chinese name is required on every card");
    if (!c.names?.en) add(id, "names.en", "English name is required on every card");

    // A free string here is how "Qinghai-Tibet Plateau" and "Qinghai-Tibet
    // Plateau" became two regions in a nine-region game (F40).
    if (!REGION_IDS.includes(c.region ?? ""))
      add(id, "region", `"${c.region}" is not one of the nine; use ${REGION_IDS.join(", ")}`);

    const t = c.trigger;
    if (!t) {
      add(id, "trigger", "missing");
    } else {
      const { bbox } = RULES;
      if (t.lat < bbox.minLat || t.lat > bbox.maxLat)
        add(id, "trigger.lat", `${t.lat} is outside China`);
      if (t.lon < bbox.minLon || t.lon > bbox.maxLon)
        add(id, "trigger.lon", `${t.lon} is outside China`);
      if (!(t.radius_km > 0)) add(id, "trigger.radius_km", "must be positive");
    }

    const one = wordCount(c.one_liner ?? "");
    if (one === 0) add(id, "one_liner", "missing");
    else if (one > RULES.oneLinerMaxWords)
      add(id, "one_liner", `${one} words, limit is ${RULES.oneLinerMaxWords}`);

    const more = wordCount(c.read_more ?? "");
    if (more === 0) add(id, "read_more", "missing");
    else if (more < RULES.readMoreMinWords || more > RULES.readMoreMaxWords)
      add(
        id,
        "read_more",
        `${more} words, must be ${RULES.readMoreMinWords}-${RULES.readMoreMaxWords}`,
      );

    if (c.figure == null || typeof c.figure.value !== "number")
      add(id, "figure", "every card carries exactly one number");
    if (!c.figure?.unit) add(id, "figure.unit", "missing");
    if (!c.figure?.label) add(id, "figure.label", "missing");

    if (!c.illustration_id) add(id, "illustration_id", "missing");

    // The fact-check pass is generated from these; a card without one cannot
    // be reviewed, so it cannot ship.
    if (!Array.isArray(c.sources) || c.sources.filter(Boolean).length === 0)
      add(id, "sources", "at least one source note is required");
  }

  // Triggers that would stack on each other.
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i]!;
      const b = cards[j]!;
      if (!a.trigger || !b.trigger) continue;
      const d = haversineKm(a.trigger.lat, a.trigger.lon, b.trigger.lat, b.trigger.lon);
      if (d < RULES.minTriggerSeparationKm) {
        add(a.id, "trigger", `only ${d.toFixed(1)} km from ${b.id}; cards would stack`);
      }
    }
  }

  return issues;
}

/**
 * Expedition schema (build plan D11 and D17).
 *
 * An expedition is waypoints, a speed for each leg, a month and a start hour.
 * Narration beats join it at phase 2; the route and its pacing are here now
 * because D17 makes a route something an autopilot has to fly over real
 * ground before it counts as data, and that check needs something to read.
 */

export const SPEED_MODES = ["low", "cruise", "boost"] as const;
export type SpeedName = (typeof SPEED_MODES)[number];

export interface RoutePoint {
  id: string;
  name: string;
  zh?: string;
  lat: number;
  lon: number;
  /** How the leg *into* this point is flown. Absent on the first point. */
  speed?: SpeedName;
}

/**
 * How high above its destination an expedition ends (D19).
 *
 * A claim the route has to be able to keep: the check flies the lowest
 * trajectory that legally exists and fails if even that arrives higher.
 * Authoring it is what turns "we hope it gets there" into something CI can
 * hold the route to.
 *
 * Optional, because the honest arrival for a route is not known until it has
 * been measured and a required field would be filled in with a guess. Absent
 * means the check reports the measured height and passes - not a silent skip,
 * a number printed where an author will see it every run.
 *
 * There is deliberately no `landing` here, and F22 is why: the altitude floor
 * keeps its terrain margin all the way to the threshold, so the lowest legal
 * trajectory over flat ground still arrives 300 m up. Until the floor tapers
 * to the arrival height, a landing is a claim this check cannot evaluate, and
 * a field that always fails is worse than one that does not exist yet.
 */
export interface Arrival {
  /** Metres above the destination's ground. */
  altitude_m: number;
  /** Metres the route must keep above terrain. Defaults to 300 (F20). */
  clearance_m?: number;
  /**
   * How far out the destination is approached at `approach` pace, kilometres.
   *
   * Deliberately not a leg speed. `approach` is the one mode that changes the
   * horizontal compression rather than the airspeed, so letting it be written
   * on any waypoint would scatter changes of scale through a route and make
   * two stretches of the same flight not comparable by eye. Here it can only
   * ever be the last few tens of kilometres into somewhere, which is the one
   * case that needed it: a destination in a valley behind a ridge cannot be
   * descended onto at any constant pace (F31).
   *
   * Absent means the final leg is flown at its authored speed to the end.
   */
  approach_km?: number;
}

export interface Expedition {
  id: string;
  name: string;
  contrast: string;
  teaches: string;
  /** 1-12. Authored, not simulated: each expedition fixes its own month. */
  month: number;
  /** 0-23, Beijing time, which is the only time zone China has. */
  start_hour: number;
  start_altitude_m: number;
  route: RoutePoint[];
  arrival?: Arrival;
}

export const EXPEDITION_RULES = {
  /** GDD, "Expeditions": nine curated journeys of 15-35 minutes. */
  minMinutes: 15,
  maxMinutes: 35,
  /** Two waypoints closer than this are a corner, not a leg. */
  minLegKm: 25,
  /** Above the aircraft's absolute ceiling nothing can start. */
  maxStartAltitudeM: 6000,
  /**
   * What an unstated arrival is checked against, and what an authored one is
   * measured with. 300 m is Expedition 1's authored margin (F20) and the
   * value every route check in the repo has used since.
   */
  defaultClearanceM: 300,
  /**
   * The lowest arrival the flown check can tell from a crash, metres.
   *
   * One second of full descent, because that is how far the probe moves
   * vertically between samples: aim it at the ground itself and it steps
   * through the floor and reports a flight that never finished (F23). A real
   * landing is authored at threshold-crossing height anyway - aviation puts
   * that at fifty feet - so this is a rule about what the instrument can see
   * rather than a restriction on what an expedition may do.
   */
  minArrivalM: 20,
  /**
   * The shortest approach worth authoring, kilometres.
   *
   * Below this the pace change lasts a few seconds and buys almost no
   * descent, so it would be a change of scale the player can see and cannot
   * benefit from - the worst of both.
   */
  minApproachKm: 10,
} as const;

export function validateExpeditions(expeditions: Expedition[]): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  const add = (subject: string, field: string, message: string) =>
    issues.push({ subject, field, message });

  for (const e of expeditions) {
    const id = e.id ?? "(no id)";
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id ?? "")) add(id, "id", "must be kebab-case");
    if (seen.has(e.id)) add(id, "id", "duplicate id");
    seen.add(e.id);

    if (!e.name) add(id, "name", "missing");
    if (!e.contrast) add(id, "contrast", "every expedition is built on one contrast");
    if (!e.teaches) add(id, "teaches", "say what it teaches, or it is a flight not an expedition");

    if (!Number.isInteger(e.month) || e.month < 1 || e.month > 12)
      add(id, "month", `${e.month} is not a month`);
    if (!Number.isInteger(e.start_hour) || e.start_hour < 0 || e.start_hour > 23)
      add(id, "start_hour", `${e.start_hour} is not an hour`);
    if (!(e.start_altitude_m >= 0) || e.start_altitude_m > EXPEDITION_RULES.maxStartAltitudeM)
      add(id, "start_altitude_m", `must be 0-${EXPEDITION_RULES.maxStartAltitudeM} m`);

    const route = e.route ?? [];
    if (route.length < 2) {
      add(id, "route", "needs at least a start and a destination");
      continue;
    }

    route.forEach((p, i) => {
      const where = `route[${i}] ${p.id ?? "(no id)"}`;
      if (!p.id) add(id, where, "every waypoint needs an id");
      if (!p.name) add(id, where, "every waypoint needs a name");
      const { bbox } = RULES;
      if (!(p.lat >= bbox.minLat && p.lat <= bbox.maxLat))
        add(id, `${where}.lat`, `${p.lat} is outside China`);
      if (!(p.lon >= bbox.minLon && p.lon <= bbox.maxLon))
        add(id, `${where}.lon`, `${p.lon} is outside China`);

      if (i === 0) {
        // The first point is where the aircraft starts, so there is no leg
        // into it and a speed there would silently do nothing.
        if (p.speed !== undefined)
          add(id, `${where}.speed`, "the first waypoint has no leg into it");
      } else {
        if (p.speed === undefined) add(id, `${where}.speed`, "every leg names its speed");
        else if (!SPEED_MODES.includes(p.speed))
          add(id, `${where}.speed`, `must be one of ${SPEED_MODES.join(", ")}`);
        const prev = route[i - 1]!;
        const legKm = haversineKm(prev.lat, prev.lon, p.lat, p.lon);
        if (legKm < EXPEDITION_RULES.minLegKm)
          add(id, where, `only ${legKm.toFixed(1)} km from ${prev.id}; that is a corner, not a leg`);
      }
    });

    const approachKm = e.arrival?.approach_km;
    if (approachKm !== undefined) {
      const last = route[route.length - 1];
      const penultimate = route[route.length - 2];
      const lastLegKm =
        last && penultimate ? haversineKm(penultimate.lat, penultimate.lon, last.lat, last.lon) : 0;
      if (!(approachKm >= EXPEDITION_RULES.minApproachKm))
        add(id, "arrival.approach_km", `must be at least ${EXPEDITION_RULES.minApproachKm} km`);
      else if (approachKm >= lastLegKm)
        add(
          id,
          "arrival.approach_km",
          `${approachKm} km is the whole last leg (${lastLegKm.toFixed(0)} km); ` +
            "an approach is the end of a leg, not a replacement for one",
        );
    }

    // The arrival is schema-checked here and flown in `tools/routeCheck.ts`.
    // Only the first can run without a built corridor, so it does what it
    // can: the contradictions that are visible in the file itself.
    const a = e.arrival;
    if (a !== undefined) {
      if (!(a.altitude_m >= 0))
        add(id, "arrival.altitude_m", `must be metres above the destination, not ${a.altitude_m}`);
      const clearance = a.clearance_m ?? EXPEDITION_RULES.defaultClearanceM;
      if (!(clearance >= 0)) add(id, "arrival.clearance_m", `must be metres, not ${clearance}`);
      // An arrival below the clearance used to be a contradiction: the floor
      // kept its full margin to the last kilometre, so nothing satisfied both
      // (F21, F22). D20 tapers the floor to the arrival height as the
      // destination comes within descending distance, so this is now an
      // ordinary landing - and what it costs is terrain margin in the
      // approach, which the flown check prints rather than guesses at.
      //
      // What is left is a limit of the instrument rather than of the route.
      if (a.altitude_m > 0 && a.altitude_m < EXPEDITION_RULES.minArrivalM)
        add(
          id,
          "arrival.altitude_m",
          `${a.altitude_m} m is below the ${EXPEDITION_RULES.minArrivalM} m the flown check ` +
            `can resolve; author the threshold-crossing height (F23)`,
        );
      if (a.altitude_m === 0)
        add(
          id,
          "arrival.altitude_m",
          `zero is the ground itself, which the check cannot tell from a crash; ` +
            `author the threshold-crossing height instead (F23)`,
        );
    }
  }

  return issues;
}

/**
 * Comparison spread schema (GDD, "Comparison spreads"; build plan D34).
 *
 * A spread is not a card, and it was one: `comparison` sat in `CARD_TYPES`
 * and a spread written as a card passed every check in this file. That is the
 * worst shape a validation error can take, because CI stays green over
 * content that cannot be the thing it claims to be -- one figure where the
 * GDD asks for six measures a side, a catchment at one of its two subjects so
 * it fires as a flyover fifteen kilometres from the Bund instead of at the
 * end of the expedition, and nowhere at all to name the other side (F40).
 *
 * So it gets its own file type, with the two things a card cannot hold: two
 * sides, and the same measures on both. The unlock is a rule about what the
 * player has done rather than a place, and it lives in
 * `engine/src/journal/spread.ts` where the atlas can evaluate it.
 */

/** GDD: *the same measures* -- elevation, two temperatures, rain, density. */
export const SPREAD_MEASURES = [
  { key: "elevation_m", unit: "m", label: "elevation" },
  { key: "january_mean_c", unit: "°C", label: "January mean" },
  { key: "july_mean_c", unit: "°C", label: "July mean" },
  { key: "annual_rain_mm", unit: "mm", label: "annual rainfall" },
  { key: "people_per_km2", unit: "/km²", label: "population density" },
] as const;

export type MeasureKey = (typeof SPREAD_MEASURES)[number]["key"];

export const MEASURE_KEYS: readonly string[] = SPREAD_MEASURES.map((m) => m.key);

export interface SpreadSide {
  /** A card id. The spread shows that entry; it does not restate it. */
  entry: string;
  measures: Partial<Record<MeasureKey, number>>;
  /** GDD: "a dish". A name, in the entry's own language plus English. */
  dish?: string;
  /** GDD: "a landscape sketch". An illustration id, like a card's. */
  sketch?: string;
}

export interface Spread {
  id: string;
  names: { zh: string; en: string };
  /**
   * The expedition whose arrival opens this spread full-screen.
   *
   * Optional: the GDD gives two unlocks and this is the first of them. A
   * spread with no linking expedition can still be reached the other way,
   * by completing both regions in free flight.
   */
  after?: string;
  left: SpreadSide;
  right: SpreadSide;
  sources: string[];
}

export function validateSpreads(
  spreads: Spread[],
  cards: Card[],
  expeditionIds: readonly string[],
): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  const byId = new Map(cards.map((c) => [c.id, c]));
  const add = (subject: string, field: string, message: string) =>
    issues.push({ subject, field, message });

  for (const s of spreads) {
    const id = s.id ?? "(no id)";
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id ?? "")) add(id, "id", "must be kebab-case");
    if (seen.has(s.id)) add(id, "id", "duplicate id");
    seen.add(s.id);

    if (!s.names?.zh) add(id, "names.zh", "a spread is a page with a title");
    if (!s.names?.en) add(id, "names.en", "a spread is a page with a title");
    if (!Array.isArray(s.sources) || s.sources.filter(Boolean).length === 0)
      add(id, "sources", "at least one source note is required");

    if (s.after !== undefined && !expeditionIds.includes(s.after))
      add(id, "after", `no expedition called "${s.after}"`);

    const sides: [string, SpreadSide | undefined][] = [
      ["left", s.left],
      ["right", s.right],
    ];
    for (const [which, side] of sides) {
      if (!side) {
        add(id, which, "a spread has two sides");
        continue;
      }
      if (!byId.has(side.entry))
        add(id, `${which}.entry`, `no card called "${side.entry}"`);
      for (const key of Object.keys(side.measures ?? {}))
        if (!MEASURE_KEYS.includes(key))
          add(id, `${which}.measures.${key}`, `not a measure; use ${MEASURE_KEYS.join(", ")}`);
    }

    if (!s.left || !s.right) continue;

    if (s.left.entry === s.right.entry)
      add(id, "right.entry", "a spread compares two entries, not one twice");

    const l = byId.get(s.left.entry);
    const r = byId.get(s.right.entry);
    if (l && r && l.region === r.region)
      add(
        id,
        "right.entry",
        `both sides are in ${regionName(l.region)}; a spread is the game's thesis, ` +
          `and two entries from one region do not carry it`,
      );

    // The rule that makes it a comparison rather than two cards side by side:
    // the GDD asks for *the same measures*, so a number on one side and not
    // the other is a row the page cannot draw.
    for (const key of MEASURE_KEYS) {
      const onLeft = (s.left.measures ?? {})[key as MeasureKey] !== undefined;
      const onRight = (s.right.measures ?? {})[key as MeasureKey] !== undefined;
      if (onLeft !== onRight)
        add(
          id,
          `measures.${key}`,
          `only ${onLeft ? s.left.entry : s.right.entry} has it; a spread compares like with like`,
        );
    }
  }

  return issues;
}

/**
 * Challenge schema (build plan, workstream D, the *Challenges* row).
 *
 * The plan's line is *"six objective primitives (land-in-radius, gate
 * sequence, reach-before-time, hold-altitude, stay-on-instruments,
 * follow-line) cover all twelve"*. These six kinds are those six names,
 * because they are six different things to write down; the engine behind them
 * is four classes and a deadline, and F43 is why.
 *
 * The GDD names four of the twelve — *land at a 4,411 m airport, thread a
 * gorge at low speed, cross a dust storm on instruments, race the sunset
 * along the Great Wall* — and every one of them was measured before this
 * schema was written. One is authorable today, one needs a decision, one
 * needs the 90 m hero grid, and one needs weather. F43 has the numbers.
 */

export const OBJECTIVE_KINDS = [
  "land",
  "gates",
  "reach",
  "hold-altitude",
  "instruments",
  "follow",
] as const;

export type ObjectiveKind = (typeof OBJECTIVE_KINDS)[number];

export interface ObjectiveSpec {
  kind: ObjectiveKind;
  id: string;
  /** One line, shown as written: "below 200 m over Daocheng Yading". */
  label: string;
  /** `land`, `reach`. */
  lat?: number;
  lon?: number;
  radius_km?: number;
  /** `land`: how low over the airfield's own ground counts as being there. */
  max_agl_m?: number;
  /** `land`: the pace it has to be done at. */
  max_speed?: SpeedName;
  /** `gates`. */
  gates?: GateSpec[];
  /** `hold-altitude`, `instruments`. */
  min_m?: number;
  max_m?: number;
  above_ground?: boolean;
  seconds?: number;
  /** `instruments`. */
  heading_deg?: number;
  heading_tolerance_deg?: number;
  /** `follow`. */
  points?: Array<{ lat: number; lon: number }>;
  corridor_km?: number;
}

export interface GateSpec {
  lat: number;
  lon: number;
  /** The course *through* the gate; the gate itself lies across it. */
  bearing_deg: number;
  width_km: number;
  floor_m: number;
  ceiling_m: number;
}

export interface DeadlineSpec {
  /**
   * `clock` is a Beijing time written down; `sunset` is computed where the
   * challenge ends, which is the only kind the GDD actually asks for.
   */
  kind: "clock" | "sunset";
  /** `clock`: "18:30", Beijing. */
  at?: string;
  /** `sunset`: where the sun has to still be up. */
  lat?: number;
  lon?: number;
  label: string;
}

export interface Challenge {
  id: string;
  name: string;
  /** One line on what makes it a test rather than a flight. */
  bite: string;
  /** 1-12, fixed the way an expedition's is (D35). */
  month: number;
  /** 0-23, Beijing time. */
  start_hour: number;
  start: { lat: number; lon: number; altitude_m: number; heading_deg: number };
  /** The pace it is flown at. Every width in it is checked against this. */
  speed: SpeedName;
  objectives: ObjectiveSpec[];
  deadline?: DeadlineSpec;
}

export const CHALLENGE_RULES = {
  /**
   * The lowest altitude above ground that exists, metres.
   *
   * `flight.ts` bounces off terrain at `ground + 25` rather than crashing, so
   * a `land` objective authored at or below this is met by flying at the
   * hill. It is the same wall F22 hit from the other side: the route check
   * has no `landing` kind because the altitude floor keeps its margin to the
   * threshold, and the flight model has no landing because it will not let
   * the aeroplane touch. Two systems, one conclusion (F43).
   */
  bounceFloorM: 25,
  /** A `land` has to ask for something below this or it is not an arrival. */
  maxLandAglM: 1000,
  /** GDD, "Challenges": twelve short optional skill tests, about an hour. */
  maxMinutes: 12,
  /** A gate the aeroplane cannot see the far post of is not a gate. */
  maxGateWidthKm: 40,
} as const;

export function validateChallenges(challenges: Challenge[]): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  const add = (subject: string, field: string, message: string) =>
    issues.push({ subject, field, message });
  const { bbox } = RULES;
  const inChina = (lat: number, lon: number): boolean =>
    lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLon && lon <= bbox.maxLon;

  for (const c of challenges) {
    const id = c.id ?? "(no id)";
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.id ?? "")) add(id, "id", "must be kebab-case");
    if (seen.has(c.id)) add(id, "id", "duplicate id");
    seen.add(c.id);
    if (!c.name) add(id, "name", "missing");
    if (!c.bite) add(id, "bite", "say what makes it a test, or it is a flight");
    if (!Number.isInteger(c.month) || c.month < 1 || c.month > 12)
      add(id, "month", `${c.month} is not a month`);
    if (!Number.isInteger(c.start_hour) || c.start_hour < 0 || c.start_hour > 23)
      add(id, "start_hour", `${c.start_hour} is not an hour`);
    if (!SPEED_MODES.includes(c.speed))
      add(id, "speed", `${c.speed} is not one of ${SPEED_MODES.join(", ")}`);

    const start = c.start;
    if (!start) add(id, "start", "a challenge starts somewhere");
    else {
      if (!inChina(start.lat, start.lon)) add(id, "start", "outside China");
      if (!(start.altitude_m >= 0)) add(id, "start.altitude_m", "must be at or above the sea");
      if (!(start.heading_deg >= 0 && start.heading_deg < 360))
        add(id, "start.heading_deg", `${start.heading_deg} is not a bearing`);
    }

    const objectives = c.objectives ?? [];
    if (objectives.length === 0) add(id, "objectives", "a challenge with no objective is a flight");
    const objectiveIds = new Set<string>();
    objectives.forEach((o, i) => {
      const where = `objectives[${i}] ${o.id ?? "(no id)"}`;
      if (!o.id) add(id, where, "every objective needs an id");
      else if (objectiveIds.has(o.id)) add(id, where, "duplicate objective id");
      objectiveIds.add(o.id);
      if (!o.label) add(id, `${where}.label`, "say what the player has to do");
      if (!OBJECTIVE_KINDS.includes(o.kind)) {
        add(id, `${where}.kind`, `${o.kind} is not one of ${OBJECTIVE_KINDS.join(", ")}`);
        return;
      }

      if (o.kind === "land" || o.kind === "reach") {
        if (o.lat === undefined || o.lon === undefined || !inChina(o.lat, o.lon))
          add(id, `${where}`, "needs a lat and lon inside China");
        if (!(o.radius_km! > 0)) add(id, `${where}.radius_km`, "needs a radius");
      }
      if (o.kind === "land") {
        const agl = o.max_agl_m;
        if (agl === undefined) add(id, `${where}.max_agl_m`, "a landing is a height above ground");
        else if (agl <= CHALLENGE_RULES.bounceFloorM)
          add(
            id,
            `${where}.max_agl_m`,
            `${agl} m is at or under the ${CHALLENGE_RULES.bounceFloorM} m the flight model ` +
              `bounces off, so it is met by flying at the ground rather than by flying well`,
          );
        else if (agl > CHALLENGE_RULES.maxLandAglM)
          add(id, `${where}.max_agl_m`, `${agl} m over an airfield is a fly-past, not an arrival`);
        if (o.max_speed !== undefined && !SPEED_MODES.includes(o.max_speed))
          add(id, `${where}.max_speed`, `${o.max_speed} is not a speed mode`);
      }

      if (o.kind === "gates") {
        const gates = o.gates ?? [];
        if (gates.length === 0) add(id, `${where}.gates`, "needs at least one gate");
        gates.forEach((g, j) => {
          const gw = `${where}.gates[${j}]`;
          if (!inChina(g.lat, g.lon)) add(id, gw, "outside China");
          if (!(g.bearing_deg >= 0 && g.bearing_deg < 360))
            add(id, `${gw}.bearing_deg`, `${g.bearing_deg} is not a bearing`);
          if (!(g.width_km > 0)) add(id, `${gw}.width_km`, "a gate needs a width");
          else if (g.width_km > CHALLENGE_RULES.maxGateWidthKm)
            add(id, `${gw}.width_km`, `${g.width_km} km is a region, not a gate`);
          if (!(g.ceiling_m > g.floor_m))
            add(id, `${gw}.ceiling_m`, "the ceiling has to be above the floor");
        });
      }

      if (o.kind === "hold-altitude" || o.kind === "instruments") {
        if (!(o.seconds! > 0)) add(id, `${where}.seconds`, "a hold needs a duration");
        if (!(o.max_m! > o.min_m!)) add(id, `${where}.max_m`, "the band has to have a height");
        if (o.above_ground && o.min_m! < CHALLENGE_RULES.bounceFloorM)
          add(
            id,
            `${where}.min_m`,
            `${o.min_m} m above ground is under the ${CHALLENGE_RULES.bounceFloorM} m ` +
              `the flight model bounces off`,
          );
      }
      if (o.kind === "instruments") {
        if (o.heading_deg === undefined || !(o.heading_deg >= 0 && o.heading_deg < 360))
          add(id, `${where}.heading_deg`, "on instruments means holding a heading");
        if (!(o.heading_tolerance_deg! > 0))
          add(id, `${where}.heading_tolerance_deg`, "needs a tolerance, or it cannot be flown");
      }

      if (o.kind === "follow") {
        const points = o.points ?? [];
        if (points.length < 2) add(id, `${where}.points`, "a line needs two ends");
        for (const p of points)
          if (!inChina(p.lat, p.lon)) add(id, `${where}.points`, "a point outside China");
        if (!(o.corridor_km! > 0)) add(id, `${where}.corridor_km`, "needs a corridor");
      }
    });

    const d = c.deadline;
    if (d) {
      if (!d.label) add(id, "deadline.label", "say what the deadline is, in words");
      if (d.kind === "clock") {
        if (!/^\d{1,2}:\d{2}$/.test(d.at ?? "")) add(id, "deadline.at", "needs a time like 18:30");
      } else if (d.kind === "sunset") {
        if (d.lat === undefined || d.lon === undefined || !inChina(d.lat, d.lon))
          add(id, "deadline", "a sunset happens somewhere; give it a lat and lon");
      } else {
        add(id, "deadline.kind", `${(d as DeadlineSpec).kind} is not clock or sunset`);
      }
    }
  }

  return issues;
}
