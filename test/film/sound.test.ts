/** The sound as content: every file credited, every cue played, and at launch, nothing missing. */
import { describe, expect, it } from "vitest";
import { soundFromRaw, soundStatus, validateSound } from "../../content/sound.ts";
import { loadFilm, loadSound } from "../../tools/film.ts";

const { film } = loadFilm();
const entry = (cue: string) => ({ cue, file: `${cue}.m4a`, title: "Piece", author: "Someone", licence: "CC BY 4.0", source: "https://example.org" });

describe("the film's sound", () => {
  it("as committed reads, and says what it lacks", () => {
    const { sound, problems } = loadSound(film);
    expect(problems).toEqual([]);
    expect(soundStatus(sound, film)).toMatch(/^sound: \d of 9 cues/);
  });

  it("refuses an entry the credits page could not print, or a file that is not a plain name", () => {
    const { problems } = soundFromRaw({ cues: [{ cue: "cue-01", file: "../x.m4a", title: "t" }] });
    expect(problems.map((p) => p.field).sort()).toEqual(["cues[0].author", "cues[0].file", "cues[0].licence", "cues[0].source"]);
  });

  it("refuses a cue no scene plays, a cue listed twice, and a file that is not there", () => {
    const { sound } = soundFromRaw({ cues: [entry("cue-01"), entry("cue-01"), entry("cue-99")] });
    const fields = validateSound(sound, film, { fileExists: (f) => f !== "cue-99.m4a" }).map((p) => p.field);
    expect(fields).toEqual(expect.arrayContaining(["cues.cue-01", "cues.cue-99", "cue-99.m4a"]));
  });

  it("at launch, wants a cue for every scene and the wind bed", () => {
    const { sound } = soundFromRaw({ cues: film.scenes.slice(1).map((s) => entry(s.music!)), wind: null });
    const problems = validateSound(sound, film, { complete: true });
    expect(problems.map((p) => `${p.scene}.${p.field}`)).toEqual([`${film.scenes[0]!.id}.music`, "sound.wind"]);
    const whole = soundFromRaw({ cues: film.scenes.map((s) => entry(s.music!)), wind: { file: "wind.m4a", title: "Wind", author: "a", licence: "l", source: "s" } });
    expect(validateSound(whole.sound, film, { complete: true })).toEqual([]);
  });
});
