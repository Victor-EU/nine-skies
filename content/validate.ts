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
  validateCards,
  validateExpeditions,
  wordCount,
  type Card,
  type Expedition,
} from "./schema.ts";

const here = dirname(fileURLToPath(import.meta.url));
const cardsDir = join(here, "cards");

const files = readdirSync(cardsDir).filter((f) => f.endsWith(".yaml"));
const cards: Card[] = files.map((f) => parse(readFileSync(join(cardsDir, f), "utf8")) as Card);

const expeditionsDir = join(here, "expeditions");
const expeditionFiles = readdirSync(expeditionsDir).filter((f) => f.endsWith(".yaml"));
const expeditions: Expedition[] = expeditionFiles.map(
  (f) => parse(readFileSync(join(expeditionsDir, f), "utf8")) as Expedition,
);

// Schema only. Whether a route can actually be flown over the ground it
// crosses is D17's question, and it needs a built corridor rather than a
// parser - `test/route/seaToSkyClearance.test.ts` answers it.
const issues = [...validateCards(cards), ...validateExpeditions(expeditions)];

if (issues.length > 0) {
  console.error(`\n${issues.length} content issue(s):\n`);
  for (const i of issues) console.error(`  ${i.subject} · ${i.field}: ${i.message}`);
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
  sheet += `\n## ${region}\n`;
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
for (const e of expeditions) {
  const legs = e.route
    .slice(1)
    .map((p) => `${p.speed} to ${p.name}`)
    .join(", ");
  console.log(`expedition ${e.id} valid · ${e.route.length} waypoints · ${legs}`);
}
console.log(`fact-check sheet -> dist-content/fact-check-sheet.md`);
