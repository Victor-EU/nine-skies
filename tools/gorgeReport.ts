/**
 * Whether the GDD's *thread a gorge at low speed* has a gorge to be threaded
 * in, measured rather than recalled.
 *
 *   npm run content:gorges        # and `make gorges`, inside `make world`
 *
 * The measurement is in `gorge.ts` and its docstring says what it is and what
 * it deliberately is not. This writes it down.
 *
 * It is a report and never a gate. Every number here feeds a decision the
 * build plan records as the user's -- which of the flight model, the speed
 * modes and the challenge moves -- and a gate would be this file choosing.
 */
import { writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { corridorCache } from "./corridor.ts";
import { reachesOf, SEARCH_CAP_M, SEARCH_STEP_M, type Reach } from "./gorge.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const km = (m: number) => (m / 1000).toFixed(2);
const m0 = (v: number) => `${Math.round(v).toLocaleString("en-GB")} m`;

/** `4.45` or `4.45+` — the trailing mark says the area's edge stopped it. */
const room = (r: { roomM: number; boundedByArea: boolean }) =>
  r.roomM === 0 ? "**0**" : `${km(r.roomM)}${r.boundedByArea ? "+" : ""}`;

function fitLine(reach: Reach): string[] {
  const near = reach.rim[0]!;
  const far = reach.rim[1]!;
  return reach.fits.map((f) => {
    if (f.aboveGroundM === null)
      return `| \`${reach.place}\` | ${f.what} | — | ${km(f.reversalM)} km | ${km(f.roomM)} km | ` +
        `not below +${SEARCH_CAP_M.toLocaleString("en-GB")} m |`;
    const nearGap = f.aboveGroundM - (near.m - reach.groundM);
    const farGap = f.aboveGroundM - (far.m - reach.groundM);
    const where =
      nearGap < 0
        ? `${m0(-nearGap)} below the near rim`
        : Math.round(nearGap) === 0
          ? "level with the near rim"
          : farGap < 0
            ? `${m0(nearGap)} above the near rim, ${m0(-farGap)} below the far one`
            : `${m0(farGap)} above the far rim`;
    return `| \`${reach.place}\` | ${f.what} | **+${f.aboveGroundM.toLocaleString("en-GB")} m** | ` +
      `${km(f.reversalM)} km | ${km(f.roomM)} km | ${where} |`;
  });
}

const open = corridorCache(join(root, "dist-world"));
const corridor = open("sea-to-sky") ?? open("china");
const lines: string[] = ["# Room to turn round, gorge by gorge", ""];

if (!corridor) {
  lines.push("No world is built, so there is no ground to measure. `make world`.");
} else if (!corridor.hero) {
  lines.push(
    `\`${corridor.manifest.corridor}\` has no 90 m cover beside it, and the 1 km grid`,
    "fills a gorge in — measuring one on it answers a question about resampling",
    "rather than about a gorge. `make hero` publishes stage 6.",
  );
} else {
  const reaches = reachesOf(corridor);
  lines.push(
    "A full-bank reversal needs a level disc of its own diameter with no ground in",
    "it. This is the diameter of the largest such disc the aeroplane's own position",
    "lies inside, at each height above the ground under it — the room to turn round",
    "*in the gorge*, which is what *threading* one means.",
    "",
    `Corridor \`${corridor.manifest.corridor}\` · ${corridor.hero.label}`,
    "",
    "## The places this grid covers",
    "",
    "Not a list in the tool: a hero area is cut to hold named places, so publishing",
    "an area over a place measures it. `shigu` is here because the gorge's area",
    "reaches it, and it is the control — a broad valley on the same river, 41 km up.",
    "",
    "| Place | Area | 90 m ground | 1 km grid | wall within 1 km | within 4 km |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
  );
  for (const r of reaches)
    lines.push(
      `| \`${r.place}\` | ${r.area} | ${m0(r.groundM)} | ${m0(r.coarseGroundM)} ` +
        `(${r.coarseGroundM > r.groundM ? "+" : ""}${Math.round(r.coarseGroundM - r.groundM)}) | ` +
        `${r.rim.map((x) => `+${m0(x.m - r.groundM)}`).join(" | ")} |`,
    );

  lines.push(
    "",
    "## Turning room, height by height",
    "",
    "Both columns are measured inside the same rectangle, so they compare grids and",
    "not extents. `+` means the area's own edge stopped the disc and the number is a",
    "floor. **0** means the aeroplane is inside the ground at that height.",
    "",
    "| Place | Height | 90 m room | 1 km room | reversal at `low` |",
    "| --- | ---: | ---: | ---: | ---: |",
  );
  for (const r of reaches)
    for (const g of r.rungs)
      lines.push(
        `| \`${r.place}\` | +${g.aboveGroundM.toLocaleString("en-GB")} m | ${room(g.fine)} km | ` +
          `${room(g.coarse)} km | ${km(g.reversalM)} km |`,
      );

  lines.push(
    "",
    "## The lowest height at which the turn fits",
    "",
    `Climbed in ${SEARCH_STEP_M} m steps to +${SEARCH_CAP_M.toLocaleString("en-GB")} m, on the 90 m grid.`,
    "Both sides move with height: the air thins, so the reversal widens as the gorge",
    "does. The right-hand column is the one the challenge turns on — a turn that only",
    "fits above the rim is a turn made out of the gorge.",
    "",
    "| Place | Turn | Fits from | Reversal there | Room there | Against the wall |",
    "| --- | --- | ---: | ---: | ---: | --- |",
  );
  for (const r of reaches) lines.push(...fitLine(r));

  lines.push(
    "",
    "Nothing here is a gate. Which of the flight model, the speed modes and the",
    "challenge moves is the build plan's open question, and these are the numbers it",
    "was missing rather than an answer to it.",
    "",
    "What this does **not** say is what a whole reach does. These are the sited",
    "points above, and a course is flown between them; the narrowest place on the",
    "water is what binds, and finding it wants the channel centreline stage 3 would",
    "bring (D45, F48). A chord between two of these is not that centreline.",
    "",
    "Nor is a gorge challenge authorable today whatever these numbers say: a patch is",
    "cut from the 1 km grid, `cutPatch` refuses to write one over a hero area, and",
    "the left-hand column of the table above is why that refusal is right (D52, F53).",
  );
}

const report = `${lines.join("\n")}\n`;
const out = join(root, "docs", "gorge-report.md");
writeFileSync(out, report);
for (const l of lines) console.log(l);
console.log(`\n-> ${relative(root, out)}\n`);
