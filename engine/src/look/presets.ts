/**
 * The look's presets: what a scene file may name under `look:` (design v2,
 * "The look"; plan v2, stage 3). Four tables, one per line of the block:
 *
 *   look:
 *     sky: gorge-afternoon      # the air: haze, its tint, how the sun glows
 *     palette: limestone-green  # the ground: ramp, rock, snow, water
 *     cloud: valley-mist        # mist in the valleys, a deck, cirrus, or none
 *     grade: cool               # the picture: exposure, warmth, vignette, bloom
 *
 * A name that is not here is a content error, caught by the gate. Every
 * number is a taste and not a finding: the reference still (stage 3) is
 * where they are argued, and every scene after it inherits the rule.
 */
import type { Rgb } from "./colour.js";
import {
  DEFAULT_PALETTE,
  ELEVATION_STOPS,
  snowLineForLatitude,
  type ElevationStop,
  type ScenePalette,
} from "../terrain/palette.js";
import type { SceneLook } from "../film/scene.js";
import type { CloudMap } from "./clouds.js";

export interface SkyPreset {
  /** Extinction per real metre of sight line: how far you see. */
  readonly hazeDensityPerM: number;
  /** The haze layer's scale height, real metres: thin keeps milk in a bowl. */
  readonly scaleHeightM: number;
  /** Multiplies the lit haze colour, sRGB: ochre dust, grey sea air, white mist. */
  readonly hazeTint: Rgb;
  /** Scales the sun's reddening: 1 is a clear day, 1.7 a dusty evening. */
  readonly turbidity: number;
  /** How bright the air glows round the sun. */
  readonly glow: number;
  /** How wide that glow is: higher is tighter. */
  readonly glowPower: number;
  /** 0 pale, 1 the deep blue of thin air. */
  readonly zenithDepth: number;
  /** How much the near haze blues a far ridge before the far haze whitens it: 0 dust, 1 clean air. */
  readonly blue: number;
}

export interface PalettePreset {
  /** Colours by stop name, over the default ramp's stops. */
  readonly stops?: Partial<Record<string, Rgb>>;
  readonly rock?: Rgb;
  readonly snow?: Rgb;
  /** Metres, or by the scene's latitude. */
  readonly snowLine?: number | "latitude";
  /** The slope band over which ground turns to rock; see `ScenePalette.rockSlope`. */
  readonly rockSlope?: readonly [number, number];
  /** The rock face its walls are laid with; see `ScenePalette.rockFace`. */
  readonly face?: string;
  readonly sea?: Rgb;
  readonly lake?: Rgb;
  readonly river?: Rgb;
}

export interface MistPreset {
  /** The top of the slab, real metres above sea level. */
  readonly topM: number;
  /** Extinction per real metre inside it, before the banks. */
  readonly densityPerM: number;
  /** sRGB; lit by the scene's sky before it reaches the shader. */
  readonly tint: Rgb;
  /** The size of a bank, real kilometres. */
  readonly bankKm: number;
  /**
   * Real metres the slab thins over above its top, or none for a hard top.
   * A dust deck has no lid: with a hard top at 1,500 m the Loess camera at
   * 1,560 m saw every ridge over 1,500 m as a dark cut-out standing on a
   * flat ochre sea, sixty kilometres off and unhazed (26 September 2026).
   */
  readonly tailM?: number;
}

