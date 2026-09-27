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
 * origin as the camera moves. What each figure does is the director's plan
 * for this viewing (D92): a monument stands at its place over the ground
 * the terrain reports there, or over the camera's own altitude until the
 * ground has arrived; a companion visits, on a path its motion lays out in
 * the camera's frame. That frame follows the camera's position exactly and
 * its heading a moment late, so a figure keeps its place in the picture at
 * any speed and swings a little when the rail turns. It is kept off ground
 * it skims, and hidden by a peak it passes behind.
 */
import { DirectionalLight, Fog, Group, HemisphereLight, Vector3, type Color, type Scene as ThreeScene } from "three";
import { castLineAt, type CastCue, type Scene } from "../film/scene.js";
import { projectAlbers } from "../terrain/worldGrid.js";
import { toWorldH, type WorldScale } from "../sim/scale.js";
import { planScene, type Plan } from "./director.js";
import { FADE_S } from "./fade.js";
import { figureBuilder, type CastFrame, type Figure } from "./figure.js";
import { angleTo, DEFAULT_VIEW, motionBuilder, newPose, type Motion, type Pose, type View, type Visit } from "./motion.js";
import { hashSeed, Rng } from "./random.js";
import { DEFAULT_SKIN, SKINS, type Skin } from "./skin.js";
import { temperamentOf } from "./temperament.js";

export { FADE_S };

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
  /** The camera's view, for motions that enter and leave off its edges; the film's usual one if absent. */
  readonly view?: View;
}

export interface CastLayerOptions {
  readonly scene: ThreeScene;
  readonly terrain: { toWorld(eastM: number, northM: number, altitudeM: number): Vector3; groundElevationM(eastM: number, northM: number): number | null };
  readonly scale: WorldScale;
  readonly skin?: string;
  /** The viewing's seed (D92): the same seed plays the same cast. Drawn from the clock if absent. */
  readonly seed?: number;
}

/** Seconds the companions' frame takes to follow the camera's heading round a turn. */
const HEADING_LAG_S = 0.8;
/** A turn larger than this in one frame is a cut: the frame follows it at once. */
const CUT_RAD = 1;

interface Placed {
  readonly index: number;
  readonly cue: CastCue;
  readonly figure: Figure;
  readonly visits: readonly { readonly visit: Visit; readonly motion: Motion }[];
  /** A world pose's grid position, projected once. */
  grid: { eastM: number; northM: number } | null;
  /** How far it has been lifted over the ground, world units; below zero while it is off stage. */
  lift: number;
}

/** The fade a cue is at: 0 before and after, 1 while it is in play. */
export function cueFade(cue: CastCue, flightS: number): number {
  if (flightS < cue.fromS || flightS > cue.untilS) return 0;
  return Math.min(1, (flightS - cue.fromS) / FADE_S, (cue.untilS - flightS) / FADE_S);
}

/**
 * Where a companion wants to be, world units, from the camera's frame. All
 * three of the cue's metres go through the horizontal scale, the one a
 * size goes through: the vertical is drawn six times the horizontal, and a
 * figure "70 m up" converted as an altitude would stand 30 degrees over
 * the lens. In the picture's own terms, up is as far as ahead is.
 */
export function companionTarget(eye: Vector3, headingRad: number, offset: NonNullable<CastCue["offset"]>, scale: WorldScale, out = new Vector3()): Vector3 {
  const fwd = new Vector3(Math.sin(headingRad), 0, Math.cos(headingRad));
  const right = new Vector3(fwd.z, 0, -fwd.x);
  return out.copy(eye).addScaledVector(fwd, toWorldH(offset.aheadM, scale)).addScaledVector(right, toWorldH(offset.rightM, scale)).add(new Vector3(0, toWorldH(offset.upM, scale), 0));
}

/**
 * The way a figure turns, radians about up: a companion's facing is from
 * the way the camera flies, a monument's a bearing. Zero faces the flight
 * or north; the doll is built facing +z, which `rotation.y` turns to the
 * bearing directly, since the world's +z is north and +x east.
 */
