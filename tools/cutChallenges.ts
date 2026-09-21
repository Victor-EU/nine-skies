/**
 * Cut the committed ground patches from whatever world is built (D39).
 *
 * `make world` ends with this beside `cutSections`, so the artefacts in
 * `content/patches/` are fresh by construction on the machine that has the
 * data. Everywhere else — CI, a writer's laptop, a fresh clone — the committed
 * patch is the ground, and `checkChallenge` catches it being stale rather than
 * trusting it.
 *
 * What this does that the section cutter does not is **fly what it cut before
 * it writes it.** A section is one-dimensional and every number in it is used:
 * if the route is covered, the section is complete by construction. A patch is
 * two-dimensional and only a few hundred of its cells are ever read, and which
 * ones depends on a flight nobody has run yet. So the guarantee cannot come
 * from the geometry — it comes from doing in advance exactly what CI will do,
 * and refusing to write a patch the flight disagrees with.
 *
 * The failure it is guarding against is not a loud one. A patch trimmed to a
 * tenth of its width everywhere makes the aeroplane run out of ground at once
 * and the flight times out — that needs no guard. What needs a guard is one
 * missing row: five per cent of `high-airfield`'s patch, and the challenge
 * still finishes in the same 68.93 seconds with both objectives met, reporting
 * its lowest pass as 170 m above the ground instead of 45, because the frames
 * where it was lowest are the frames it had no ground for (F44).
 */
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { flyChallenge, type ChallengeFlight } from "../engine/src/challenge/fly.ts";
import type { SpeedMode } from "../engine/src/sim/scale.ts";
import { corridorCache, type Corridor, type GroundField } from "./corridor.ts";
import { courseFor, loadChallenges, placesOf, specFrom } from "./challenge.ts";
import { cellCount, cutPatch, patchGround, writePatch, type GroundPatch } from "./patch.ts";
import { committedSigner } from "./attest.ts";
import { projectAlbers } from "../engine/src/terrain/worldGrid.ts";
import type { Challenge } from "../content/schema.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const patchesDir = join(root, "content", "patches");
const open = corridorCache(join(root, "dist-world"));
// Read before the loop: a missing cutting key is a property of the machine,
// not of any one challenge, and finding out after the first cut has been
// written would leave half the patches signed (D23).
const sign = committedSigner(root);

function fly(c: Challenge, field: GroundField): ChallengeFlight {
  return flyChallenge(specFrom(c), courseFor(c), c.speed as SpeedMode, {
    groundAt: (eastM, northM) => (field.covers(eastM, northM) ? field.groundAt(eastM, northM) : null),
  });
}

/** Where a world and the patch cut from it disagree about the same flight. */
function disagreement(world: ChallengeFlight, patch: ChallengeFlight): string | null {
  if (patch.framesWithoutGround)
    return (
      `the flight left the patch on ${patch.framesWithoutGround} frame(s) — the ` +
      `margin is too narrow for the course`
    );
  if (world.state !== patch.state) return `${world.state} over the world, ${patch.state} over the patch`;
  if (Math.abs(world.seconds - patch.seconds) > 1e-9)
    return `${world.seconds.toFixed(3)} s over the world, ${patch.seconds.toFixed(3)} s over the patch`;
  if (Math.abs(world.minAglM - patch.minAglM) > 1e-9)
    return `lowest ${world.minAglM.toFixed(3)} m over the world, ${patch.minAglM.toFixed(3)} m over the patch`;
  if (world.bounces !== patch.bounces)
    return `${world.bounces} bounce frames over the world, ${patch.bounces} over the patch`;
  return null;
}

/** The corridor to cut from: the challenge's own, then the route's, then the country. */
function worldFor(c: Challenge): { name: string; corridor: Corridor } | null {
  for (const name of [c.id, "sea-to-sky", "china"]) {
    const corridor = open(name);
    if (!corridor) continue;
    const covered = placesOf(c).every((p) => {
      const { eastM, northM } = projectAlbers(p.lat, p.lon);
      return corridor.covers(eastM, northM);
    });
    if (covered) return { name, corridor };
  }
  return null;
}

let cut = 0;
let changed = 0;
let refused = 0;
console.log("");
for (const c of loadChallenges(join(root, "content", "challenges"))) {
  const world = worldFor(c);
  if (!world) {
    console.log(`  – ${c.id} not cut — no built world has ground under every place it names`);
    continue;
  }
  const result = cutPatch(c, world.corridor, sign);
  if ("problem" in result) {
    console.log(`  – ${c.id} not cut — ${result.problem}`);
    refused++;
    continue;
  }
  const patch: GroundPatch = result.patch;
  const wrong = disagreement(fly(c, world.corridor), fly(c, patchGround(patch)));
  if (wrong) {
    console.log(`  ✗ ${c.id} not written — the patch does not fly like the world it came from: ${wrong}`);
    refused++;
    continue;
  }

  const { path, changed: rewritten } = writePatch(patchesDir, patch);
  cut++;
  if (rewritten) changed++;
  console.log(
    `  ${rewritten ? "✎" : "="} ${relative(root, path)} — ${cellCount(patch)} km² of ground ` +
      `in ${patch.rows.length} rows, ${patch.marginKm} km either side of the course, from ${world.name}` +
      `${patch.clippedByWorld ? `, ${patch.clippedByWorld} cell(s) clipped at the world's edge` : ""}` +
      `${rewritten ? "" : " (unchanged)"}`,
  );
}

console.log(`\n${cut} patch(es) cut, ${changed} rewritten.`);
if (refused) {
  console.error(`${refused} refused. A patch that cannot be flown is not committed.\n`);
  process.exit(1);
}
if (cut === 0) {
  console.error("Nothing was cut. Build a world first: `make world CORRIDOR=<id>`.\n");
  process.exit(1);
}
console.log("");
