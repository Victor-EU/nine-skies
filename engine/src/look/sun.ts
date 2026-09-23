/**
 * The sun over a scene (design v2, "A sun"): where it is, from the scene's
 * month and hour and the camera's place, and what colour its light is.
 *
 * Where it is comes from `gfx/solar.ts`, which is NOAA's algorithm in real
 * degrees; this file only turns that into a vector in the world's axes. The
 * colour is a transmittance: white light losing blue, then green, to the
 * air it crosses on the way down, by an air mass that grows to about 38 at
 * the horizon. The extinction is tuned to the picture and not to any
 * atmosphere - low sun goes gold, then orange, and the scene's sky preset
 * scales it with a turbidity - and it is one function of one number, so the
 * dawn of scene 1 and the dusk of scene 9 are lit by the same rule.
 */
import { dayOfYear, sunPosition } from "../gfx/solar.js";
import { clamp01, smoothstep, type Rgb } from "./colour.js";

export interface SunState {
  readonly elevationDeg: number;
  readonly azimuthDeg: number;
  /** Unit vector towards the sun in world axes: x east, y up, z north. */
  readonly direction: Rgb;
  /** Direct sunlight, linear, 1 at a clear zenith and 0 below the horizon. */
  readonly light: Rgb;
  /** The light's hue with its brightness taken out, for tinting. */
  readonly tint: Rgb;
  /** 0 by night, 1 by day, ramping through civil twilight. */
  readonly daylight: number;
  /** 1 with the sun on the horizon, 0 with it 25 degrees up or more. */
  readonly lowness: number;
}

/**
 * Relative air mass along the line to the sun (Kasten and Young, 1989). One
 * at the zenith, about 38 at the horizon; held at the horizon's value below
 * it, where the sun lights nothing directly anyway.
 */
export function airMass(elevationDeg: number): number {
  const e = Math.max(elevationDeg, 0);
  return 1 / (Math.sin((e * Math.PI) / 180) + 0.50572 * (e + 6.07995) ** -1.6364);
}

/**
 * Extinction per unit of air mass, red, green, blue. Not Rayleigh's numbers:
 * chosen so the sun ten degrees up is gold and on the horizon is orange-red,
 * which is the picture and not the physics.
 */
export const EXTINCTION: Rgb = [0.021, 0.05, 0.115];

/** The colour of sunlight after the air, linear, 1 with no air. */
export function sunTransmittance(elevationDeg: number, turbidity = 1): [number, number, number] {
  const m = airMass(elevationDeg) - 1;
  return [
    Math.exp(-EXTINCTION[0] * m * turbidity),
    Math.exp(-EXTINCTION[1] * m * turbidity),
    Math.exp(-EXTINCTION[2] * m * turbidity),
  ];
}

/** The sun as the film's clock and the camera's place put it. */
export function sunState(latDeg: number, lonDeg: number, month: number, hour: number, turbidity = 1): SunState {
  const { elevationDeg, azimuthDeg } = sunPosition(hour * 60, latDeg, lonDeg, dayOfYear(month));
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  const direction: Rgb = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  const t = sunTransmittance(elevationDeg, turbidity);
  // Direct light is gone a little after the disc sets; the sky keeps going.
  const direct = smoothstep(-0.8, 3, elevationDeg);
  const light: Rgb = [t[0] * direct, t[1] * direct, t[2] * direct];
  const peak = Math.max(t[0], t[1], t[2], 1e-6);
  return {
    elevationDeg,
    azimuthDeg,
    direction,
    light,
    tint: [t[0] / peak, t[1] / peak, t[2] / peak],
    daylight: smoothstep(-6, 12, elevationDeg),
    lowness: 1 - clamp01(elevationDeg / 25),
  };
}
