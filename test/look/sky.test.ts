/**
 * The sky's colours from the sun (design v2, "A sky per scene"): what the
 * model does at the hours the film is flown at.
 */
import { describe, expect, it } from "vitest";
import { skyState } from "../../engine/src/look/sky.js";
import { sunState } from "../../engine/src/look/sun.js";
import { SKY_PRESETS } from "../../engine/src/look/presets.js";
import { luminance } from "../../engine/src/look/colour.js";

const NOON = sunState(30, 110, 6, 12.6);
const DUSK = sunState(28, 87, 10, 19.5);

describe("the sky", () => {
  it("is deeper at the zenith than at the horizon by day", () => {
    const s = skyState(NOON, SKY_PRESETS["noon-hard"]!, 1000);
    expect(luminance(s.zenith)).toBeLessThan(luminance(s.horizon));
    expect(s.zenith[2]).toBeGreaterThan(s.zenith[0]);
  });

  it("deepens with altitude, the cue for height", () => {
    const low = skyState(NOON, SKY_PRESETS["plateau-dusk"]!, 500);
    const high = skyState(NOON, SKY_PRESETS["plateau-dusk"]!, 7000);
    expect(luminance(high.zenith)).toBeLessThan(luminance(low.zenith));
  });

  it("warms the horizon and the glow at dusk, and dims", () => {
    const dusk = skyState(DUSK, SKY_PRESETS["last-light"]!, 6000);
    const noon = skyState(NOON, SKY_PRESETS["last-light"]!, 6000);
    expect(dusk.horizon[0] / dusk.horizon[2]).toBeGreaterThan(noon.horizon[0] / noon.horizon[2]);
    expect(dusk.glow[0]).toBeGreaterThan(dusk.glow[2]);
    expect(luminance(dusk.sunColor)).toBeLessThan(luminance(noon.sunColor));
    expect(luminance(dusk.ambientZenith)).toBeLessThan(luminance(noon.ambientZenith));
  });

  it("lights the ground from the sky a good deal less than the sun does", () => {
    const s = skyState(NOON, SKY_PRESETS.default!, 500);
    expect(luminance(s.ambientZenith)).toBeGreaterThan(0.15);
    expect(luminance(s.ambientZenith)).toBeLessThan(0.5 * luminance(s.sunColor));
    expect(luminance(s.ambientGround)).toBeLessThan(luminance(s.ambientZenith));
  });

  it("draws a disc brighter than white, so the bloom finds it", () => {
    const s = skyState(NOON, SKY_PRESETS.default!, 500);
    expect(Math.max(...s.disc)).toBeGreaterThan(5);
    expect(s.discCos).toBeLessThan(1);
    expect(s.discCos).toBeGreaterThan(0.999);
  });

  it("keeps an afterglow once the sun has set", () => {
    const set = sunState(28, 87, 10, 19.9);
    expect(set.elevationDeg).toBeLessThan(0);
    const s = skyState(set, SKY_PRESETS["last-light"]!, 6000);
    expect(luminance(s.sunColor)).toBe(0);
    expect(luminance(s.glow)).toBeGreaterThan(0);
  });
});
