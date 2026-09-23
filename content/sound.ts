/**
 * The film's sound as content (design v2, "Sound"; plan v2, stage 5): which
 * file plays for each scene's cue, the wind bed, and whom each is credited
 * to. Parsed and checked here, in Node and the browser alike; the files and
 * whether they exist are the caller's to say.
 */
import type { Film } from "../engine/src/film/scene.js";
import type { Problem } from "./scenes.ts";

export interface SoundCredit {
  /** In `app/public/sound/`. */
  readonly file: string;
  readonly title: string;
  readonly author: string;
  readonly licence: string;
  readonly source: string;
}

export interface SoundCue extends SoundCredit {
  /** The name a scene's `music:` gives. */
  readonly cue: string;
}

export interface Sound {
  readonly cues: readonly SoundCue[];
  readonly wind: SoundCredit | null;
}

export const NO_SOUND: Sound = { cues: [], wind: null };

const FILE = /^[a-z0-9][a-z0-9._-]*\.(m4a|mp3|ogg|opus|webm)$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

function credit(raw: unknown, where: string, add: (field: string, message: string) => void): SoundCredit | null {
  if (!isRecord(raw)) {
    add(where, "a mapping of file, title, author, licence and source");
    return null;
  }
  let ok = true;
  for (const k of ["file", "title", "author", "licence", "source"] as const) {
    if (!isStr(raw[k])) {
      add(`${where}.${k}`, "required: the credits page prints it");
      ok = false;
    }
  }
  if (isStr(raw.file) && !FILE.test(raw.file)) {
    add(`${where}.file`, "a plain file name in app/public/sound/, ending .m4a, .mp3, .ogg, .opus or .webm");
    ok = false;
  }
  if (!ok) return null;
  return {
    file: raw.file as string,
    title: (raw.title as string).trim(),
    author: (raw.author as string).trim(),
    licence: (raw.licence as string).trim(),
    source: (raw.source as string).trim(),
  };
}

export function soundFromRaw(raw: unknown): { sound: Sound; problems: Problem[] } {
  const problems: Problem[] = [];
  const add = (field: string, message: string) => problems.push({ scene: "sound", field, message });
  if (!isRecord(raw)) {
    add("", "a mapping of cues and wind");
    return { sound: NO_SOUND, problems };
  }
  const cues: SoundCue[] = [];
  if (raw.cues !== undefined && raw.cues !== null) {
    if (!Array.isArray(raw.cues)) add("cues", "a list");
    else
      raw.cues.forEach((c, i) => {
        const name = isRecord(c) && isStr(c.cue) ? c.cue : null;
        if (!name) return add(`cues[${i}].cue`, "the cue's name, as a scene's `music:` gives it");
        const got = credit(c, `cues[${i}]`, add);
        if (got) cues.push({ ...got, cue: name });
      });
  }
  const wind = raw.wind === undefined || raw.wind === null ? null : credit(raw.wind, "wind", add);
  return { sound: { cues, wind }, problems };
}

export interface SoundOptions {
  /** Whether a file is in `app/public/sound/`; absent, files are not checked. */
  readonly fileExists?: ((file: string) => boolean) | undefined;
  /** The launch setting: every scene's cue and the wind bed are required. */
  readonly complete?: boolean | undefined;
}

/** The sound held to the film it plays under. */
export function validateSound(sound: Sound, film: Film, options: SoundOptions = {}): Problem[] {
  const problems: Problem[] = [];
  const add = (field: string, message: string) => problems.push({ scene: "sound", field, message });
  const named = new Set(film.scenes.map((s) => s.music).filter((m): m is string => m !== null));
  const seen = new Set<string>();
  for (const c of sound.cues) {
    if (seen.has(c.cue)) add(`cues.${c.cue}`, "listed twice");
    seen.add(c.cue);
    if (!named.has(c.cue)) add(`cues.${c.cue}`, "no scene plays it");
  }
  if (options.fileExists) {
    for (const c of [...sound.cues, ...(sound.wind ? [sound.wind] : [])]) {
      if (!options.fileExists(c.file)) add(c.file, "is not in app/public/sound/");
    }
  }
  if (options.complete) {
    for (const s of film.scenes) {
      if (s.music === null) problems.push({ scene: s.id, field: "music", message: "a finished film has a cue for every scene" });
      else if (!seen.has(s.music)) problems.push({ scene: s.id, field: "music", message: `${s.music} has no licensed file in content/sound.yaml` });
    }
    if (!sound.wind) add("wind", "a finished film has its wind bed");
  }
  return problems;
}

/** What the sound still lacks, in a line: for the gate's report. */
export function soundStatus(sound: Sound, film: Film): string {
  const cues = new Set(sound.cues.map((c) => c.cue));
  const have = film.scenes.filter((s) => s.music !== null && cues.has(s.music)).length;
  return `sound: ${have} of ${film.scenes.length} cues, ${sound.wind ? "a wind bed" : "no wind bed"}`;
}
