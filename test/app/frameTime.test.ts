/** The phone's frame time is read by wall clock; the summary has to say what it saw. */
import { describe, expect, it } from "vitest";
import { FRAME_WINDOW, FrameClock, summarise } from "../../app/src/frameTime.js";

describe("the wall-clock frame time", () => {
  it("says nothing until there are enough frames to say it", () => {
    expect(summarise([16.7, 16.7])).toBeNull();
  });

  it("reads a phone holding 60 Hz as its refresh interval, and counts stutter", () => {
    const steady = Array.from({ length: 100 }, () => 16.7);
    const s = summarise(steady)!;
    expect(s.medianMs).toBeCloseTo(16.7, 6);
    expect(s.fps).toBeCloseTo(59.9, 1);
    expect(s.slowShare).toBe(0);
    const stutter = summarise([...steady.slice(0, 90), ...Array.from({ length: 10 }, () => 33.4)])!;
    expect(stutter.medianMs).toBeCloseTo(16.7, 6);
    expect(stutter.p95Ms).toBeCloseTo(33.4, 6);
    expect(stutter.slowShare).toBeCloseTo(0.1, 6);
  });

  it("keeps a window of recent frames, and forgets a pause", () => {
    const clock = new FrameClock();
    let t = 0;
    for (let i = 0; i < FRAME_WINDOW + 50; i++) clock.tick((t += 20));
    expect(clock.summary()!.frames).toBe(FRAME_WINDOW);
    clock.reset();
    clock.tick(10_000);
    expect(clock.summary()).toBeNull();
  });
});