export interface CloudLayerPreset {
  /** The painted map its cloud is read from (D95): `app/public/clouds/<map>.webp`. */
  readonly map: CloudMap;
  /** Real metres above sea level. */
  readonly altitudeM: number;
  /** 0 clear to 1 as much as the map holds. */
  readonly coverage: number;
  /** One tile of the map, real kilometres. */
  readonly scaleKm: number;
  /** How stretched along the grain: 1 is the map as painted. */
  readonly stretch: number;
  /** How solid at its thickest: 1 is cumulus, 0.4 is cirrus. */
  readonly density: number;
  /** Degrees from east the map's grain runs along; 0 by default. */
  readonly bearingDeg?: number;
  /** How fast the sun's light dies through it, seen from below: 2.5 a heap, 0.4 ice. */
  readonly absorb?: number;
  /** How steep its billows are, seen from above: the cloud sea's relief. */
  readonly billow?: number;
  /** A deck's least opacity where the map is thin: 0 has holes, 0.8 a sea whose rifts are thin cloud. */
  readonly veil?: number;
  /** Real metres of ground paled where it meets a deck seen from above; none by default. */
  readonly contactM?: number;
}

export interface CloudPreset {
  readonly mist: MistPreset | null;
  /** Cloud layers, any number; each is one quad at its altitude. */
  readonly layers: readonly CloudLayerPreset[];
}

export interface GradePreset {
  readonly exposure: number;
  /** -1 cold to 1 warm. */
  readonly temperature: number;
  readonly saturation: number;
  readonly contrast: number;
  /** 0 none to 1 heavy. */
  readonly vignette: number;
  /** How much of the bright pass comes back. */
  readonly bloom: number;
}

const WHITE: Rgb = [1, 1, 1];

export const SKY_PRESETS: Readonly<Record<string, SkyPreset>> = {
  default: { hazeDensityPerM: 2.75e-6, scaleHeightM: 6000, hazeTint: WHITE, turbidity: 1, glow: 0.8, glowPower: 8, zenithDepth: 0.8, blue: 0.5 },
  "huangshan-dawn": { hazeDensityPerM: 2.5e-6, scaleHeightM: 2000, hazeTint: [1.0, 0.96, 0.92], turbidity: 1.3, glow: 1.3, glowPower: 6, zenithDepth: 0.65, blue: 0.65 },
  "delta-dawn": { hazeDensityPerM: 3.5e-6, scaleHeightM: 2500, hazeTint: [1.0, 0.95, 0.9], turbidity: 1.4, glow: 1.2, glowPower: 6, zenithDepth: 0.55, blue: 0.4 },
  "gorge-afternoon": { hazeDensityPerM: 4.5e-6, scaleHeightM: 2500, hazeTint: [0.92, 0.97, 1.0], turbidity: 1.1, glow: 0.8, glowPower: 8, zenithDepth: 0.7, blue: 0.8 },
  "karst-mist": { hazeDensityPerM: 7e-6, scaleHeightM: 1500, hazeTint: [0.95, 1.0, 0.98], turbidity: 1.2, glow: 0.7, glowPower: 6, zenithDepth: 0.5, blue: 0.6 },
  "noon-hard": { hazeDensityPerM: 2.2e-6, scaleHeightM: 5000, hazeTint: WHITE, turbidity: 0.8, glow: 0.5, glowPower: 12, zenithDepth: 1.0, blue: 0.7 },
  "dust-afternoon": { hazeDensityPerM: 5e-6, scaleHeightM: 3000, hazeTint: [1.0, 0.86, 0.66], turbidity: 1.6, glow: 1.0, glowPower: 5, zenithDepth: 0.45, blue: 0.1 },
  "steppe-evening": { hazeDensityPerM: 2.5e-6, scaleHeightM: 4000, hazeTint: [1.0, 0.93, 0.84], turbidity: 1.2, glow: 1.2, glowPower: 8, zenithDepth: 0.8, blue: 0.45 },
  "desert-evening": { hazeDensityPerM: 3e-6, scaleHeightM: 3000, hazeTint: [1.0, 0.82, 0.62], turbidity: 1.7, glow: 1.5, glowPower: 6, zenithDepth: 0.7, blue: 0.15 },
  "plateau-dusk": { hazeDensityPerM: 2e-6, scaleHeightM: 6000, hazeTint: [0.9, 0.95, 1.0], turbidity: 0.7, glow: 0.6, glowPower: 14, zenithDepth: 1.0, blue: 0.6 },
  "last-light": { hazeDensityPerM: 2e-6, scaleHeightM: 6000, hazeTint: [0.95, 0.92, 1.0], turbidity: 0.9, glow: 1.4, glowPower: 8, zenithDepth: 1.0, blue: 0.6 },
};

