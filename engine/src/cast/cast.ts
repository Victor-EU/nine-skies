/**
 * The cast layer (D91): the figures a scene puts in its sky, when the
 * viewer has asked for them. Off, none of this is loaded; on, one object
 * owns every figure of the current scene, places each by its cue every
 * frame, and lights them with the film's own sun and air.
 *
 * The seam with the film is three calls: `setScene` when a scene starts,
 * `frame` after the look has computed the frame's light, and `dispose` when
 * the viewer switches it off. The layer reads the look's values and writes
 * nothing back into it.
 *
 * Placement is in world units, every frame, because the terrain rebases its
 * origin as the camera moves. A monument stands at its place over the
 * ground the terrain reports there, or over the camera's own altitude until
 * the ground has arrived; a companion rides in the camera's frame, eased so
 * it floats rather than being bolted to the lens.
 */
import { DirectionalLight, Fog, Group, HemisphereLight, Vector3, type Color, type Scene as ThreeScene } from "three";
import type { CastCue, Scene } from "../film/scene.js";
import { projectAlbers } from "../terrain/worldGrid.js";
import { toWorldH, toWorldV, type WorldScale } from "../sim/scale.js";
import { figureBuilder, type CastFrame, type Figure } from "./figure.js";
import { DEFAULT_SKIN, SKINS, type Skin } from "./skin.js";

/** What the layer needs from the look each frame: its light and its air. */
export interface CastLight {
  readonly sunDirection: Vector3;
  readonly sunColor: Color;
  readonly ambientZenith: Color;
  readonly ambientGround: Color;
  readonly skyHorizon: Color;
  /** The haze's density per world unit, as the look computed it. */
  readonly hazeDensity: number;
  /** 0 at night to 1 in full day. */
  readonly daylight: number;
}

export interface CastFrameInput {
  readonly timeS: number;
  readonly flightS: number;
  readonly eye: Vector3;
  readonly headingRad: number;
  readonly eastM: number;
  readonly northM: number;
  readonly altitudeM: number;
  readonly light: CastLight;
}

export interface CastLayerOptions {
  readonly scene: ThreeScene;
  readonly terrain: { toWorld(eastM: number, northM: number, altitudeM: number): Vector3; groundElevationM(eastM: number, northM: number): number | null };
  readonly scale: WorldScale;
  readonly skin?: string;
}

/** Seconds a figure takes to arrive and to go. */
export const FADE_S = 1.5;
/** How much of the way to its place a companion moves each second. */
const COMPANION_EASE = 3;

interface Placed {
  readonly cue: CastCue;
  readonly figure: Figure;
  /** A monument's grid position, projected once. */
  readonly grid: { eastM: number; northM: number } | null;
  readonly eased: Vector3;
  settled: boolean;
}

/** The fade a cue is at: 0 before and after, 1 while it is in play. */
export function cueFade(cue: CastCue, flightS: number): number {
  if (flightS < cue.fromS || flightS > cue.untilS) return 0;
  return Math.min(1, (flightS - cue.fromS) / FADE_S, (cue.untilS - flightS) / FADE_S);
}

/** Where a companion wants to be, world units, from the camera's frame and the cue's real metres. */
export function companionTarget(eye: Vector3, headingRad: number, offset: NonNullable<CastCue["offset"]>, scale: WorldScale, out = new Vector3()): Vector3 {
  const fwd = new Vector3(Math.sin(headingRad), 0, Math.cos(headingRad));
  const right = new Vector3(fwd.z, 0, -fwd.x);
  return out.copy(eye).addScaledVector(fwd, toWorldH(offset.aheadM, scale)).addScaledVector(right, toWorldH(offset.rightM, scale)).add(new Vector3(0, toWorldV(offset.upM, scale), 0));
}

export class CastLayer {
  readonly group = new Group();
  readonly sun = new DirectionalLight(0xffffff, 2);
  readonly sky = new HemisphereLight(0xffffff, 0x888888, 1);
  private readonly fog = new Fog(0xffffff, 1, 1_000_000);
  private skin: Skin;
  private placed: Placed[] = [];
  private scale: WorldScale;
  private last = 0;
  /** Whether the pass draws; `frameCost` switches it off to price it. */
  visible = true;

