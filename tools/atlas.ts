/**
 * What the journal can show, and what it cannot yet. (Finding F40.)
 *
 *   npm run content:atlas
 *
 * A report and never a gate, like `content:teaches` and `content:discoveries`
 * before it: everything it counts is answered by writing rather than by code,
 * and failing a build over unwritten content would be answering it.
 *
 * Four questions, in the order they bite:
 *
 *   1. How much of the planned atlas can the built trigger actually carry?
 *      The GDD names eight entry types and five ways of arriving at one; the
 *      discovery system has a circle on the ground (D30).
 *   2. Which regions have anything in them, and what does the journal say
 *      about the entries nobody has found?
 *   3. Do the comparison spreads exist -- the twelve pages the GDD calls the
 *      payoff and G2 scores one of?
 *   4. Of the measures a spread promises, which can this repository check for
 *      itself? Exactly one: elevation, out of the committed section (D21).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENTRY_PLAN,
  MEASURE_KEYS,
  SPREAD_MEASURES,
  validateCards,
  type Card,
} from "../content/schema.ts";
import { loadExpeditions } from "./expedition.ts";
import { atlasBundle, groundUnder, loadCards, loadSpreads } from "./journal.ts";
import { Atlas } from "../engine/src/journal/atlas.ts";
import { spreadState } from "../engine/src/journal/spread.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = join(root, "content");

/**
 * How far an authored elevation may sit from the ground under the route, m.
 *
 * A city's published elevation is a datum somebody chose - a square, a
 * station, a municipal mean - and the section holds the average of a
 * kilometre of ground. Lhasa is published at 3,650 m and the route flies over
 * 3,651.8; Shanghai is published at 4 m and the route starts over 9.9. So
 * this catches a wrong place or a wrong unit, not a disagreement about where
 * the middle of a city is.
 */
const ELEVATION_TOLERANCE_M = 25;

const cards = loadCards(join(contentDir, "cards"));
const spreads = loadSpreads(join(contentDir, "spreads"));
const expeditions = loadExpeditions(join(contentDir, "expeditions"));
const bundle = atlasBundle(cards, spreads);
const atlas = new Atlas(bundle.regions, bundle.entries);

const pad = (s: string, n: number) => s.padEnd(n);
console.log("");

// 1. The plan, by how each type fires.
console.log("  The planned atlas, by what it takes to reach an entry");
const planned = ENTRY_PLAN.reduce((n, p) => n + p.target, 0);
const byKind = new Map<string, number>();
for (const p of ENTRY_PLAN) byKind.set(p.trigger, (byKind.get(p.trigger) ?? 0) + p.target);
for (const p of ENTRY_PLAN) {
  const have = p.type === "comparison" ? spreads.length : cards.filter((c) => c.type === p.type).length;
  console.log(
    `    ${pad(p.type, 18)} ${String(have).padStart(3)} of ${String(p.target).padStart(3)}` +
      `   ${pad(p.trigger, 10)} ${p.how}`,
  );
}
const discs = (byKind.get("disc") ?? 0) + (byKind.get("on-entry") ?? 0);
console.log(
  `\n    ${discs} of ${planned} entries are a circle on the ground, which is what the ` +
    `discovery system tests (D30).`,
);
console.log(
  `    ${byKind.get("on-entry") ?? 0} of those ${discs} sit on top of another entry, ` +
    `and ${planned - discs} are not places at all:`,
);
for (const kind of ["boundary", "condition", "progress"]) {
  const types = ENTRY_PLAN.filter((p) => p.trigger === kind);
  console.log(
    `      ${pad(kind, 10)} ${String(types.reduce((n, p) => n + p.target, 0)).padStart(3)}` +
      `   ${types.map((p) => p.type).join(", ")} — ${types[0]!.how}`,
  );
}

// The anti-stacking rule, run rather than described.
const [a, b] = coLocatedPair();
const stacking = validateCards([a, b]).filter((i) => i.field === "trigger");
console.log(
  `\n    A ${b.type} card authored at the ${a.type} that owns it: ` +
    (stacking.length === 0
      ? "accepted."
      : `rejected — "${stacking[0]!.message}".`),
);
console.log(
  `    That is the rule against two cards stacking, which the card queue has handled\n` +
    `    since F37. It currently forbids ${byKind.get("on-entry") ?? 0} planned entries.`,
);

