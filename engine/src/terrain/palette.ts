/**
 * The hypsometric ramp, in one place.
 *
 * Stops are real elevations in metres, so every surface that draws ground -
 * the streamed terrain, the horizon impostor, and the map overlay - keys off
 * the same numbers. The GDD's rule is that colour is never hand-painted; the
 * corollary is that it is also never duplicated, because a second copy is a
 * second set of stops waiting to drift.
 *
 * The high stops are a snow line, and a snow line is a fact: permanent snow on
 * the Tibetan Plateau starts around 5,400 m, not at the 3,800 m the first
 * draft used - which painted the whole plateau as an ice sheet and would have
 * had Expedition 7's players arriving somewhere that does not exist. Land
 * cover (workstream A step 7) supersedes all of this; until it lands, the
 * stops are the only thing keeping the ground honest.
 *
 * **The stops are data and the shader is generated from them (F45).** They
 * were a wall of GLSL, which meant the one rule this file states - never a
 * second copy - was the one rule it could not enforce: the map overlay went
 * and wrote its own ramp (F42), because reading this one would have needed a
 * GPU. It also meant nothing could test the ramp. The first thing a test
 * found once it could was that the sub-sea-level branch had its two colours
 * the wrong way round, painting the floor of a depression as plain green and
 * its shoreline as salt pan, with a 40.6 dE step across the shore between
 * them. Nothing has ever shown it: the built corridor has no cell below sea
 * level, and the place that does is Ayding Lake, which the pipeline has a
 * golden probe for and the renderer had never drawn.
 */
export const COLOR_SPACE_GLSL = /* glsl */ `
vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(vec3(0.04045), c));
}

vec3 linearToSrgb(vec3 c) {
  vec3 v = max(c, vec3(0.0));
  vec3 lo = v * 12.92;
  vec3 hi = 1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), v));
}
`;

export interface ElevationStop {
  /** Real metres above sea level. */
  readonly m: number;
  /** The colour at that elevation, sRGB 0-1 - picked by eye, so sRGB. */
  readonly srgb: readonly [number, number, number];
  /** What the stop is, kept because it survives into the generated shader. */
  readonly name: string;
}

/**
 * The ramp itself. Ordered by elevation; below the first and above the last
 * the colour is held, which is what puts the snow line at a height rather
 * than at the top of whatever the highest sample happens to be.
 */
export const ELEVATION_STOPS: readonly ElevationStop[] = [
  { m: -160, srgb: [0.82, 0.78, 0.68], name: "saltPan" },
  { m: 0, srgb: [0.35, 0.47, 0.27], name: "plain" },
  { m: 200, srgb: [0.47, 0.52, 0.28], name: "farmland" },
  { m: 800, srgb: [0.66, 0.54, 0.31], name: "loess" },
  { m: 2000, srgb: [0.6, 0.51, 0.4], name: "highDry" },
  { m: 3800, srgb: [0.62, 0.57, 0.5], name: "plateau" },
  { m: 5400, srgb: [0.7, 0.68, 0.64], name: "alpine" },
  { m: 6600, srgb: [0.95, 0.95, 0.97], name: "snow" },
];

/**
 * The ramp, in sRGB, on the CPU.
 *
 * The same arithmetic the shader does, because the shader is generated from
 * the same stops below rather than written beside them. Interpolation is in
 * sRGB and not in light, deliberately: the stops were picked by eye on a
 * screen, so the midpoint a reader expects between two of them is the one
 * halfway along in the space they were picked in.
 */
export function elevationRampSrgb(m: number): [number, number, number] {
  const first = ELEVATION_STOPS[0]!;
  if (m <= first.m) return [...first.srgb];
  for (let i = 1; i < ELEVATION_STOPS.length; i++) {
    const hi = ELEVATION_STOPS[i]!;
    if (m >= hi.m) continue;
    const lo = ELEVATION_STOPS[i - 1]!;
    const t = (m - lo.m) / (hi.m - lo.m);
    return [
      lo.srgb[0] + (hi.srgb[0] - lo.srgb[0]) * t,
      lo.srgb[1] + (hi.srgb[1] - lo.srgb[1]) * t,
      lo.srgb[2] + (hi.srgb[2] - lo.srgb[2]) * t,
    ];
  }
  return [...ELEVATION_STOPS[ELEVATION_STOPS.length - 1]!.srgb];
}

/**
 * The same function in GLSL, written out from the stops at module load.
 *
 * Generated rather than transcribed, so "never a second copy" is true of the
 * ramp instead of merely asked for. The names come through into the shader,
 * so it still reads as a palette and not as a table of constants.
 */