  constructor(private readonly options: CastLayerOptions) {
    this.scale = options.scale;
    this.skin = (SKINS[options.skin ?? DEFAULT_SKIN] ?? SKINS[DEFAULT_SKIN]!)();
    this.group.name = "cast";
    options.scene.add(this.group, this.sun, this.sky);
    options.scene.fog = this.fog;
  }

  /** The figures on stage now. */
  get figures(): readonly Figure[] {
    return this.placed.map((p) => p.figure);
  }

  /** Build the scene's cues; the figures of the scene before are freed. */
  setScene(scene: Scene | null): void {
    this.clear();
    for (const cue of scene?.cast ?? []) {
      const build = figureBuilder(cue.figure);
      if (!build) continue;
      const figure = build({ skin: this.skin, variant: cue.variant, scale: this.scale });
      figure.group.visible = false;
      this.group.add(figure.group);
      const grid = cue.at ? projectAlbers(cue.at.lat, cue.at.lon) : null;
      this.placed.push({ cue, figure, grid: grid ? { eastM: grid.eastM, northM: grid.northM } : null, eased: new Vector3(), settled: false });
    }
  }

  setScale(scale: WorldScale): void {
    this.scale = scale;
  }

  frame(f: CastFrameInput): void {
    const dt = this.last ? Math.min(0.1, f.timeS - this.last) : 0;
    this.last = f.timeS;
    const L = f.light;
    this.sun.position.copy(L.sunDirection).multiplyScalar(10_000).add(f.eye);
    this.sun.target.position.copy(f.eye);
    this.sun.target.updateMatrixWorld();
    this.sun.color.copy(L.sunColor);
    this.sun.intensity = 2.4 * L.daylight;
    this.sky.color.copy(L.ambientZenith);
    this.sky.groundColor.copy(L.ambientGround);
    this.sky.intensity = 1.6;
    // The look's haze is exponential in the distance; a linear fog with the
    // same colour crosses it at two thirds of the way to the horizon, near
    // enough for figures that fade into the sky where the ground does.
    this.fog.color.copy(L.skyHorizon);
    this.fog.near = 0;
    this.fog.far = L.hazeDensity > 0 ? 2.2 / L.hazeDensity : 1_000_000;

    this.group.visible = this.visible;
    for (const p of this.placed) {
      const fade = cueFade(p.cue, f.flightS);
      p.figure.group.visible = fade > 0;
      if (fade <= 0) {
        p.settled = false;
        continue;
      }
      const g = p.figure.group;
      const sizeWorld = toWorldH(p.cue.sizeM, this.scale);
      g.scale.setScalar((sizeWorld / p.figure.nativeSize) * (0.6 + 0.4 * fade));
      if (p.grid) {
        const ground = this.options.terrain.groundElevationM(p.grid.eastM, p.grid.northM);
        const altitudeM = (ground ?? f.altitudeM - (p.cue.at?.aboveGroundM ?? 0)) + (p.cue.at?.aboveGroundM ?? 0);
        g.position.copy(this.options.terrain.toWorld(p.grid.eastM, p.grid.northM, altitudeM));
      } else if (p.cue.offset) {
        const target = companionTarget(f.eye, f.headingRad, p.cue.offset, this.scale);
        if (!p.settled) {
          p.eased.copy(target);
          p.settled = true;
        } else p.eased.lerp(target, Math.min(1, COMPANION_EASE * dt));
        g.position.copy(p.eased);
        g.rotation.set(0, f.headingRad, 0);
      }
      const frame: CastFrame = { timeS: f.timeS, flightS: f.flightS, eye: f.eye, headingRad: f.headingRad, group: g };
      p.figure.update(frame);
    }
  }

  /** Dress every figure again from another skin. */
  setSkin(name: string): void {
    const make = SKINS[name];
    if (!make) return;
    const old = this.skin;
    this.skin = make();
    for (const p of this.placed) p.figure.setSkin(this.skin);
    old.dispose();
  }

  private clear(): void {
    for (const p of this.placed) {
      this.group.remove(p.figure.group);
      p.figure.dispose();
    }
    this.placed = [];
  }

  dispose(): void {
    this.clear();
    const s = this.options.scene;
    s.remove(this.group, this.sun, this.sky);
    if (s.fog === this.fog) s.fog = null;
    this.skin.dispose();
  }
}
