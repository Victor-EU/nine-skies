import { Color, ShaderMaterial, GLSL3, Vector3, Vector4 } from "three";
import {
  AERIAL_HAZE_GLSL,
  COLOR_SPACE_GLSL,
  DEFAULT_PALETTE,
  GROUND_LIGHT_GLSL,
  elevationRampGlsl,
  paletteConstantsGlsl,
  type ScenePalette,
} from "./palette.js";
import { MIST_GLSL, NOISE_GLSL, SHADOW_GLSL, SKY_GLSL, TIME_GLSL } from "../look/glsl.js";
import { lookUniformDefaults } from "../look/uniforms.js";
import { NO_RIBBON_CAP_M, waterGlsl } from "./water.js";
import { COLOUR_CELLS, COLOUR_SAMPLES } from "./colour.js";

/**
 * Terrain shader (build plan D3 and D12; design v2, "The look").
 *
 * Two things earn their place here:
 *
 * 1. The mesh is displaced by a vertex texture fetch, so the CPU never builds
 *    terrain geometry. One grid, many tiles, one integer texture array.
 *
 * 2. Normals are the ground's own, not the triangles': each vertex takes a
 *    central difference of the heights around its texel, read at the finest
 *    spacing whatever the LOD, and the fragment lights the interpolated
 *    normal. Version 1 lit each triangle flat from the derivatives of the
 *    world position, a low-poly look its art direction asked for; over 1 km
 *    samples that drew the country as facets a kilometre wide, which viewers
 *    of the film read as a game built of bricks (stage 7, F86). The shadow
 *    reads the same normal: on the flat one, a triangle turned from the sun
 *    skipped the shadow test and shone out of a mountain's cast shadow as a
 *    lit facet. Along a tile's edge the difference reads the neighbour's row
 *    (`iNeighbours`), since tiles share their edge samples; a one-sided
 *    difference stands in where the neighbour is not resident, so the only
 *    seam is at the edge of what is loaded. The rim's curtain, a wall with
 *    no heights around it, keeps the flat normal.
 *
 * Colour is the scene's palette: an elevation ramp, rock on the steep, snow
 * above a line, baked in as constants and regenerated at scene start
 * (`setTerrainPalette`). Light is the sun with its shadow, the sky and the
 * ground's bounce (`GROUND_LIGHT_GLSL`); the air is mist in the valleys and
 * haze to the sky's own colour in the direction looked (`look/glsl.ts`).
 * The output is linear: the post pass (`look/post.ts`) grades it.
 */

/** Where in its tile a fragment is, for the water and the colour, which read layers of their own. */
const TEXEL_VERTEX_INPUTS = /* glsl */ `
out vec2 vTexel;
flat out float vLayer;`;

const TEXEL_VERTEX_BODY = /* glsl */ `
  vTexel = aTexel;
  vLayer = iLayer;`;

const TEXEL_FRAGMENT_INPUTS = /* glsl */ `
in vec2 vTexel;
flat in float vLayer;`;

/** What the water layer adds to each stage, when there is one (F72). */
const WATER_VERTEX_INPUTS = /* glsl */ `
in float iWater;
flat out float vWater;`;

const WATER_VERTEX_BODY = /* glsl */ `
  vWater = iWater;`;

const WATER_FRAGMENT_INPUTS = /* glsl */ `
flat in float vWater;`;

/** What the ground's colour adds (F87). */
const COLOUR_VERTEX_INPUTS = /* glsl */ `
in float iColour;
flat out float vColour;`;

const COLOUR_VERTEX_BODY = /* glsl */ `
  vColour = iColour;`;

/**
 * The mosaic at a fragment. Colour tiles are `COLOUR_SAMPLES` a side with
 * sample 0 on the tile's west and north edges, so a tile-local position
 * maps to the middle of the edge texels, and rows run north to south, so
 * the tile's v is flipped. Graded: the mosaic's colours are a map's, and the
 * film's light is its own (`uImagery`: gain, saturation; `uImageryTint`,
 * a white balance, since the mosaic's greens lean to blue).
 */
