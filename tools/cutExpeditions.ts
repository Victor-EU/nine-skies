/**
 * Cut the authored expeditions into the bundle the app flies (F38).
 *
 *   npm run content:expeditions
 *
 * The same shape `tools/cutStations.ts` uses, for the same reason: the app
 * cannot read YAML off disk and must not re-derive a route's geometry for
 * itself. What it fetches is what the content gate flew - the same legs, the
 * same projection, the same pacing - so "this route clears the ground" stays
 * a claim about the flight the player is actually given.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadExpeditions, planFor } from "./expedition.ts";
import { pathFrom } from "../engine/src/expedition/path.ts";
import {
  BUNDLE_VERSION,
  type ExpeditionBundle,
} from "../engine/src/expedition/runner.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const plans = loadExpeditions(join(root, "content", "expeditions")).map(planFor);
const bundle: ExpeditionBundle = { version: BUNDLE_VERSION, expeditions: plans };

const out = join(root, "app", "public", "expeditions.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(bundle, null, 2)}\n`);

for (const plan of plans) {
  const path = pathFrom(plan.points);
  console.log(`\n  ${plan.id} · ${path.lengthKm.toFixed(0)} km · cruise ${plan.cruiseKmPerMin} km/min`);
  for (const leg of plan.legs)
    console.log(`    ${leg.name.padEnd(24)} ${leg.mode.padEnd(8)} to km ${leg.endKm.toFixed(0).padStart(5)}`);
  console.log(`    beats: ${plan.beats.map((b) => `${b.name ?? b.id} at ${b.km.toFixed(0)}`).join(", ")}`);
}
console.log(`\n  wrote ${plans.length} expedition(s) to app/public/expeditions.json\n`);
