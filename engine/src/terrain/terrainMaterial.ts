import { Color, ShaderMaterial, GLSL3, Vector2, Vector3, Vector4 } from "three";
import {
  AERIAL_HAZE_GLSL,
  COLOR_SPACE_GLSL,
  ELEVATION_RAMP_GLSL,
  GROUND_LIGHT_GLSL,
} from "./palette.js";
import { waterGlsl } from "./water.js";

/**
 * Terrain shader (build plan D3 and D12).
 *
 * Two things earn their place here:
 *
 * 1. The mesh is displaced by a vertex texture fetch, so the CPU never builds
 *    terrain geometry. One grid, many tiles, one integer texture array.
 *
 * 2. Normals come from screen-space derivatives of the interpolated world
 *    position. Because that position is linear across a triangle, its
 *    derivatives are constant across it - which is exactly flat shading, for
 *    free, with no normal attribute, no baking and no split vertices. The
 *    low-poly faceting the art direction asks for falls out of the maths.
 *
 * Colour is elevation plus slope for now. Land cover fractions arrive from the
 * pipeline as a second texture array and blend in here; the GDD's rule is that
 * colour is never hand-painted.
 */

/** What the water layer adds to each stage, when there is one (F72). */
const WATER_VERTEX_INPUTS = /* glsl */ `
in float iWater;
out vec2 vTexel;
flat out float vLayer;
flat out float vWater;`;

const WATER_VERTEX_BODY = /* glsl */ `
  vTexel = aTexel;
  vLayer = iLayer;
  vWater = iWater;`;

const WATER_FRAGMENT_INPUTS = /* glsl */ `
in vec2 vTexel;
flat in float vLayer;
flat in float vWater;`;

// A tile whose water has landed. Flat per instance, so every fragment of a
// triangle takes the same branch and the derivatives inside it hold.
const WATER_FRAGMENT_BODY = /* glsl */ `
  if (vWater > 0.5) lit = withWater(lit, normalize(uSunDirection), uSunColor, vTexel, vLayer);`;

const vertexShader = (water: boolean): string => /* glsl */ `
precision highp float;
precision highp int;
precision highp isampler2DArray;

in vec2 aTexel;
in float aSkirt;
in vec2 iOrigin;
in float iLayer;
${water ? WATER_VERTEX_INPUTS : ""}

uniform isampler2DArray uHeights;
uniform float uTileWorldSize;
uniform float uVerticalExaggeration;
uniform float uSkirtDepth;

out vec3 vWorld;
out float vElevation;

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
${water ? WATER_VERTEX_BODY : ""}
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
 * a hero area is a straight line at neither spacing. The gap it leaves is
 * covered by the hero tiles' own skirts, which drop 900 m against a rim that
 * the cutter measures and refuses to publish above 333 m.
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

const fragmentShader = (maxCuts: number, waterSamples: number): string => /* glsl */ `
precision highp float;
precision highp int;
precision highp usampler2DArray;

in vec3 vWorld;
in float vElevation;
${waterSamples > 0 ? WATER_FRAGMENT_INPUTS : ""}

uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uHazeColor;
uniform float uHazeDensity;
uniform float uHazeHeightFalloff;
uniform vec3 uCameraWorld;

out vec4 fragColor;

${COLOR_SPACE_GLSL}
${ELEVATION_RAMP_GLSL}
${AERIAL_HAZE_GLSL}
${GROUND_LIGHT_GLSL}
${cutUniforms(maxCuts)}
${waterSamples > 0 ? waterGlsl(waterSamples) : ""}

void main() {
${cutBody(maxCuts)}
  // Flat-shaded facet normal from the derivative of world position.
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;

  vec3 base = elevationColor(vElevation);

  // Steep ground reads as rock wherever it is.
  float slope = 1.0 - clamp(n.y, 0.0, 1.0);
  base = mix(base, srgbToLinear(vec3(0.40, 0.37, 0.35)), smoothstep(0.35, 0.75, slope));

  vec3 lit = base * groundLight(n, normalize(uSunDirection), uSunColor);
${waterSamples > 0 ? WATER_FRAGMENT_BODY : ""}

  // Analytic haze, integrated along the sight line. Cheap, art-directable per
  // region, and it is what makes the plateau horizon read as hard and clean
  // while the Sichuan Basin reads as milk.
  float fog = aerialFog(uCameraWorld, vWorld, uHazeDensity, uHazeHeightFalloff);
  fragColor = vec4(linearToSrgb(mix(lit, uHazeColor, fog)), 1.0);
}
`;

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
  sunDirection: Vector3;
  sunColor: Color;
  hazeColor: Color;
  hazeDensity: number;
  hazeHeightFalloff: number;
  /**
   * The water layer (F72): the array beside the heights, and what its bytes
   * mean. Absent compiles a shader with no water in it, which is the hero
   * lattice's until a hero area has a layer of its own.
   */
  water?: {
    texture: import("three").DataArrayTexture;
    samples: number;
    sampleM: number;
    offsetStepM: number;
    offsetZero: number;
    reachM: number;
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
      }
    : {};
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: vertexShader(water !== undefined),
    fragmentShader: fragmentShader(maxCuts, water?.samples ?? 0),
    uniforms: {
      ...cuts,
      ...waterUniforms,
      uHeights: { value: heights },
      uTileWorldSize: { value: values.tileWorldSize },
      uVerticalExaggeration: { value: values.verticalExaggeration },
      uSkirtDepth: { value: values.skirtDepth },
      uSunDirection: { value: values.sunDirection },
      uSunColor: { value: values.sunColor },
      uHazeColor: { value: values.hazeColor },
      uHazeDensity: { value: values.hazeDensity },
      uHazeHeightFalloff: { value: values.hazeHeightFalloff },
      uCameraWorld: { value: new Vector3() },
    },
  });
}

/**
 * Per-region atmosphere parameters (build plan D12). Nine of these, blended by
 * region weight. Three are enough to prove the technique in the spike.
 */
export interface RegionAtmosphere {
  name: string;
  hazeColor: Color;
  /**
   * Extinction per **real** metre of sight line. Convert with
   * `hazeDensityPerWorldUnit` at the point of upload; these numbers are a
   * claim about the air over a place and must not depend on how hard the
   * world happens to be compressed.
   */
  hazeDensity: number;
  sunColor: Color;
}

export const SPIKE_REGIONS: RegionAtmosphere[] = [
  {
    name: "Yangtze & East coast",
    hazeColor: new Color(0.78, 0.80, 0.82),
    hazeDensity: 3.5e-6,
    sunColor: new Color(1.0, 0.97, 0.92),
  },
  {
    name: "Sichuan Basin",
    hazeColor: new Color(0.86, 0.88, 0.86),
    hazeDensity: 7.0e-6,
    sunColor: new Color(0.96, 0.96, 0.94),
  },
  {
    name: "Qinghai-Tibet Plateau",
    hazeColor: new Color(0.55, 0.68, 0.86),
    hazeDensity: 8.5e-7,
    sunColor: new Color(1.0, 0.99, 0.96),
  },
];

export { Vector2 };
