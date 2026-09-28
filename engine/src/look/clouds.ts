/**
 * A cloud layer (design v2, "Clouds ... slabs and billboards, not a
 * simulation"): one horizontal quad at an altitude, following the camera,
 * whose cloud is read from a painted map (D95) and lit here by the scene's
 * own sun. Faded into the haze with distance so it joins the sky where the
 * ground does, and faded out where the camera is about to pass through it
 * so the plane never shows.
 *
 * The map is cloud seen from straight above, white where it is thick
 * (`content/clouds/`, cut by `nineskies.cloudmaps`): cumulus heaps, cirrus
 * streaks, a mackerel sky, the cloud sea's billows. It is read twice, once
 * as it is and once three and a half times finer for the frayed edges, and
 * a slow noise over the whole sky moves the threshold, so no two stretches
 * of a tiled map carry the same cloud. Value noise alone had been the
 * cloud before (stage 3): a field of soft grey fuzz, with nothing a viewer
 * takes for a cloud's shape (28 September 2026).
 *
 * Light, from below: the sky's light on a base that darkens as the cloud
 * thickens, the sun's through it by Beer's law, an edge facing the sun
 * lit more than one facing away (the map read again a step towards the
 * sun), and the forward glow of thin cloud towards the sun, the silver
 * lining. From above, the cloud sea: the map is the height of its billows,
 * lit as a surface the sun rakes, each billow's lee in the shade of the
 * one sunward of it.
 *
 * Mist - the low cloud that fills a valley - is not this; it is a term in
 * the terrain shader (`MIST_GLSL`), because it is air the ground is seen
 * through rather than a surface.
 */
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  GLSL3,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix3,
  Mesh,
  NoColorSpace,
  RepeatWrapping,
  ShaderMaterial,
  TextureLoader,
  Vector3,
  type Texture,
} from "three";
import { AERIAL_HAZE_GLSL, GROUND_LIGHT_GLSL } from "../terrain/palette.js";
import { NOISE_GLSL, SKY_GLSL, TIME_GLSL } from "./glsl.js";
import { lookUniformDefaults } from "./uniforms.js";
import type { CloudLayerPreset } from "./presets.js";
import { apparentExaggeration, toWorldH, toWorldV, type WorldScale } from "../sim/scale.js";

/** Half the quad's side, world units: past the camera's far plane. */
const HALF_EXTENT = 450_000;

/** Where the cloud maps are served from, beside the page as the cast's pictures are: `app/public/clouds/<map>.webp`. */
export const CLOUD_MAP_BASE = "clouds/";

/** The painted maps a layer may be drawn from (D95), one file each. */
export const CLOUD_MAPS = ["cumulus", "cirrus", "sea", "alto"] as const;
export type CloudMap = (typeof CLOUD_MAPS)[number];

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

uniform sampler2D uMap;
uniform float uMapReady;
uniform vec3 uCameraWorld;
uniform vec3 uSunColor;
uniform float uHazeDensity;
uniform float uHazeHeightFalloff;
uniform float uCoverage;
uniform float uDensity;
uniform float uAbsorb;
uniform float uScale;
uniform mat3 uToMap;
uniform float uThickness;
uniform float uBillow;
uniform float uVeil;

${AERIAL_HAZE_GLSL}
${GROUND_LIGHT_GLSL}
${SKY_GLSL}
${NOISE_GLSL}
${TIME_GLSL}

// World xz to the map's own coordinates: scaled, stretched along the
// grain, turned to its bearing, and drifting on the wind.
vec2 toMap(vec2 xz) {
  return (uToMap * vec3(xz / uScale, 1.0)).xy + vec2(uTime * 0.0006, uTime * 0.0002);
}

// The map's raw thickness at a point, 0 clear to 1 thickest, with a finer
// read of itself fraying the edges.
float thicknessAt(vec2 q) {
  float base = texture(uMap, q).r;
  float fine = texture(uMap, q * 3.7 + vec2(0.31, 0.67)).r;
  return base * (0.72 + 0.4 * fine);
}

// Where the cloud is, 0 to 1: the thickness past a threshold the coverage
// sets and a slow noise moves, so the sky has fuller and emptier reaches.
float cloudAt(vec2 q, float edge) {
  return smoothstep(edge, edge + 0.32, thicknessAt(q));
}