export function figureYaw(cue: Pick<CastCue, "role" | "facingDeg">, headingRad: number): number {
  const facing = (cue.facingDeg * Math.PI) / 180;
  return cue.role === "companion" ? headingRad + facing : facing;
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
  /** The heading the companions' frame is at, following the camera's. */
  private frameHeading: number | null = null;
  private readonly pose: Pose = newPose();
  private readonly fwd = new Vector3();
  private readonly right = new Vector3();
  /** This viewing's seed (D92). */
  readonly seed: number;
  /** The current scene's plan, for probing. */
  plan: Plan | null = null;
  /** Whether the pass draws; `frameCost` switches it off to price it. */
  visible = true;

  constructor(private readonly options: CastLayerOptions) {
    this.seed = (options.seed ?? hashSeed(Date.now())) >>> 0;
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

  /** Plan the scene's cast for this viewing and build what it casts; the figures of the scene before are freed. */
  setScene(scene: Scene | null): void {
    this.clear();
    this.frameHeading = null;
    this.plan = scene ? planScene(scene, this.seed) : null;
    scene?.cast.forEach((cue, index) => {
      const plan = this.plan!.cues[index]!;
      const build = figureBuilder(cue.figure);
      if (!plan.cast || !build) return;
      const temperament = temperamentOf(cue.figure);
      const visits = plan.visits.flatMap((visit) => {
        const make = motionBuilder(visit.motion);
        const leader = visit.leader;
        const motion = make?.({ cue, visit, temperament, rng: new Rng(visit.seed), leader: leader === null ? null : (t, view, out) => this.poseOf(leader, t, view, out) });
        return motion ? [{ visit, motion }] : [];
      });
      const figure = build({ skin: this.skin, variant: cue.variant, scale: this.scale });
      figure.group.visible = false;
      figure.group.rotation.order = "YXZ";
      this.group.add(figure.group);
      this.placed.push({ index, cue, figure, visits, grid: null, lift: -1 });
    });
  }

  /** The cast's line on at this second, among the figures this viewing casts. */
  lineAt(flightS: number): CastCue | null {
    return castLineAt({ cast: this.placed.map((p) => p.cue) }, flightS);
  }

  /** The pose of cue `index` at a second, for a figure that follows it. */
  private poseOf(index: number, flightS: number, view: View, out: Pose): boolean {
    const p = this.placed.find((q) => q.index === index);
    const v = p?.visits.find(({ visit }) => flightS >= visit.fromS && flightS <= visit.untilS);
    return v ? v.motion.pose(flightS, view, out) : false;
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
    // The companions' frame: the camera's position now, its heading a moment late.
    if (this.frameHeading === null || Math.abs(angleTo(this.frameHeading, f.headingRad)) > CUT_RAD) this.frameHeading = f.headingRad;
    else this.frameHeading += angleTo(this.frameHeading, f.headingRad) * (1 - Math.exp(-dt / HEADING_LAG_S));
    const h = this.frameHeading;
    this.fwd.set(Math.sin(h), 0, Math.cos(h));
    this.right.set(this.fwd.z, 0, -this.fwd.x);
    const view = f.view ?? DEFAULT_VIEW;
    const pose = this.pose;
    for (const p of this.placed) {
      const g = p.figure.group;
      const on = p.visits.find(({ visit }) => f.flightS >= visit.fromS && f.flightS <= visit.untilS);
      if (!on || !on.motion.pose(f.flightS, view, pose) || pose.presence <= 0) {
        g.visible = false;
        p.lift = -1;
        continue;
      }
      g.visible = true;
      const sizeWorld = toWorldH(p.cue.sizeM, this.scale);
      g.scale.setScalar((sizeWorld / p.figure.nativeSize) * (0.6 + 0.4 * pose.presence));
      if (pose.space === "world" && pose.world) {
        p.grid ??= projectAlbers(pose.world.lat, pose.world.lon);
        const above = pose.world.aboveGroundM;
        const ground = this.options.terrain.groundElevationM(p.grid.eastM, p.grid.northM);
        g.position.copy(this.options.terrain.toWorld(p.grid.eastM, p.grid.northM, (ground ?? f.altitudeM - above) + above));
        g.rotation.set(-pose.pitch, pose.yaw, pose.bank);
      } else {
        const a = pose.at;
        g.position
          .copy(f.eye)
          .addScaledVector(this.fwd, toWorldH(a.ahead, this.scale))
          .addScaledVector(this.right, toWorldH(a.right, this.scale));
        g.position.y += toWorldH(a.up, this.scale);
        // Kept off the ground it skims, lifted quickly and let down slowly. Only
        // by up to half its size: a peak it goes behind hides it, as a peak
        // would, rather than shoving it out of the top of the picture (F111).
        const eastM = f.eastM + a.ahead * Math.sin(h) + a.right * Math.cos(h);
        const northM = f.northM + a.ahead * Math.cos(h) - a.right * Math.sin(h);
        const ground = this.options.terrain.groundElevationM(eastM, northM);
        const need = ground === null ? 0 : Math.min(0.5 * sizeWorld, Math.max(0, ground * this.scale.verticalExaggeration + 0.45 * sizeWorld - g.position.y));
        if (p.lift < 0) p.lift = need;
        else p.lift += (need - p.lift) * Math.min(1, (need > p.lift ? 10 : 1.5) * dt);
        g.position.y += p.lift;
        g.rotation.set(-pose.pitch, h + pose.yaw, pose.bank);
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