// 2. Regions, counts and hints.
console.log("\n  Regions");
for (const c of atlas.counts()) {
  const mark = c.total === 0 ? "·" : atlas.complete(c.region) ? "✓" : " ";
  console.log(`    ${mark} ${pad(c.name, 28)} ${c.seen} of ${c.total}`);
}
const noHint = bundle.entries.filter((e) => e.hint === null);
console.log(
  `\n    ${bundle.entries.length - noHint.length} of ${bundle.entries.length} entries carry a ` +
    `soft hint; the rest fall back to their region:`,
);
for (const e of noHint.slice(0, 5)) console.log(`      ${pad(e.name, 28)} "${atlas.hintFor(e.id)}"`);
console.log(
  `    Nine region names, and none of them has a Chinese name to show beside it.`,
);

// 3. Spreads.
console.log("\n  Comparison spreads");
const spreadTarget = ENTRY_PLAN.find((p) => p.type === "comparison")!.target;
console.log(`    ${spreads.length} authored of ${spreadTarget} planned.`);
for (const s of bundle.spreads) {
  const state = spreadState(s, atlas, new Set());
  const missing = MEASURE_KEYS.filter(
    (k) => s.left.measures[k] === undefined || s.right.measures[k] === undefined,
  );
  console.log(
    `    ${pad(s.id, 24)} ${s.left.entry} / ${s.right.entry} · ` +
      `${state.unlocked ? `open by ${state.by}` : "locked"} · ` +
      (missing.length === 0
        ? `all ${MEASURE_KEYS.length} measures`
        : `missing ${missing.join(", ")}`),
  );
  for (const side of [s.left, s.right]) {
    const check = elevationCheck(side.entry, side.measures["elevation_m"]);
    if (check) console.log(`      ${check}`);
  }
}
for (const e of expeditions) {
  const linked = bundle.spreads.filter((s) => s.after === e.id);
  if (linked.length === 0)
    console.log(
      `    ⚠ ${e.id} ends with no spread. G2 scores "the full-screen comparison spread is\n` +
        `      read rather than dismissed by a majority", and there is nothing to read.`,
    );
}

// 4. What the repository can check for itself.
console.log(
  `\n  A spread carries ${SPREAD_MEASURES.length} numbers, a dish and a sketch. One of the numbers\n` +
    `  is already in this repository: elevation, out of the committed section the route was\n` +
    `  flown over (D21, D23). ${SPREAD_MEASURES.filter((m) => m.key !== "elevation_m").map((m) => m.label).join(", ")}\n` +
    `  are a writer's, with sources.\n`,
);

/** A food card at the city that owns it - the GDD's own trigger for one. */
function coLocatedPair(): [Card, Card] {
  const base = (over: Partial<Card>): Card => ({
    id: "city",
    type: "city",
    region: "sichuan-hengduan",
    names: { zh: "重庆", en: "Chongqing" },
    trigger: { lat: 29.56, lon: 106.55, radius_km: 15 },
    one_liner: "A city built on hills where two rivers meet, stacked in layers.",
    read_more: Array(100).fill("word").join(" "),
    figure: { value: 1, unit: "m", label: "x" },
    illustration_id: "x",
    sources: ["x"],
    ...over,
  });
  return [
    base({ id: "chongqing" }),
    base({ id: "chongqing-hotpot", type: "food", names: { zh: "重庆火锅", en: "Chongqing hotpot" } }),
  ];
}

/**
 * The authored elevation against the ground the route was flown over.
 *
 * `groundUnder` is where the reading happens; this is only how it prints.
 */
function elevationCheck(entry: string, authoredM: number | undefined): string | null {
  if (authoredM === undefined) return null;
  const under = groundUnder(entry, join(contentDir, "sections"));
  if (!under) return null;
  const drift = authoredM - under.groundM;
  return (
    `elevation_m ${authoredM} against ${under.groundM.toFixed(1)} m under ${entry} ` +
    `on ${under.expedition}` +
    (Math.abs(drift) > ELEVATION_TOLERANCE_M
      ? `  ⚠ ${drift > 0 ? "+" : ""}${drift.toFixed(0)} m`
      : " ✓")
  );
}