export const PALETTE_PRESETS: Readonly<Record<string, PalettePreset>> = {
  default: {},
  "granite-pine": {
    face: "granite",
    stops: { plain: [0.24, 0.36, 0.23], farmland: [0.28, 0.38, 0.24], loess: [0.34, 0.4, 0.28], highDry: [0.42, 0.42, 0.36] },
    rock: [0.54, 0.52, 0.5],
    rockSlope: [0.6, 0.95],
    river: [0.26, 0.34, 0.32],
  },
  // August: the Xilingol steppe and Changbai's forest are green, the tundra
  // above the trees olive, the crater's rim pale grey trachyte and pumice,
  // and the lake the blue-green of deep cold water (F83).
  "grassland-volcano": {
    face: "sediment",
    stops: { plain: [0.27, 0.38, 0.22], farmland: [0.33, 0.42, 0.25], loess: [0.43, 0.47, 0.31], highDry: [0.49, 0.5, 0.4], plateau: [0.64, 0.64, 0.62] },
    rock: [0.56, 0.56, 0.55],
    rockSlope: [0.65, 0.95],
    lake: [0.14, 0.46, 0.58],
  },
  "delta-grey-green": {
    stops: { plain: [0.36, 0.46, 0.3], farmland: [0.45, 0.52, 0.3] },
    sea: [0.33, 0.39, 0.41],
    river: [0.55, 0.62, 0.62],
  },
  "limestone-green": {
    face: "limestone",
    stops: { plain: [0.28, 0.4, 0.24], farmland: [0.35, 0.44, 0.27], loess: [0.46, 0.48, 0.31], highDry: [0.52, 0.48, 0.38] },
    rock: [0.56, 0.53, 0.49],
    rockSlope: [0.55, 0.9],
    river: [0.3, 0.38, 0.34],
  },
  "jade-limestone": {
    face: "limestone",
    stops: { plain: [0.3, 0.46, 0.26], farmland: [0.38, 0.5, 0.29], loess: [0.46, 0.52, 0.31] },
    rock: [0.52, 0.51, 0.46],
    rockSlope: [0.62, 0.95],
    river: [0.26, 0.42, 0.36],
  },
  "snow-and-scree": {
    face: "limestone",
    stops: { loess: [0.5, 0.5, 0.33], highDry: [0.5, 0.45, 0.38], plateau: [0.58, 0.55, 0.5] },
    rock: [0.42, 0.38, 0.35],
    snowLine: 4900,
    river: [0.4, 0.39, 0.31],
  },
  "loess-ochre": {
    face: "sediment",
    stops: { farmland: [0.6, 0.5, 0.3], loess: [0.72, 0.58, 0.32], highDry: [0.68, 0.56, 0.4] },
    rock: [0.55, 0.45, 0.35],
    river: [0.7, 0.6, 0.4],
    lake: [0.45, 0.5, 0.45],
  },
  "sage-to-tan": {
    stops: { farmland: [0.5, 0.52, 0.34], loess: [0.55, 0.55, 0.38], highDry: [0.66, 0.58, 0.42] },
    rock: [0.45, 0.4, 0.36],
  },
  "dune-orange": {
    face: "sediment",
    stops: {
      saltPan: [0.85, 0.82, 0.75],
      plain: [0.72, 0.6, 0.42],
      farmland: [0.78, 0.6, 0.38],
      loess: [0.85, 0.62, 0.38],
      highDry: [0.7, 0.55, 0.42],
    },
    rock: [0.5, 0.42, 0.36],
    lake: [0.3, 0.45, 0.5],
  },
  "plateau-tan-turquoise": {
    face: "dark",
    stops: { highDry: [0.6, 0.55, 0.42], plateau: [0.66, 0.6, 0.48], alpine: [0.72, 0.7, 0.66] },
    lake: [0.15, 0.55, 0.62],
    snowLine: 5600,
  },
  "snow-rock": {
    face: "dark",
    stops: { plateau: [0.55, 0.5, 0.45], alpine: [0.6, 0.58, 0.56] },
    rock: [0.32, 0.3, 0.3],
    snow: [0.97, 0.97, 1.0],
    snowLine: 5400,
    river: [0.44, 0.49, 0.5],
    lake: [0.3, 0.42, 0.5],
  },
};

