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
import { projectAlbers } from "../terrain/worldGrid.js";
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
  /**
   * Its river's colour where it was measured along its course, where one
   * colour is wrong for much of it (F138); `river` stays the colour away
   * from them all. See `riverColourAt`.
   */
  readonly riverAlong?: readonly RiverSample[];
}

/** A river's colour where it was measured: the median of its water's pixels in the photograph (F138). */
export interface RiverSample {
  readonly lat: number;
  readonly lon: number;
  readonly srgb: Rgb;
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
  // October on the Loess Plateau, the year's least dusty month: what haze
  // there is is fine and grey, the ridges fade blue-grey for tens of
  // kilometres (F138; it had been a dust storm's ochre, which is April's).
  "autumn-afternoon": { hazeDensityPerM: 2.75e-6, scaleHeightM: 4000, hazeTint: [0.98, 0.97, 0.96], turbidity: 1.1, glow: 0.9, glowPower: 8, zenithDepth: 0.75, blue: 0.55 },
  "steppe-evening": { hazeDensityPerM: 2.5e-6, scaleHeightM: 4000, hazeTint: [1.0, 0.93, 0.84], turbidity: 1.2, glow: 1.2, glowPower: 8, zenithDepth: 0.8, blue: 0.45 },
  "desert-evening": { hazeDensityPerM: 3e-6, scaleHeightM: 3000, hazeTint: [1.0, 0.82, 0.62], turbidity: 1.7, glow: 1.5, glowPower: 6, zenithDepth: 0.7, blue: 0.15 },
  "plateau-dusk": { hazeDensityPerM: 2e-6, scaleHeightM: 6000, hazeTint: [0.9, 0.95, 1.0], turbidity: 0.7, glow: 0.6, glowPower: 14, zenithDepth: 1.0, blue: 0.6 },
  "last-light": { hazeDensityPerM: 2e-6, scaleHeightM: 6000, hazeTint: [0.95, 0.92, 1.0], turbidity: 0.9, glow: 1.4, glowPower: 8, zenithDepth: 1.0, blue: 0.6 },
};

