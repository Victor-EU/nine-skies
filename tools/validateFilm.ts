/**
 * The film's content gate: `npm run content:validate`, `make film`, CI.
 *
 * Reads every scene, holds it to `content/scenes.ts`, counts the text, and
 * exits non-zero on any problem. `--complete` also holds the film to its
 * finished nine scenes and a licensed cue for each with a wind bed under
 * them, which is the launch setting. Needs no world; when one is built it is
 * asked which hero grids exist.
 */
import { existsSync } from "node:fs";
import { TEXT_LINE_BUDGET, textLines } from "../content/scenes.ts";
import { soundStatus } from "../content/sound.ts";
import { SCENE_S } from "../engine/src/film/timeline.js";
import { formatProblems, heroBuiltIn, loadFilm, loadSound } from "./film.ts";

const complete = process.argv.includes("--complete");
// The first built world that carries a hero index answers for the hero grids.
const worldDir = ["dist-world/china", "dist-world/sea-to-sky"].find((d) => existsSync(`${d}/hero/index.json`)) ?? "dist-world/china";
const loaded = loadFilm(undefined, { complete, heroBuilt: heroBuiltIn(worldDir) });
const { film } = loaded;
const sound = loadSound(film, { complete });
const problems = [...loaded.problems, ...sound.problems];

const lines = textLines(film);
const seconds = film.scenes.length * SCENE_S;
console.log(
  `${film.scenes.length} scene(s), ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} of film, ` +
    `${lines.length} line(s) of text against a budget of ${TEXT_LINE_BUDGET}` +
    (heroBuiltIn(worldDir) ? ` · hero grids checked against ${worldDir}` : " · no world here, hero grids not checked"),
);
for (const s of film.scenes) console.log(`  ${s.id.padEnd(24)} ${s.title.zh} · ${s.title.en} · ${s.rail.length} keys · ${s.captions.length} caption(s)`);
console.log(soundStatus(sound.sound, film) + (complete ? "" : " (the launch gate, --complete, requires all of it)"));
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n${formatProblems(problems)}`);
  process.exit(1);
}
console.log("film ok");
