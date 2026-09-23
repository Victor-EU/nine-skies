/** The wind thins with altitude, and the music follows the film rather than its own clock. */
import { describe, expect, it } from "vitest";
import { DRIFT_S, SoundTrack, needsSeek, windAt } from "../../app/src/sound.js";

describe("the sound at run time", () => {
  it("thins the wind as the camera climbs: quieter, and losing its low end", () => {
    const sea = windAt(0);
    const plateau = windAt(4500);
    const everest = windAt(9000);
    expect(sea.gain).toBeGreaterThan(plateau.gain);
    expect(plateau.gain).toBeGreaterThan(everest.gain);
    expect(everest.gain).toBeGreaterThan(0);
    expect(sea.highPassHz).toBeLessThan(plateau.highPassHz);
    expect(plateau.highPassHz).toBeLessThan(everest.highPassHz);
    expect(windAt(20_000)).toEqual(everest);
  });

  it("moves the music only when it has drifted from the film", () => {
    expect(needsSeek(30, 30 + DRIFT_S / 2)).toBe(false);
    expect(needsSeek(30, 45)).toBe(true);
  });

  it("has nothing to play with nothing licensed", () => {
    expect(new SoundTrack({ cues: [], wind: null }).hasSound).toBe(false);
    const one = { file: "a.m4a", title: "t", author: "a", licence: "l", source: "s" };
    expect(new SoundTrack({ cues: [{ ...one, cue: "cue-01" }], wind: null }).hasSound).toBe(true);
  });
});
