/**
 * Read the film off disk: every `NN-<id>.yaml` in `content/scenes/`, in the
 * order the prefix gives, parsed and checked by `content/scenes.ts`.
 *
 * Node only; the Vite plugin and the validator share it, so the film the
 * shell fetches is the film the gate checked.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { FILM_VERSION, type Film, type Scene } from "../engine/src/film/scene.js";
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
  const index = join(worldDir, "hero", "index.json");
  if (!existsSync(index)) return undefined;
  const parsed = JSON.parse(readFileSync(index, "utf8")) as { areas?: { id: string }[] };
  const ids = new Set((parsed.areas ?? []).map((a) => a.id));
  return (id) => ids.has(id);
}

export function formatProblems(problems: readonly Problem[]): string {
  return problems.map((p) => `  ${p.scene || "film"}${p.field ? `.${p.field}` : ""}: ${p.message}`).join("\n");
}
