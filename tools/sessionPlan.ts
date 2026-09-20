/**
 * What a playtest session of a given length actually contains (G1, G2).
 *
 * A gate protocol says "fly the corridor for twelve minutes" and a route is
 * authored in kilometres. Converting between them is not arithmetic: true
 * airspeed rises as the air thins, so the back half of Expedition 1 goes past
 * far faster than the front, and no amount of reasoning about distance
 * answers where a cohort will be when their session ends.
 *
 *   npm run content:sessions           # twelve minutes, the G1 protocol
 *   npm run content:sessions -- 30     # a G2-length session
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { steepestRise } from "../engine/src/sim/route.ts";
import { densityRatio } from "../engine/src/sim/atmosphere.ts";
import { flyableFrom, loadExpeditions } from "./expedition.ts";
import { resolveGround } from "./ground.ts";
import { sectionsDir } from "./routeCheck.ts";
import { profileOf, session, startsContainingRim, trackOf } from "./session.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const minutes = Number(process.argv[2] ?? 12);
const contentDir = join(root, "content");

console.log(`\n  sessions of ${minutes} minutes\n`);
let unflown = 0;
for (const expedition of loadExpeditions(join(contentDir, "expeditions"))) {
  const ground = resolveGround(expedition, join(root, "dist-world"), sectionsDir(contentDir));
  if (!ground.groundM) {
    console.log(`  ⚠ ${expedition.id} — ${ground.skipReason}`);
    unflown++;
    continue;
  }
  const { route, ground: profile } = flyableFrom(expedition, ground.groundM);
  const whole = trackOf(route, profile, expedition.start_altitude_m);
  const total = whole[whole.length - 1]!.seconds / 60;
  const wall = steepestRise(profileOf(profile, whole.length));
  const rim = whole.find((s) => s.km >= wall.rimKm) ?? whole[whole.length - 1]!;

  console.log(
    `  ${expedition.id} · ${total.toFixed(1)} min over ${whole[whole.length - 1]!.km} km\n` +
      `    the wall  km ${wall.footKm}–${wall.rimKm}, ${wall.riseM.toFixed(0)} m at ` +
      `${wall.gradientMPerKm.toFixed(1)} m/km · crossed at minute ${(rim.seconds / 60).toFixed(1)}`,
  );

  const fromStart = session(route, profile, whole, { minutes, startKm: 0, escarpment: wall });
  console.log(
    `    from the start: km 0–${fromStart.endKm.toFixed(0)} · climbs ` +
      `${fromStart.climbM.toFixed(0)} m to ${fromStart.endAltitudeM.toFixed(0)} m over ground at ` +
      `${fromStart.groundEndM.toFixed(0)} m · air to σ ${fromStart.lowestSigma.toFixed(2)} · ` +
      (fromStart.rimAtMinute === null
        ? `DOES NOT REACH THE WALL — ${(rim.seconds / 60 - minutes).toFixed(1)} min short`
        : `wall at minute ${fromStart.rimAtMinute.toFixed(1)}`),
  );

  const containing = startsContainingRim(route, profile, whole, minutes);
  if (containing.length === 0) {
    console.log(`    no start at this length contains the wall`);
  } else {
    const first = containing[0]!;
    console.log(
      `    earliest start that contains it: km ${first.startKm} at ` +
        `${first.startAltitudeM.toFixed(0)} m (σ ${densityRatio(first.startAltitudeM).toFixed(2)}), ` +
        `wall at minute ${first.rimAtMinute!.toFixed(1)}`,
    );
  }
  console.log("");
}
if (unflown > 0) process.exit(1);