const COLOUR_FRAGMENT_INPUTS = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray uColour;
uniform float uTileTexels;
uniform vec4 uImagery;
uniform vec3 uImageryTint;
flat in float vColour;

vec3 imageryAt(vec2 texel, float layer) {
  vec2 uv = texel / uTileTexels;
  vec2 st = vec2(uv.x, 1.0 - uv.y) * (${COLOUR_CELLS.toFixed(1)} / ${COLOUR_SAMPLES.toFixed(1)}) + 0.5 / ${COLOUR_SAMPLES.toFixed(1)};
  vec3 c = texture(uColour, vec3(st, layer)).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return max(mix(vec3(l), c, uImagery.y), 0.0) * uImagery.x * uImageryTint;
}`;

// A tile whose water has landed. Flat per instance, so every fragment of a
// triangle takes the same branch and the derivatives inside it hold.
const WATER_FRAGMENT_BODY = /* glsl */ `
  if (vWater > 0.5) lit = withWater(lit, sun, uSunColor, shadow, vTexel, vLayer, dir, vWorld);`;

/** The ground's normal at a vertex, for the lit pass (not the depth pass). */
const NORMAL_VERTEX_INPUTS = /* glsl */ `
in vec4 iNeighbours;
out vec3 vNormal;

// The height one texel from t along d, which is on the neighbouring tile when
// the step leaves this one: tiles share their edge row, so the neighbour's
// texel one in from its own edge. False where that neighbour is not resident.
bool heightNear(ivec2 t, ivec2 d, int last, out float h) {
  ivec2 p = t + d;
  float layer = iLayer;
  if (p.x < 0) { layer = iNeighbours.x; p.x += last; }
  else if (p.x > last) { layer = iNeighbours.y; p.x -= last; }
  else if (p.y < 0) { layer = iNeighbours.z; p.y += last; }
  else if (p.y > last) { layer = iNeighbours.w; p.y -= last; }
  if (layer < 0.0) return false;
  h = float(texelFetch(uHeights, ivec3(p, int(layer)), 0).r);
  return true;
}

// A central difference where both sides are there, one-sided where one is not.
float slopeAcross(float before, bool hasBefore, float here, float after, bool hasAfter) {
  if (hasBefore && hasAfter) return (after - before) * 0.5;
  if (hasAfter) return after - here;
  if (hasBefore) return here - before;
  return 0.0;
}

vec3 groundNormal(ivec2 t, float here) {
  int last = textureSize(uHeights, 0).x - 1;
  float w, e, s, n;
  bool hw = heightNear(t, ivec2(-1, 0), last, w);
  bool he = heightNear(t, ivec2(1, 0), last, e);
  bool hs = heightNear(t, ivec2(0, -1), last, s);
  bool hn = heightNear(t, ivec2(0, 1), last, n);
  // Metres of rise per texel, to world units of rise per world unit across.
  float k = uVerticalExaggeration * float(last) / uTileWorldSize;
  float dx = slopeAcross(w, hw, here, e, he) * k;
  float dz = slopeAcross(s, hs, here, n, hn) * k;
  return normalize(vec3(-dx, 1.0, -dz));
}`;

const vertexShader = (water: boolean, normals: boolean, colour: boolean): string => /* glsl */ `
precision highp float;
precision highp int;
precision highp isampler2DArray;

in vec2 aTexel;
in float aSkirt;
in vec2 iOrigin;
in float iLayer;
${water || colour ? TEXEL_VERTEX_INPUTS : ""}
${water ? WATER_VERTEX_INPUTS : ""}
${colour ? COLOUR_VERTEX_INPUTS : ""}

uniform isampler2DArray uHeights;
uniform float uTileWorldSize;
uniform float uVerticalExaggeration;
uniform float uSkirtDepth;

