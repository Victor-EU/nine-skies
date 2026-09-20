/**
 * The hypsometric ramp, in one place.
 *
 * Stops are real elevations in metres, so every surface that draws ground -
 * the streamed terrain, the horizon impostor, and later the map overlay -
 * keys off the same numbers. The GDD's rule is that colour is never
 * hand-painted; the corollary is that it is also never duplicated, because a
 * second copy is a second set of stops waiting to drift.
 *
 * The high stops are a snow line, and a snow line is a fact: permanent snow on
 * the Tibetan Plateau starts around 5,400 m, not at the 3,800 m the first
 * draft used - which painted the whole plateau as an ice sheet and would have
 * had Expedition 7's players arriving somewhere that does not exist. Land
 * cover (workstream A step 7) supersedes all of this; until it lands, the
 * stops are the only thing keeping the ground honest.
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

export const ELEVATION_RAMP_GLSL = /* glsl */ `
vec3 elevationRampSrgb(float m) {
  vec3 saltPan   = vec3(0.82, 0.78, 0.68);
  vec3 plain     = vec3(0.35, 0.47, 0.27);
  vec3 farmland  = vec3(0.47, 0.52, 0.28);
  vec3 loess     = vec3(0.66, 0.54, 0.31);
  vec3 highDry   = vec3(0.60, 0.51, 0.40);
  vec3 plateau   = vec3(0.62, 0.57, 0.50);
  vec3 alpine    = vec3(0.70, 0.68, 0.64);
  vec3 snow      = vec3(0.95, 0.95, 0.97);

  if (m < 0.0)    return mix(saltPan, plain, clamp(m / -160.0, 0.0, 1.0));
  if (m < 200.0)  return mix(plain,    farmland, m / 200.0);
  if (m < 800.0)  return mix(farmland, loess,    (m - 200.0) / 600.0);
  if (m < 2000.0) return mix(loess,    highDry,  (m - 800.0) / 1200.0);
  if (m < 3800.0) return mix(highDry,  plateau,  (m - 2000.0) / 1800.0);
  if (m < 5400.0) return mix(plateau,  alpine,   (m - 3800.0) / 1600.0);
  return mix(alpine, snow, clamp((m - 5400.0) / 1200.0, 0.0, 1.0));
}

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
 * Ground lighting, in one place, for the same reason the ramp is.
 *
 * The horizon band has no normals to light - a silhouette does not have a
 * surface - so it borrows the response of flat sunlit ground and darkens it
 * by a constant for the mix of lit and shaded faces a range presents at
 * distance. Keeping one function means the band and the terrain cannot drift
 * apart in brightness, which is exactly what shows up as a step at the
 * handover between them.
 */
export const GROUND_LIGHT_GLSL = /* glsl */ `
vec3 groundLight(vec3 n, vec3 sunDirection, vec3 sunColor) {
  return sunColor * max(dot(n, sunDirection), 0.0) + vec3(0.28 + 0.22 * n.y);
}
`;

/** How much darker a distant range is than flat sunlit ground. */
export const RIDGE_SHADE = 0.9;
