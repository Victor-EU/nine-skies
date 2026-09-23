/**
 * The sky (design v2, "A sky per scene"): its colours from the sun and the
 * scene's preset, and the dome that draws them.
 *
 * The dome is one triangle over the whole screen, drawn first with the depth
 * test off, whose fragment shader asks `skyAt` for the colour along each
 * pixel's ray. The terrain and the horizon impostor ask `skyHorizonAt` for
 * the colour they fade into, from the same uniforms, so where the ground
 * runs out and the sky begins is not a seam but the same number.
 *
 * The colours are a model and not a measurement: day and night endpoints
 * for the zenith and the horizon, blended by how far up the sun is, the
 * horizon warmed by the sun's own transmitted colour when it is low, the
 * zenith deepened by the preset and by altitude. Enough for nine skies; the
 * reference still is where the endpoints are argued.
 */
import { BufferAttribute, BufferGeometry, GLSL3, Matrix4, Mesh, ShaderMaterial, type PerspectiveCamera } from "three";
import { SKY_GLSL } from "./glsl.js";
import { lookUniformDefaults } from "./uniforms.js";
import type { SkyPreset } from "./presets.js";
import { sunTransmittance, type SunState } from "./sun.js";
import { add, clamp01, luminance, mix, mul, smoothstep, srgbToLinear, type Rgb } from "./colour.js";

export interface SkyState {
  readonly horizon: Rgb;
  readonly zenith: Rgb;
  readonly glow: Rgb;
  readonly glowPower: number;
  readonly disc: Rgb;
  readonly discCos: number;
  readonly sunColor: Rgb;
  readonly ambientZenith: Rgb;
  readonly ambientGround: Rgb;
}

const DAY_ZENITH = srgbToLinear([0.3, 0.5, 0.88]);
const DEEP_ZENITH = srgbToLinear([0.14, 0.32, 0.72]);
const NIGHT_ZENITH = srgbToLinear([0.08, 0.1, 0.22]);
const DAY_HORIZON = srgbToLinear([0.8, 0.86, 0.92]);
const NIGHT_HORIZON = srgbToLinear([0.3, 0.26, 0.34]);
/** Real: 0.27 degrees. Drawn a little larger, for the picture and the bloom. */
export const SUN_DISC_RADIUS_DEG = 0.7;
/** How much brighter than white the disc is, before the bloom. */
export const SUN_DISC_INTENSITY = 25;

/** The same brightness with no hue. */
function grey(c: Rgb): Rgb {
  const l = luminance(c);
  return [l, l, l];
}

export function skyState(sun: SunState, preset: SkyPreset, altitudeM: number): SkyState {
  const day = sun.daylight;
  // The thin air over the plateau deepens the zenith: a cue for height (F36).
  const thin = 1 - Math.exp(-Math.max(altitudeM, 0) / 7000);
  const zenith = mix(NIGHT_ZENITH, mix(DAY_ZENITH, DEEP_ZENITH, clamp01(0.5 * preset.zenithDepth + 0.6 * thin)), day);

  const tint = srgbToLinear(preset.hazeTint);
  const warm = mix([1, 1, 1], sun.tint, 0.5 * sun.lowness);
  const horizon = mul(mul(mix(NIGHT_HORIZON, DAY_HORIZON, day), tint), warm);

  // The glow outlives the disc: the afterglow is the transmitted colour at
  // the horizon, fading through civil twilight.
  const afterglow = smoothstep(-8, 2, sun.elevationDeg);
  const glowLight = mul(sunTransmittance(Math.max(sun.elevationDeg, 0), preset.turbidity), afterglow);
  const glow = mul(glowLight, preset.glow * (0.5 + 0.9 * sun.lowness));

  return {
    horizon,
    zenith,
    glow,
    glowPower: preset.glowPower,
    disc: mul(sun.light, SUN_DISC_INTENSITY),
    discCos: Math.cos((SUN_DISC_RADIUS_DEG * Math.PI) / 180),
    sunColor: sun.light,
    // The sky's light on the ground: between the zenith and the horizon,
    // pulled a third of the way to grey so the shade side is cool, not blue.
    ambientZenith: mul(mix(mix(zenith, horizon, 0.7), grey(mix(zenith, horizon, 0.7)), 0.35), 0.7),
    ambientGround: add(mul(horizon, 0.22), mul(sun.light, 0.08)),
  };
}

const VERTEX = /* glsl */ `
precision highp float;

uniform mat4 uInvProjection;
uniform mat4 uCameraToWorld;

out vec3 vDir;

void main() {
  // A point on the far plane in view space, rotated into the world. Left
  // unnormalised so it interpolates as a ray should; normalised per pixel.
  vec4 far = uInvProjection * vec4(position.xy, 1.0, 1.0);
  vDir = (uCameraToWorld * vec4(far.xyz / far.w, 0.0)).xyz;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;

in vec3 vDir;
out vec4 fragColor;

${SKY_GLSL}

void main() {
  fragColor = vec4(skyAt(normalize(vDir)), 1.0);
}
`;

export class SkyDome {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;

  constructor() {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        ...lookUniformDefaults(),
        uInvProjection: { value: new Matrix4() },
        uCameraToWorld: { value: new Matrix4() },
      },
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    // Before everything: the horizon ring at -1 and the terrain paint over it.
    this.mesh.renderOrder = -2;
  }

  update(camera: PerspectiveCamera): void {
    camera.updateMatrixWorld();
    (this.material.uniforms.uInvProjection!.value as Matrix4).copy(camera.projectionMatrixInverse);
    (this.material.uniforms.uCameraToWorld!.value as Matrix4).copy(camera.matrixWorld);
  }
}
