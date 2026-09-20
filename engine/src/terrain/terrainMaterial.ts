import { Color, ShaderMaterial, GLSL3, Vector2, Vector3 } from "three";
import {
  AERIAL_HAZE_GLSL,
  COLOR_SPACE_GLSL,
  ELEVATION_RAMP_GLSL,
  GROUND_LIGHT_GLSL,
} from "./palette.js";

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

const VERTEX = /* glsl */ `
precision highp float;
precision highp int;
precision highp isampler2DArray;

in vec2 aTexel;
in float aSkirt;
in vec2 iOrigin;
in float iLayer;

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
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;

in vec3 vWorld;
in float vElevation;

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

void main() {
  // Flat-shaded facet normal from the derivative of world position.
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;

  vec3 base = elevationColor(vElevation);

  // Steep ground reads as rock wherever it is.
  float slope = 1.0 - clamp(n.y, 0.0, 1.0);
  base = mix(base, srgbToLinear(vec3(0.40, 0.37, 0.35)), smoothstep(0.35, 0.75, slope));

  vec3 lit = base * groundLight(n, normalize(uSunDirection), uSunColor);

  // Analytic haze, integrated along the sight line. Cheap, art-directable per
  // region, and it is what makes the plateau horizon read as hard and clean
  // while the Sichuan Basin reads as milk.
  float fog = aerialFog(uCameraWorld, vWorld, uHazeDensity, uHazeHeightFalloff);
  fragColor = vec4(linearToSrgb(mix(lit, uHazeColor, fog)), 1.0);
}
`;

export interface TerrainUniformValues {
  tileWorldSize: number;
  verticalExaggeration: number;
  skirtDepth: number;
  sunDirection: Vector3;
  sunColor: Color;
  hazeColor: Color;
  hazeDensity: number;
  hazeHeightFalloff: number;
}

export function createTerrainMaterial(
  heights: import("three").DataArrayTexture,
  values: TerrainUniformValues,
): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
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
  hazeDensity: number;
  sunColor: Color;
}

export const SPIKE_REGIONS: RegionAtmosphere[] = [
  {
    name: "Yangtze & East coast",
    hazeColor: new Color(0.78, 0.80, 0.82),
    hazeDensity: 2.8e-5,
    sunColor: new Color(1.0, 0.97, 0.92),
  },
  {
    name: "Sichuan Basin",
    hazeColor: new Color(0.86, 0.88, 0.86),
    hazeDensity: 5.6e-5,
    sunColor: new Color(0.96, 0.96, 0.94),
  },
  {
    name: "Qinghai-Tibet Plateau",
    hazeColor: new Color(0.55, 0.68, 0.86),
    hazeDensity: 6.8e-6,
    sunColor: new Color(1.0, 0.99, 0.96),
  },
];

export { Vector2 };
