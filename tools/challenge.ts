/**
 * Load an authored challenge and turn it into something flyable.
 *
 * Node-only, like `expedition.ts`, and for the same reason: it reads YAML off
 * disk. The projection happens here, once, so the check tool and the runtime
 * bundle get the same metres — a challenge whose gate is in a different place
 * offline from in the game would make the report a fiction (D21's argument).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { Challenge, GateSpec, ObjectiveSpec } from "../content/schema.ts";
import { projectAlbers } from "../engine/src/terrain/worldGrid.ts";
import { dayOfYear, sunPosition } from "../engine/src/sim/solar.ts";
import { gateAcross, type Objective } from "../engine/src/challenge/objectives.ts";
import {
  objectiveFromPlan,
  type ChallengePlan,
  type ObjectivePlan,
} from "../engine/src/challenge/plan.ts";
import { specFromPlan } from "../engine/src/challenge/plan.ts";
import type { ChallengeSpec, Deadline } from "../engine/src/challenge/challenge.ts";
import type { CoursePoint } from "../engine/src/challenge/fly.ts";
import { MODE_GROUND_KM_PER_MIN, type SpeedMode } from "../engine/src/sim/scale.ts";
import type { Waypoint } from "./corridor.ts";

export function loadChallenge(path: string): Challenge {
  return parse(readFileSync(path, "utf8")) as Challenge;
}

export function loadChallenges(dir: string): Challenge[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => loadChallenge(join(dir, f)));
}

const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function gateFrom(g: GateSpec) {
  const { eastM, northM } = projectAlbers(g.lat, g.lon);
  return gateAcross(eastM, northM, toRad(g.bearing_deg), g.width_km * 1000, g.floor_m, g.ceiling_m);
}

/** One authored objective, projected into the form the engine is handed. */
export function objectivePlanFrom(o: ObjectiveSpec): ObjectivePlan {
  switch (o.kind) {
    case "land":
    case "reach": {
      const { eastM, northM } = projectAlbers(o.lat!, o.lon!);
      return {
        kind: "disc",
        id: o.id,
        label: o.label,
        eastM,
        northM,
        radiusM: o.radius_km! * 1000,
        maxAglM: o.max_agl_m,
        maxGroundSpeedKmPerMin: o.max_speed ? MODE_GROUND_KM_PER_MIN[o.max_speed] : undefined,
      };
    }
    case "gates":
      return { kind: "gates", id: o.id, label: o.label, gates: (o.gates ?? []).map(gateFrom) };
    case "hold-altitude":
      return {
        kind: "band",
        id: o.id,
        label: o.label,
        minM: o.min_m!,
        maxM: o.max_m!,
        aboveGround: o.above_ground,
        seconds: o.seconds!,
      };
    case "instruments":
      return {
        kind: "band",
        id: o.id,
        label: o.label,
        minM: o.min_m!,
        maxM: o.max_m!,
        aboveGround: o.above_ground,
        seconds: o.seconds!,
        headingRad: toRad(o.heading_deg!),
        headingToleranceRad: toRad(o.heading_tolerance_deg!),
      };
    case "follow":
      return {
        kind: "line",
        id: o.id,
        label: o.label,
        points: (o.points ?? []).map((p) => projectAlbers(p.lat, p.lon)),
        corridorM: o.corridor_km! * 1000,
      };
  }
}

export function objectiveFrom(o: ObjectiveSpec): Objective {
  return objectiveFromPlan(objectivePlanFrom(o));
}

/**
 * Sunset, in Beijing minutes after midnight, at a place and a date.
 *
 * The horizon is -0.833 degrees, not zero: refraction lifts the sun by about
 * 34 arcminutes and its disc is another 16, which together are the four
 * minutes between "the centre is level with the horizon" and "the last of it
 * has gone". On a challenge whose whole content is arriving before the sun
 * goes down, four minutes is worth having right.
 */
export const HORIZON_DEG = -0.833;

