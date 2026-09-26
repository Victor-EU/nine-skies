/**
 * The look, assembled (design v2, "The look"; plan v2, stage 3).
 *
 * One object owns everything stage 3 added over the terrain renderer - the
 * sky dome, the sun's shadow map, two cloud layers, the post pass - and the
 * values that drive them. A scene hands it a look (`setScene`); every frame
 * the shell hands it where the camera is and what time it is (`frame`), and
 * it writes the sun, the sky, the haze, the mist and the shadow into every
 * material that draws the world; then `render` draws the passes in order.
 *
 * The clock runs at 1x: two minutes of flight move the sun half a degree,
 * so a scene is lit by the hour its file names and nothing else.
 */
import { Color, Vector3, type PerspectiveCamera, type Scene as ThreeScene, type ShaderMaterial, type WebGLRenderer } from "three";
import type { Scene } from "../film/scene.js";
import type { Terrain } from "../terrain/terrain.js";
import type { HorizonRing } from "../terrain/horizonRing.js";
import { hazeDensityPerWorldUnit, hazeFalloffPerWorldUnit, toWorldH, toWorldV, type WorldScale } from "../sim/scale.js";
import { mix, mul, srgbToLinear } from "./colour.js";
import { CloudLayer } from "./clouds.js";
import { PostPipeline } from "./post.js";
import { resolveLook, scenePalette, type ResolvedLook, type MistPreset } from "./presets.js";
import { SunShadow } from "./shadows.js";
import { SkyDome, skyState } from "./sky.js";
import { sunState, type SunState } from "./sun.js";
import { createLookValues, writeLookUniforms } from "./uniforms.js";

export interface LookRigOptions {
  readonly renderer: WebGLRenderer;
  readonly scene: ThreeScene;
  readonly camera: PerspectiveCamera;
  readonly terrain: Terrain;
  readonly ring: HorizonRing;
  readonly scale: WorldScale;
  readonly shadowResolution?: number;
}

export interface FrameState {
  readonly eastM: number;
  readonly northM: number;
  readonly altitudeM: number;
  readonly headingRad: number;
  /** The camera in world units, as `Terrain.update` returned it. */
  readonly eye: Vector3;
  /** The ground under the camera, real metres. */
  readonly groundM: number;
  readonly latDeg: number;
  readonly lonDeg: number;
  /** Beijing time, minutes after midnight. */
  readonly clockMinutes: number;
  readonly month: number;
  /** Seconds, any origin: for the water's sparkle and the clouds' drift. */
  readonly timeS: number;
}

/** Passes a capture can switch off to price them (`frameCost.ts`). */
export interface Passes {
  sky: boolean;
  shadow: boolean;
  clouds: boolean;
  post: boolean;
}

/** The shadow map's side, world units, from the camera's height over the ground. */
export function shadowSizeWorld(aboveGroundWorld: number): number {
  return Math.min(16_000, Math.max(4_000, 40 * aboveGroundWorld + 1_500));
}

export class LookRig {
  readonly sky = new SkyDome();
  readonly shadow: SunShadow;
  readonly deck = new CloudLayer();
  readonly cirrus = new CloudLayer();
  readonly post: PostPipeline;
  readonly values = createLookValues();
  readonly passes: Passes = { sky: true, shadow: true, clouds: true, post: true };
  /** The sun as last computed, for anyone who wants to know where it is. */
  sun: SunState | null = null;
  private look: ResolvedLook = resolveLook({ sky: "default", palette: "default", cloud: "none", grade: "none" });
  private mist: MistPreset | null = null;
  private readonly forward = new Vector3();
  private readonly sunDirection = new Vector3();
  private scale: WorldScale;

  constructor(private readonly options: LookRigOptions) {
    this.scale = options.scale;
    this.shadow = new SunShadow(options.shadowResolution ?? 2048);
    this.post = new PostPipeline(options.renderer);
    options.scene.add(this.sky.mesh, this.deck.mesh, this.cirrus.mesh);
    this.post.setGrade(this.look.grade);
    this.values.shadowMap = this.shadow.map;
  }

  /** The materials the look writes: the terrain's, the curtain's, the ring's, the clouds'. */
  private get materials(): ShaderMaterial[] {
    return [...this.options.terrain.lookMaterials, this.options.ring.material, this.sky.material, this.deck.material, this.cirrus.material];
  }

  /**
   * The world's scale, when a scene draws its relief at its own (F97). The
   * air, the mist, the shadow's reach and the clouds are all real
   * quantities put into world units here, so they follow it.
   */
  setScale(scale: WorldScale): void {
    this.scale = scale;
    this.deck.set(this.look.cloud.deck, scale);
    this.cirrus.set(this.look.cloud.cirrus, scale);
  }

