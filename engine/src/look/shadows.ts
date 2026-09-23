/**
 * The sun's shadow (design v2, "A sun ... shadows on the ground").
 *
 * One depth map from the sun's point of view, over a square of ground in
 * front of the camera, drawn with the terrain's own vertex shader so the
 * ground that casts is the ground that is drawn (`createDepthMaterial`).
 * The square follows the camera and scales with its height, and its centre
 * is snapped to the map's texels in light space, so a moving camera does not
 * crawl the shadow edges. Beyond the square the ground is lit by the sun and
 * the sky without a cast shadow; the terrain's `sunShadow` fades the map out
 * over its last fifteen percent so the border is not a line.
 *
 * Comparison sampling with linear filtering, so the hardware does the first
 * four taps of the filter and the shader's nine make a soft edge of 36.
 */
import {
  DepthFormat,
  DepthTexture,
  LessEqualCompare,
  LinearFilter,
  Matrix4,
  NearestFilter,
  OrthographicCamera,
  UnsignedIntType,
  Vector3,
  WebGLRenderTarget,
  type Material,
  type Mesh,
  type Object3D,
  type Scene,
  type ShaderMaterial,
  type WebGLRenderer,
} from "three";
import { createDepthMaterial } from "../terrain/terrainMaterial.js";

export interface ShadowFit {
  /** The camera, world units. */
  readonly eye: Vector3;
  /** Where it looks, horizontal and unit. */
  readonly forward: Vector3;
  readonly sunDirection: Vector3;
  /** The square's side, world units. */
  readonly sizeWorld: number;
  /** The heights the map must cover, world units. */
  readonly yLo: number;
  readonly yHi: number;
}

const BIAS_MATRIX = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

export class SunShadow {
  readonly target: WebGLRenderTarget;
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 1, 10);
  /** World to shadow map: xy the texel, z the depth, all 0 to 1. */
  readonly matrix = new Matrix4();
  /** One texel of the map, world units, at the last fit. */
  texelWorld = 0;
  /** Depth units: one texel's worth of the map's range. */
  depthTexel = 0;
  private readonly depthMaterials = new Map<Material, ShaderMaterial>();
  private readonly centre = new Vector3();
  private readonly axisX = new Vector3();
  private readonly axisY = new Vector3();
  private readonly up = new Vector3();
  private readonly basis = new Matrix4();

  constructor(readonly resolution = 2048) {
    const depth = new DepthTexture(resolution, resolution, UnsignedIntType);
    depth.format = DepthFormat;
    depth.compareFunction = LessEqualCompare;
    depth.minFilter = LinearFilter;
    depth.magFilter = LinearFilter;
    this.target = new WebGLRenderTarget(resolution, resolution, {
      depthTexture: depth,
      depthBuffer: true,
      stencilBuffer: false,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      generateMipmaps: false,
    });
  }

  get map(): DepthTexture {
    return this.target.depthTexture!;
  }

  /** The texel, in the map's own units. */
  get texelUv(): number {
    return 1 / this.resolution;
  }

  fit(f: ShadowFit): void {
    const size = f.sizeWorld;
    const sun = f.sunDirection;
    const el = Math.asin(Math.min(1, Math.max(-1, sun.y)));
    const sinEl = Math.max(Math.sin(el), 0.05);
    const cosEl = Math.cos(el);

    // A basis with z towards the sun and y as near to up as the sun allows.
    this.up.set(0, 1, 0);
    if (Math.abs(sun.y) > 0.98) this.up.set(0, 0, 1);
    this.basis.lookAt(sun, new Vector3(0, 0, 0), this.up);
    this.axisX.setFromMatrixColumn(this.basis, 0);
    this.axisY.setFromMatrixColumn(this.basis, 1);

    // The square sits ahead of the camera, at the middle of the heights.
    this.centre.copy(f.eye).addScaledVector(f.forward, size * 0.3);
    this.centre.y = (f.yLo + f.yHi) / 2;

    // The map's extent in light space: the square, foreshortened by the
    // sun's elevation, plus the heights, foreshortened the other way.
    const halfX = size / 2;
    const halfY = 0.5 * size * sinEl + 0.5 * (f.yHi - f.yLo) * cosEl;
    const halfDepth = 0.5 * size * cosEl + 0.5 * (f.yHi - f.yLo) * sinEl;
    this.texelWorld = size / this.resolution;

    // Snap the centre to a texel in light space, so the map's texels stay
    // put in the world while the camera moves inside a texel.
    const tx = (2 * halfX) / this.resolution;
    const ty = (2 * halfY) / this.resolution;
    const cx = this.centre.dot(this.axisX);
    const cy = this.centre.dot(this.axisY);
    this.centre.addScaledVector(this.axisX, Math.round(cx / tx) * tx - cx);
    this.centre.addScaledVector(this.axisY, Math.round(cy / ty) * ty - cy);

    const margin = halfDepth * 0.1 + 10;
    const c = this.camera;
    c.left = -halfX;
    c.right = halfX;
    c.top = halfY;
    c.bottom = -halfY;
    c.near = 1;
    c.far = 2 * halfDepth + 2 * margin;
    c.up.copy(this.up);
    c.position.copy(this.centre).addScaledVector(sun, halfDepth + margin);
    c.lookAt(this.centre);
    c.updateMatrixWorld(true);
    c.updateProjectionMatrix();
    this.matrix.copy(BIAS_MATRIX).multiply(c.projectionMatrix).multiply(c.matrixWorldInverse);
    this.depthTexel = this.texelWorld / (c.far - c.near);
  }

  /** Draw the casters' depth from the sun. Leaves the renderer's target as it found it. */
  render(renderer: WebGLRenderer, scene: Scene, casters: readonly Mesh[]): void {
    const casting = new Set<Object3D>(casters);
    const hidden: Object3D[] = [];
    for (const child of scene.children) {
      if (!casting.has(child) && child.visible) {
        child.visible = false;
        hidden.push(child);
      }
    }
    const swapped: [Mesh, Material | Material[]][] = [];
    for (const mesh of casters) {
      const material = mesh.material as ShaderMaterial;
      let depth = this.depthMaterials.get(material);
      if (!depth) {
        depth = createDepthMaterial(material);
        this.depthMaterials.set(material, depth);
      }
      swapped.push([mesh, mesh.material]);
      mesh.material = depth;
    }
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, this.camera);
    renderer.setRenderTarget(previous);
    for (const [mesh, material] of swapped) mesh.material = material;
    for (const child of hidden) child.visible = true;
  }

  dispose(): void {
    this.target.dispose();
    for (const m of this.depthMaterials.values()) m.dispose();
    this.depthMaterials.clear();
  }
}
