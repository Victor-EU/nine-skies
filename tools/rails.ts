/**
 * `make rails`: every rail flown over the built world, and what the camera
 * would do on it (plan v2, D83).
 *
 * Not a test and not CI: it needs the world, so it runs on the machine that
 * has one and its report is committed beside the scenes. For each scene it
 * walks the rail at the authored speed with the altitude controller reading
 * the world's drawn ground (the hero grid where one is drawn, the country
 * grid elsewhere), and reports the camera's height over the ground under it,
 * the ground ahead that stands above the camera, and how much of the rail
 * lies over a hero grid.
 *
 *   npm run content:rails            # docs/rails-report.md
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { AltitudeController } from "../engine/src/film/altitude.js";
import { buildRail, railAtKm, railSecondsAtAuthoredSpeed } from "../engine/src/film/scene.js";
import { FLIGHT_S } from "../engine/src/film/timeline.js";
import { loadCorridor, type Corridor } from "./corridor.ts";
import { formatProblems, loadFilm } from "./film.ts";

/** Metres between samples along the rail. */
const STEP_M = 250;
/** The ground this far ahead is checked against the camera's height. */
const AHEAD_M = [500, 1000, 2000];

interface RailReport {
  readonly id: string;
  readonly lengthKm: number;
  readonly authoredS: number;
  readonly samples: number;
  readonly offWorld: number;
  readonly overHero: number;
  readonly minAboveM: number;
  readonly maxAboveM: number;
  readonly minAltitudeM: number;
  readonly maxAltitudeM: number;
  /** Samples where ground within `AHEAD_M` stands above the camera. */
  readonly groundAhead: number;
  readonly worstAheadM: number;
  readonly floorHits: number;
  readonly ceilingHits: number;
}

function fly(
  corridor: Corridor,
  id: string,
  scene: Parameters<typeof buildRail>[0],
  band: { minM: number; maxM: number },
  lookAheadKm: number,
): RailReport {
  const rail = buildRail(scene);
  const controller = new AltitudeController();
  const ground = (e: number, n: number): number | null => (corridor.covers(e, n) ? corridor.drawnAt(e, n) : null);
  const totalM = rail.path.lengthKm * 1000;
  let samples = 0;
  let offWorld = 0;
  let overHero = 0;
  let minAbove = Infinity;
  let maxAbove = -Infinity;
  let minAlt = Infinity;
  let maxAlt = -Infinity;
  let groundAhead = 0;
  let worstAhead = 0;
  let floorHits = 0;
  let ceilingHits = 0;
  let lastAlt: number | null = null;
  for (let m = 0; m <= totalM; m += STEP_M) {
    const fix = railAtKm(rail, m / 1000);
    const dt = lastAlt === null ? 0 : STEP_M / ((fix.kmPerMin * 1000) / 60);
    const alt = controller.update(dt, fix.eastM, fix.northM, fix.headingRad, fix.aboveGroundM, band, ground, lookAheadKm);
    lastAlt = alt;
    samples++;
    if (!corridor.covers(fix.eastM, fix.northM)) {
      offWorld++;
      continue;
    }
    const under = corridor.drawnAt(fix.eastM, fix.northM);
    if (corridor.heroGroundAt(fix.eastM, fix.northM) !== null) overHero++;
    const above = alt - under;
    minAbove = Math.min(minAbove, above);
    maxAbove = Math.max(maxAbove, above);
    minAlt = Math.min(minAlt, alt);
    maxAlt = Math.max(maxAlt, alt);
    if (above <= band.minM + 1) floorHits++;
    if (above >= band.maxM - 1) ceilingHits++;
    let worst = 0;
    for (const ahead of AHEAD_M) {
      const e = fix.eastM + Math.sin(fix.headingRad) * ahead;
      const n = fix.northM + Math.cos(fix.headingRad) * ahead;
      if (!corridor.covers(e, n)) continue;
      worst = Math.max(worst, corridor.drawnAt(e, n) - alt);
    }
    if (worst > 0) {
      groundAhead++;
      worstAhead = Math.max(worstAhead, worst);
    }
  }
  return {
    id,
    lengthKm: rail.path.lengthKm,
    authoredS: railSecondsAtAuthoredSpeed(rail),
    samples,
    offWorld,
    overHero,
    minAboveM: minAbove,
    maxAboveM: maxAbove,
    minAltitudeM: minAlt,
    maxAltitudeM: maxAlt,
    groundAhead,
    worstAheadM: worstAhead,
    floorHits,
    ceilingHits,
  };
}

function render(world: string, reports: readonly RailReport[]): string {
  const pct = (n: number, of: number) => (of === 0 ? "—" : `${((100 * n) / of).toFixed(0)} %`);
  const lines = [
    "# Rails report",
    "",
    `Every scene's rail flown over \`${world}\` by \`tools/rails.ts\` (plan v2, D83): the altitude`,
    `controller reading the drawn ground every ${STEP_M} m at the authored speed. *Above* is the`,
    "camera over the ground directly under it; *ahead* counts samples where ground within",
    `${AHEAD_M[AHEAD_M.length - 1]} m along the heading stands above the camera, which is a wall in the frame.`,
    `The flight is ${FLIGHT_S} s; a viewer at double speed needs twice that of rail.`,
    "",
    "| Scene | Rail | At authored speed | Over hero grid | Off world | Above ground | Altitude | Ground ahead | Worst ahead | At floor | At ceiling |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const r of reports) {
    lines.push(
      `| ${r.id} | ${r.lengthKm.toFixed(0)} km | ${r.authoredS.toFixed(0)} s | ${pct(r.overHero, r.samples)} | ` +
        `${r.offWorld} | ${r.minAboveM.toFixed(0)}–${r.maxAboveM.toFixed(0)} m | ${r.minAltitudeM.toFixed(0)}–${r.maxAltitudeM.toFixed(0)} m | ` +
        `${pct(r.groundAhead, r.samples)} | ${r.worstAheadM.toFixed(0)} m | ${pct(r.floorHits, r.samples)} | ${pct(r.ceilingHits, r.samples)} |`,
    );
  }
  return lines.join("\n") + "\n";
}

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
const reports = film.scenes.map((s) => fly(corridor, s.id, s.rail, s.band, s.lookAheadKm));
const text = render(worldDir, reports);
mkdirSync("docs", { recursive: true });
writeFileSync("docs/rails-report.md", text);
console.log(text);