  /** A scene's look, or the defaults for none. Recompiles the palette shaders. */
  setScene(scene: Scene | null): void {
    this.look = resolveLook(scene?.look ?? { sky: "default", palette: "default", cloud: "none", grade: "none" });
    const lat = scene?.rail[0]?.lat ?? 35;
    const palette = scenePalette(this.look.palette, lat);
    this.options.terrain.setPalette(palette);
    this.options.ring.setPalette(palette);
    this.mist = this.look.cloud.mist;
    this.deck.set(this.look.cloud.deck, this.scale);
    this.cirrus.set(this.look.cloud.cirrus, this.scale);
    this.post.setGrade(this.look.grade);
  }

  frame(f: FrameState): void {
    const v = this.values;
    const preset = this.look.sky;
    const sun = sunState(f.latDeg, f.lonDeg, f.month, f.clockMinutes / 60, preset.turbidity);
    this.sun = sun;
    const sky = skyState(sun, preset, f.altitudeM);

    v.skyHorizon.setRGB(...sky.horizon);
    v.skyZenith.setRGB(...sky.zenith);
    v.sunDirection.set(...sun.direction);
    v.sunGlow.setRGB(...sky.glow);
    v.glowPower = sky.glowPower;
    v.sunDisc.setRGB(...sky.disc);
    v.sunDiscCos = sky.discCos;
    v.sunColor.setRGB(...sky.sunColor);
    v.ambientZenith.setRGB(...sky.ambientZenith);
    v.ambientGround.setRGB(...sky.ambientGround);
    v.time = f.timeS;

    // The air, in world units.
    const hazeDensity = hazeDensityPerWorldUnit(preset.hazeDensityPerM, this.scale);
    const hazeFalloff = hazeFalloffPerWorldUnit(preset.scaleHeightM, this.scale);
    for (const m of [...this.options.terrain.lookMaterials, this.options.ring.material]) {
      m.uniforms.uHazeDensity!.value = hazeDensity;
      m.uniforms.uHazeHeightFalloff!.value = hazeFalloff;
    }

    // Mist: white cloud lit by the day, pulled towards the horizon's colour
    // so it joins the haze, and never bluer than the sky it sits under.
    if (this.mist) {
      v.mistTop = toWorldV(this.mist.topM, this.scale);
      v.mistDensity = hazeDensityPerWorldUnit(this.mist.densityPerM, this.scale);
      v.mistBankScale = toWorldH(this.mist.bankKm * 1000, this.scale);
      const white = mul([1, 1, 1], 0.8 * (0.45 + 0.55 * sun.daylight));
      const lit = mix(sky.horizon, white, 0.35);
      v.mistColor.setRGB(...mul(srgbToLinear(this.mist.tint), lit));
    } else {
      v.mistDensity = 0;
    }

    // The shadow map over the ground ahead.
    const on = this.passes.shadow && sun.elevationDeg > 0.5;
    v.shadowOn = on ? 1 : 0;
    if (on) {
      this.forward.set(Math.sin(f.headingRad), 0, Math.cos(f.headingRad));
      this.sunDirection.copy(v.sunDirection);
      const groundY = toWorldV(f.groundM, this.scale);
      const size = shadowSizeWorld(Math.max(0, f.eye.y - groundY));
      this.shadow.fit({
        eye: f.eye,
        forward: this.forward,
        sunDirection: this.sunDirection,
        sizeWorld: size,
        yLo: Math.min(groundY, f.eye.y) - toWorldV(300, this.scale),
        yHi: Math.max(groundY, f.eye.y) + toWorldV(4_500, this.scale),
      });
      v.shadowMatrix.copy(this.shadow.matrix);
      v.shadowTexel = this.shadow.texelUv;
      v.shadowNormalOffset = 1.5 * this.shadow.texelWorld;
      v.shadowBias = 1.5 * this.shadow.depthTexel;
      v.shadowStrength = 0.9 * sun.daylight;
    }

    this.deck.update(f.eye, hazeDensity, hazeFalloff);
    this.cirrus.update(f.eye, hazeDensity, hazeFalloff);
    this.sky.update(this.options.camera);
    for (const m of this.materials) writeLookUniforms(m, v);
  }

  /** The passes, in order: the shadow map, the scene, the grade. */
  render(): void {
    const { renderer, scene, camera, terrain } = this.options;
    this.sky.mesh.visible = this.passes.sky;
    if (!this.passes.clouds) {
      this.deck.mesh.visible = false;
      this.cirrus.mesh.visible = false;
    } else {
      this.deck.set(this.look.cloud.deck, this.scale);
      this.cirrus.set(this.look.cloud.cirrus, this.scale);
    }
    if (this.values.shadowOn > 0) this.shadow.render(renderer, scene, terrain.casters);
    if (this.passes.post) {
      this.post.render(renderer, () => renderer.render(scene, camera));
    } else {
      // Without the grade there is no pass to turn the picture the right
      // way round (F100): this is the frame-cost capture's, never the film's.
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    }
  }

  /** What the scene's look resolved to, for the console and the findings. */
  get resolved(): ResolvedLook {
    return this.look;
  }

  static readonly Color = Color;
}
