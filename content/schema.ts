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
