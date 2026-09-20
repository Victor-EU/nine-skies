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
  "comparison",
] as const;

export type CardType = (typeof CARD_TYPES)[number];

export interface Card {
  id: string;
  type: CardType;
  region: string;
  names: { zh: string; en: string; pinyin?: string };
  trigger: { lat: number; lon: number; radius_km: number };
  one_liner: string;
  read_more: string;
  figure: { value: number; unit: string; label: string };
  illustration_id: string;
  sources: string[];
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
}

export const EXPEDITION_RULES = {
  /** GDD, "Expeditions": nine curated journeys of 15-35 minutes. */
  minMinutes: 15,
  maxMinutes: 35,
  /** Two waypoints closer than this are a corner, not a leg. */
  minLegKm: 25,
  /** Above the aircraft's absolute ceiling nothing can start. */
  maxStartAltitudeM: 6000,
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
  }

  return issues;
}
