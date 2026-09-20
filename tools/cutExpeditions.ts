/**
 * Cut the authored expeditions into the bundle the app flies (F38, F39).
 *
 *   npm run content:expeditions
 *
 * The same shape `tools/cutStations.ts` uses, for the same reason: the app
 * cannot read YAML off disk and must not re-derive a route's geometry for
 * itself. What it fetches is what the content gate flew - the same legs, the
 * same projection, the same pacing - so "this route clears the ground" stays
 * a claim about the flight the player is actually given.
 *
 * It also carries the route's altitude floor (D18), which is why this step
 * needs ground: the floor is the minimum altitude the rest of the route can
 * be flown from, and computing one sample means flying that remainder. At a
 * kilometre a sample that is about ten seconds a route here and an array
 * lookup in the game (F39). A route with no committed section and no built
 * world ships without one rather than with a guessed one.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { flyableFrom, loadExpeditions, loadTriggers, planFor } from "./expedition.ts";
import { atlasBundle, loadCards, loadSpreads } from "./journal.ts";
import { resolveGround } from "./ground.ts";
import { climbFloor } from "../engine/src/sim/route.ts";
import { pathFrom } from "../engine/src/expedition/path.ts";
import { clockString, dayOfYear, solarTimeMinutes } from "../engine/src/sim/solar.ts";
import { unprojectAlbers } from "../engine/src/terrain/worldGrid.ts";
import { NO_FLOOR, type AltitudeFloor } from "../engine/src/expedition/resume.ts";
import {
  BUNDLE_VERSION,
  type ExpeditionBundle,
  type ExpeditionPlan,
} from "../engine/src/expedition/runner.ts";
import { EXPEDITION_RULES, type Expedition } from "../content/schema.ts";

/** One sample per kilometre, which is what the ground under it has. */
export const FLOOR_STRIDE_KM = 1;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function floorFor(expedition: Expedition): AltitudeFloor {
  const ground = resolveGround(
    expedition,
    join(root, "dist-world"),
    join(root, "content", "sections"),
  );
  if (!ground.groundM) return NO_FLOOR;
  const flyable = flyableFrom(expedition, ground.groundM);
  const samples = climbFloor(flyable.route, flyable.ground, {
    strideKm: FLOOR_STRIDE_KM,
    startAltitudeM: expedition.start_altitude_m,
    clearanceM: expedition.arrival?.clearance_m ?? EXPEDITION_RULES.defaultClearanceM,
    ...(expedition.arrival ? { arrivalM: expedition.arrival.altitude_m } : {}),
  });
  return { strideKm: FLOOR_STRIDE_KM, m: samples.map((s) => Math.round(s.floorM)) };
}

const plans: ExpeditionPlan[] = loadExpeditions(join(root, "content", "expeditions")).map(
  (expedition) => planFor(expedition, floorFor(expedition)),
);
const cards = loadTriggers(join(root, "content", "cards"));
const atlas = atlasBundle(
  loadCards(join(root, "content", "cards")),
  loadSpreads(join(root, "content", "spreads")),
);
const bundle: ExpeditionBundle = { version: BUNDLE_VERSION, expeditions: plans, cards, atlas };

const out = join(root, "app", "public", "expeditions.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(bundle)}\n`);

for (const plan of plans) {
  const path = pathFrom(plan.points);
  console.log(`\n  ${plan.id} · ${path.lengthKm.toFixed(0)} km · cruise ${plan.cruiseKmPerMin} km/min`);
  for (const leg of plan.legs)
    console.log(`    ${leg.name.padEnd(24)} ${leg.mode.padEnd(8)} to km ${leg.endKm.toFixed(0).padStart(5)}`);
  console.log(`    beats: ${plan.beats.map((b) => `${b.name ?? b.id} at ${b.km.toFixed(0)}`).join(", ")}`);
  // The clock, and the only thing it can say without a flight model: how far
  // the sun at each end of the route is from the one clock China keeps (F41).
  const day = dayOfYear(plan.month);
  const ends = [plan.points[0]!, plan.points[plan.points.length - 1]!].map((p) =>
    unprojectAlbers(p.eastM, p.northM),
  );
  const start = plan.startHour * 60;
  console.log(
    `    clock: month ${plan.month}, ${clockString(start)} Beijing · sun reads ` +
      ends
        .map((e) => clockString(solarTimeMinutes(start, e.lonDeg, day)))
        .join(" at the start, ") +
      ` at the end · ${(
        (solarTimeMinutes(start, ends[0]!.lonDeg, day) -
          solarTimeMinutes(start, ends[1]!.lonDeg, day)) /
        60
      ).toFixed(2)} h of sun crossed`,
  );
  console.log(
    plan.floor.m.length === 0
      ? "    ⚠ no altitude floor: no world and no committed section for this route"
      : `    floor: ${plan.floor.m.length} samples at ${plan.floor.strideKm} km, ` +
        `peak ${Math.max(...plan.floor.m).toLocaleString()} m`,
  );
}
console.log(
  `\n  ${cards.length} card catchment(s): ` +
    cards.map((c) => `${c.name} ${(c.radiusM / 1000).toFixed(0)} km`).join(", "),
);
console.log(
  `  atlas: ${atlas.entries.length} entr${atlas.entries.length === 1 ? "y" : "ies"} across ` +
    `${atlas.regions.filter((r) => atlas.entries.some((e) => e.region === r.id)).length} of ` +
    `${atlas.regions.length} regions · ${atlas.spreads.length} spread(s)`,
);
const bytes = JSON.stringify(bundle).length;
console.log(
  `\n  wrote ${plans.length} expedition(s) to app/public/expeditions.json ` +
    `(${(bytes / 1024).toFixed(1)} kB)\n`,
);