const NO_CLOUD: CloudPreset = { mist: null, layers: [] };

/*
 * The sky's cloud, a layer or two per scene (D95), each drawn from a painted
 * map: fair-weather cumulus over the south's summer, ice cloud at evening,
 * a mackerel sky catching the dawn over Huangshan's cloud sea. A layer sits
 * above every peak its scene flies past, since a plane through a mountain
 * is a line drawn round it; the gorges' and the karst's lie under 2,500 m,
 * the Roof's under 6,500. Altitudes are real and drawn at the scene's
 * exaggeration like the ground, so a heap two kilometres over the camera
 * stands as high in the frame as a ridge twelve (at six) would: the sky
 * reads its cloud overhead and thinning into the haze at the horizon.
 */
const CUMULUS = { map: "cumulus", coverage: 0.55, scaleKm: 20, stretch: 1.15, density: 0.95, absorb: 2.4 } as const;
const CIRRUS = { map: "cirrus", altitudeM: 9500, coverage: 0.7, scaleKm: 90, stretch: 1.6, density: 0.5, absorb: 0.4 } as const;

export const CLOUD_PRESETS: Readonly<Record<string, CloudPreset>> = {
  none: NO_CLOUD,
  "coastal-haze": { mist: { topM: 120, densityPerM: 5e-5, tint: [0.96, 0.96, 0.95], bankKm: 25 }, layers: [] },
  "valley-mist": {
    mist: { topM: 230, densityPerM: 1.4e-4, tint: [0.97, 0.98, 1.0], bankKm: 12 },
    layers: [{ ...CUMULUS, altitudeM: 3400 }, { ...CIRRUS, coverage: 0.45, bearingDeg: 20 }],
  },
  "river-mist": {
    mist: { topM: 190, densityPerM: 7e-5, tint: [0.98, 0.99, 1.0], bankKm: 8 },
    layers: [{ ...CUMULUS, altitudeM: 2600, coverage: 0.5, scaleKm: 22 }],
  },
  "dust-haze": {
    mist: { topM: 1500, densityPerM: 5e-5, tint: [1.0, 0.9, 0.72], bankKm: 40, tailM: 900 },
    layers: [{ ...CIRRUS, coverage: 0.35, density: 0.3, bearingDeg: -15 }],
  },
  "cloud-sea": {
    mist: null,
    layers: [
      { map: "sea", altitudeM: 1050, coverage: 0.9, scaleKm: 9, stretch: 1.25, density: 1.0, billow: 0.09, veil: 0.8, contactM: 90 },
      { map: "alto", altitudeM: 5200, coverage: 0.4, scaleKm: 34, stretch: 1.2, density: 0.7, absorb: 1.2, bearingDeg: 30 },
    ],
  },
  "noon-cumulus": { mist: null, layers: [{ ...CUMULUS, altitudeM: 6600, coverage: 0.5, scaleKm: 30 }] },
  "high-cirrus": {
    mist: null,
    layers: [{ ...CUMULUS, altitudeM: 3600, coverage: 0.45, scaleKm: 30 }, { ...CIRRUS, coverage: 0.55, bearingDeg: 10 }],
  },
  "desert-cirrus": { mist: null, layers: [{ ...CIRRUS, coverage: 0.75, density: 0.6, bearingDeg: -25 }] },
  "plateau-cumulus": { mist: null, layers: [{ ...CUMULUS, altitudeM: 7400, coverage: 0.42, scaleKm: 34 }] },
  "summit-plume": { mist: null, layers: [{ ...CIRRUS, altitudeM: 10500, coverage: 0.88, scaleKm: 70, density: 0.65, bearingDeg: 0 }] },
};

