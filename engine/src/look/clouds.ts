/**
 * A cloud layer (design v2, "Clouds ... slabs and billboards, not a
 * simulation"): one horizontal quad at an altitude, following the camera,
 * with five octaves of value noise deciding where the cloud is. Lit from
 * above by the sun and from below by the sky, faded into the haze with
 * distance so it joins the sky where the ground does, and faded out where
 * the camera is about to pass through it so the plane never shows.
 *
 * Mist - the low cloud that fills a valley - is not this; it is a term in
 * the terrain shader (`MIST_GLSL`), because it is air the ground is seen
 * through rather than a surface.
 */
import { BufferAttribute, BufferGeometry, DoubleSide, GLSL3, Mesh, ShaderMaterial, Vector2, Vector3 } from "three";
import { AERIAL_HAZE_GLSL, GROUND_LIGHT_GLSL } from "../terrain/palette.js";
import { NOISE_GLSL, SKY_GLSL, TIME_GLSL } from "./glsl.js";
import { lookUniformDefaults } from "./uniforms.js";
import type { CloudDeckPreset } from "./presets.js";
import { toWorldH, toWorldV, type WorldScale } from "../sim/scale.js";

/** Half the quad's side, world units: past the camera's far plane. */
const HALF_EXTENT = 450_000;

const VERTEX = /* glsl */ `
precision highp float;

uniform vec3 uCentre;
uniform float uHalfExtent;

out vec3 vWorld;

void main() {
  vWorld = vec3(uCentre.x + position.x * uHalfExtent, uCentre.y, uCentre.z + position.z * uHalfExtent);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vWorld, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;

in vec3 vWorld;
out vec4 fragColor;

uniform vec3 uCameraWorld;
uniform vec3 uSunColor;
uniform float uHazeDensity;
uniform float uHazeHeightFalloff;
uniform float uCoverage;
uniform float uDensity;
uniform float uScale;
uniform vec2 uStretch;
uniform float uThickness;

${AERIAL_HAZE_GLSL}
${GROUND_LIGHT_GLSL}
${SKY_GLSL}
${NOISE_GLSL}
${TIME_GLSL}

void main() {
  vec2 p = vWorld.xz * uStretch / uScale + vec2(uTime * 0.004, 0.0);
  float n = fbm(p);
  float edge = 1.0 - uCoverage;
  float cover = smoothstep(edge - 0.12, edge + 0.18, n);
  float alpha = cover * uDensity;
  if (alpha <= 0.002) discard;

  // Fade before the camera reaches the plane, and where the noise is under
  // a pixel, which is the far edge at a grazing angle.
  alpha *= smoothstep(0.0, uThickness, abs(uCameraWorld.y - vWorld.y));
  alpha *= 1.0 - smoothstep(0.3, 1.0, fwidth(n) * 6.0);

  vec3 toFrag = vWorld - uCameraWorld;
  float dist = length(toFrag);
  vec3 dir = toFrag / max(dist, 1e-3);
  float above = uCameraWorld.y > vWorld.y ? 1.0 : 0.0;

  // The top is sunlit with the billows brighter; the underside is the sky's
  // light with the thick parts darker.
  float thick = smoothstep(edge, 1.0, n);
  vec3 sun = normalize(uSunDirection);
  vec3 top = groundLight(vec3(0.0, 1.0, 0.0), sun, uSunColor, 1.0) * mix(0.85, 1.1, thick);
  vec3 under = (uAmbientZenith * 1.3 + uSunColor * 0.35 * max(sun.y, 0.0)) * mix(1.0, 0.7, thick);
  vec3 lit = mix(under, top, above) + sunGlow(dir) * 0.5 * (1.0 - thick);

  float fog = aerialFog(uCameraWorld, vWorld, uHazeDensity, uHazeHeightFalloff);
  fragColor = vec4(mix(lit, skyHorizonAt(dir), fog), alpha);
}
`;

export class CloudLayer {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;

  constructor() {
    const geometry = new BufferGeometry();
    // xz in -1..1; the vertex shader scales and places it.
    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, -1, 1, 0, 1, -1, 0, 1]), 3),
    );
    this.material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: {
        ...lookUniformDefaults(),
        uCentre: { value: new Vector3() },
        uHalfExtent: { value: HALF_EXTENT },
        uCameraWorld: { value: new Vector3() },
        uHazeDensity: { value: 0 },
        uHazeHeightFalloff: { value: 0 },
        uCoverage: { value: 0 },
        uDensity: { value: 0 },
        uScale: { value: 1 },
        uStretch: { value: new Vector2(1, 1) },
        uThickness: { value: 1 },
      },
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
  }

  /** What this layer is in the scene, or nothing. */
  set(preset: CloudDeckPreset | null, scale: WorldScale): void {
    this.mesh.visible = preset !== null;
    if (!preset) return;
    const u = this.material.uniforms;
    (u.uCentre!.value as Vector3).y = toWorldV(preset.altitudeM, scale);
    u.uCoverage!.value = preset.coverage;
    u.uDensity!.value = preset.density;
    u.uScale!.value = toWorldH(preset.scaleKm * 1000, scale);
    (u.uStretch!.value as Vector2).set(1 / preset.stretch, 1);
    u.uThickness!.value = toWorldV(400, scale);
  }

  /** Per frame: follow the camera, and the air it is seen through. */
  update(eye: Vector3, hazeDensity: number, hazeHeightFalloff: number): void {
    const u = this.material.uniforms;
    const c = u.uCentre!.value as Vector3;
    c.x = eye.x;
    c.z = eye.z;
    (u.uCameraWorld!.value as Vector3).copy(eye);
    u.uHazeDensity!.value = hazeDensity;
    u.uHazeHeightFalloff!.value = hazeHeightFalloff;
  }
}