function rampGlsl(stops: readonly ElevationStop[]): string {
  const v = (s: ElevationStop) =>
    `vec3(${s.srgb.map((c) => c.toFixed(2)).join(", ")})`;
  const lines = stops.map((s) => `  vec3 ${s.name} = ${v(s)};`);
  lines.push("");
  lines.push(`  if (m <= ${stops[0]!.m.toFixed(1)}) return ${stops[0]!.name};`);
  for (let i = 1; i < stops.length; i++) {
    const lo = stops[i - 1]!;
    const hi = stops[i]!;
    const span = (hi.m - lo.m).toFixed(1);
    const offset =
      lo.m === 0 ? "m" : lo.m < 0 ? `(m + ${(-lo.m).toFixed(1)})` : `(m - ${lo.m.toFixed(1)})`;
    lines.push(
      `  if (m < ${hi.m.toFixed(1)}) return mix(${lo.name}, ${hi.name}, ${offset} / ${span});`,
    );
  }
  lines.push(`  return ${stops[stops.length - 1]!.name};`);
  return lines.join("\n");
}

/**
 * The ramp chunk for one set of stops: the film's palettes (design v2, "A
 * palette per scene") are each a set of stops, and a scene's terrain shader
 * is generated from its own at scene start. The default is the ramp above.
 */
export function elevationRampGlsl(stops: readonly ElevationStop[]): string {
  if (stops.length < 2) throw new Error("a ramp needs at least two stops");
  for (let i = 1; i < stops.length; i++) {
    if (stops[i]!.m <= stops[i - 1]!.m) throw new Error(`ramp stops out of order at ${stops[i]!.name}`);
  }
  return /* glsl */ `
vec3 elevationRampSrgb(float m) {
${rampGlsl(stops)}
}
${ELEVATION_COLOR_GLSL}`;
}

const ELEVATION_COLOR_GLSL = /* glsl */ `
// The stops above are picked by eye, which means they are sRGB. Lighting and
// haze are physics, which means they are linear. three converts the clear
// colour from linear on its way to the screen and does not touch a custom
// shader's output, so a shader that skips both conversions lands terrain at
// full haze on a different value from the sky it is fading into - a hard seam
// along the horizon, which is the one place this game cannot afford one.
vec3 elevationColor(float m) {
  return srgbToLinear(elevationRampSrgb(m));
}
`;

export const ELEVATION_RAMP_GLSL = elevationRampGlsl(ELEVATION_STOPS);

/**
 * Aerial perspective, integrated along the sight line.
 *
 * Haze was previously sampled at the far end of the ray, which is fine for a
 * 384 km world and wrong for a 1,200 km one: the sight line to a 4,500 m
 * ridge spends most of its length in the thick air below, and taking only the
 * ridge's own height made distant mountains arrive as clean, dark cut-outs.
 *
 * For an exponential atmosphere the mean density along a straight path has a
 * closed form - the integral of exp(-y/H) between two heights, divided by the
 * height difference - so the correction costs two exponentials and no
 * marching. Distance then reads on its own, which is the whole job of the
 * horizon band.
 */
/**
 * Scale height of the haze layer, in **real** metres: the height over which
 * the air thins by 1/e. Art-directed rather than physical (real aerosol sits
 * far lower), and tuned on screen at the exaggeration the prototype flew with
 * before F14 moved it. Convert with `hazeFalloffPerWorldUnit` - holding it in
 * world units is what let it drift in the first place.
 */
export const HAZE_SCALE_HEIGHT_M = 6_000;

/**
 * Extinction per real metre before any region weighting - the neutral air the
 * terrain and the horizon ring are built with, replaced every frame by the
 * blended region value once one is known.
 */
export const DEFAULT_HAZE_DENSITY_PER_M = 2.75e-6;

export const AERIAL_HAZE_GLSL = /* glsl */ `
float airMass(float yA, float yB, float falloff) {
  float y0 = max(min(yA, yB), 0.0);
  float y1 = max(max(yA, yB), 0.0);
  float d = (y1 - y0) * falloff;
  if (d < 1e-4) return exp(-y0 * falloff);
  return (exp(-y0 * falloff) - exp(-y1 * falloff)) / d;
}

float aerialFog(vec3 eye, vec3 target, float density, float falloff) {
  float dist = distance(eye, target);
  return clamp(1.0 - exp(-dist * density * airMass(eye.y, target.y, falloff)), 0.0, 1.0);
}
`;

/**
 * The same five lines in TypeScript, in real metres.
 *
 * A second copy, deliberately, and worth saying why rather than hiding. The
 * question "how far can you see in the Sichuan Basin" is answered by a
 * constant in `SPIKE_REGIONS` and nothing could reach it: the only
 * implementation ran on a GPU, and CI has none. That left the region table -
 * which is most of what D12 is - unguarded, and F36 found one of its claims
 * only cashes out past a hundred kilometres.
 *
 * It is safe as copies go: the GLSL is directly above, it is two expressions
 * with one guard, and there is no state. It is in real metres because the
 * world-unit conversions cancel exactly - `hazeDensityPerWorldUnit` multiplies
 * by the compression and the distance is divided by it; `hazeFalloffPerWorldUnit`
 * divides by the exaggeration and the height is multiplied by it - so this is
 * the shader's own arithmetic rather than an approximation of it, at any scale.
 */
export function airMassReal(eyeM: number, targetM: number, scaleHeightM: number): number {
  const falloff = 1 / scaleHeightM;
  const y0 = Math.max(Math.min(eyeM, targetM), 0);
  const y1 = Math.max(Math.max(eyeM, targetM), 0);
  const d = (y1 - y0) * falloff;
  if (d < 1e-4) return Math.exp(-y0 * falloff);
  return (Math.exp(-y0 * falloff) - Math.exp(-y1 * falloff)) / d;
}