out vec3 vWorld;
out float vElevation;
${normals ? NORMAL_VERTEX_INPUTS : ""}

void main() {
  int h = texelFetch(uHeights, ivec3(int(aTexel.x), int(aTexel.y), int(iLayer)), 0).r;
  float elevationM = float(h);

  // Skirt vertices duplicate the edge sample and drop straight down, which
  // hides the crack where a coarser neighbour tile disagrees about the height.
  float y = elevationM * uVerticalExaggeration - aSkirt * uSkirtDepth;

  vec3 world = vec3(
    iOrigin.x + position.x * uTileWorldSize,
    y,
    iOrigin.y + position.z * uTileWorldSize
  );

  vWorld = world;
  vElevation = elevationM;
${normals ? "  vNormal = groundNormal(ivec2(aTexel), elevationM);" : ""}
${water || colour ? TEXEL_VERTEX_BODY : ""}
${water ? WATER_VERTEX_BODY : ""}
${colour ? COLOUR_VERTEX_BODY : ""}
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
`;

/**
 * How many hero areas one terrain material can cut holes for.
 *
 * The build plan names five (gorge, karst towers, sandstone pillars, three
 * gorges, Everest) and the last of those may want to be three areas, so eight
 * is the next comfortable size up. A material asked for more is refused
 * rather than quietly dropping the ninth.
 */
export const MAX_CUT_RECTS = 8;

/**
 * How the mosaic is graded into the film's light (F87): gain, saturation,
 * then the share of the palette's rock laid on steep ground and of its snow
 * above the line. Set against the nine stills.
 */
export const DEFAULT_IMAGERY: readonly [number, number, number, number] = [1.4, 1.05, 0.5, 0.0];

/** The mosaic's white balance in the film's light: its greens lean to blue (F87). */
export const DEFAULT_IMAGERY_TINT: readonly [number, number, number] = [1.1, 1.0, 0.78];

const cutUniforms = (maxCuts: number): string =>
  maxCuts === 0
    ? ""
    : /* glsl */ `
uniform vec4 uCutRects[${maxCuts}];
uniform int uCutCount;
`;

/**
 * The overlap rule, in one `discard` (F51).
 *
 * Where a hero area exists, the country grid under it is not a coarser
 * version of the same ground - it is different ground. Through Tiger Leaping
 * Gorge the 1 km surface stands up to 764 m above the 90 m one and 390 m
 * below its ridges, so neither can be drawn over the other: the country
 * surface would fill the gorge in from above, and the hero ridges would
 * spear through it from below. The country grid is removed inside the
 * rectangle instead.
 *
 * Per-fragment rather than per-vertex because a country tile's vertices are
 * 1 km apart at the finest LOD and 8 km apart at the coarsest, and the rim of
 * a hero area is a straight line at neither spacing. The gap it leaves is a
 * step, and which way it steps changes along the rim. Where the hero edge
 * stands higher, the hero tiles' own skirts fill it. Where the country ground
 * does, which is three-quarters of both rims, the country hangs a curtain of
 * its own from the surface it draws there (F74, `rimCurtain.ts`). Both drop
 * 900 m, against a disagreement the cutter measures and refuses to publish
 * above that.
 *
 * This is also why the block is generated rather than always present: a
 * shader containing `discard` gives up early-Z on most hardware whether the
 * branch is taken or not, so the material that has no holes to cut is
 * compiled without one.
 */
const cutBody = (maxCuts: number): string =>
  maxCuts === 0
    ? ""
    : /* glsl */ `
  for (int i = 0; i < uCutCount; i++) {
    vec4 r = uCutRects[i];
    if (vWorld.x >= r.x && vWorld.x < r.z && vWorld.z >= r.y && vWorld.z < r.w) {
      discard;
    }
  }
`;

// The mosaic in place of the palette where the tile has its colour. It
// photographed the rock and the snow, so the palette's are only laid over it
// where the relief is steeper than a photograph from above can show - a
// cliff is a smear of a few texels - and not at all for snow (`uImagery`:
// the rock's share, the snow's). Flat per instance, so the texture read's
// derivatives hold.
const COLOUR_FRAGMENT_BODY = /* glsl */ `
  if (vColour > 0.5) {
    base = imageryAt(vTexel, vLayer);
    rock *= uImagery.z;
    snow *= uImagery.w;
  }`;

// The ground's normal, interpolated from its vertices (header).
const SMOOTH_NORMAL = /* glsl */ `
  vec3 n = normalize(vNormal);`;

// The drawn triangle's own, from the derivative of world position: the rim's.
const FLAT_NORMAL = /* glsl */ `
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;`;

const fragmentShader = (
  maxCuts: number,
  waterSamples: number,
  palette: ScenePalette,
  smooth: boolean,
  colour: boolean,
): string => /* glsl */ `
precision highp float;
precision highp int;
precision highp usampler2DArray;

in vec3 vWorld;
in float vElevation;
${smooth ? "in vec3 vNormal;" : ""}
${waterSamples > 0 || colour ? TEXEL_FRAGMENT_INPUTS : ""}
${waterSamples > 0 ? WATER_FRAGMENT_INPUTS : ""}
${colour ? COLOUR_FRAGMENT_INPUTS : ""}

uniform vec3 uSunColor;
uniform float uHazeDensity;
uniform float uHazeHeightFalloff;
uniform vec3 uCameraWorld;

out vec4 fragColor;

${COLOR_SPACE_GLSL}
${elevationRampGlsl(palette.stops)}
${paletteConstantsGlsl(palette)}
${AERIAL_HAZE_GLSL}
${GROUND_LIGHT_GLSL}
${SKY_GLSL}
${NOISE_GLSL}
${MIST_GLSL}
${SHADOW_GLSL}
${TIME_GLSL}
${cutUniforms(maxCuts)}
${waterSamples > 0 ? waterGlsl(waterSamples, palette) : ""}

void main() {
${cutBody(maxCuts)}
${smooth ? SMOOTH_NORMAL : FLAT_NORMAL}
  vec3 sun = normalize(uSunDirection);

  vec3 base = elevationColor(vElevation);

  // Steep ground reads as rock wherever it is; snow lies where the ground
  // can hold it, above the scene's line.
  float slope = 1.0 - clamp(n.y, 0.0, 1.0);
  float rock = smoothstep(ROCK_FROM, ROCK_TO, slope);
  float snow = smoothstep(SNOW_LINE_M - 400.0, SNOW_LINE_M + 300.0, vElevation) * (1.0 - smoothstep(0.55, 0.85, slope));
${colour ? COLOUR_FRAGMENT_BODY : ""}
  base = mix(base, srgbToLinear(ROCK_SRGB), rock);
  base = mix(base, srgbToLinear(SNOW_SRGB), snow);

  float shadow = sunShadow(vWorld, n, sun);
  vec3 lit = base * groundLight(n, sun, uSunColor, shadow);

  vec3 toFrag = vWorld - uCameraWorld;
  vec3 dir = toFrag / max(length(toFrag), 1e-3);
${waterSamples > 0 ? WATER_FRAGMENT_BODY : ""}

  // Mist first, then the analytic haze integrated along the sight line: the
  // valley fills with white and the whole fades to the sky in the direction
  // looked, which is what makes the plateau horizon read as hard and clean
  // while the Sichuan Basin reads as milk.
  lit = mix(lit, uMistColor, mistAlong(uCameraWorld, vWorld));
  float fog = aerialFog(uCameraWorld, vWorld, uHazeDensity, uHazeHeightFalloff);
  fragColor = vec4(mix(lit, skyHorizonAt(dir), fog), 1.0);
}
`;

/** What a material remembers so its shader can be regenerated for a palette. */
interface Recipe {
  readonly kind: "terrain" | "rim";
  readonly maxCuts: number;
  readonly waterSamples: number;
  readonly colour: boolean;
}

export interface TerrainUniformValues {
  tileWorldSize: number;
  /**
   * Rectangles of the world this material must not draw, because a finer grid
   * draws them instead. Zero - the default - compiles a shader with no
   * `discard` in it at all.
   */
  maxCuts?: number;
  verticalExaggeration: number;
  skirtDepth: number;
  hazeDensity: number;
  hazeHeightFalloff: number;
  /** The scene's colours; the default until a scene names its own. */
  palette?: ScenePalette;
  /**
   * The ground's colour layers (F87), one beside each height layer. Absent
   * compiles a shader with the palette alone.
   */
  colour?: import("three").DataArrayTexture;
  /**
   * The water layer (F72): the array beside the heights, and what its bytes
   * mean. Absent compiles a shader with no water in it.
   */
  water?: {
    texture: import("three").DataArrayTexture;
    samples: number;
    sampleM: number;
    offsetStepM: number;
    offsetZero: number;
    reachM: number;
    /**
     * The widest a ribbon is drawn before the pixel floor, on a grid that
     * resolves its valleys: the hero grid's half a sample (F73). Absent, the
     * width table alone.
     */
    ribbonMaxM?: number;
  };
}

export function createTerrainMaterial(
  heights: import("three").DataArrayTexture,
  values: TerrainUniformValues,
): ShaderMaterial {
  const maxCuts = values.maxCuts ?? 0;
  if (maxCuts > MAX_CUT_RECTS) {
    throw new Error(`${maxCuts} cut rectangles asked for, ${MAX_CUT_RECTS} available`);
  }
  const cuts =
    maxCuts === 0
      ? {}
      : {
          uCutRects: {
            value: Array.from({ length: maxCuts }, () => new Vector4()),
          },
          uCutCount: { value: 0 },
        };
  const water = values.water;
  const waterUniforms = water
    ? {
        uWater: { value: water.texture },
        uWaterSampleM: { value: water.sampleM },
        uWaterStepM: { value: water.offsetStepM },
        uWaterReachM: { value: water.reachM },
        uWaterZero: { value: water.offsetZero },
        uWaterRibbonMaxM: { value: water.ribbonMaxM ?? NO_RIBBON_CAP_M },
      }
    : {};
  const recipe: Recipe = { kind: "terrain", maxCuts, waterSamples: water?.samples ?? 0, colour: values.colour !== undefined };
  const colourUniforms = values.colour
    ? {
        uColour: { value: values.colour },
        uTileTexels: { value: heights.image.width - 1 },
        uImagery: { value: new Vector4(...DEFAULT_IMAGERY) },
        uImageryTint: { value: new Vector3(...DEFAULT_IMAGERY_TINT) },
      }
    : {};
  const material = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: vertexShader(water !== undefined, true, recipe.colour),
    fragmentShader: fragmentShader(maxCuts, recipe.waterSamples, values.palette ?? DEFAULT_PALETTE, true, recipe.colour),
    uniforms: {
      ...lookUniformDefaults(),
      ...cuts,
      ...waterUniforms,
      ...colourUniforms,
      uHeights: { value: heights },
      uTileWorldSize: { value: values.tileWorldSize },
      uVerticalExaggeration: { value: values.verticalExaggeration },
      uSkirtDepth: { value: values.skirtDepth },
      uHazeDensity: { value: values.hazeDensity },
      uHazeHeightFalloff: { value: values.hazeHeightFalloff },
      uCameraWorld: { value: new Vector3() },
    },
  });
  material.userData.recipe = recipe;
  return material;
}

/**
 * Regenerate a material's fragment shader for a scene's palette. The stops
 * and the rock, snow and water colours are constants in the shader, so a
 * palette is a recompile: once a scene, during its lead-in.
 */
export function setTerrainPalette(material: ShaderMaterial, palette: ScenePalette): void {
  const recipe = material.userData.recipe as Recipe | undefined;
  if (!recipe) throw new Error("not a terrain material");
  const terrain = recipe.kind === "terrain";
  material.fragmentShader = fragmentShader(terrain ? recipe.maxCuts : 0, recipe.waterSamples, palette, terrain, recipe.colour);
  material.needsUpdate = true;
}

/**
 * The curtain the country grid hangs along a hero rim (F74): see
 * `rimCurtain.ts`. Its x and z arrive in world units and its y in real
 * metres, so exaggeration and depth are the lattice's own uniforms.
 */
const rimVertexShader = /* glsl */ `
precision highp float;

in float aSkirt;

uniform float uVerticalExaggeration;
uniform float uSkirtDepth;

out vec3 vWorld;
out float vElevation;

void main() {
  vec3 world = vec3(position.x, position.y * uVerticalExaggeration - aSkirt * uSkirtDepth, position.z);
  vWorld = world;
  vElevation = position.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
`;

/** The uniforms the rim and the depth pass borrow from the country material. */
const SHARED_WITH_RIM = [
  "uVerticalExaggeration",
  "uSkirtDepth",
  "uHazeDensity",
  "uHazeHeightFalloff",
  "uCameraWorld",
] as const;

/**
 * The country material's shading on the curtain's geometry.
 *
 * The uniforms the curtain shares with the country are the country's own
 * objects, not copies, so a scale change and the camera reach it without
 * anyone writing to it; the look's uniforms are its own, because the rig
 * writes every material it draws with. No cut, since the curtain stands
 * exactly on the rectangle's edge and a `discard` would take it or leave it
 * by rounding, no water, since it is a wall, and the flat normal, since a
 * wall has no heights around it to difference.
 */
export function createRimMaterial(country: ShaderMaterial, palette: ScenePalette = DEFAULT_PALETTE): ShaderMaterial {
  const u = country.uniforms;
  const material = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: rimVertexShader,
    fragmentShader: fragmentShader(0, 0, palette, false, false),
    uniforms: {
      ...lookUniformDefaults(),
      ...Object.fromEntries(SHARED_WITH_RIM.map((name) => [name, u[name]!])),
    },
  });
  material.userData.recipe = { kind: "rim", maxCuts: 0, waterSamples: 0, colour: false } satisfies Recipe;
  return material;
}

const depthFragmentShader = (maxCuts: number): string => /* glsl */ `
precision highp float;

in vec3 vWorld;
in float vElevation;
${cutUniforms(maxCuts)}
out vec4 fragColor;

void main() {
${cutBody(maxCuts)}
  fragColor = vec4(1.0);
}
`;

/**
 * The same geometry from the sun's point of view (`look/shadows.ts`): the
 * terrain's own vertex shader, so the depth the shadow reads is the depth
 * the picture drew, and the same cut, so the country ground under a hero
 * area does not shadow the hero ground that replaces it. Every uniform it
 * needs is the source material's own object.
 */
export function createDepthMaterial(source: ShaderMaterial): ShaderMaterial {
  const recipe = source.userData.recipe as Recipe | undefined;
  if (!recipe) throw new Error("not a terrain material");
  const u = source.uniforms;
  if (recipe.kind === "rim") {
    return new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: rimVertexShader,
      fragmentShader: depthFragmentShader(0),
      uniforms: { uVerticalExaggeration: u.uVerticalExaggeration!, uSkirtDepth: u.uSkirtDepth! },
    });
  }
  const names = ["uHeights", "uTileWorldSize", "uVerticalExaggeration", "uSkirtDepth"];
  if (recipe.maxCuts > 0) names.push("uCutRects", "uCutCount");
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: vertexShader(false, false, false),
    fragmentShader: depthFragmentShader(recipe.maxCuts),
    uniforms: Object.fromEntries(names.map((name) => [name, u[name]!])),
  });
}

export { Color };
