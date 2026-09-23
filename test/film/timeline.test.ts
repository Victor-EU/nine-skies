/**
 * The clock the film is built on (D73): 120 s a scene, 6 of them lead-in,
 * nine scenes making 18:00 to the second, and nothing the viewer can do
 * moving the cut.
 */
import { describe, expect, it } from "vitest";
import {
  FLIGHT_S,
  LEAD_IN_S,
  SCENE_S,
  Timeline,
  filmLengthS,
  positionAt,
} from "../../engine/src/film/timeline.js";

describe("the scene clock", () => {
  it("is 120 seconds, 6 of them lead-in", () => {
    expect(SCENE_S).toBe(120);
    expect(LEAD_IN_S).toBe(6);
    expect(FLIGHT_S).toBe(114);
  });

  it("makes nine scenes exactly eighteen minutes", () => {
    expect(filmLengthS(9)).toBe(18 * 60);
  });

  it("opens every scene on its lead-in and cuts at 120 wherever the camera is", () => {
    expect(positionAt(0, 9)).toMatchObject({ scene: 0, phase: "lead-in", flightS: 0 });
    expect(positionAt(5.99, 9)).toMatchObject({ scene: 0, phase: "lead-in" });
    expect(positionAt(6, 9)).toMatchObject({ scene: 0, phase: "flight", flightS: 0 });
    expect(positionAt(119.99, 9).scene).toBe(0);
    expect(positionAt(120, 9)).toMatchObject({ scene: 1, phase: "lead-in", t: 0 });
    expect(positionAt(8 * 120 + 100, 9)).toMatchObject({ scene: 8, phase: "flight", flightS: 94 });
  });

  it("ends at the film's length and stays on the last scene", () => {
    expect(positionAt(1080, 9)).toMatchObject({ scene: 8, phase: "end" });
    expect(positionAt(5000, 9)).toMatchObject({ scene: 8, phase: "end", filmS: 1080 });
    expect(positionAt(0, 0).phase).toBe("end");
  });
});

describe("the running timeline", () => {
  it("advances by the frame and never past the end", () => {
    const t = new Timeline(2);
    expect(t.totalS).toBe(240);
    t.advance(100);
    expect(t.at()).toMatchObject({ scene: 0, phase: "flight", flightS: 94 });
    t.advance(1000);
    expect(t.ended).toBe(true);
    expect(t.at().filmS).toBe(240);
  });

  it("holds while paused", () => {
    const t = new Timeline(2);
    t.paused = true;
    t.advance(50);
    expect(t.at().filmS).toBe(0);
  });

  it("jumps to a chapter's lead-in and clamps the index", () => {
    const t = new Timeline(3);
    expect(t.jumpTo(2)).toMatchObject({ scene: 2, t: 0, phase: "lead-in" });
    expect(t.jumpTo(-4).scene).toBe(0);
    expect(t.jumpTo(99).scene).toBe(2);
    t.restart();
    expect(t.at().filmS).toBe(0);
  });
});
