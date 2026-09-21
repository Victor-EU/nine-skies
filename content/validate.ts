/**
 * Content validation gate. Run by CI on every commit.
 *
 * Also emits the fact-check sheet the geography reviewer reads - one page per
 * region, every claim beside its source, no game and no repo required.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  regionName,
  validateCards,
  validateChallenges,
  validateExpeditions,
  validateSpreads,
  wordCount,
  type Card,
  type Challenge,
  type Expedition,
} from "./schema.ts";
import { checkRoutes, describe, sectionsDir } from "../tools/routeCheck.ts";
import { loadExpeditions } from "../tools/expedition.ts";
import { loadSpreads } from "../tools/journal.ts";
import { loadChallenges } from "../tools/challenge.ts";

const here = dirname(fileURLToPath(import.meta.url));
const cardsDir = join(here, "cards");

const files = readdirSync(cardsDir).filter((f) => f.endsWith(".yaml"));
const cards: Card[] = files.map((f) => parse(readFileSync(join(cardsDir, f), "utf8")) as Card);

const expeditions: Expedition[] = loadExpeditions(join(here, "expeditions"));

const spreads = loadSpreads(join(here, "spreads"));

const challenges: Challenge[] = loadChallenges(join(here, "challenges"));

const issues = [
  ...validateCards(cards),
  ...validateExpeditions(expeditions),
  ...validateSpreads(spreads, cards, expeditions.map((e) => e.id)),
  ...validateChallenges(challenges),
];

if (issues.length > 0) {
  console.error(`\n${issues.length} content issue(s):\n`);
  for (const i of issues) console.error(`  ${i.subject} · ${i.field}: ${i.message}`);
  console.error("");
  process.exit(1);
}

// The half a parser cannot do (D19). A route is well-formed above and
// flyable here, and the second is the one that has ever been wrong: every
// route in this repo has passed the schema since the day it was written, and
// all four findings against Expedition 1 are things the schema cannot see.
//
// This runs everywhere, because the ground it needs is committed beside the
// route (D21). An expedition it cannot check is an error, not a warning, per
// the risk register: "or is skipped because no corridor is built" is listed
// as a way this check fails rather than as a way it succeeds. The one escape
// is `--allow-unchecked`, for drafting a route on a machine with no world -
// it is in no Makefile target and in no CI step, and it cannot hide a route
// that was checked and found wrong.
const routes = checkRoutes(expeditions, join(here, "..", "dist-world"), sectionsDir(here));
const allowUnchecked = process.argv.includes("--allow-unchecked");

console.log("");
for (const r of routes) for (const l of describe(r)) console.log(l);

const brokenIssues = routes.reduce((n, r) => n + (r.check?.issues.length ?? 0), 0);
const staleSections = routes.filter((r) => r.sectionIssue !== null);
const unchecked = routes.filter((r) => r.check === null);
let failed = false;

if (brokenIssues > 0) {
  const broken = routes.filter((r) => (r.check?.issues.length ?? 0) > 0).length;
  console.error(`\n${brokenIssues} route issue(s) across ${broken} expedition(s).`);
  console.error("A route is not data until an autopilot has flown it (D17, D19).");
  failed = true;
}
if (staleSections.length > 0) {
  console.error(
    `\n${staleSections.length} committed section(s) no longer describe their route.`,
  );
  console.error("Re-cut them with `npm run content:sections` on a machine with a world.");
  failed = true;
}
if (unchecked.length > 0 && !allowUnchecked) {
  console.error(`\n${unchecked.length} expedition(s) have no ground to be flown over.`);
  console.error("Pass --allow-unchecked to draft one anyway; CI does not.");
  failed = true;
}
if (failed) {
  console.error("");
  process.exit(1);
}

// Fact-check sheet, grouped by region.
const byRegion = new Map<string, Card[]>();
for (const c of cards) {
  const list = byRegion.get(c.region) ?? [];
  list.push(c);
  byRegion.set(c.region, list);
}
let sheet = "# Fact-check sheet\n\nOne page per region. Every claim, and where it came from.\n";
for (const [region, list] of [...byRegion].sort()) {
  sheet += `\n## ${regionName(region)}\n`;
  for (const c of list.sort((a, b) => a.id.localeCompare(b.id))) {
    sheet += `\n### ${c.names.en} · ${c.names.zh}\n\n`;
    sheet += `**${c.figure.value} ${c.figure.unit}** — ${c.figure.label}\n\n`;
    sheet += `> ${c.one_liner.trim()}\n\n`;
    sheet += `${c.read_more.trim()}\n\n`;
    sheet += `Sources:\n${c.sources.map((s) => `- ${s}`).join("\n")}\n`;
  }
}
const outDir = join(here, "..", "dist-content");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "fact-check-sheet.md"), sheet);

const totalWords = cards.reduce((n, c) => n + wordCount(c.read_more), 0);
console.log(
  `${cards.length} card(s) valid · ${byRegion.size} region(s) · ${totalWords} words of read-more`,
);
console.log(
  spreads.length === 0
    ? `0 comparison spread(s) · the GDD plans 12 and G2 scores one (npm run content:atlas)`
    : `${spreads.length} comparison spread(s) valid`,
);
console.log(
  challenges.length === 0
    ? `0 challenge(s) · the GDD plans 12 (npm run content:challenges)`
    : `${challenges.length} of 12 challenge(s) valid · flown over committed ground by npm run content:challenges`,
);
for (const e of expeditions) {
  const legs = e.route
    .slice(1)
    .map((p) => `${p.speed} to ${p.name}`)
    .join(", ");
  console.log(`expedition ${e.id} valid · ${e.route.length} waypoints · ${legs}`);
}
console.log(`fact-check sheet -> dist-content/fact-check-sheet.md`);
