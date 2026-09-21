/**
 * Every authored challenge, flown and priced.
 *
 *   npm run content:challenges
 *
 * A gate rather than a report, unlike `teaches` and `atlas`: a challenge
 * whose objectives cannot be met, or whose gate is narrower than the
 * aeroplane's own turn, is broken rather than unwritten.
 *
 * It runs in CI as well as on a machine with a world (D39). A challenge is a
 * set of points rather than a route, so what is committed beside it is not a
 * profile along a line but a swath of the world's own lattice wide enough for
 * the aeroplane's own turn — and because that is a subset of the world rather
 * than a resampling of it, the flight CI runs is the flight the author ran,
 * to the millisecond. A challenge with neither world nor patch is reported as
 * a failure rather than a pass.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHALLENGE_RULES } from "../content/schema.ts";
import { AIRCRAFT_TIME_RATE, clockString } from "../engine/src/sim/solar.ts";
import { loadChallenges } from "./challenge.ts";
import { checkChallenge } from "./challengeCheck.ts";
import { corridorCache } from "./corridor.ts";
import { describeGap } from "./routeCheck.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const challengesDir = join(root, "content", "challenges");
const open = corridorCache(join(root, "dist-world"));
const patchesDir = join(root, "content", "patches");

const pct = (x: number): string => `${(x * 100).toFixed(0)} %`;

console.log("");
let failures = 0;
for (const c of loadChallenges(challengesDir)) {
  const r = checkChallenge(c, open, patchesDir);
  console.log(`  ${c.id} · ${c.name} · ${c.speed} · ${r.courseKm.toFixed(0)} km · ${r.minutes.toFixed(1)} min`);
  console.log(`    ${c.bite}`);
  if (r.minutes > CHALLENGE_RULES.maxMinutes)
    console.log(`    ⚠ ${r.minutes.toFixed(1)} min is over the ${CHALLENGE_RULES.maxMinutes} min a challenge is meant to be`);

  if (r.patchIssue) {
    console.log(`    ✗ patch: ${r.patchIssue}`);
    failures++;
  }
  // Only ever non-null on a machine with a world, which is the machine that
  // has the 90 m cover to compare against (F53).
  const gap = describeGap(r.drawnGap);
  if (gap) {
    console.log(`    ✗ ${gap}`);
    failures++;
  } else if (r.drawnGap?.cover) {
    console.log(
      `    90 m cover beside it: ${r.drawnGap.cover} · ` +
        `${r.drawnGap.over} of ${r.drawnGap.of} committed cells over it`,
    );
  }
  const from = r.world === null ? "nothing built" : r.groundSource === "patch" ? `the committed patch of ${r.world}` : r.world;
  console.log(`    ground, from ${from}:`);
  for (const g of r.ground)
    console.log(`      ${g.what.padEnd(22)} ${g.groundM === null ? "    — not built" : `${g.groundM.toFixed(1).padStart(8)} m`}`);

  if (r.widths.length) {
    console.log(`    widths against a full-bank reversal at ${c.speed} and ${c.start.altitude_m} m:`);
    for (const w of r.widths) {
      const ok = w.widthM >= w.reversalM;
      console.log(
        `      ${w.what.padEnd(22)} ${(w.widthM / 1000).toFixed(1).padStart(6)} km  ` +
          `reversal ${(w.reversalM / 1000).toFixed(1)} km  ${ok ? "fits" : "TOO NARROW TO FLY"}`,
      );
      if (!ok) failures++;
    }
  }

  const d = c.deadline;
  if (d && r.deadlineMinutes !== null) {
    console.log(`    deadline: ${d.label} at ${clockString(r.deadlineMinutes)} Beijing`);
    const available = r.deadlineMinutes - c.start_hour * 60;
    console.log(`      ${available.toFixed(1)} clock minutes available, ${r.minutes.toFixed(1)} minutes of flying`);
    for (const rate of [1, AIRCRAFT_TIME_RATE]) {
      const spent = r.minutes * rate;
      console.log(
        `      at x${String(rate).padEnd(5)} the flight costs ${spent.toFixed(1).padStart(6)} clock min — ` +
          (spent <= available ? `wins by ${(available - spent).toFixed(1)}` : `loses by ${(spent - available).toFixed(1)}`),
      );
    }
    console.log(`      dead heat at x${(available / r.minutes).toFixed(2)}`);
  } else if (d) {
    console.log(`    ⚠ deadline "${d.label}" could not be computed`);
  }

  if (!r.flight) {
    console.log(`    ⚠ not flown — ${r.skipReason}\n`);
    failures++;
    continue;
  }
  const f = r.flight;
  console.log(
    `    flown: ${f.state} in ${f.seconds.toFixed(0)} s, lowest ${f.minAglM.toFixed(0)} m above ground` +
      `${f.bounces ? `, ${f.bounces} bounce frames` : ""}`,
  );
  // A flight over ground that is not there completes things it was never
  // shown to be able to do, and says `done` while doing it (F44).
  if (f.framesWithoutGround) {
    console.log(
      `      ✗ ${f.framesWithoutGround} frame(s) flown with no ground under the aircraft — ` +
        `this flight proves nothing`,
    );
    failures++;
  }
  for (const o of f.outcomes)
    console.log(`      ${o.state === "met" ? "✓" : o.state === "missed" ? "✗" : "·"} ${o.id.padEnd(12)} ${pct(o.progress).padStart(5)}  ${o.label}`);
  if (f.marginMinutes !== null)
    console.log(`      ${f.marginMinutes.toFixed(1)} clock minutes left on the deadline`);
  if (f.state !== "done") failures++;
  console.log("");
}

if (failures) {
  console.log(`  ${failures} challenge problem(s)\n`);
  process.exitCode = 1;
}
