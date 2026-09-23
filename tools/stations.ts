/**
 * `make stations`: the film's frame-cost stations, cut from its rails
 * (plan v2, stage 3: "hold GPU cost at the stations").
 *
 * One station a scene, on its rail at the authored speed sixty seconds into
 * the flight, with the altitude controller's height over the drawn ground.
 * Not a test and not CI: it needs the world for the ground, so it runs on
 * the machine that has one and writes `app/public/capture-stations.json`,
 * which `__ns.frameCost()` reads. Version 1's stations were the Sea to Sky
 * route's waypoints; the film has no route, it has nine scenes.
 */
import { existsSync, writeFileSync } from "node:fs";
import { AltitudeController } from "../engine/src/film/altitude.js";
import { buildRail, railAtKm } from "../engine/src/film/scene.js";
import { loadCorridor } from "./corridor.ts";
import { formatProblems, loadFilm } from "./film.ts";

/** Seconds into each flight the station is taken. */
export const STATION_AT_S = 60;
const OUT = "app/public/capture-stations.json";

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
const { film, problems } = loadFilm();
if (problems.length > 0) {
  console.error(`film problems:\n${formatProblems(problems)}`);
  process.exit(1);
}

const stations = film.scenes.map((s) => {
  const rail = buildRail(s.rail);
  let km = 0;
  let left = STATION_AT_S;
  for (let k = 0; k + 1 < rail.keys.length && left > 0; k++) {
    const segKm = (rail.path.cumM[k + 1]! - rail.path.cumM[k]!) / 1000;
    const segS = (segKm / rail.keys[k]!.kmPerMin) * 60;
    const take = Math.min(segS, left);
    km += (take / 60) * rail.keys[k]!.kmPerMin;
    left -= take;
  }
  const fix = railAtKm(rail, km);
  const ground = (e: number, n: number): number | null => (corridor.covers(e, n) ? corridor.drawnAt(e, n) : null);
  const groundM = ground(fix.eastM, fix.northM) ?? 0;
  const controller = new AltitudeController();
  const altitudeM = controller.update(0, fix.eastM, fix.northM, fix.headingRad, fix.aboveGroundM, s.band, ground, s.lookAheadKm);
  return {
    id: s.id,
    km: Math.round(km * 10) / 10,
    flightS: STATION_AT_S,
    eastM: Math.round(fix.eastM),
    northM: Math.round(fix.northM),
    altitudeM: Math.round(altitudeM),
    headingRad: Math.round(fix.headingRad * 1e6) / 1e6,
    groundM: Math.round(groundM),
    why: `scene ${s.id} at ${STATION_AT_S} s on its rail`,
  };
});

const out = { version: 2, expedition: "the film", world: worldDir, stations };
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`${OUT}: ${stations.length} stations`);
for (const st of stations) console.log(`  ${st.id.padEnd(16)} ${String(st.km).padStart(6)} km  alt ${st.altitudeM} m  ground ${st.groundM} m`);