/*
 * A river's colour is its water's in the photograph (F127), which the film
 * grades as it grades the ground: the median of the pixels in the river's
 * own cluster of colours, within 400 m of its line, in the 10 m colour along
 * the rails. Where the rails cross only dry beds, the nearest water of the
 * same kind the photograph has.
 */
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
    // The steppe's rivers are dry sand where the rail crosses them: its
    // river's standing water, off the rail, is a dark teal (F127).
    river: [0.15, 0.24, 0.22],
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
    // The Yangtze below the gorges, jade (F127).
    river: [0.32, 0.44, 0.39],
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
    // The Jinsha, milky with the silt of its gorges (F127).
    river: [0.66, 0.62, 0.5],
  },
  "loess-ochre": {
    face: "sediment",
    stops: { farmland: [0.6, 0.5, 0.3], loess: [0.72, 0.58, 0.32], highDry: [0.68, 0.56, 0.4] },
    rock: [0.55, 0.45, 0.35],
    // The Yellow River, khaki (F127).
    river: [0.52, 0.47, 0.33],
    // ...silt off the Hetao at Hekou, jade in the Wanjiazhai and Longkou
    // reservoirs, grey-green down past Fugu, then khaki and tan to Tongguan:
    // at each rail point, the median of the river's water in the 10 m
    // photograph, the water as ESA WorldCover 2021 has it less its ponds
    // (F138; `pipeline/nineskies/rivercolour.py`).
    riverAlong: [
      { lat: 40.2081, lon: 111.1848, srgb: [0.518, 0.475, 0.318] }, // 0 km
      { lat: 40.1567, lon: 111.3003, srgb: [0.545, 0.486, 0.325] }, // 11 km
      { lat: 40.0709, lon: 111.3769, srgb: [0.557, 0.482, 0.329] }, // 23 km
      { lat: 39.9724, lon: 111.415, srgb: [0.62, 0.502, 0.345] }, // 34 km
      { lat: 39.8727, lon: 111.4141, srgb: [0.455, 0.455, 0.306] }, // 45 km
      { lat: 39.7734, lon: 111.3644, srgb: [0.376, 0.447, 0.314] }, // 57 km
      { lat: 39.6826, lon: 111.4178, srgb: [0.22, 0.29, 0.235] }, // 68 km
      { lat: 39.6219, lon: 111.4247, srgb: [0.227, 0.329, 0.259] }, // 75 km
      { lat: 39.518, lon: 111.4149, srgb: [0.251, 0.333, 0.278] }, // 87 km
      { lat: 39.4362, lon: 111.3285, srgb: [0.224, 0.306, 0.255] }, // 98 km
      { lat: 39.4261, lon: 111.1905, srgb: [0.31, 0.353, 0.275] }, // 110 km
      { lat: 39.3678, lon: 111.1398, srgb: [0.29, 0.325, 0.259] }, // 118 km
      { lat: 39.3056, lon: 111.2253, srgb: [0.314, 0.349, 0.271] }, // 128 km
      { lat: 39.2068, lon: 111.1777, srgb: [0.408, 0.392, 0.302] }, // 140 km
      { lat: 39.1056, lon: 111.1362, srgb: [0.227, 0.314, 0.251] }, // 152 km
      { lat: 39.0286, lon: 111.0498, srgb: [0.392, 0.388, 0.306] }, // 163 km
      { lat: 38.9525, lon: 110.9852, srgb: [0.369, 0.388, 0.306] }, // 173 km
      { lat: 38.8507, lon: 110.987, srgb: [0.282, 0.333, 0.275] }, // 185 km
      { lat: 38.7511, lon: 110.9448, srgb: [0.373, 0.384, 0.294] }, // 196 km
      { lat: 38.6549, lon: 110.8905, srgb: [0.463, 0.427, 0.325] }, // 208 km
      { lat: 38.5582, lon: 110.9, srgb: [0.4, 0.38, 0.298] }, // 219 km
      { lat: 38.4599, lon: 110.8543, srgb: [0.459, 0.424, 0.329] }, // 230 km
      { lat: 38.3949, lon: 110.7579, srgb: [0.471, 0.455, 0.349] }, // 241 km
      { lat: 38.3157, lon: 110.669, srgb: [0.471, 0.455, 0.353] }, // 253 km
      { lat: 38.2582, lon: 110.5737, srgb: [0.459, 0.435, 0.333] }, // 264 km
      { lat: 38.1815, lon: 110.5045, srgb: [0.533, 0.482, 0.361] }, // 274 km
      { lat: 38.0778, lon: 110.5008, srgb: [0.533, 0.486, 0.369] }, // 286 km
      { lat: 37.9731, lon: 110.5139, srgb: [0.545, 0.486, 0.365] }, // 297 km
      { lat: 37.9027, lon: 110.5989, srgb: [0.592, 0.498, 0.369] }, // 308 km
      { lat: 37.8077, lon: 110.6599, srgb: [0.514, 0.451, 0.333] }, // 320 km
      { lat: 37.7383, lon: 110.7478, srgb: [0.498, 0.439, 0.329] }, // 331 km
      { lat: 37.6795, lon: 110.7761, srgb: [0.561, 0.471, 0.349] }, // 338 km
      { lat: 37.5892, lon: 110.7818, srgb: [0.553, 0.482, 0.361] }, // 348 km
      { lat: 37.4913, lon: 110.7503, srgb: [0.537, 0.467, 0.349] }, // 359 km
      { lat: 37.4304, lon: 110.6497, srgb: [0.604, 0.502, 0.373] }, // 370 km
      { lat: 37.355, lon: 110.6872, srgb: [0.537, 0.486, 0.369] }, // 379 km
      { lat: 37.2634, lon: 110.6389, srgb: [0.576, 0.506, 0.38] }, // 390 km
      { lat: 37.1752, lon: 110.564, srgb: [0.565, 0.49, 0.365] }, // 402 km
      { lat: 37.091, lon: 110.4885, srgb: [0.6, 0.51, 0.392] }, // 414 km
      { lat: 37.0235, lon: 110.4379, srgb: [0.584, 0.502, 0.38] }, // 423 km
      { lat: 36.9867, lon: 110.3952, srgb: [0.592, 0.502, 0.373] }, // 428 km
      { lat: 36.8971, lon: 110.3788, srgb: [0.627, 0.545, 0.408] }, // 438 km
      { lat: 36.8105, lon: 110.4163, srgb: [0.612, 0.502, 0.365] }, // 448 km
      { lat: 36.7439, lon: 110.4135, srgb: [0.643, 0.525, 0.38] }, // 456 km
      { lat: 36.6986, lon: 110.3933, srgb: [0.647, 0.518, 0.369] }, // 461 km
      { lat: 36.6123, lon: 110.4635, srgb: [0.682, 0.522, 0.357] }, // 473 km
      { lat: 36.5126, lon: 110.4993, srgb: [0.631, 0.529, 0.396] }, // 484 km
      { lat: 36.4084, lon: 110.4768, srgb: [0.643, 0.522, 0.373] }, // 496 km
      { lat: 36.3044, lon: 110.4652, srgb: [0.624, 0.525, 0.388] }, // 508 km
      { lat: 36.2018, lon: 110.4493, srgb: [0.627, 0.549, 0.416] }, // 519 km
      { lat: 36.0973, lon: 110.4607, srgb: [0.573, 0.498, 0.388] }, // 531 km
      { lat: 35.9942, lon: 110.4929, srgb: [0.635, 0.529, 0.408] }, // 542 km
      { lat: 35.8892, lon: 110.5101, srgb: [0.639, 0.525, 0.392] }, // 554 km
      { lat: 35.8082, lon: 110.5647, srgb: [0.659, 0.545, 0.4] }, // 565 km
      { lat: 35.703, lon: 110.58, srgb: [0.616, 0.537, 0.435] }, // 576 km
      { lat: 35.5104, lon: 110.5576, srgb: [0.541, 0.506, 0.392] }, // 600 km
      { lat: 35.3332, lon: 110.4437, srgb: [0.714, 0.592, 0.42] }, // 622 km
      { lat: 35.2492, lon: 110.3672, srgb: [0.659, 0.569, 0.424] }, // 634 km
      { lat: 34.9449, lon: 110.2595, srgb: [0.616, 0.518, 0.38] }, // 669 km
      { lat: 34.8425, lon: 110.256, srgb: [0.655, 0.561, 0.4] }, // 681 km
      { lat: 34.7397, lon: 110.2405, srgb: [0.694, 0.573, 0.412] }, // 692 km
    ],
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
    // Its rivers are dry beds under the rails: silt, as the Yellow River's (F127).
    river: [0.52, 0.47, 0.33],
  },
  "plateau-tan-turquoise": {
    face: "dark",
    stops: { highDry: [0.6, 0.55, 0.42], plateau: [0.66, 0.6, 0.48], alpine: [0.72, 0.7, 0.66] },
    lake: [0.15, 0.55, 0.62],
    // The plateau's rivers, ochre with silt (F127).
    river: [0.67, 0.51, 0.33],
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
  "thin-cirrus": { mist: null, layers: [{ ...CIRRUS, coverage: 0.35, density: 0.3, bearingDeg: -15 }] },
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
    riverAlong: (preset.riverAlong ?? []).map((p) => ({ ...projectAlbers(p.lat, p.lon), srgb: p.srgb })),
  };
}
