/**
 * Whether the GDD's *thread a gorge at low speed* has a gorge to be threaded
 * in, measured rather than recalled -- both ways of reading *thread*.
 *
 *   npm run content:gorges        # and `make gorges`, inside `make world`
 *
 * The measurements are in `gorge.ts` (room to turn round, at the places) and
 * `reach.ts` (the whole river through each area: its narrowest place, and
 * whether it can be flown through), and their docstrings say what each is
 * and what it deliberately is not. This writes them down.
 *
 * It is a report and never a gate. Every number here feeds a decision the
 * build plan records as the user's -- which reading of *thread* the challenge
 * means, and which of the flight model, the speed modes and the challenge
 * moves -- and a gate would be this file choosing.
 */
import { writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { corridorCache } from "./corridor.ts";
import { reachesOf, SEARCH_CAP_M, SEARCH_STEP_M, type Reach } from "./gorge.ts";
import {
  END_SEPARATION_M,
  RUN_BUDGET,
  RUN_DT_S,
  RUN_FRAMES,
  RUN_INSET_KM,
  RUN_LEVELS_M,
  RUN_MARGINS_M,
  reachesThrough,
  type ReachOfArea,
  type Run,
} from "./reach.ts";

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

/**
 * A paragraph wrapped the way the written ones beside it are, so a generated
 * sentence diffs like a written one when a number in it moves.
 */
function para(text: string, width = 80): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/** Where a course kilometre is, against the nearest place on it. */
function whereOn(r: ReachOfArea, km: number): string {
  const near = [...r.course.places].sort((a, b) => Math.abs(a.km - km) - Math.abs(b.km - km))[0];
  const at = `km ${km.toFixed(1)}`;
  if (!near) return at;
  const d = km - near.km;
  if (Math.abs(d) < 0.25) return `${at}, at \`${near.place}\``;
  return `${at}, ${Math.abs(d).toFixed(1)} km ${d < 0 ? "above" : "below"} \`${near.place}\``;
}

/** Which side of its area a course end leaves by. */
function side(r: ReachOfArea, end: "first" | "last"): string {
  const s = end === "first" ? r.course.stations[0]! : r.course.stations[r.course.stations.length - 1]!;
  const all = r.course.stations;
  const e = all.map((x) => x.eastM);
  const n = all.map((x) => x.northM);
  const [e0, e1, n0, n1] = [Math.min(...e), Math.max(...e), Math.min(...n), Math.max(...n)];
  const gaps: [string, number][] = [
    ["west", s.eastM - e0], ["east", e1 - s.eastM], ["south", s.northM - n0], ["north", n1 - s.northM],
  ];
  return gaps.sort((a, b) => a[1] - b[1])[0]![0];
}

const minutes = (run: Run) => {
  const secs = Math.round(run.frames * RUN_DT_S);
  return `${Math.floor(secs / 60)} min ${String(secs % 60).padStart(2, "0")} s`;
};

/** Why no flight was found, over every search that tried. */
const why = (runs: readonly Run[]) =>
  runs.some((t) => t.outcome === "no air")
    ? "no air joins the ends"
    : runs.every((t) => t.outcome === "exhausted")
      ? "both orders tried every state they kept"
      : `both orders, ${RUN_BUDGET.toLocaleString("en-GB")} states each`;

function reachSection(reaches: readonly ReachOfArea[]): string[] {
  const out: string[] = [
    "## The whole reach",
    "",
    "Everything above is five points, and a course is flown between them. This walks",
    "the river through each area instead. There is no table of reaches: an area is",
    "cut to hold named places on a river, so the course is the lowest ground that",
    "joins them, run out to the area's edge at both ends and kept to its middle. A",
    "flood from the places reaches the edge first at one crossing; the first edge",
    `cell it reaches ${(END_SEPARATION_M / 1000).toFixed(0)} km clear of all of that crossing is the other. The lower`,
    "end is downstream.",
    "",
    "| Area | Course | Upstream end | Downstream end | Sill | Places along it |",
    "| --- | ---: | --- | --- | --- | --- |",
  ];
  for (const r of reaches) {
    const c = r.course;
    const first = c.stations[0]!;
    const last = c.stations[c.stations.length - 1]!;
    out.push(
      `| \`${r.area}\` | ${c.lengthKm.toFixed(1)} km | ${m0(first.groundM)}, ${side(r, "first")} edge | ` +
        `${m0(last.groundM)}, ${side(r, "last")} edge | ${m0(c.sillM)} at km ${c.sillKm.toFixed(1)} | ` +
        `${[...c.places].sort((a, b) => a.km - b.km).map((p) => `\`${p.place}\` km ${p.km.toFixed(1)} (${Math.round(p.offM)} m off)`).join(" · ")} |`,
    );
  }
  out.push(
    "",
    "The **sill** is the highest ground the lowest path between the two ends has to",
    "cross. Every path crosses it, so no level flight below it plus the bounce joins",
    "the ends at all, which makes it the one floor here that is a proof rather than a",
    "search result.",
  );
  for (const r of reaches) {
    const c = r.course;
    const upstream = c.stations[0]!.groundM;
    if (c.sillM <= upstream) {
      out.push(
        "",
        ...para(
          `\`${r.area}\`: the sill is the upstream end itself — nothing on the lowest path ` +
            "between the ends stands above the water where the river enters — so water can " +
            "drain the whole way on this grid, and a level over the sill is a height over the water.",
        ),
      );
      continue;
    }
    const over = Object.entries(r.water)
      .sort((a, b) => (c.places.find((p) => p.place === a[0])?.km ?? 0) - (c.places.find((p) => p.place === b[0])?.km ?? 0))
      .map(([place, m]) => `${Math.round(c.sillM - m)} m over the water at \`${place}\``)
      .join(" and ");
    out.push(
      "",
      ...para(
        `\`${r.area}\`: **the sill is not the river.** The lowest path between the two ends ` +
          `rises to ${m0(c.sillM)} at km ${c.sillKm.toFixed(1)}, which is ${over}. Nothing on ` +
          "this grid can drain through that, and a probe that reads the river at two points " +
          "on either side of it cannot see it (F48). Whose sill it is, the grid's or the " +
          "source's, is not something the lowest ground near it can say; the probe report " +
          "floods the source the area was cut from between the same probe's cells and " +
          "prints the answer beside its pass (F58).",
      ),
    );
  }

  out.push(
    "",
    "### The narrowest place, and where a turn round fits",
    "",
    "The turning room of the table above at every station of the course, level at",
    "each height over the sill — the same air the run below is searched in. The",
    `narrowest leaves out ${RUN_INSET_KM} km at each end, where the area's edge rather than the`,
    "ground can be what stops a disc. *Under a wall* is the part of *fits over* with",
    "ground within a kilometre standing above the aeroplane: a turn made in the gorge",
    "rather than over it.",
    "",
    "| Area | Level | Narrowest | Where | Reversal at `low` | Fits over | Under a wall |",
    "| --- | ---: | ---: | --- | ---: | ---: | ---: |",
  );
  for (const r of reaches)
    for (const w of r.walks)
      out.push(
        `| \`${r.area}\` | ${m0(w.altitudeM)} (+${Math.round(w.altitudeM - r.course.sillM)}) | ` +
          `${room(w.narrowest.room)} km | ${whereOn(r, w.narrowest.km)} | ${km(w.reversalM)} km | ` +
          `${w.fitsKm.toFixed(1)} km | ${w.fitsInsideKm.toFixed(1)} km |`,
      );

  out.push(
    "",
    "### Flying it through",
    "",
    "The other reading of *thread*. A pass needs no reversal: it needs the aeroplane",
    "to follow the channel's bends with the turn it has. So it is answered by flying",
    "it — a search over the stick through `flight.ts`'s own `step`, at `low`, level,",
    `each roll input held for ${RUN_FRAMES} frames of 1/${Math.round(1 / RUN_DT_S)} s, from ${RUN_INSET_KM} km inside one end of`,
    `the course to ${RUN_INSET_KM} km inside the other, with contact wherever the ground the game`,
    "draws plus the bounce reaches the aeroplane. *Room either side* is how far to",
    "each side of the track the ground must also stay clear. The flights the search",
    "finds graze the ground, because it asks for clearance and not comfort, so this",
    "is the number that says how exactly a run would have to be flown — and a flight",
    `with room either side is a flight with less, so the widest of ${RUN_MARGINS_M.join(", ")} m flown`,
    "at a level settles every margin under it.",
    "",
    "A flight it finds is replayed from its first frame before it is printed, so",
    "*flown* means the model flies it. *Not found* is not a proof: the search keeps",
    "one state per 90 m cell, 3° of heading and 7.5° of bank, and in a channel a few",
    "cells wide the state it dropped can be the one that fits. It is run in two",
    "orders — middle of the channel first, and shortest line first — because each",
    "finds flights the other prunes, and *not found* means neither did. How far",
    "they got is printed beside it, because the place has held where the verdict",
    "has not.",
    "",
    "| Area | Level | Flown with | Takes | Not found with | Stalled at | Under a wall |",
    "| --- | ---: | ---: | ---: | ---: | --- | ---: |",
  );
  for (const r of reaches)
    r.runs.forEach((tried, i) => {
      const best = tried.find((t) => t.flown);
      // The margin just wider than the widest flown -- or the widest tried,
      // when nothing flew -- and every search that did not fly it.
      const wider = RUN_MARGINS_M.filter((m) => m > (best?.marginM ?? -1));
      const next = wider.length > 0 ? wider[0] : undefined;
      const failed = tried.filter((t) => !t.flown && t.marginM === (best ? next : RUN_MARGINS_M[0]));
      const furthest = failed.reduce<Run | undefined>((a, t) => (a && a.reachedKm >= t.reachedKm ? a : t), undefined);
      const inset = r.course.lengthKm - 2 * RUN_INSET_KM;
      const level = r.course.sillM + RUN_LEVELS_M[i]!;
      out.push(
        `| \`${r.area}\` | ${m0(level)} (+${RUN_LEVELS_M[i]}) | ` +
          `${best ? `**${best.marginM} m** either side` : "—"} | ${best ? minutes(best) : "—"} | ` +
          `${furthest ? `${furthest.marginM} m` : "—"} | ` +
          `${furthest ? `${whereOn(r, furthest.reachedKm)} (${why(failed)})` : "—"} | ` +
          `${((r.underWallKm[i]! / inset) * 100).toFixed(0)} % |`,
      );
    });
  return out;
}

const open = corridorCache(join(root, "dist-world"));
const corridor = open("sea-to-sky") ?? open("china");
const lines: string[] = ["# Room to turn round, and room to fly through", ""];

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
  );
  lines.push(...reachSection(reachesThrough(corridor)));
  lines.push(
    "",
    "Nor is a gorge challenge authorable today whatever these numbers say: a patch is",
    "cut from the 1 km grid, `cutPatch` refuses to write one over a hero area, and",
    "the 1 km column of the turning-room table above is why that refusal is right",
    "(D52, F53).",
  );
}

const report = `${lines.join("\n")}\n`;
const out = join(root, "docs", "gorge-report.md");
writeFileSync(out, report);
for (const l of lines) console.log(l);
console.log(`\n-> ${relative(root, out)}\n`);