export function sunsetMinutes(latDeg: number, lonDeg: number, month: number): number | null {
  const doy = dayOfYear(month);
  let lo = 720;
  let hi = 1439;
  if (sunPosition(lo, latDeg, lonDeg, doy).elevationDeg < HORIZON_DEG) return null;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (sunPosition(mid, latDeg, lonDeg, doy).elevationDeg > HORIZON_DEG) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function deadlineFrom(c: Challenge): Deadline | undefined {
  const d = c.deadline;
  if (!d) return undefined;
  if (d.kind === "clock") {
    const [h, m] = (d.at ?? "0:00").split(":").map(Number);
    return { clockMinutes: (h ?? 0) * 60 + (m ?? 0), label: d.label };
  }
  const minutes = sunsetMinutes(d.lat!, d.lon!, c.month);
  // A sun that never sets - and in China's latitudes it always does - would
  // be a deadline of infinity, which is no deadline. Say so rather than
  // silently handing back a challenge that cannot be lost.
  return minutes === null ? undefined : { clockMinutes: minutes, label: d.label };
}

/** The authored challenge, projected once, as the bundle carries it. */
export function planFrom(c: Challenge): ChallengePlan {
  const { eastM, northM } = projectAlbers(c.start.lat, c.start.lon);
  return {
    id: c.id,
    name: c.name,
    bite: c.bite,
    speed: c.speed as SpeedMode,
    start: {
      eastM,
      northM,
      altitudeM: c.start.altitude_m,
      headingRad: toRad(c.start.heading_deg),
      month: c.month,
      clockMinutes: c.start_hour * 60,
    },
    objectives: c.objectives.map(objectivePlanFrom),
    deadline: deadlineFrom(c),
  };
}

/** The authored challenge as the engine runs it, for the offline probe. */
export function specFrom(c: Challenge): ChallengeSpec {
  return specFromPlan(planFrom(c));
}

/**
 * The course a challenge implies: start, then every objective in order.
 *
 * Not the route the player will fly — there is no route, that is the point of
 * a challenge — but the shortest thing that visits everything it asks for, so
 * a time budget and a deadline have something to be measured against. A
 * player who flies further than this has only made it harder.
 */
export function courseOf(c: Challenge): Waypoint[] {
  const points: Waypoint[] = [projectAlbers(c.start.lat, c.start.lon)];
  for (const o of c.objectives) {
    if (o.kind === "land" || o.kind === "reach") points.push(projectAlbers(o.lat!, o.lon!));
    else if (o.kind === "gates") for (const g of o.gates ?? []) points.push(projectAlbers(g.lat, g.lon));
    else if (o.kind === "follow") for (const p of o.points ?? []) points.push(projectAlbers(p.lat, p.lon));
  }
  return points;
}

/**
 * Every lat/lon a challenge names, so the ground under it can be read.
 *
 * Here rather than in the check because the committed patch of ground needs
 * the same list (D39): the places are what a stale patch is diagnosed
 * against, and two copies of this would let a check and an artefact disagree
 * about what a challenge is written over.
 */
export function placesOf(c: Challenge): Array<{ what: string; lat: number; lon: number }> {
  const places = [{ what: "start", lat: c.start.lat, lon: c.start.lon }];
  for (const o of c.objectives) {
    if (o.kind === "land" || o.kind === "reach")
      places.push({ what: `${o.id} centre`, lat: o.lat!, lon: o.lon! });
    else if (o.kind === "gates")
      (o.gates ?? []).forEach((g, i) =>
        places.push({ what: `${o.id} gate ${i + 1}`, lat: g.lat, lon: g.lon }),
      );
    else if (o.kind === "follow")
      (o.points ?? []).forEach((p, i) =>
        places.push({ what: `${o.id} point ${i + 1}`, lat: p.lat, lon: p.lon }),
      );
  }
  return places;
}

/**
 * The polyline the autopilot is actually steered along.
 *
 * `courseOf` is the challenge's own places, which is what a time budget is
 * measured over. This is what the probe flies, and they are not the same
 * list: a hold has no place in it, so `courseFor` synthesises a point at the
 * end of its run, and that point can be tens of kilometres off any objective.
 * Committing ground under `courseOf` would leave a hold flying over a hole
 * (D39).
 */
export function flownCourse(c: Challenge): Waypoint[] {
  return [
    projectAlbers(c.start.lat, c.start.lon),
    ...courseFor(c).map((p) => ({ eastM: p.eastM, northM: p.northM })),
  ];
}

export function courseKm(c: Challenge): number {
  const points = courseOf(c);
  let km = 0;
  for (let i = 1; i < points.length; i++)
    km += Math.hypot(points[i]!.eastM - points[i - 1]!.eastM, points[i]!.northM - points[i - 1]!.northM) / 1000;
  return km;
}

export function minutesFor(c: Challenge): number {
  return courseKm(c) / MODE_GROUND_KM_PER_MIN[c.speed as SpeedMode];
}

/**
 * The course an autopilot flies to prove a challenge completable.
 *
 * Objectives in the order they are written, which is the order they are meant
 * to be met: a challenge whose objectives only work in some other order is
 * one the author should reorder, and the probe failing is how they find out.
 *
 * A hold has no place in it, only a duration, so it becomes a straight run of
 * exactly that many seconds from wherever the previous objective left the
 * aircraft — on the authored heading for `instruments`, and on the course so
 * far for `hold-altitude`. That is the literal reading of *hold this* and it
 * is the cheapest thing that can be flown.
 */
export function courseFor(c: Challenge): CoursePoint[] {
  const points: CoursePoint[] = [];
  const speed = c.speed as SpeedMode;
  const metresPerSecond = (MODE_GROUND_KM_PER_MIN[speed] * 1000) / 60;
  let atE: number;
  let atN: number;
  let heading = toRad(c.start.heading_deg);
  ({ eastM: atE, northM: atN } = projectAlbers(c.start.lat, c.start.lon));

  const push = (p: CoursePoint): void => {
    const dx = p.eastM - atE;
    const dy = p.northM - atN;
    if (dx !== 0 || dy !== 0) heading = Math.atan2(dx, dy);
    atE = p.eastM;
    atN = p.northM;
    points.push(p);
  };

  for (const o of c.objectives) {
    if (o.kind === "land" || o.kind === "reach") {
      const { eastM, northM } = projectAlbers(o.lat!, o.lon!);
      push({
        eastM,
        northM,
        // Aim for the middle of the band rather than its edge: an autopilot
        // that flew the ceiling would report a pass that a metre of
        // turbulence would take away.
        altitude:
          o.kind === "land" ? { kind: "agl", m: o.max_agl_m! / 2 } : { kind: "hold" },
        reachedWithinM: (o.radius_km! * 1000) / 2,
      });
    } else if (o.kind === "gates") {
      for (const g of o.gates ?? []) {
        const { eastM, northM } = projectAlbers(g.lat, g.lon);
        push({
          eastM,
          northM,
          altitude: { kind: "msl", m: (g.floor_m + g.ceiling_m) / 2 },
          reachedWithinM: 200,
        });
      }
    } else if (o.kind === "follow") {
      for (const p of o.points ?? []) {
        const { eastM, northM } = projectAlbers(p.lat, p.lon);
        push({
          eastM,
          northM,
          altitude: { kind: "hold" },
          reachedWithinM: (o.corridor_km! * 1000) / 4,
        });
      }
    } else {
      const course = o.kind === "instruments" ? toRad(o.heading_deg!) : heading;
      // A little over the duration, because the run has to still be inside
      // the band when the last second is credited.
      const run = metresPerSecond * o.seconds! * 1.1;
      push({
        eastM: atE + Math.sin(course) * run,
        northM: atN + Math.cos(course) * run,
        altitude: o.above_ground
          ? { kind: "agl", m: (o.min_m! + o.max_m!) / 2 }
          : { kind: "msl", m: (o.min_m! + o.max_m!) / 2 },
        reachedWithinM: metresPerSecond,
      });
    }
  }
  return points;
}
