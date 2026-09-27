/**
 * The camera on its rail and the four inputs (D74): auto is the attractor,
 * direction is a heading inside a corridor, speed is a bounded multiplier,
 * and none of it touches the clock.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_RAIL, RailFlight } from "../../engine/src/film/rail.js";
import { pathFrom } from "../../engine/src/film/path.js";
import { TURN_S, railAtKm, type BuiltRail } from "../../engine/src/film/scene.js";

/** 100 km due east at 60 km/min, which is a kilometre a second. */
function eastward(): BuiltRail {
  const keys = [
    { eastM: 0, northM: 0, aboveGroundM: 300, kmPerMin: 60, pitchDeg: 6 },
    { eastM: 100_000, northM: 0, aboveGroundM: 500, kmPerMin: 60, pitchDeg: 12 },
  ];
  return { path: pathFrom(keys), keys };
}

/** 50 km east, then 50 km north, at 60 km/min: a right angle at the 50th second. */
function corner(): BuiltRail {
  const keys = [
    { eastM: 0, northM: 0, aboveGroundM: 300, kmPerMin: 60, pitchDeg: 6 },
    { eastM: 50_000, northM: 0, aboveGroundM: 300, kmPerMin: 60, pitchDeg: 6 },
    { eastM: 50_000, northM: 50_000, aboveGroundM: 300, kmPerMin: 60, pitchDeg: 6 },
  ];
  return { path: pathFrom(keys), keys };
}

const idle = { speed: 0, heading: 0, auto: false };

describe("the rail's heading", () => {
  it("is the line's own on a straight", () => {
    const rail = corner();
    expect(railAtKm(rail, 0).headingRad).toBeCloseTo(Math.PI / 2, 9);
    expect(railAtKm(rail, 50 - TURN_S / 2 - 0.1).headingRad).toBeCloseTo(Math.PI / 2, 9);
    expect(railAtKm(rail, 50 + TURN_S / 2 + 0.1).headingRad).toBeCloseTo(0, 9);
    expect(railAtKm(rail, 100).headingRad).toBeCloseTo(0, 9);
  });

  it("turns through a corner over the turn's seconds, never in one frame", () => {
    const rail = corner();
    // Halfway round at the key itself.
    expect(railAtKm(rail, 50).headingRad).toBeCloseTo(Math.PI / 4, 9);
    // A frame at 60 fps is 1/60 km here; no frame turns more than a degree.
    let before = railAtKm(rail, 40).headingRad;
    for (let km = 40; km <= 60; km += 1 / 60) {
      const h = railAtKm(rail, km).headingRad;
      expect(Math.abs(h - before)).toBeLessThan(Math.PI / 180);
      before = h;
    }
  });

  it("keeps the camera on the line: only the heading turns", () => {
    const rail = corner();
    const at = railAtKm(rail, 49.5);
    expect(at.eastM).toBeCloseTo(49_500, 6);
    expect(at.northM).toBeCloseTo(0, 6);
  });
});

function run(flight: RailFlight, input: typeof idle, seconds: number, step = 1 / 60) {
  let state = flight.state();
  for (let t = 0; t < seconds - 1e-9; t += step) state = flight.update(input, step);
  return state;
}

describe("on auto", () => {
  it("flies the rail at the authored speed, on the line, along its heading", () => {
    const f = new RailFlight(eastward());
    const s = run(f, idle, 10);
    expect(s.auto).toBe(true);
    expect(s.km).toBeCloseTo(10, 3);
    expect(s.northM).toBeCloseTo(0, 6);
    expect(s.headingRad).toBeCloseTo(Math.PI / 2, 9);
    expect(s.groundSpeedMs).toBeCloseTo(1000, 6);
  });

  it("interpolates the wanted height between the keys", () => {
    const f = new RailFlight(eastward());
    expect(run(f, idle, 50).aboveGroundM).toBeCloseTo(400, 0);
  });

  it("stops at the end of the rail rather than running off it", () => {
    const f = new RailFlight(eastward());
    const s = run(f, idle, 200);
    expect(s.km).toBe(100);
    expect(f.atEnd).toBe(true);
  });
});

describe("direction", () => {
  it("turns the heading off the rail, no further than the corridor, and drifts", () => {
    const f = new RailFlight(eastward(), { corridorRad: Math.PI / 3 });
    const s = run(f, { ...idle, heading: 1 }, 4);
    expect(s.auto).toBe(false);
    expect(s.headingRad - Math.PI / 2).toBeCloseTo(Math.PI / 3, 6);
    // Right of an eastward heading is south.
    expect(s.northM).toBeLessThan(-500);
    expect(s.bankRad).toBeGreaterThan(0);
  });

  it("goes no further off the line than the scene allows", () => {
    const f = new RailFlight(eastward(), { maxOffsetM: 2_000 });
    const s = run(f, { ...idle, heading: -1 }, 30);
    expect(s.northM).toBeCloseTo(2_000, 6);
  });

  it("resumes auto by itself after the idle time, and eases back onto the rail", () => {
    const f = new RailFlight(eastward());
    run(f, { ...idle, heading: 1 }, 1);
    const off = f.state();
    expect(off.auto).toBe(false);
    expect(Math.abs(off.northM)).toBeGreaterThan(0);
    const soon = run(f, idle, DEFAULT_RAIL.autoResumeS - 0.5);
    expect(soon.auto).toBe(false);
    const later = run(f, idle, 1);
    expect(later.auto).toBe(true);
    // The drift peaks in the kilometres while the offset is held; the ease
    // brings it back to a few tens of metres within its time constants.
    const peak = Math.abs(f.state().northM);
    const back = run(f, idle, 15);
    expect(Math.abs(back.headingRad - Math.PI / 2)).toBeLessThan(0.01);
    expect(Math.abs(back.northM)).toBeLessThan(peak * 0.05);
    expect(Math.abs(back.northM)).toBeLessThan(100);
  });

  it("resumes auto on the press", () => {
    const f = new RailFlight(eastward());
    run(f, { ...idle, heading: 1 }, 1);
    expect(f.update({ ...idle, auto: true }, 1 / 60).auto).toBe(true);
  });
});

describe("speed", () => {
  it("doubles in the ramp time and goes no faster", () => {
    const f = new RailFlight(eastward());
    expect(run(f, { ...idle, speed: 1 }, DEFAULT_RAIL.speedRampS).speedMul).toBeCloseTo(2, 2);
    expect(run(f, { ...idle, speed: 1 }, 5).speedMul).toBe(DEFAULT_RAIL.speedMax);
  });

  it("halves and goes no slower, and holds where it is left", () => {
    const f = new RailFlight(eastward());
    expect(run(f, { ...idle, speed: -1 }, 10).speedMul).toBe(DEFAULT_RAIL.speedMin);
    expect(run(f, idle, 10).speedMul).toBe(DEFAULT_RAIL.speedMin);
    expect(f.isAuto).toBe(true);
  });

  it("changes how far along the rail two minutes get, and nothing else", () => {
    const slow = new RailFlight(eastward());
    const fast = new RailFlight(eastward());
    run(slow, { ...idle, speed: -1 }, 5);
    run(fast, { ...idle, speed: 1 }, 5);
    expect(run(slow, idle, 20).km).toBeLessThan(run(fast, idle, 20).km);
  });
});

describe("reset", () => {
  it("puts the camera back at the start, on auto, at the authored speed", () => {
    const f = new RailFlight(eastward());
    run(f, { ...idle, heading: 1, speed: 1 }, 5);
    f.reset();
    expect(f.state()).toMatchObject({ km: 0, speedMul: 1, auto: true, northM: 0 });
  });
});