export const GRADE_PRESETS: Readonly<Record<string, GradePreset>> = {
  none: { exposure: 1.0, temperature: 0, saturation: 1.0, contrast: 1.0, vignette: 0.25, bloom: 0.3 },
  warm: { exposure: 1.05, temperature: 0.35, saturation: 1.1, contrast: 1.05, vignette: 0.35, bloom: 0.4 },
  cool: { exposure: 1.0, temperature: -0.3, saturation: 0.95, contrast: 1.05, vignette: 0.35, bloom: 0.3 },
  clear: { exposure: 1.05, temperature: 0, saturation: 1.05, contrast: 1.1, vignette: 0.25, bloom: 0.25 },
  cold: { exposure: 0.95, temperature: -0.5, saturation: 0.9, contrast: 1.1, vignette: 0.4, bloom: 0.45 },
};

export interface ResolvedLook {
  readonly sky: SkyPreset;
  readonly palette: PalettePreset;
  readonly cloud: CloudPreset;
  readonly grade: GradePreset;
}

/** The names a scene's look block may not use, with the table each is missing from. */
export function lookProblems(look: SceneLook): { field: keyof SceneLook; message: string }[] {
  const problems: { field: keyof SceneLook; message: string }[] = [];
  const check = (field: keyof SceneLook, table: Readonly<Record<string, unknown>>) => {
    if (!(look[field] in table)) problems.push({ field, message: `"${look[field]}" is not a ${field} preset; one of ${Object.keys(table).join(", ")}` });
  };
  check("sky", SKY_PRESETS);
  check("palette", PALETTE_PRESETS);
  check("cloud", CLOUD_PRESETS);
  check("grade", GRADE_PRESETS);
  return problems;
}

/** The presets a look names, with the defaults for any it does not. */
export function resolveLook(look: SceneLook): ResolvedLook {
  return {
    sky: SKY_PRESETS[look.sky] ?? SKY_PRESETS.default!,
    palette: PALETTE_PRESETS[look.palette] ?? PALETTE_PRESETS.default!,
    cloud: CLOUD_PRESETS[look.cloud] ?? CLOUD_PRESETS.none!,
    grade: GRADE_PRESETS[look.grade] ?? GRADE_PRESETS.none!,
  };
}

/** A palette preset made concrete for a scene at a latitude. */
export function scenePalette(preset: PalettePreset, latDeg: number): ScenePalette {
  const stops: ElevationStop[] = ELEVATION_STOPS.map((s) => {
    const over = preset.stops?.[s.name];
    return over ? { ...s, srgb: over } : s;
  });
  const snowLine = preset.snowLine ?? "latitude";
  return {
    stops,
    rockSrgb: preset.rock ?? DEFAULT_PALETTE.rockSrgb,
    snowSrgb: preset.snow ?? DEFAULT_PALETTE.snowSrgb,
    snowLineM: snowLine === "latitude" ? snowLineForLatitude(latDeg) : snowLine,
    rockSlope: preset.rockSlope ?? DEFAULT_PALETTE.rockSlope,
    rockFace: preset.face ?? DEFAULT_PALETTE.rockFace,
    seaSrgb: preset.sea ?? DEFAULT_PALETTE.seaSrgb,
    lakeSrgb: preset.lake ?? DEFAULT_PALETTE.lakeSrgb,
    riverSrgb: preset.river ?? DEFAULT_PALETTE.riverSrgb,
  };
}
