import {
  BufferAttribute,
  BufferGeometry,
  Color,
  GLSL3,
  Mesh,
  ShaderMaterial,
  Vector3,
} from "three";
import {
  AERIAL_HAZE_GLSL,
  COLOR_SPACE_GLSL,
  ELEVATION_RAMP_GLSL,
  GROUND_LIGHT_GLSL,
  RIDGE_SHADE,
} from "./palette.js";
import type { HorizonProfile } from "./horizon.js";
import type { WorldScale } from "../sim/scale.js";

/**
 * The horizon impostor's geometry and shader (build plan D15).
 *
 * A ridge line per shell, each a closed band hanging from its silhouette. The
 * bands are written into one geometry with the far shell's indices first, and
 * the whole thing draws with the depth buffer switched off before the terrain
 * does - so it is one draw call, nearer ranges cover farther ones, and the
 * streamed terrain paints over all of it. No hole-punching, no depth fight,
 * and nothing is paid for ground the haze was going to eat anyway.
 *
 * Vertices sit at the true world position of the ridge they came from, not on
 * a fixed cylinder, so flying towards the plateau closes on it properly. The
 * mesh is anchored where the march happened rather than at the aircraft,
 * which is what keeps a refresh from sliding the whole skyline sideways.
 */

/** How far each band hangs below its ridge, as a tangent. ~14 degrees. */
const BASE_DROP_TAN = 0.25;

/** Extra haze at the foot of a band. Distant ranges pale towards their base. */
const BASE_HAZE = 0.38;

const VERTEX = /* glsl */ `
precision highp float;

in float aRidgeM;
in float aBase;

uniform vec3 uCameraWorld;
uniform vec3 uAnchorWorld;
uniform float uHazeDensity;
uniform float uHazeHeightFalloff;
uniform float uBaseHaze;

out vec3 vColor;
out float vFog;

${COLOR_SPACE_GLSL}
${ELEVATION_RAMP_GLSL}
${AERIAL_HAZE_GLSL}

void main() {
  vec3 world = uAnchorWorld + position;
  vColor = elevationColor(aRidgeM);

  // Same analytic haze as the terrain, evaluated per vertex: at this distance
  // a band is a handful of pixels tall and nothing inside it needs per-pixel
  // anything. The height term is what pales the foot of a range - the sight
  // line to a ridge climbs out of the thick air, the one to its base does not.
  float fog = aerialFog(uCameraWorld, world, uHazeDensity, uHazeHeightFalloff);
  vFog = clamp(fog + aBase * uBaseHaze, 0.0, 1.0);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;

in vec3 vColor;
in float vFog;

uniform vec3 uHazeColor;
uniform vec3 uSunColor;
uniform vec3 uSunDirection;
uniform float uRidgeShade;

out vec4 fragColor;

${COLOR_SPACE_GLSL}
${GROUND_LIGHT_GLSL}

void main() {
  // The response of flat sunlit ground, darkened for the mix of faces a range
  // presents. Shading it by a made-up normal is how distant mountains start
  // looking like painted scenery.
  vec3 lit = vColor * groundLight(vec3(0.0, 1.0, 0.0), normalize(uSunDirection), uSunColor);
  fragColor = vec4(linearToSrgb(mix(lit * uRidgeShade, uHazeColor, vFog)), 1.0);
}
`;

export interface HorizonRingUniforms {
  hazeColor: Color;
  sunColor: Color;
  sunDirection: Vector3;
  hazeDensity: number;
  hazeHeightFalloff: number;
}

export class HorizonRing {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  private readonly geometry: BufferGeometry;
  private readonly positions: Float32Array;

