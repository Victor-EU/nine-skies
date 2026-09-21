/**
 * Where the ground the game draws and the ground the gates read come apart.
 *
 *   npm run content:ground        # and `make ground`, inside `make world`
 *
 * Since stage 6 this world has two elevation grids. The country grid is 1 km
 * and covers everything; a hero area is 90 m and covers a few hundred square
 * kilometres of it. `Terrain.groundElevationM` prefers the fine one, so the
 * cockpit reads 90 m ground wherever there is any. Every committed section
 * and patch is cut from the coarse one, because `cutSection` and `cutPatch`
 * read `groundAt` and every artefact in `content/` was signed off that
 * surface (D23, D24).
 *
 * So there are two answers to "what is under the aeroplane", and a route or a
 * challenge over a hero area would be checked against the one the player
 * never flies. Nothing authored is over one today. That is a fact about the
 * content as it stands rather than a property of anything, which is why it is
 * measured here on every build instead of being remembered — twice already a
 * coordinate nobody re-measured has moved out from under a claim (F49, F50),
 * and a golden probe has reported `pass` over a raster it could not read
 * (F52).
 *
 * The number this exists to keep is in the first table: through Tiger Leaping
 * Gorge the fine grid stands **374 m above** the coarse one, and Expedition 1
 * clears its worst terrain by 333. A route checked against the coarse grid
 * there can pass the clearance gate and fly into a wall (F53).
 */
import { writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { corridorCache, drawnGap, stationsAlong, type Corridor } from "./corridor.ts";
import { loadChallenges } from "./challenge.ts";
import { loadExpeditions, projectedWaypoints } from "./expedition.ts";
import { patchPoints, readPatch } from "./patch.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * How far apart the two grids are across one area.
 *
 * Sampled on a lattice of its own rather than on either grid's, because the
 * question is about positions and not about cells: a section samples the
 * coarse grid bilinearly at a kilometre station that no cell is centred on,
 * and the cockpit samples the fine grid bilinearly at wherever the aeroplane
 * happens to be.
 *
 * Both directions are reported and only one of them is dangerous. Coarse
 * *above* fine is a section that says the ground is higher than it is drawn,
 * which flies safe and looks wrong. Fine above coarse is a section that says
 * the ground is lower than the player's aeroplane meets, which is a clearance
 * check passing over terrain that is not there.
 */
export const SPREAD_STEP_M = 250;

export interface AreaSpread {
  readonly area: string;
  readonly points: number;
  readonly meanM: number;
  /** The fine grid above the coarse one — the direction that flies into a wall. */
  readonly fineAboveM: number;
  readonly fineAboveAt: { eastKm: number; northKm: number };
  readonly coarseAboveM: number;
  readonly coarseAboveAt: { eastKm: number; northKm: number };
}

export function spreadOf(corridor: Corridor, step = SPREAD_STEP_M): AreaSpread[] {
  const hero = corridor.hero;
  if (!hero) return [];
  const out: AreaSpread[] = [];
  for (const b of hero.bounds()) {
    let points = 0;
    let sum = 0;
    let fineAboveM = 0;
    let coarseAboveM = 0;
    let fineAt = { eastKm: 0, northKm: 0 };
    let coarseAt = { eastKm: 0, northKm: 0 };
    let area = "";
    for (let eastM = b.eastM0; eastM < b.eastM1; eastM += step)
      for (let northM = b.northM0; northM < b.northM1; northM += step) {
        const fine = hero.groundAt(eastM, northM);
        if (fine === null) continue;
        if (!area) area = hero.areaAt(eastM, northM) ?? "";
        const coarse = corridor.groundAt(eastM, northM);
        points++;
        sum += Math.abs(coarse - fine);
        const at = { eastKm: eastM / 1000, northKm: northM / 1000 };
        if (fine - coarse > fineAboveM) {
          fineAboveM = fine - coarse;
          fineAt = at;
        }
        if (coarse - fine > coarseAboveM) {
          coarseAboveM = coarse - fine;
          coarseAt = at;
        }
      }
    if (points === 0) continue;
    out.push({
      area,
      points,
      meanM: sum / points,
      fineAboveM,
      fineAboveAt: fineAt,
      coarseAboveM,
      coarseAboveAt: coarseAt,
    });
  }
  return out;
}

const open = corridorCache(join(root, "dist-world"));
const corridor = open("sea-to-sky") ?? open("china");
const lines: string[] = ["# Two grids, and what is authored over them", ""];

if (!corridor) {
  lines.push("No world is built, so there is nothing to compare. `make world`.");
} else if (!corridor.hero) {
  lines.push(
    `\`${corridor.manifest.corridor}\` has no 90 m cover beside it, so the country ` +
      "grid is the only grid and every check reads the ground the game draws. " +
      "`make hero` publishes stage 6.",
  );
} else {
  lines.push(
    "The game draws 90 m ground over a hero area and 1 km ground everywhere else.",
    "Every committed section and patch is cut from the 1 km grid. This is what",
    "that costs where the two overlap, and what is authored over them today.",
    "",
    `Corridor \`${corridor.manifest.corridor}\` · ${corridor.hero.label}`,
    "",
    "## Where the two grids disagree",
    "",
    `Sampled every ${SPREAD_STEP_M} m across each area. \`90 m above 1 km\` is the`,
    "direction that matters: there, a clearance check reading the 1 km grid passes",
    "over ground the aeroplane actually meets.",
    "",
    "| Area | Points | Mean gap | 90 m above 1 km | where | 1 km above 90 m | where |",
    "| --- | ---: | ---: | ---: | --- | ---: | --- |",
  );
  for (const s of spreadOf(corridor))
    lines.push(
      `| ${s.area} | ${s.points.toLocaleString("en-GB")} | ${s.meanM.toFixed(1)} m | ` +
        `**${s.fineAboveM.toFixed(0)} m** | ${s.fineAboveAt.eastKm.toFixed(0)}, ${s.fineAboveAt.northKm.toFixed(0)} km | ` +
        `${s.coarseAboveM.toFixed(0)} m | ${s.coarseAboveAt.eastKm.toFixed(0)}, ${s.coarseAboveAt.northKm.toFixed(0)} km |`,
    );

  lines.push("", "## What is authored over them", "", "| Content | Checked points | Over 90 m ground |", "| --- | ---: | ---: |");
  for (const e of loadExpeditions(join(root, "content", "expeditions"))) {
    const gap = drawnGap(corridor, stationsAlong(projectedWaypoints(e)));
    lines.push(`| expedition \`${e.id}\` | ${gap.of} stations | ${gap.over}${gap.over ? ` (${gap.areas.join(", ")})` : ""} |`);
  }
  for (const c of loadChallenges(join(root, "content", "challenges"))) {
    const patch = readPatch(join(root, "content", "patches"), c.id);
    if (!patch) {
      lines.push(`| challenge \`${c.id}\` | — | no committed patch |`);
      continue;
    }
    const gap = drawnGap(corridor, patchPoints(patch));
    lines.push(`| challenge \`${c.id}\` | ${gap.of} cells | ${gap.over}${gap.over ? ` (${gap.areas.join(", ")})` : ""} |`);
  }
  lines.push(
    "",
    "A non-zero count in the right-hand column is a failure rather than a note, and",
    "`cutSection` and `cutPatch` refuse to write the artefact that would carry it.",
    "They refuse rather than cutting from the finer grid because which grid content",
    "comes from is an open decision: changing it re-signs every committed section and",
    "patch at once (D23, D24, F51, F53).",
  );
}

const report = `${lines.join("\n")}\n`;
const out = join(root, "docs", "ground-report.md");
writeFileSync(out, report);
console.log(`\n${lines.slice(0, 2).join("\n")}`);
for (const l of lines.slice(2)) console.log(l);
console.log(`\n-> ${relative(root, out)}\n`);
