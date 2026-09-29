/**
 * `npx vite-node tools/sightlines.ts`: when each monument of the cast is
 * behind the ground (F133), into `content/scenes/sightlines.json`, which the
 * film reads as each scene's `behind`.
 *
 * The director brings a Dragon King up where the flight is looking (D93),
 * and knew only where across the picture his place was: over Huangshan it
 * brought the King of the North up straight ahead, ten kilometres off,
 * behind the peaks. This flies each scene's rail at its authored speeds,
 * the camera held by the altitude controller over the drawn ground as the
 * shell holds it, and for every quarter second asks whether the ground
 * rises above the straight line from the lens to each monument's place, at
 * its height over the ground there. The spans it does are written by place
 * (`placeKey`), with a digest of what they were worked out from, so the
 * film can tell when a rail or a place has moved since.
 *
 * Needs the built world for the ground, so it runs on the machine that has
 * one, as `make stations` does. Run it again after a rail, a band, a
 * monument's place, or the ground under them changes; the content gate
 * says when the rail or a place has.
 */
import { existsSync, writeFileSync } from "node:fs";
import { authoredKm, placeKey } from "../engine/src/cast/sight.js";
import { AltitudeController } from "../engine/src/film/altitude.js";
import { buildRail, railAtKm, type Scene } from "../engine/src/film/scene.js";
import { SCENE_S } from "../engine/src/film/timeline.js";
import { projectAlbers } from "../engine/src/terrain/worldGrid.js";
import { loadCorridor } from "./corridor.ts";
import { formatProblems, loadFilm, railDigest, SIGHTLINES_FILE, type Sightlines } from "./film.ts";

/** Seconds between the times asked, and between the controller's steps. */
const STEP_S = 0.25;
const TICK_S = 1 / 30;
/** Metres between the ground's samples along a sightline, and how far from each end they stop. */
const ALONG_M = 30;
const NEAR_M = 60;
const FAR_M = 100;
/** Seconds a place may show between two spans behind the ground and still count as behind it: a peep over a ridge is not a sight. */
const PEEP_S = 1;

const worldDir = ["dist-world/china", "dist-world/sea-to-sky"].find((d) => existsSync(`${d}/manifest.json`));
if (!worldDir) {
  console.error("no built world under dist-world/; `make world CORRIDOR=china` builds one");
  process.exit(1);
}
const corridor = loadCorridor(worldDir);
if (!corridor) {
  console.error(`${worldDir} could not be read`);
  process.exit(1);
}
const ground = (e: number, n: number): number | null => (corridor.covers(e, n) ? corridor.drawnAt(e, n) : null);

// The film as written, whatever the sightlines on disk say about it.
const { film, problems } = loadFilm(undefined, {}, { sightlines: false });
if (problems.length > 0) {
  console.error(`film problems:\n${formatProblems(problems)}`);
  process.exit(1);
}

/** Whether the ground stands between the lens and a point, all in real metres. */
function blocked(eye: { eastM: number; northM: number; altitudeM: number }, eastM: number, northM: number, altitudeM: number): boolean {
  const d = Math.hypot(eastM - eye.eastM, northM - eye.northM);
  for (let m = NEAR_M; m < d - FAR_M; m += ALONG_M) {
    const u = m / d;
    const g = ground(eye.eastM + u * (eastM - eye.eastM), eye.northM + u * (northM - eye.northM));
    if (g !== null && g > eye.altitudeM + u * (altitudeM - eye.altitudeM)) return true;
  }
  return false;
}

function sightlinesOf(scene: Scene): Sightlines["scenes"][string] {
  const rail = buildRail(scene.rail);
  const kmAt = authoredKm(rail);
  const controller = new AltitudeController();
  const places = scene.cast.flatMap((c) => (c.role === "monument" && c.at ? [c.at] : []));
  const spans: Record<string, [number, number][]> = {};
  const open = new Map<string, number>();
  let last = 0;
  for (let tick = 0; tick * TICK_S <= SCENE_S + 1e-9; tick++) {
    const s = tick * TICK_S;
    const fix = railAtKm(rail, kmAt(s));
    const altitudeM = controller.update(tick === 0 ? 0 : TICK_S, fix.eastM, fix.northM, fix.headingRad, fix.aboveGroundM, scene.band, ground, scene.lookAheadKm);
    if (Math.abs(s / STEP_S - Math.round(s / STEP_S)) > 1e-6) continue;
    const eye = { eastM: fix.eastM, northM: fix.northM, altitudeM };
    for (const at of places) {
      const key = placeKey(at);
      const p = projectAlbers(at.lat, at.lon);
      const hidden = blocked(eye, p.eastM, p.northM, (ground(p.eastM, p.northM) ?? 0) + at.aboveGroundM);
      if (hidden && !open.has(key)) open.set(key, s);
      if (!hidden && open.has(key)) {
        const list = (spans[key] ??= []);
        const before = list[list.length - 1];
        if (before && open.get(key)! - before[1] < PEEP_S) before[1] = s;
        else list.push([open.get(key)!, s]);
        open.delete(key);
      }
    }
    last = s;
  }
  for (const [key, from] of open) {
    const list = (spans[key] ??= []);
    const before = list[list.length - 1];
    if (before && from - before[1] < PEEP_S) before[1] = last + STEP_S;
    else list.push([from, last + STEP_S]);
  }
  for (const at of places) spans[placeKey(at)] ??= [];
  return { rail: railDigest(scene), places: spans };
}

const out: Sightlines = { scenes: {} };
for (const scene of film.scenes) {
  if (!scene.cast.some((c) => c.role === "monument" && c.at)) continue;
  const lines = sightlinesOf(scene);
  out.scenes[scene.id] = lines;
  for (const [key, spans] of Object.entries(lines.places)) {
    const hidden = spans.reduce((sum, [a, b]) => sum + b - a, 0);
    console.log(`  ${scene.id.padEnd(26)} ${key.padEnd(28)} behind the ground ${hidden.toFixed(1).padStart(5)} s of ${SCENE_S}`);
  }
}
// A place a line, so a change reads as the places that moved.
const text = [
  "{",
  '  "scenes": {',
  Object.entries(out.scenes)
    .map(([id, s]) => {
      const places = Object.entries(s.places).map(([key, spans]) => `        ${JSON.stringify(key)}: ${JSON.stringify(spans)}`);
      return `    ${JSON.stringify(id)}: {\n      "rail": ${JSON.stringify(s.rail)},\n      "places": {\n${places.join(",\n")}\n      }\n    }`;
    })
    .join(",\n"),
  "  }",
  "}",
].join("\n");
writeFileSync(SIGHTLINES_FILE, text + "\n");
console.log(`wrote ${SIGHTLINES_FILE} from ${worldDir}`);