  constructor(
    private readonly profile: HorizonProfile,
    values: HorizonRingUniforms,
  ) {
    const az = profile.azimuths;
    const shells = profile.shells.length;
    const vertices = az * 2 * shells;

    this.positions = new Float32Array(vertices * 3);
    const ridgeM = new Float32Array(vertices);
    const base = new Float32Array(vertices);
    for (let v = 0; v < vertices; v++) base[v] = v % 2; // odd vertex = foot

    // Far shell first. With the depth buffer off, submission order is the
    // only thing deciding what covers what, and that is exactly what we want.
    const index = new Uint32Array(az * 6 * shells);
    let w = 0;
    for (let s = shells - 1; s >= 0; s--) {
      const off = s * az * 2;
      for (let i = 0; i < az; i++) {
        const a = off + i * 2;
        const b = off + ((i + 1) % az) * 2;
        // Wound to face the axis. The player is inside this cylinder, so the
        // obvious winding points every triangle away and culls the lot.
        index[w++] = a;
        index[w++] = b;
        index[w++] = a + 1;
        index[w++] = b;
        index[w++] = b + 1;
        index[w++] = a + 1;
      }
    }

    this.geometry = new BufferGeometry();
    this.geometry.setAttribute("position", new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("aRidgeM", new BufferAttribute(ridgeM, 1));
    this.geometry.setAttribute("aBase", new BufferAttribute(base, 1));
    this.geometry.setIndex(new BufferAttribute(index, 1));

    this.material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uCameraWorld: { value: new Vector3() },
        uAnchorWorld: { value: new Vector3() },
        uHazeColor: { value: values.hazeColor },
        uSunColor: { value: values.sunColor },
        uSunDirection: { value: values.sunDirection },
        uRidgeShade: { value: RIDGE_SHADE },
        uHazeDensity: { value: values.hazeDensity },
        uHazeHeightFalloff: { value: values.hazeHeightFalloff },
        uBaseHaze: { value: BASE_HAZE },
      },
    });

    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    // Before the terrain, so the terrain paints over it.
    this.mesh.renderOrder = -1;
  }

  get triangleCount(): number {
    return this.profile.azimuths * 2 * this.profile.shells.length;
  }

  /**
   * Rewrite the vertex positions from the current profile. Called after a
   * march, and after a compression change - the profile itself is stored in
   * real kilometres and metres, so a scale change never needs a re-march.
   */
  rebuild(scale: WorldScale): void {
    const az = this.profile.azimuths;
    const shells = this.profile.shells.length;
    const c = scale.horizontalCompression;
    const vex = scale.verticalExaggeration;
    const eyeY = this.profile.altitudeM * vex;
    const ridgeAttr = this.geometry.getAttribute("aRidgeM") as BufferAttribute;
    const ridgeM = ridgeAttr.array as Float32Array;

    for (let s = 0; s < shells; s++) {
      for (let i = 0; i < az; i++) {
        const theta = (i / az) * Math.PI * 2;
        const idx = s * az + i;
        const distWorld = this.profile.ridgeDistM[idx]! / c;
        const y = this.profile.ridgeM[idx]! * vex - eyeY;
        const x = Math.sin(theta) * distWorld;
        const z = Math.cos(theta) * distWorld;

        const v = (s * az + i) * 2;
        this.positions[v * 3] = x;
        this.positions[v * 3 + 1] = y;
        this.positions[v * 3 + 2] = z;
        this.positions[v * 3 + 3] = x;
        this.positions[v * 3 + 4] = y - distWorld * BASE_DROP_TAN;
        this.positions[v * 3 + 5] = z;

        ridgeM[v] = this.profile.ridgeM[idx]!;
        ridgeM[v + 1] = this.profile.ridgeM[idx]!;
      }
    }

    (this.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
    ridgeAttr.needsUpdate = true;
  }

  /**
   * Per frame. `anchorWorld` is where the march happened, in world units, so
   * the caller applies the same rebase the terrain uses.
   */
  update(anchorWorld: Vector3, cameraWorld: Vector3): void {
    (this.material.uniforms.uAnchorWorld!.value as Vector3).copy(anchorWorld);
    (this.material.uniforms.uCameraWorld!.value as Vector3).copy(cameraWorld);
  }
}