float henyeyGreenstein(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * 3.14159265 * pow(1.0 + g2 - 2.0 * g * c, 1.5));
}

void main() {
  if (uMapReady < 0.5) discard;
  vec2 q = toMap(vWorld.xz);
  float macro = vnoise(vWorld.xz / (uScale * 2.7) + 11.0);
  float edge = mix(0.62, 0.0, uCoverage) + (0.5 - macro) * 0.22;
  float raw = thicknessAt(q);
  float cover = smoothstep(edge, edge + 0.32, raw);
  // A deck's thin places are thin cloud, not holes: the veil is what of it
  // the ground below is seen through.
  float alpha = max(cover, uVeil * (0.55 + 0.45 * raw)) * uDensity;
  if (alpha <= 0.003) discard;

  // Fade before the camera reaches the plane, and where the map is finer
  // than a pixel can hold, which is the far edge at a grazing angle.
  alpha *= smoothstep(0.0, uThickness, abs(uCameraWorld.y - vWorld.y));
  vec2 dq = fwidth(q);
  alpha *= 1.0 - smoothstep(0.02, 0.2, max(dq.x, dq.y));

  vec3 toFrag = vWorld - uCameraWorld;
  float dist = length(toFrag);
  vec3 dir = toFrag / max(dist, 1e-3);
  vec3 sun = normalize(uSunDirection);
  float sunUp = max(sun.y, 0.0);

  // A step towards the sun, in the map: what lies between this cloud and it.
  vec2 sunQ = toMap(vWorld.xz + normalize(sun.xz + vec2(1e-5)) * uScale * 0.012) - q;
  float sunward = thicknessAt(q + sunQ);

  vec3 lit;
  if (uCameraWorld.y > vWorld.y) {
    // From above: the map is the height of the billows, and the sun rakes it.
    float e = max(1.5 / 1024.0, max(dq.x, dq.y));
    vec2 ex = toMap(vWorld.xz + vec2(uScale * e, 0.0)) - q;
    vec2 ez = toMap(vWorld.xz + vec2(0.0, uScale * e)) - q;
    float gx = (thicknessAt(q + ex) - thicknessAt(q - ex)) / (2.0 * e);
    float gz = (thicknessAt(q + ez) - thicknessAt(q - ez)) / (2.0 * e);
    // Far off, a cloud sea's billows are under a pixel and its surface
    // reads smooth: the relief and its shade go with distance, or the
    // horizon is a field of blue flecks.
    float far = smoothstep(0.4 * uScale, 3.0 * uScale, dist);
    vec3 n = normalize(vec3(-gx * uBillow * (1.0 - far), 1.0, -gz * uBillow * (1.0 - far)));
    // Cloud is lit through as well as on, so the light wraps far round a
    // billow and its lee is paled, not black: shade on a cloud sea is the
    // sky's lavender, never a hole.
    float wrap = clamp((dot(n, sun) + 0.65) / 1.65, 0.0, 1.0);
    float lee = 1.0 - 0.3 * (1.0 - far) * smoothstep(0.0, 0.25, sunward - raw);
    vec3 skyLight = uAmbientZenith * mix(0.95, 1.2, n.y) * mix(0.85, 1.05, raw);
    lit = 0.95 * (uSunColor * wrap * lee * mix(0.8, 1.0, raw) + skyLight);
  } else {
    // From below: sky light on a base that darkens as it thickens, the sun
    // through it, brighter where the sunward side is thinner, and the thin
    // edges towards the sun aglow.
    float thick = cover * mix(0.35, 1.0, raw);
    float through = exp(-uAbsorb * thick);
    vec3 base = uAmbientZenith * mix(1.35, 0.72, thick);
    vec3 sunLit = uSunColor * (0.18 + 0.82 * sunUp) * mix(0.3, 1.0, through);
    float side = smoothstep(-0.25, 0.25, raw - sunward);
    float c = dot(dir, sun);
    float lining = henyeyGreenstein(c, 0.65) * 1.6 * (1.0 - thick);
    lit = base + sunLit * (0.55 + 0.45 * side) + uSunColor * lining;
  }

  float fog = aerialFog(uCameraWorld, vWorld, uHazeDensity, uHazeHeightFalloff);
  fragColor = vec4(mix(lit, skyHorizonAt(dir), fog), alpha);
}
`;

/** The maps, loaded once and shared by every layer that draws from them. */
const maps = new Map<CloudMap, { texture: Texture | null; waiting: ((t: Texture) => void)[] }>();

function loadMap(name: CloudMap, anisotropy: number, ready: (t: Texture) => void): void {
  const known = maps.get(name);
  if (known?.texture) return ready(known.texture);
  if (known) {
    known.waiting.push(ready);
    return;
  }
  const entry = { texture: null as Texture | null, waiting: [ready] };
  maps.set(name, entry);
  void new TextureLoader().loadAsync(`${CLOUD_MAP_BASE}${name}.webp`).then(
    (t) => {
      t.wrapS = RepeatWrapping;
      t.wrapT = RepeatWrapping;
      t.colorSpace = NoColorSpace;
      t.minFilter = LinearMipmapLinearFilter;
      t.magFilter = LinearFilter;
      t.anisotropy = anisotropy;
      t.generateMipmaps = true;
      t.needsUpdate = true;
      entry.texture = t;
      for (const w of entry.waiting.splice(0)) w(t);
    },
    () => {
      // A missing map is a sky without that layer, not a broken film.
      maps.delete(name);
    },
  );
}

export class CloudLayer {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  private preset: CloudLayerPreset | null = null;

  constructor(private readonly anisotropy = 8) {
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
        uMap: { value: null },
        uMapReady: { value: 0 },
        uCentre: { value: new Vector3() },
        uHalfExtent: { value: HALF_EXTENT },
        uCameraWorld: { value: new Vector3() },
        uHazeDensity: { value: 0 },
        uHazeHeightFalloff: { value: 0 },
        uCoverage: { value: 0 },
        uDensity: { value: 0 },
        uAbsorb: { value: 2 },
        uScale: { value: 1 },
        uToMap: { value: new Matrix3() },
        uThickness: { value: 1 },
        uBillow: { value: 0.12 },
        uVeil: { value: 0 },
      },
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
  }

  /** What this layer is in the scene, or nothing. */
  set(preset: CloudLayerPreset | null, scale: WorldScale): void {
    this.mesh.visible = preset !== null;
    if (!preset) {
      this.preset = null;
      return;
    }
    const u = this.material.uniforms;
    const before = this.preset?.map;
    // Set first: a map already loaded answers at once, and must find this preset.
    this.preset = preset;
    if (preset.map !== before) {
      u.uMapReady!.value = 0;
      const wanted = preset.map;
      loadMap(wanted, this.anisotropy, (t) => {
        if (this.preset?.map !== wanted) return;
        u.uMap!.value = t;
        u.uMapReady!.value = 1;
      });
    }
    (u.uCentre!.value as Vector3).y = toWorldV(preset.altitudeM, scale);
    u.uCoverage!.value = preset.coverage;
    u.uDensity!.value = preset.density;
    u.uAbsorb!.value = preset.absorb ?? 2;
    u.uBillow!.value = preset.billow ?? 0.12;
    u.uVeil!.value = preset.veil ?? 0;
    // The layer's height over the camera is drawn at the scene's
    // exaggeration, so its map is spread by the same: a heap keeps the
    // proportion of its size to its height that the eye judges it by, and
    // does not shrink to popcorn six times as high (28 September 2026).
    u.uScale!.value = toWorldH(preset.scaleKm * 1000, scale) * apparentExaggeration(scale);
    // The map's axes: turned to the grain's bearing, then squeezed across it.
    const b = ((preset.bearingDeg ?? 0) * Math.PI) / 180;
    const c = Math.cos(b);
    const s = Math.sin(b);
    const k = 1 / preset.stretch;
    (u.uToMap!.value as Matrix3).set(k * c, k * s, 0, -s, c, 0, 0, 0, 1);
    u.uThickness!.value = toWorldV(250, scale);
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
    // Of two layers, the one nearer the camera's height is drawn last, over the other.
    this.mesh.renderOrder = 1 + 1 / (1 + Math.abs(eye.y - c.y));
  }
}
