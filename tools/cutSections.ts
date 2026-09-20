/**
 * Cut the committed route sections from whatever world is built.
 *
 * `make world` ends with this, so the artefact in `content/sections/` is
 * fresh by construction on the machine that has the data. Everywhere else -
 * CI, a writer's laptop, a fresh clone - the committed file is the ground,
 * and `checkRoutes` catches it being stale rather than trusting it.
 *
 * A corridor build covers one expedition, so cutting what it can reach and
 * naming what it cannot is the normal outcome, not a failure. The only
 * failure is being asked to cut with nothing built at all.
 */
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { corridorCache } from "./corridor.ts";
import { corridorFor, loadExpeditions } from "./expedition.ts";
import { cutSection, writeSection } from "./section.ts";
import { committedSigner } from "./attest.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sectionsDir = join(root, "content", "sections");
const open = corridorCache(join(root, "dist-world"));
// Read before the loop: a missing cutting key is a property of the machine,
// not of any one expedition, and finding out after the first cut has been
// written would leave half the sections signed (D23).
const sign = committedSigner(root);

let cut = 0;
let changed = 0;
console.log("");
for (const expedition of loadExpeditions(join(root, "content", "expeditions"))) {
  const { chosen, looked, leaves } = corridorFor(expedition, open);
  if (!chosen) {
    const why = leaves.length
      ? leaves.map((l) => `${l.name} stops covering it at km ${l.km}`).join("; ")
      : `none of ${looked.join(", ")} is built`;
    console.log(`  – ${expedition.id} not cut — ${why}`);
    continue;
  }
  const result = cutSection(expedition, chosen.corridor, sign);
  if ("problem" in result) {
    console.log(`  – ${expedition.id} not cut — ${result.problem}`);
    continue;
  }
  const { path, changed: rewritten } = writeSection(sectionsDir, result.section);
  cut++;
  if (rewritten) changed++;
  console.log(
    `  ${rewritten ? "✎" : "="} ${relative(root, path)} — ` +
      `${result.section.groundM.length} km of ground from ${chosen.name}` +
      `${rewritten ? "" : " (unchanged)"}`,
  );
}

console.log(`\n${cut} section(s) cut, ${changed} rewritten.`);
if (cut === 0) {
  console.error("Nothing was cut. Build a world first: `make world CORRIDOR=<id>`.\n");
  process.exit(1);
}
console.log("");
