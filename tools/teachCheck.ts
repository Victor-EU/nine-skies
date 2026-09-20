/**
 * What each expedition actually shows, against what its file claims (G2).
 *
 *   npm run content:teaches
 *
 * A report and never a gate. The route is not broken when these disagree —
 * Sea to Sky crosses exactly the ground it says it crosses — so the thing to
 * change is the lesson, the routing, or the criterion, and which of those is
 * a writing decision. Failing a build over it would be answering it.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { flyableFrom, loadExpeditions } from "./expedition.ts";
import { resolveGround } from "./ground.ts";
import { sectionsDir } from "./routeCheck.ts";
import { lessonOf } from "./teaches.ts";
import { trackOf } from "./session.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = join(root, "content");
const bar = (km: number, per = 40) => "▁".repeat(Math.max(1, Math.round(km / per)));

console.log("");
for (const expedition of loadExpeditions(join(contentDir, "expeditions"))) {
  const ground = resolveGround(expedition, join(root, "dist-world"), sectionsDir(contentDir));
  if (!ground.groundM) {
    console.log(`  ⚠ ${expedition.id} — ${ground.skipReason}\n`);
    continue;
  }
  const { route, ground: profile } = flyableFrom(expedition, ground.groundM);
  const track = trackOf(route, profile, expedition.start_altitude_m);
  const lesson = lessonOf(expedition.teaches, track, profile);

  console.log(`  ${expedition.id} · ${lesson.minutes.toFixed(1)} min`);
  console.log(`    teaches: ${lesson.teaches}`);
  console.log(`    minutes over each step, which is what a sketch is drawn from:`);
  for (const step of lesson.steps)
    console.log(
      `      ${step.name.padEnd(26)} ${step.minutes.toFixed(1).padStart(5)} min  ` +
        `${(step.share * 100).toFixed(0).padStart(3)} %`,
    );
  console.log(`    shape, cut at the route's own wall (km ${lesson.wall.footKm}–${lesson.wall.rimKm}):`);
  for (const s of lesson.sections) {
    const f = s.flatness;
    console.log(
      `      ${s.name.padEnd(16)} km ${String(s.fromKm).padStart(4)}–${String(s.toKm).padEnd(4)} · ` +
        `${f.lowM.toFixed(0).padStart(4)}–${f.highM.toFixed(0).padStart(4)} m · sd ${f.sdM.toFixed(0).padStart(3)} m · ` +
        `flattest run ${String(f.longestFlatKm).padStart(4)} km ${bar(f.longestFlatKm)} · ` +
        `${String(f.reversals).padStart(3)} reversals`,
    );
  }
  console.log(`    the flattest thing flown over is "${lesson.flattest.name}"\n`);
}