/** Fraction of a target's own colour that the air has replaced, 0 to 1. */
export function aerialFogReal(
  distanceM: number,
  eyeM: number,
  targetM: number,
  densityPerM: number,
  scaleHeightM: number = HAZE_SCALE_HEIGHT_M,
): number {
  const fog = 1 - Math.exp(-distanceM * densityPerM * airMassReal(eyeM, targetM, scaleHeightM));
  return Math.min(1, Math.max(0, fog));
}

/** Distance at which a target level with the eye is half hidden, km. */
export function halfVisibleKm(eyeM: number, densityPerM: number): number {
  let lo = 0;
  let hi = 4_000_000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (aerialFogReal(mid, eyeM, eyeM, densityPerM) < 0.5) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2000;
}

/**
 * Ground lighting, in one place, for the same reason the ramp is.
 *
 * The horizon band has no normals to light - a silhouette does not have a
 * surface - so it borrows the response of flat sunlit ground and darkens it
 * by a constant for the mix of lit and shaded faces a range presents at
 * distance. Keeping one function means the band and the terrain cannot drift
 * apart in brightness, which is exactly what shows up as a step at the
 * handover between them.
 *
 * Three lights (design v2, "A sun"): the sun, shadowed where the look says
 * so; the sky from above, which is what makes the cold side of a ridge
 * cold; and the ground's own bounce from below. The two ambient colours
 * are the look's uniforms, written every frame with the sun's.
 */
export const GROUND_LIGHT_GLSL = /* glsl */ `
uniform vec3 uAmbientZenith;
uniform vec3 uAmbientGround;

vec3 groundLight(vec3 n, vec3 sunDirection, vec3 sunColor, float shadow) {
  vec3 direct = sunColor * max(dot(n, sunDirection), 0.0) * shadow;
  vec3 ambient = mix(uAmbientGround, uAmbientZenith, 0.5 + 0.5 * n.y);
  return direct + ambient;
}
`;

/** How much darker a distant range is than flat sunlit ground. */
export const RIDGE_SHADE = 0.9;

/**
 * What one scene's terrain is coloured with (design v2, "A palette per
 * scene"): its ramp, its rock and snow, where its snow starts, and the three
 * colours of its water. Everything the fragment shader bakes in as constants
 * at scene start; `look/presets.ts` builds one from a named preset.
 */
export interface ScenePalette {
  readonly stops: readonly ElevationStop[];
  readonly rockSrgb: readonly [number, number, number];
  readonly snowSrgb: readonly [number, number, number];
  /** Real metres: permanent snow from here up, on ground that can hold it. */
  readonly snowLineM: number;
  /**
   * Where ground reads as rock, as a slope (1 minus the ground normal's rise,
   * 0 flat to 1 vertical): none below the first, all above the second. At
   * six times relief most hillsides are steep, so a green gorge wants the
   * rock later than a scree slope does.
   */
  readonly rockSlope: readonly [number, number];
  /**
   * The photographed rock face laid on its walls (F92), by name in the
   * world's `rock/index.json`, tinted to `rockSrgb`; null for none.
   */
  readonly rockFace: string | null;
  readonly seaSrgb: readonly [number, number, number];
  readonly lakeSrgb: readonly [number, number, number];
  readonly riverSrgb: readonly [number, number, number];
}

/**
 * The snow line by latitude (design v2, "A snow line"): about 5,700 m on the
 * Himalaya's north side at 28 N, 4,800 m in the Qilian at 36 N, 4,000 m in
 * the Tian Shan at 43 N. A straight line through those, held between
 * 3,000 and 6,000 m. Wetter ranges run lower and a preset may say so.
 */
export function snowLineForLatitude(latDeg: number): number {
  return Math.min(6000, Math.max(3000, 6000 - 110 * (latDeg - 25)));
}

export const DEFAULT_PALETTE: ScenePalette = {
  stops: ELEVATION_STOPS,
  rockSrgb: [0.4, 0.37, 0.35],
  snowSrgb: [0.95, 0.95, 0.97],
  snowLineM: 5400,
  rockSlope: [0.35, 0.75],
  rockFace: null,
  seaSrgb: [0.15, 0.27, 0.38],
  lakeSrgb: [0.2, 0.4, 0.5],
  riverSrgb: [0.42, 0.66, 0.84],
};

/** The palette's constants, for the fragment shader that draws it. */
export function paletteConstantsGlsl(p: ScenePalette): string {
  const v = (c: readonly [number, number, number]) => `vec3(${c.map((x) => x.toFixed(3)).join(", ")})`;
  return /* glsl */ `
const vec3 ROCK_SRGB = ${v(p.rockSrgb)};
const vec3 SNOW_SRGB = ${v(p.snowSrgb)};
const float SNOW_LINE_M = ${p.snowLineM.toFixed(1)};
const float ROCK_FROM = ${p.rockSlope[0].toFixed(3)};
const float ROCK_TO = ${p.rockSlope[1].toFixed(3)};
`;
}
