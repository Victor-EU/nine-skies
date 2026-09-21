import { describe, expect, it } from "vitest";
import {
  FlownTrack,
  TRACK_STRIDE_KM,
  TRACK_WINDOW_KM,
  bandOf,
} from "../../engine/src/map/track.js";

/**
 * Fly east in `stepM` steps, ground rising `risePerStepM` a step.
 *
 * The first call establishes where the aircraft is without flying anything,
 * which is why it is `i = 0`: nothing flew to the first point.
 */
function fly(track: FlownTrack, steps: number, stepM = 250, risePerStepM = 0, fromM = 0): void {
  for (let i = 0; i <= steps; i++) {
    track.advance(fromM + i * stepM, 0, 3000, i * risePerStepM);
  }
}

describe("FlownTrack", () => {
  it("records one point a kilometre, not one a frame", () => {
    const track = new FlownTrack();
    // 250 m a step is about what cruise covers in a tenth of a second.
    fly(track, 40);
    expect(track.km).toBeCloseTo(10, 6);
    // Ten kilometres flown, plus the first point.
    expect(track.length).toBe(11);
    expect(TRACK_STRIDE_KM).toBe(1);
  });

  it("keeps the last 200 km and no more", () => {
    const track = new FlownTrack();
    fly(track, 4 * 250); // 250 km
    expect(track.km).toBeCloseTo(250, 6);
    expect(track.length).toBe(TRACK_WINDOW_KM / TRACK_STRIDE_KM + 1);
    const points = track.recent();
    expect(points[0]!.km).toBeCloseTo(50, 6);
    expect(points[points.length - 1]!.km).toBeCloseTo(250, 6);
  });

  it("counts distance flown, not distance along anything", () => {
    const track = new FlownTrack();
    fly(track, 8); // 2 km east
    track.advance(2000, 3000, 3000, 0); // 3 km north
    expect(track.km).toBeCloseTo(5, 6);
  });
});

describe("a teleport lifts the pen", () => {
  it("does not join the two ends of a jump", () => {
    const track = new FlownTrack();
    fly(track, 20); // 5 km
    track.moveTo(2_000_000, 1_000_000);
    track.advance(2_000_000, 1_000_000, 5000, 4200);
    const points = track.recent();
    const jump = points[points.length - 1]!;
    expect(jump.joined).toBe(false);
    expect(points[points.length - 2]!.joined).toBe(true);
  });

  it("writes the first point after the jump, not at it", () => {
    // The ground under a teleport is not resident on the frame it happens, so
    // `moveTo` records nothing at all: a point written there carried sea level
    // into the middle of Tibet and the profile read `ground 0-0 m`.
    const track = new FlownTrack();
    track.moveTo(2_000_000, 1_000_000);
    expect(track.length).toBe(0);
    track.advance(2_000_000, 1_000_000, 5000, 4200);
    expect(track.recent()[0]).toMatchObject({ groundM: 4200, joined: false });
  });

  it("does not count the jump as distance flown", () => {
    const track = new FlownTrack();
    fly(track, 20); // 5 km
    track.moveTo(3_000_000, 2_000_000);
    track.advance(3_000_000, 2_000_000, 5000, 4200);
    expect(track.km).toBeCloseTo(5, 6);
  });

  it("starts unjoined, because nothing flew to the first point either", () => {
    const track = new FlownTrack();
    track.advance(0, 0, 1200, 10);
    expect(track.recent()[0]!.joined).toBe(false);
  });

  it("does not record a point whose ground has not loaded yet", () => {
    // The tile under a jump is a frame or two from resident. A point with no
    // ground draws sea level through the Hengduan, so it is not written.
    const track = new FlownTrack();
    track.moveTo(2_000_000, 1_000_000);
    track.advance(2_000_000, 1_000_000, 5000, null);
    expect(track.length).toBe(0);
    track.advance(2_000_100, 1_000_000, 5000, 4200);
    expect(track.recent()).toEqual([
      { eastM: 2_000_100, northM: 1_000_000, altitudeM: 5000, groundM: 4200, km: 0.1, joined: false },
    ]);
  });

  it("forgets everything for the next participant", () => {
    const track = new FlownTrack();
    fly(track, 40);
    track.forget();
    expect(track.length).toBe(0);
    expect(track.km).toBe(0);
    expect(bandOf(track.recent())).toBeNull();
  });
});

describe("the band the profile has to fit", () => {
  it("reports what is in the window, and leaves the scale to the renderer", () => {
    const track = new FlownTrack();
    fly(track, 40, 250, 25); // 10 km, ground climbing 100 m/km
    const band = bandOf(track.recent())!;
    expect(band.minGroundM).toBe(0);
    expect(band.maxGroundM).toBe(1000);
    expect(band.spanKm).toBeCloseTo(10, 6);
    expect(band.minAltitudeM).toBe(3000);
  });
});
