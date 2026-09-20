/**
 * Whether a route delivers the lesson its file claims (F29).
 *
 * G2's first pass criterion is that seven of ten players sketch the lesson
 * back — three steps, west higher, the plateau as a flat top rather than a
 * peak. A cohort can only sketch what it was shown, and nothing had ever
 * measured what this route shows. Runs on the committed section.
 */
import { describe, expect, it } from "vitest";
import { flatness, lessonOf, stepMinutes } from "../../tools/teaches.ts";
import { trackOf } from "../../tools/session.ts";
import { hasGround, sea } from "./fixture.ts";

const flown = () => {
  const { route, ground, expedition } = sea();
  const track = trackOf(route, ground, expedition.start_altitude_m);
  return { track, ground, expedition, lesson: lessonOf(expedition.teaches, track, ground) };
};

describe("flatness, on profiles whose answer is known by hand", () => {
  it("calls a level profile flat and a staircase not", () => {
    const level = new Array(100).fill(3_000);
    expect(flatness(level, 0, 99).longestFlatKm).toBe(100);
    expect(flatness(level, 0, 99).sdM).toBe(0);
    const steps = Array.from({ length: 100 }, (_, i) => Math.floor(i / 10) * 1_000);
    expect(flatness(steps, 0, 99).longestFlatKm).toBe(10);
  });

  it("finds a run that begins inside an earlier one", () => {
    // The case that makes the obvious optimisation wrong. A run is measured
    // against its own first sample, so a slow drift carries the inner run
    // further than the one containing it: skipping to the end of the first
    // found here reports 6 where the answer is 7.
    const drift = [0, 240, 250, 260, 270, 280, 290, 300];
    expect(flatness(drift, 0, 7).longestFlatKm).toBe(7);
  });

  it("counts reversals rather than samples", () => {
    const saw = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 0 : 1_000));
    expect(flatness(saw, 0, 99).reversals).toBe(99);
    expect(flatness(new Array(100).fill(0), 0, 99).reversals).toBe(0);
  });
});

describe.skipIf(!hasGround)("what Expedition 1 shows a cohort", () => {
  it("spends most of itself over the step the game is least about", () => {
    const { lesson } = flown();
    const [third, second, first] = lesson.steps;
    expect(third!.share).toBeGreaterThan(0.5);
    expect(first!.share).toBeLessThan(0.25);
    // Nearly three times as long below 500 m as above 2,000.
    expect(third!.minutes / first!.minutes).toBeGreaterThan(2.5);
    expect(second!.minutes).toBeGreaterThan(0);
  });

  it("weights a sketch by minutes, which are not kilometres", () => {
    // The reason this is measured in time. Airspeed rises as the air thins,
    // so the share of the trip spent over a step and the share of the route
    // crossing it are different numbers, and a player remembers the first.
    const { track, ground, lesson } = flown();
    const byKm = [0, 0, 0];
    for (const s of track) {
      const h = ground(s.km);
      byKm[h < 500 ? 0 : h < 2_000 ? 1 : 2]! += 1;
    }
    const kmShare = byKm[2]! / track.length;
    expect(Math.abs(kmShare - lesson.steps[2]!.share)).toBeGreaterThan(0.1);
  });

  it("is flattest before the wall, not beyond it", () => {
    // The finding. G2 asks for the plateau drawn as a flat top; the part of
    // this route beyond the rim is the least flat thing in the flight —
    // Shanghai to Lhasa crosses the mountainous eastern margin of Tibet, not
    // the Changtang, and a cohort cannot sketch a plateau it never saw.
    const { lesson } = flown();
    expect(lesson.flattest.name).toBe("before the wall");
    const beyond = lesson.sections.find((s) => s.name === "beyond the rim")!;
    const before = lesson.sections.find((s) => s.name === "before the wall")!;
    expect(beyond.flatness.longestFlatKm).toBeLessThan(before.flatness.longestFlatKm / 5);
    expect(beyond.flatness.sdM).toBeGreaterThan(before.flatness.sdM);
    expect(beyond.flatness.reversals).toBeGreaterThan(100);
  });

  it("cuts its sections at the wall it finds, not at authored names", () => {
    const { lesson } = flown();
    expect(lesson.sections.map((s) => s.name)).toEqual([
      "before the wall",
      "the wall",
      "beyond the rim",
    ]);
    expect(lesson.sections[0]!.toKm).toBe(lesson.wall.footKm);
    expect(lesson.sections[2]!.fromKm).toBe(lesson.wall.rimKm);
  });

  it("agrees with stepMinutes called on its own", () => {
    const { track, ground, lesson } = flown();
    expect(stepMinutes(track, ground)).toEqual(lesson.steps);
  });
});
