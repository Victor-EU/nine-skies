import { describe, expect, it } from "vitest";
import {
  HorizonField,
  SILHOUETTE_BIAS,
  buildSyntheticHorizonField,
} from "../../engine/src/terrain/horizonField.js";
import {
  DEFAULT_HORIZON,
  HorizonScheduler,
  createProfile,
  marchHorizon,
  needsRefresh,
} from "../../engine/src/terrain/horizon.js";
import { sampleElevationM } from "../../engine/src/terrain/syntheticTiles.js";

const field = buildSyntheticHorizonField();

/** Highest ground along a bearing, sampled the way the march does. */
function maxAlong(
  eastM: number,
  northM: number,
  theta: number,
  fromKm: number,
  toKm: number,
): { m: number; tangentFrom: (altM: number) => number } {
  let best = -Infinity;
  let bestDistM = fromKm * 1000;
  for (let km = fromKm; km <= toKm; km += 8) {
    const m = field.sampleM(
      eastM + Math.sin(theta) * km * 1000,
      northM + Math.cos(theta) * km * 1000,
    );
    if (m > best) {
      best = m;
      bestDistM = km * 1000;
    }
  }
  return { m: best, tangentFrom: (altM) => (best - altM) / bestDistM };
}

describe("coarse horizon field", () => {
  it("is small enough to ship whole", () => {
    // One raster of the country, loaded at boot and never streamed.
    expect(field.byteLength).toBeLessThan(700 * 1024);
  });

  it("keeps the Himalayan crest when it reduces", () => {
    // The ridge is the reason the bias exists: averaging shaves the crests
    // off and the mountains arrive as a hump.
    let fieldMax = -Infinity;
    let trueMax = -Infinity;
    for (let inland = 4300; inland <= 5100; inland += 8) {
      for (let north = 100; north <= 900; north += 8) {
        fieldMax = Math.max(fieldMax, field.sampleM(inland * 1000, north * 1000));
        trueMax = Math.max(trueMax, sampleElevationM(inland, north));
      }
    }
    expect(trueMax).toBeGreaterThan(5000);
    expect(fieldMax).toBeGreaterThan(trueMax * 0.9);
  });

  it("leaves flat ground flat", () => {
    // And the other half of the bargain: the plateau must not be inflated to
    // the height of its tallest bump, or the basin fills in behind it.
    for (let inland = 3600; inland <= 3900; inland += 64) {
      const coarse = field.sampleM(inland * 1000, 1_500_000);
      const fine = sampleElevationM(inland, 1500);
      expect(Math.abs(coarse - fine)).toBeLessThan(250);
    }
  });

  it("reads open sea off the raster", () => {
    expect(field.sampleM(-40_000, 1_500_000)).toBe(0);
    expect(field.sampleM(200_000, -5_000)).toBe(0);
  });

  it("holds the bias between mean and maximum", () => {
    const flat = new HorizonField(8, 64, 64).fill(() => 100);
    expect(flat.sampleM(32_000, 32_000)).toBeCloseTo(100, 6);
    // A cell holding one spike reduces to mean + bias * (max - mean).
    const spike = new HorizonField(8, 8, 8).fill((e, n) => (e < 4 && n < 4 ? 400 : 0));
    const mean = 100;
    expect(spike.data[0]).toBe(Math.round(mean + SILHOUETTE_BIAS * (400 - mean)));
  });
});

