/**
 * Read the film off disk: every `NN-<id>.yaml` in `content/scenes/`, in the
 * order the prefix gives, parsed and checked by `content/scenes.ts`.
 *
 * Node only; the Vite plugin and the validator share it, so the film the
 * shell fetches is the film the gate checked.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { FILM_VERSION, type Film, type Scene } from "../engine/src/film/scene.js";
import { HERO_DIRS } from "../engine/src/terrain/heroSource.js";
import { sceneFromRaw, validateFilm, type FilmOptions, type Problem } from "../content/scenes.ts";

export const SCENES_DIR = "content/scenes";
const FILE = /^(\d\d)-([a-z0-9][a-z0-9-]*)\.yaml$/;

export interface LoadedFilm {
  readonly film: Film;
  readonly problems: readonly Problem[];
}

export function loadFilm(dir = SCENES_DIR, options: FilmOptions = {}): LoadedFilm {
  const problems: Problem[] = [];
  const scenes: Scene[] = [];
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort() : [];
  for (const file of files) {
    const m = FILE.exec(file);
    if (!m) {
      problems.push({ scene: file, field: "", message: "named NN-<id>.yaml, so the order is the file order" });
      continue;
    }
    let raw: unknown;
    try {
      raw = parse(readFileSync(join(dir, file), "utf8"));
    } catch (error) {
      problems.push({ scene: file, field: "", message: `not YAML: ${(error as Error).message}` });
      continue;
    }
    const read = sceneFromRaw(raw, m[2]!);
    problems.push(...read.problems);
    if (read.scene && read.problems.length === 0) scenes.push(read.scene);
  }
  const film: Film = { version: FILM_VERSION, scenes };
  problems.push(...validateFilm(film, options));
  return { film, problems };
}

/** Whether a world has built a hero grid of this id, from its published index. */
export function heroBuiltIn(worldDir: string): ((id: string) => boolean) | undefined {
  // One lattice per directory: the 90 m areas in `hero/`, the 30 m in `hero-30m/`.
  const ids = new Set<string>();
  let any = false;
  for (const dir of HERO_DIRS) {
    const index = join(worldDir, dir, "index.json");
    if (!existsSync(index)) continue;
    any = true;
    const parsed = JSON.parse(readFileSync(index, "utf8")) as { areas?: { id: string }[] };
    for (const a of parsed.areas ?? []) ids.add(a.id);
  }
  return any ? (id) => ids.has(id) : undefined;
}


export function formatProblems(problems: readonly Problem[]): string {
  return problems.map((p) => `  ${p.scene || "film"}${p.field ? `.${p.field}` : ""}: ${p.message}`).join("\n");
}

export interface RecordedKey {
  readonly lat: number;
  readonly lon: number;
  readonly above_ground_m: number;
  readonly speed: number;
}

/**
 * Write a recorded rail into its scene (D83). The scene's file keeps its
 * title, hour, band and captions; only the `rail:` block is replaced. A
 * scene with no file yet gets a skeleton at the end of the order, to be
 * renamed into its slot and filled in by hand.
 */
export function writeRail(id: string, keys: readonly RecordedKey[], dir = SCENES_DIR): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`not a scene id: ${id}`);
  if (keys.length < 2) throw new Error("a rail is at least two keys");
  const block =
    "rail:\n" +
    keys
      .map((k) => `  - { lat: ${k.lat.toFixed(4)}, lon: ${k.lon.toFixed(4)}, above_ground_m: ${Math.round(k.above_ground_m)}, speed: ${+k.speed.toFixed(1)} }`)
      .join("\n") +
    "\n";
  const existing = existsSync(dir) ? readdirSync(dir).find((f) => FILE.exec(f)?.[2] === id) : undefined;
  if (existing) {
    const path = join(dir, existing);
    const text = readFileSync(path, "utf8");
    const m = /^rail:\n(?:  - .*\n)*/m.exec(text);
    if (!m) throw new Error(`${existing} has no rail block to replace`);
    writeFileSync(path, text.slice(0, m.index) + block + text.slice(m.index + m[0].length));
    return path;
  }
  const path = join(dir, `99-${id}.yaml`);
  writeFileSync(
    path,
    `# Recorded in the app; rename into its slot and fill in the rest.\n\nid: ${id}\n` +
      `title: { zh: 待定, pinyin: dàidìng, en: ${id} }\nline: "To be written."\nmonth: 6\nhour: 12\n\n${block}\n` +
      `band: { above_ground_m: [100, 2000] }\ncorridor_deg: 60\n\ncaptions: []\n`,
  );
  return path;
}
