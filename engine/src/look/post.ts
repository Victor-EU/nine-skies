/**
 * The grade (design v2, "A grade"): the scene drawn in linear light into a
 * half-float target, a bloom pulled from what is brighter than white - the
 * sun's disc, its glint on water - and one composite that exposes, warms or
 * cools, saturates, tone-maps, vignettes and writes sRGB. Cheap, and most of
 * the difference between a render and a picture.
 *
 * Edges are smoothed in the composite by FXAA rather than by multisampling
 * the scene target: four samples of half-float at 1080p were two of the
 * three milliseconds this pass cost, and FXAA is a fraction of one (F83).
 * Multisampling is still there for a machine that can afford it.
 *
 * Every target follows the drawing buffer's size, checked each frame, so a
 * capture that resizes the renderer is measured at the size it asked for.
 * The scene may be drawn smaller than the canvas (`renderScale`) and is then
 * stretched by the composite: the lever a slow phone pulls.
 */
import {
  BufferAttribute,
  BufferGeometry,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from "three";
import { COLOR_SPACE_GLSL } from "../terrain/palette.js";
import type { GradePreset } from "./presets.js";

const QUAD_VERTEX = /* glsl */ `
precision highp float;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** One triangle over the screen, drawn with whatever material a pass needs. */
class FullScreenQuad {
  private readonly mesh: Mesh;
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor() {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.mesh = new Mesh(geometry);
    this.mesh.frustumCulled = false;
  }

  set material(m: ShaderMaterial) {
    this.mesh.material = m;
  }

  render(renderer: WebGLRenderer): void {
    renderer.render(this.mesh, this.camera);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}

const BRIGHT_FRAGMENT = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D tScene;
uniform float uThreshold;
void main() {
  vec3 c = texture(tScene, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  fragColor = vec4(c * smoothstep(uThreshold, uThreshold + 1.0, l), 1.0);
}
`;

const BLUR_FRAGMENT = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D tInput;
uniform vec2 uStep;
const float W[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
void main() {
  vec3 c = texture(tInput, vUv).rgb * W[0];
  for (int i = 1; i < 5; i++) {
    vec2 o = uStep * float(i);
    c += texture(tInput, vUv + o).rgb * W[i];
    c += texture(tInput, vUv - o).rgb * W[i];
  }
  fragColor = vec4(c, 1.0);
}
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uExposure;
uniform float uBloom;
uniform vec3 uBalance;
uniform float uSaturation;
uniform float uContrast;
uniform float uVignette;
uniform vec2 uTexel;
uniform float uFxaa;

${COLOR_SPACE_GLSL}

// FXAA (Lottes' algorithm in its compact form): find the edge's direction
// from the luma of the four diagonal neighbours and blend along it. The
// scene is linear HDR, so luma is compressed first or every bright edge
// would read as the strongest one on screen.
float edgeLuma(vec3 c) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return l / (1.0 + l);
}

vec3 antialiased(vec2 uv) {
  vec3 m = texture(tScene, uv).rgb;
  if (uFxaa < 0.5) return m;
  float lNW = edgeLuma(texture(tScene, uv + vec2(-1.0, -1.0) * uTexel).rgb);
  float lNE = edgeLuma(texture(tScene, uv + vec2(1.0, -1.0) * uTexel).rgb);
  float lSW = edgeLuma(texture(tScene, uv + vec2(-1.0, 1.0) * uTexel).rgb);
  float lSE = edgeLuma(texture(tScene, uv + vec2(1.0, 1.0) * uTexel).rgb);
  float lM = edgeLuma(m);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  // Flat enough to leave alone: most of the frame, and the cheap path.
  if (lMax - lMin < max(0.0312, lMax * 0.125)) return m;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  float scale = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
  dir = clamp(dir * scale, vec2(-8.0), vec2(8.0)) * uTexel;
  vec3 a = 0.5 * (texture(tScene, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture(tScene, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture(tScene, uv - dir * 0.5).rgb + texture(tScene, uv + dir * 0.5).rgb);
  float lB = edgeLuma(b);
  return (lB < lMin || lB > lMax) ? a : b;
}

// A filmic curve (Narkowicz's fit of ACES): highlights roll off, colour holds.
vec3 filmic(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec3 c = antialiased(vUv) + texture(tBloom, vUv).rgb * uBloom;
  c *= uExposure * uBalance;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  c = pow(max(c, 0.0) / 0.18, vec3(uContrast)) * 0.18;
  c = filmic(c);
  float r = length((vUv - 0.5) * 2.0);
  c *= 1.0 - uVignette * smoothstep(0.45, 1.35, r);
  fragColor = vec4(linearToSrgb(c), 1.0);
}
`;

/** Luminance above which light blooms: brighter than white. */
export const BLOOM_THRESHOLD = 1.0;
/** Blur passes at quarter size; each widens the glow. */
const BLUR_ITERATIONS = 2;

export interface PostOptions {
  /** Multisamples on the scene target; 0, the default, smooths edges with FXAA instead. */
  readonly samples?: number;
  /** The scene target's size as a fraction of the drawing buffer's, 0.25 to 1. */
  readonly renderScale?: number;
}

export class PostPipeline {
  readonly scene: WebGLRenderTarget;
  private readonly bright: WebGLRenderTarget;
  private readonly blurA: WebGLRenderTarget;
  private readonly blurB: WebGLRenderTarget;
  private readonly quad = new FullScreenQuad();
  private readonly brightMaterial: ShaderMaterial;
  private readonly blurMaterial: ShaderMaterial;
  private readonly compositeMaterial: ShaderMaterial;
  private width = 0;
  private height = 0;
  private scale = 1;
  private readonly maxSamples: number;

  constructor(renderer: WebGLRenderer, options: PostOptions = {}) {
    this.maxSamples = renderer.capabilities.maxSamples;
    const samples = Math.max(0, Math.min(options.samples ?? 0, this.maxSamples));
    const make = (w: number, h: number, msaa: number, depth: boolean) =>
      new WebGLRenderTarget(w, h, {
        type: HalfFloatType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        generateMipmaps: false,
        depthBuffer: depth,
        stencilBuffer: false,
        samples: msaa,
      });
    this.scene = make(2, 2, samples, true);
    this.bright = make(1, 1, 0, false);
    this.blurA = make(1, 1, 0, false);
    this.blurB = make(1, 1, 0, false);
    this.renderScale = options.renderScale ?? 1;
    const material = (fragment: string, uniforms: Record<string, { value: unknown }>) =>
      new ShaderMaterial({ glslVersion: GLSL3, vertexShader: QUAD_VERTEX, fragmentShader: fragment, uniforms, depthTest: false, depthWrite: false });
    this.brightMaterial = material(BRIGHT_FRAGMENT, { tScene: { value: null }, uThreshold: { value: BLOOM_THRESHOLD } });
    this.blurMaterial = material(BLUR_FRAGMENT, { tInput: { value: null }, uStep: { value: new Vector2() } });
    this.compositeMaterial = material(COMPOSITE_FRAGMENT, {
      tScene: { value: null },
      tBloom: { value: null },
      uExposure: { value: 1 },
      uBloom: { value: 0.3 },
      uBalance: { value: [1, 1, 1] },
      uSaturation: { value: 1 },
      uContrast: { value: 1 },
      uVignette: { value: 0.25 },
      uTexel: { value: new Vector2(1, 1) },
      uFxaa: { value: samples === 0 ? 1 : 0 },
    });
  }

  /** The scene target's size as a fraction of the drawing buffer's. */
  get renderScale(): number {
    return this.scale;
  }

  set renderScale(s: number) {
    this.scale = Math.max(0.25, Math.min(1, s));
    this.width = 0; // resized on the next frame
  }

  /** Multisamples on the scene target: 0 turns the multisampling off. */
  get samples(): number {
    return this.scene.samples;
  }

  set samples(n: number) {
    const want = Math.max(0, Math.min(n, this.maxSamples));
    if (want === this.scene.samples) return;
    // A target's sample count is fixed when three first sets it up; disposing
    // it lets the next frame set it up again with the new count.
    this.scene.dispose();
    this.scene.samples = want;
    this.compositeMaterial.uniforms.uFxaa!.value = want === 0 ? 1 : 0;
  }

  setGrade(g: GradePreset): void {
    const u = this.compositeMaterial.uniforms;
    u.uExposure!.value = g.exposure;
    u.uBloom!.value = g.bloom;
    u.uSaturation!.value = g.saturation;
    u.uContrast!.value = g.contrast;
    u.uVignette!.value = g.vignette;
    // Warm pulls the blue down and the red up; cold the other way.
    const t = g.temperature;
    u.uBalance!.value = t >= 0 ? [1 + 0.1 * t, 1, 1 - 0.14 * t] : [1 + 0.1 * t, 1 - 0.03 * t, 1 - 0.12 * t];
  }

  private resize(renderer: WebGLRenderer): void {
    const size = renderer.getDrawingBufferSize(new Vector2());
    const w = Math.max(1, Math.round(size.x * this.scale));
    const h = Math.max(1, Math.round(size.y * this.scale));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.scene.setSize(w, h);
    (this.compositeMaterial.uniforms.uTexel!.value as Vector2).set(1 / w, 1 / h);
    this.bright.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.blurA.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.blurB.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
  }

  private pass(renderer: WebGLRenderer, material: ShaderMaterial, into: WebGLRenderTarget | null): void {
    this.quad.material = material;
    renderer.setRenderTarget(into);
    this.quad.render(renderer);
  }

  /** Draw the scene through `drawScene` and the picture to the canvas. */
  render(renderer: WebGLRenderer, drawScene: () => void): void {
    this.resize(renderer);
    renderer.setRenderTarget(this.scene);
    renderer.clear();
    drawScene();

    this.brightMaterial.uniforms.tScene!.value = this.scene.texture;
    this.pass(renderer, this.brightMaterial, this.bright);

    let input: Texture = this.bright.texture;
    const step = this.blurMaterial.uniforms.uStep!.value as Vector2;
    for (let i = 0; i < BLUR_ITERATIONS; i++) {
      const spread = 1 + i;
      this.blurMaterial.uniforms.tInput!.value = input;
      step.set(spread / this.blurA.width, 0);
      this.pass(renderer, this.blurMaterial, this.blurA);
      this.blurMaterial.uniforms.tInput!.value = this.blurA.texture;
      step.set(0, spread / this.blurB.height);
      this.pass(renderer, this.blurMaterial, this.blurB);
      input = this.blurB.texture;
    }

    this.compositeMaterial.uniforms.tScene!.value = this.scene.texture;
    this.compositeMaterial.uniforms.tBloom!.value = input;
    this.pass(renderer, this.compositeMaterial, null);
  }

  dispose(): void {
    for (const t of [this.scene, this.bright, this.blurA, this.blurB]) t.dispose();
    for (const m of [this.brightMaterial, this.blurMaterial, this.compositeMaterial]) m.dispose();
    this.quad.dispose();
  }
}
