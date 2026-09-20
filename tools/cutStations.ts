/**
 * Cut the capture stations for an expedition (see `stations.ts`).
 *
 *   npm run content:stations              # sea-to-sky
 *   npm run content:stations -- kunlun    # some other expedition
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { stationsFor } from "./stations.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stations = stationsFor(root, process.argv[2] ?? "sea-to-sky");
const out = join(root, "app", "public", "capture-stations.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(stations, null, 2)}\n`);

console.log(`\n  ${stations.expedition} · ${stations.lengthKm} km\n`);
for (const s of stations.stations) {
  console.log(
    `  ${s.id.padEnd(12)} km ${String(s.km).padStart(6)}  ` +
      `${String(s.altitudeM).padStart(5)} m over ground at ${String(s.groundM).padStart(5)} m` +
      `   ${s.why}`,
  );
}
console.log(`\n  wrote ${stations.stations.length} stations to app/public/capture-stations.json\n`);
