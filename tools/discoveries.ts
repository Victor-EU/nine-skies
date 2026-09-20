/**
 * Which cards each expedition actually flies past. (Finding F37.)
 *
 *   npm run content:discoveries
 *
 * A report and never a gate, for the same reason `content:teaches` is one: a
 * route that passes no cards is not broken code, it is a route and a card set
 * that have not been introduced to each other, and which of the two moves is a
 * writing decision. Failing a build over it would be answering it.
 *
 * The flight is the authored polyline itself rather than a simulated one. What
 * a catchment sees is where the aircraft goes, and the altitude profile does
 * not change that - so this needs no world, no section and no elevations, and
 * runs anywhere.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { Card } from "../content/schema.ts";
import { loadExpeditions, projectedWaypoints } from "./expedition.ts";
import { TriggerField, triggerAt } from "../engine/src/discovery/triggers.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = join(root, "content");

const cards: Card[] = readdirSync(join(contentDir, "cards"))
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => parse(readFileSync(join(contentDir, "cards", f), "utf8")) as Card);

const triggers = cards.map((c) =>
  triggerAt(c.id, c.trigger.lat, c.trigger.lon, c.trigger.radius_km),
);

/** Distance from a catchment to the nearest point of the flown polyline. */
function nearestKm(
  points: readonly { eastM: number; northM: number }[],
  eastM: number,
  northM: number,
): { km: number; atKm: number } {
  let best = Infinity;
  let bestAt = 0;
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dx = b.eastM - a.eastM;
    const dy = b.northM - a.northM;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((eastM - a.eastM) * dx + (northM - a.northM) * dy) / len2));
    const d = Math.hypot(a.eastM + dx * t - eastM, a.northM + dy * t - northM);
    if (d < best) {
      best = d;
      bestAt = travelled + Math.sqrt(len2) * t;
    }
    travelled += Math.sqrt(len2);
  }
  return { km: best / 1000, atKm: bestAt / 1000 };
}

console.log("");
for (const expedition of loadExpeditions(join(contentDir, "expeditions"))) {
  const points = projectedWaypoints(expedition);
  const field = new TriggerField(triggers);
  field.moveTo(points[0]!.eastM, points[0]!.northM);

  // A kilometre a step. The segment test does not need it finer - it would
  // catch every one of these in a single call - but stepping gives the
  // distance along the route at which each card comes up, which is what an
  // author wants to know.
  const fired: { id: string; km: number }[] = [];
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b.eastM - a.eastM, b.northM - a.northM);
    for (let s = 1000; s <= len; s += 1000) {
      for (const id of field.advance(
        a.eastM + ((b.eastM - a.eastM) * s) / len,
        a.northM + ((b.northM - a.northM) * s) / len,
      )) {
        fired.push({ id, km: (travelled + s) / 1000 });
      }
    }
    travelled += len;
  }

  console.log(`  ${expedition.id} · ${(travelled / 1000).toFixed(0)} km · ${cards.length} card(s) in the set`);
  if (fired.length === 0) {
    console.log(`    ⚠ no card fires on this route`);
  } else {
    for (const f of fired) console.log(`    ✓ ${f.id.padEnd(26)} at km ${f.km.toFixed(0)}`);
  }

  const missed = triggers.filter((t) => !fired.some((f) => f.id === t.id));
  if (missed.length > 0) {
    console.log(`    not passed:`);
    for (const t of missed) {
      const { km, atKm } = nearestKm(points, t.eastM, t.northM);
      console.log(
        `      ${t.id.padEnd(26)} ${km.toFixed(0).padStart(5)} km away at its nearest (km ${atKm.toFixed(0)} of the route)` +
          ` · radius ${(t.radiusM / 1000).toFixed(0)} km`,
      );
    }
  }
  console.log("");
}