describe("horizon march", () => {
  // The Sichuan Basin, at the altitude the GDD opens Expedition 1 on.
  const BASIN = { eastM: 2_760_000, northM: 1_500_000, altitudeM: 1200 };
  const PLATEAU_AZIMUTH = Math.PI / 2; // inland, towards the third step
  const az = DEFAULT_HORIZON.azimuths;
  const inlandIndex = az / 4;

  const profile = marchHorizon(
    field,
    BASIN.eastM,
    BASIN.northM,
    BASIN.altitudeM,
    createProfile(DEFAULT_HORIZON),
  );

  it("draws the plateau wall the tile cache cannot reach (F1)", () => {
    // 384 km is the streamed radius. This is the finding in one assertion:
    // without the impostor, Expedition 1's signature moment is off-world.
    const streamed = maxAlong(BASIN.eastM, BASIN.northM, PLATEAU_AZIMUTH, 8, 384);
    const ridgeM = profile.ridgeM[inlandIndex]!;
    expect(streamed.m).toBeLessThan(2600);
    expect(ridgeM).toBeGreaterThan(streamed.m + 1500);

    // And it clears the near ground, so it is visible rather than merely
    // present - the wall rises above everything inside the cache.
    const ridgeTangent = (ridgeM - BASIN.altitudeM) / profile.ridgeDistM[inlandIndex]!;
    expect(ridgeTangent).toBeGreaterThan(streamed.tangentFrom(BASIN.altitudeM));
    expect(ridgeTangent).toBeGreaterThan(0);
  });

  it("keeps every ridge inside its own shell", () => {
    for (let s = 0; s < profile.shells.length; s++) {
      const shell = profile.shells[s]!;
      for (let i = 0; i < az; i += 37) {
        const d = profile.ridgeDistM[s * az + i]! / 1000;
        expect(d).toBeGreaterThanOrEqual(shell.fromKm);
        expect(d).toBeLessThanOrEqual(shell.toKm);
      }
    }
  });

  it("covers every azimuth of every shell", () => {
    expect(profile.ridgeM).toHaveLength(az * profile.shells.length);
    expect(profile.ridgeDistM.every((d) => d > 0)).toBe(true);
  });

  it("reads sea level out over the ocean", () => {
    const coast = marchHorizon(field, 40_000, 1_500_000, 1200, createProfile(DEFAULT_HORIZON));
    // Seaward is -east here, because east is metres inland in this world.
    const seaward = (az * 3) / 4;
    for (let s = 0; s < coast.shells.length; s++) {
      expect(coast.ridgeM[s * az + seaward]).toBe(0);
    }
  });

  it("costs a bounded number of samples", () => {
    // ~105k field reads per march, every 25 km of travel. Held here so a
    // change to the shells or the step cannot quietly become a frame hitch.
    expect(profile.samples).toBeLessThan(150_000);
  });
});

describe("horizon refresh", () => {
  const base = createProfile(DEFAULT_HORIZON);

  it("marches once before anything is known", () => {
    expect(needsRefresh(base, 0, 0, 0)).toBe(true);
  });

  it("re-marches on travel and, sooner, on climb", () => {
    const p = marchHorizon(field, 1_000_000, 1_500_000, 2000, createProfile(DEFAULT_HORIZON));
    expect(needsRefresh(p, 1_010_000, 1_500_000, 2000)).toBe(false);
    expect(needsRefresh(p, 1_040_000, 1_500_000, 2000)).toBe(true);
    // A kilometre of climb is worth far more angle at 600 km than a
    // kilometre of travel is, so the vertical trigger is much tighter.
    expect(needsRefresh(p, 1_000_000, 1_500_000, 2400)).toBe(true);
  });
});

describe("horizon scheduler", () => {
  const field2 = field;

  it("has a whole skyline on the first frame", () => {
    const s = new HorizonScheduler(field2, DEFAULT_HORIZON, 128);
    expect(s.update(2_760_000, 1_500_000, 1200)).toBe(true);
    expect(s.front.ridgeDistM.every((d) => d > 0)).toBe(true);
  });

  it("swaps only when the new sweep is complete", () => {
    const s = new HorizonScheduler(field2, DEFAULT_HORIZON, 128);
    s.update(2_760_000, 1_500_000, 1200);
    const before = s.front.ridgeM.slice();

    // Move far enough to trigger, then run the slices out.
    const east = 2_760_000 + 60_000;
    expect(s.update(east, 1_500_000, 1200)).toBe(false); // starts the sweep
    let frames = 0;
    let swapped = false;
    while (!swapped && frames < 32) {
      swapped = s.update(east, 1_500_000, 1200);
      // Mid-sweep the drawn profile is untouched: no tear through the ridges.
      if (!swapped) expect(s.front.ridgeM).toEqual(before);
      frames++;
    }
    expect(swapped).toBe(true);
    expect(frames).toBe(DEFAULT_HORIZON.azimuths / 128);
    expect(s.front.eastM).toBe(east);
    expect(s.front.ridgeM).not.toEqual(before);
  });

  it("stays idle when the aircraft has barely moved", () => {
    const s = new HorizonScheduler(field2, DEFAULT_HORIZON, 128);
    s.update(2_760_000, 1_500_000, 1200);
    for (let i = 0; i < 5; i++) {
      expect(s.update(2_760_000 + i * 100, 1_500_000, 1200)).toBe(false);
    }
    expect(s.marching).toBe(false);
  });
});
