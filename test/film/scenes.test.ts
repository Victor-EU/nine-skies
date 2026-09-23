/**
 * The film's content gate (D81): every committed scene passes it, and the
 * things it exists to refuse are refused.
 */
import { describe, expect, it } from "vitest";
import {
  CAPTIONS_PER_SCENE,
  TEXT_LINE_BUDGET,
  WORDS_PER_LINE,
  sceneFromRaw,
  textLines,
  validateFilm,
  validateScene,
  wordCount,
} from "../../content/scenes.ts";
import { FILM_VERSION } from "../../engine/src/film/scene.js";
import { SCENE_S } from "../../engine/src/film/timeline.js";
import { loadFilm } from "../../tools/film.ts";

/** A rail long enough for a fast viewer: Yichang to Chongqing, roughly. */
const longRail = [
  { lat: 30.7, lon: 111.29, above_ground_m: 300, speed: 90 },
  { lat: 31.04, lon: 109.57, above_ground_m: 300, speed: 90 },
  { lat: 30.3, lon: 108.0, above_ground_m: 300, speed: 90 },
  { lat: 29.57, lon: 106.55, above_ground_m: 300, speed: 90 },
];

function good(over: Record<string, unknown> = {}) {
  return {
    id: "gorges",
    title: { zh: "三峡", pinyin: "Sānxiá", en: "The Three Gorges" },
    line: "One river, three gorges.",
    month: 5,
    hour: 9.5,
    rail: longRail,
    band: { above_ground_m: [100, 900] },
    corridor_deg: 60,
    captions: [{ at: 20, text: "The camera is below the rim." }],
    ...over,
  };
}

const problemsOf = (raw: unknown, name = "gorges") => {
  const read = sceneFromRaw(raw, name);
  return read.scene ? [...read.problems, ...validateScene(read.scene)] : read.problems;
};

describe("the committed scenes", () => {
  const { film, problems } = loadFilm();

  it("all pass the gate", () => {
    expect(problems).toEqual([]);
    expect(film.version).toBe(FILM_VERSION);
    expect(film.scenes.length).toBeGreaterThan(0);
  });

  it("say fewer than forty lines, none over twelve words", () => {
    const lines = textLines(film);
    expect(lines.length).toBeLessThan(TEXT_LINE_BUDGET);
    for (const l of lines) expect(wordCount(l)).toBeLessThanOrEqual(WORDS_PER_LINE);
  });

  it("each last exactly 120 seconds, so the film is the scene count times two minutes", () => {
    expect(SCENE_S).toBe(120);
    expect(film.scenes.length * SCENE_S).toBe(film.scenes.length * 120);
  });

  it("each carry a title in characters, pinyin and English", () => {
    for (const s of film.scenes) {
      expect(s.title.zh).toMatch(/[㐀-鿿]/);
      expect(s.title.pinyin.length).toBeGreaterThan(0);
      expect(s.title.en.length).toBeGreaterThan(0);
    }
  });
});

describe("what the gate refuses", () => {
  it("nothing about a good scene", () => {
    expect(problemsOf(good())).toEqual([]);
  });

  it("a rail a fast viewer would run off", () => {
    const short = problemsOf(good({ rail: longRail.slice(0, 2) }));
    expect(short.map((p) => p.field)).toContain("rail");
    expect(short[0]!.message).toMatch(/km more/);
  });

  it("a caption over twelve words, too many captions, or two on screen at once", () => {
    const long = "one two three four five six seven eight nine ten eleven twelve thirteen";
    expect(problemsOf(good({ captions: [{ at: 10, text: long }] })).map((p) => p.field)).toEqual(["captions[0]"]);
    const many = Array.from({ length: CAPTIONS_PER_SCENE + 1 }, (_, i) => ({ at: 10 + i * 10, text: "x" }));
    expect(problemsOf(good({ captions: many })).map((p) => p.field)).toContain("captions");
    const overlap = [
      { at: 10, text: "a" },
      { at: 12, text: "b" },
    ];
    expect(problemsOf(good({ captions: overlap })).map((p) => p.field)).toEqual(["captions[1].at"]);
    expect(problemsOf(good({ captions: [{ at: 110, text: "late" }] })).map((p) => p.field)).toEqual(["captions[0].at"]);
  });

  it("an hour with no sun", () => {
    expect(problemsOf(good({ hour: 2 })).map((p) => p.field)).toEqual(["hour"]);
    expect(problemsOf(good({ hour: 18.5, month: 6 }))).toEqual([]);
  });

  it("a key outside China, a height outside the band, a title without characters", () => {
    expect(problemsOf(good({ rail: [{ lat: 48.8, lon: 2.3, above_ground_m: 300, speed: 90 }, ...longRail] })).map((p) => p.field)).toContain("rail[0].lon");
    expect(problemsOf(good({ band: { above_ground_m: [400, 900] } })).map((p) => p.field)).toContain("rail[0].above_ground_m");
    expect(problemsOf(good({ title: { zh: "Sanxia", pinyin: "Sānxiá", en: "x" } })).map((p) => p.field)).toEqual(["title.zh"]);
    expect(problemsOf(good(), "other").map((p) => p.field)).toEqual(["id"]);
  });

  it("a look-ahead that would read as a wall or as a map; eight kilometres unless the scene says", () => {
    expect(sceneFromRaw(good(), "gorges").scene!.lookAheadKm).toBe(8);
    expect(sceneFromRaw(good({ look_ahead_km: 1.5 }), "gorges").scene!.lookAheadKm).toBe(1.5);
    expect(problemsOf(good({ look_ahead_km: 0.1 })).map((p) => p.field)).toEqual(["look_ahead_km"]);
    expect(problemsOf(good({ look_ahead_km: "far" })).map((p) => p.field)).toEqual(["look_ahead_km"]);
  });

  it("a hero grid the world has not built, when there is a world to ask", () => {
    const { scene } = sceneFromRaw(good({ hero: "everest" }), "gorges");
    expect(validateScene(scene!, { heroBuilt: () => false }).map((p) => p.field)).toEqual(["hero"]);
    expect(validateScene(scene!, { heroBuilt: () => true })).toEqual([]);
    expect(validateScene(scene!)).toEqual([]);
  });

  it("a finished film that is not nine scenes, and a film that talks too much", () => {
    const one = sceneFromRaw(good(), "gorges").scene!;
    const film = { version: FILM_VERSION, scenes: [one] };
    expect(validateFilm(film, { complete: true }).map((p) => p.field)).toEqual(["scenes"]);
    expect(validateFilm(film)).toEqual([]);
    const chatty = { version: FILM_VERSION, scenes: Array.from({ length: 12 }, (_, i) => ({ ...one, id: `s${i}`, captions: [...one.captions, { at: 40, text: "b" }, { at: 60, text: "c" }] })) };
    expect(validateFilm(chatty).map((p) => p.field)).toContain("text");
  });
});
