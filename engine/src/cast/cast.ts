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
 * it skims, and where rock would cut it or stand before it, it is drawn
 * nearer and smaller about the eye, the same in the picture (F137).
 *
 * The plan is drawn with the scene's sight (D93), so a monument that
 * surfaces comes up where the flight looks; a visit an omen reacts in is
 * built by the omen's module around the figure's own motion; and a figure
 * with a head turns it where its pose says to look, after it has moved
 * itself.
 */
import { Box3, DirectionalLight, Fog, Group, HemisphereLight, Vector3, type Color, type Scene as ThreeScene, type WebGLRenderer } from "three";
import { castLineAt, type CastCue, type Scene } from "../film/scene.js";
import { projectAlbers } from "../terrain/worldGrid.js";
import { toWorldH, type WorldScale } from "../sim/scale.js";
import { clearRatio } from "./clearance.js";
import { planScene, type Plan } from "./director.js";
import { FADE_S } from "./fade.js";
import { figureBuilder, type CastFrame, type Figure, type Pace } from "./figure.js";
import { restHeads, turnHead } from "./gaze.js";
import { angleTo, DEFAULT_VIEW, motionBuilder, newPose, type Motion, type MotionContext, type Pose, type View, type Visit } from "./motion.js";
import { omenWrap } from "./omens.js";
import { paintedHeight } from "./painting.js";
import { hashSeed, Rng } from "./random.js";
import { sightOf } from "./sight.js";
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

/** Seconds either side of now a figure's path is read at for its pace (D96). */
export const PACE_S = 0.2;

/**
 * Where a pose puts a figure, as plain numbers (D96): metres of the picture
 * for a pose in the frame, real metres from its place for one in the
 * world. Taken at once, since a motion may hand every pose it makes the
 * same place to fill.
 */
export interface Spot {
  readonly space: Pose["space"];
  /** The world place it is measured from, so two spots from different places are not compared. */
  readonly place: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function spotOf(pose: Pose): Spot {
  const w = pose.world;
  if (pose.space === "world" && w) return { space: "world", place: `${w.lat},${w.lon}`, x: w.eastM ?? 0, y: w.aboveGroundM, z: w.northM ?? 0 };
  return { space: "frame", place: "", x: pose.at.right, y: pose.at.up, z: pose.at.ahead };
}

/**
 * How far a figure went between two spots of its path, body lengths a
 * second (D96): through the picture for spots in the frame, over the
 * ground for spots in the world. Nought when they are not the same kind of
 * place, as at a visit's edge.
 */
export function paceBetween(a: Spot, b: Spot, seconds: number, sizeM: number): number {
  if (a.space !== b.space || a.place !== b.place || seconds <= 0) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / seconds / Math.max(1, sizeM);
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
  /** The share of its distance it is drawn at, to keep it out of the rock (F137); 1 in the clear. */
  nearer: number;
  /** Whether its heads are turned, so they are set back when the pose lets them go. */
  looking: boolean;
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
  /** Its path a moment before and after, for its pace. */
  private readonly before: Pose = newPose();
  private readonly fwd = new Vector3();
  private readonly right = new Vector3();
  /** The frame's eye and the camera's altitude, for a pose read in the middle of placing. */
  private readonly eye = new Vector3();
  private altitudeM = 0;
  /** The camera's real position, for the ground under a figure in the frame. */
  private eastM = 0;
  private northM = 0;
  private readonly at = new Vector3();
  private readonly bounds = new Box3();
  /** The drawn ground at a world position, world units (F137). */
  private readonly drawnGround = (x: number, z: number): number | null => {
    const c = this.scale.horizontalCompression;
    const g = this.options.terrain.groundElevationM(this.eastM + (x - this.eye.x) * c, this.northM + (z - this.eye.z) * c);
    return g === null ? null : g * this.scale.verticalExaggeration;
  };
  /** How deep a pose is being read for another figure's omen. */
  private asking = 0;
  /** This viewing's seed (D92). */
  readonly seed: number;
  /** The current scene's plan, for probing. */
  plan: Plan | null = null;
  /** Whether the pass draws; `frameCost` switches it off to price it. */
  visible = true;
  private renderer: WebGLRenderer | null = null;
  private readonly unhook: () => void;

  constructor(private readonly options: CastLayerOptions) {
    this.seed = (options.seed ?? hashSeed(Date.now())) >>> 0;
    this.scale = options.scale;
    this.skin = (SKINS[options.skin ?? DEFAULT_SKIN] ?? SKINS[DEFAULT_SKIN]!)();
    this.group.name = "cast";
    options.scene.add(this.group, this.sun, this.sky);
    options.scene.fog = this.fog;
    // The renderer, from the scene as it is drawn, so the figures' pictures can be handed to the GPU as they arrive (F123).
    const scene = options.scene;
    const before = scene.onBeforeRender;
    this.unhook = () => {
      scene.onBeforeRender = before;
    };
    scene.onBeforeRender = (renderer, ...rest) => {
      this.renderer = renderer;
      before.call(scene, renderer, ...rest);
    };
  }

  /** The figures on stage now. */
  get figures(): readonly Figure[] {
    return this.placed.map((p) => p.figure);
  }

  /** Plan the scene's cast for this viewing and build what it casts; the figures of the scene before are freed. */
  setScene(scene: Scene | null): void {
    this.clear();
    this.frameHeading = null;
    this.plan = scene ? planScene(scene, this.seed, temperamentOf, sightOf(scene)) : null;
    scene?.cast.forEach((cue, index) => {
      const plan = this.plan!.cues[index]!;
      const build = figureBuilder(cue.figure);
      if (!plan.cast || !build) return;
      const temperament = temperamentOf(cue.figure);
      const visits = plan.visits.flatMap((visit) => {
        const make = motionBuilder(visit.motion);
        if (!make) return [];
        const leader = visit.leader;
        const context = (v: Visit): MotionContext => ({
          cue,
          visit: v,
          temperament,
          rng: new Rng(v.seed),
          leader: leader === null ? null : (t, view, out) => this.poseOf(leader, t, view, out),
          leaderCue: leader === null ? null : (scene?.cast[leader] ?? null),
          heightOf: (c) => paintedHeight(c.figure, c.variant) ?? 1,
        });
        // A visit an omen reacts in: the omen's module lays the figure's own motion and takes over from it.
        const r = visit.reaction;
        const wrap = r ? omenWrap(r.omen) : null;
        const motion =
          r && wrap
            ? wrap({ reaction: r, cue, visit, temperament, rng: new Rng(hashSeed(visit.seed, "omen")), threat: (t, view, out) => this.poseInFrame(r.arrival, t, view, out), build: (v) => make(context(v)) })
            : make(context(visit));
        return motion ? [{ visit, motion }] : [];
      });
      const figure = build({ skin: this.skin, variant: cue.variant, scale: this.scale });
      figure.group.visible = false;
      figure.group.rotation.order = "YXZ";
      this.group.add(figure.group);
      this.placed.push({ index, cue, figure, visits, grid: null, lift: -1, nearer: 1, looking: false });
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
    out.gaze.weight = 0;
    return v ? v.motion.pose(flightS, view, out) : false;
  }

  /**
   * The pose of cue `index` at a second in the companions' frame as it is
   * this frame, a monument's too: where a witness sees it coming from.
   */
  private poseInFrame(index: number, flightS: number, view: View, out: Pose): boolean {
    // Two figures that each foretell the other would ask after each other for ever.
    if (this.asking > 1) return false;
    this.asking++;
    try {
      if (!this.poseOf(index, flightS, view, out)) return false;
    } finally {
      this.asking--;
    }
    const p = this.placed.find((q) => q.index === index)!;
    if (out.space !== "world" || !out.world) return true;
    const d = this.worldPlace(p, out.world, this.at).sub(this.eye);
    const k = toWorldH(1, this.scale);
    out.at.ahead = d.dot(this.fwd) / k;
    out.at.right = d.dot(this.right) / k;
    out.at.up = d.y / k;
    out.space = "frame";
    out.world = null;
    return true;
  }

  /**
   * Where a world pose stands, world units: over the ground at its place,
   * or over the camera's own altitude until the ground has arrived, and as
   * far as it has swum from there.
   */
  private worldPlace(p: Placed, w: NonNullable<Pose["world"]>, out: Vector3): Vector3 {
    p.grid ??= projectAlbers(w.lat, w.lon);
    const ground = this.options.terrain.groundElevationM(p.grid.eastM, p.grid.northM);
    const altitude = (ground ?? this.altitudeM - w.aboveGroundM) + w.aboveGroundM;
    return out.copy(this.options.terrain.toWorld(p.grid.eastM + (w.eastM ?? 0), p.grid.northM + (w.northM ?? 0), altitude));
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
    this.eye.copy(f.eye);
    this.altitudeM = f.altitudeM;
    this.eastM = f.eastM;
    this.northM = f.northM;
    const view = f.view ?? DEFAULT_VIEW;
    // A picture a frame, handed to the GPU before its figure first comes on.
    if (this.renderer) for (const p of this.placed) if (p.figure.warm?.(this.renderer)) break;
    const pose = this.pose;
    for (const p of this.placed) {
      const g = p.figure.group;
      const on = p.visits.find(({ visit }) => f.flightS >= visit.fromS && f.flightS <= visit.untilS);
      pose.gaze.weight = 0;
      pose.alarm = 0;
      if (!on || !on.motion.pose(f.flightS, view, pose) || pose.presence <= 0) {
        g.visible = false;
        p.lift = -1;
        continue;
      }
      g.visible = true;
      const sizeWorld = toWorldH(p.cue.sizeM, this.scale);
      g.scale.setScalar((sizeWorld / p.figure.nativeSize) * (0.6 + 0.4 * pose.presence));
      if (pose.space === "world" && pose.world) {
        p.nearer = 1;
        this.worldPlace(p, pose.world, g.position);
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
        // Where rock would still cut it or stand before it, nearer and
        // smaller about the eye: the same picture, in front of the rock (F137).
        g.updateMatrixWorld(true);
        this.bounds.setFromObject(g).expandByScalar(0.05 * sizeWorld);
        p.nearer = clearRatio(this.eye, this.bounds, this.drawnGround, 0.02 * sizeWorld);
        if (p.nearer === 0) {
          g.visible = false;
          continue;
        }
        if (p.nearer < 1) {
          g.position.sub(this.eye).multiplyScalar(p.nearer).add(this.eye);
          g.scale.multiplyScalar(p.nearer);
        }
      }
      const frame: CastFrame = { timeS: f.timeS, flightS: f.flightS, eye: f.eye, headingRad: f.headingRad, group: g, alarm: pose.alarm, light: L, pace: this.paceOf(on.motion, f.flightS, view, p.cue.sizeM, pose.space === "frame") };
      p.figure.update(frame);
      this.look(p, pose);
    }
  }

  /**
   * How fast a figure goes by its own motion now (D96): its path read a
   * moment either side, which is where it would be at those seconds, since
   * a path is the flight's second's alone; one side only at a visit's edge.
   */
  private paceOf(motion: Motion, flightS: number, view: View, sizeM: number, withFlight: boolean): Pace {
    const scratch = this.before;
    const now = spotOf(this.pose);
    scratch.gaze.weight = 0;
    const early = motion.pose(flightS - PACE_S, view, scratch) ? spotOf(scratch) : null;
    const late = motion.pose(flightS + PACE_S, view, scratch) ? spotOf(scratch) : null;
    // Read again at now, so a place the motion shares between its poses is where the figure stands.
    motion.pose(flightS, view, scratch);
    const bodiesPerS = early && late ? paceBetween(early, late, 2 * PACE_S, sizeM) : early ? paceBetween(early, now, PACE_S, sizeM) : late ? paceBetween(now, late, PACE_S, sizeM) : 0;
    return { bodiesPerS, withFlight };
  }

  /** Its heads where its pose looks, or back to rest once it has stopped looking. */
  private look(p: Placed, pose: Pose): void {
    const heads = p.figure.heads;
    if (!heads || heads.length === 0) return;
    const w = pose.gaze.weight;
    if (w <= 0) {
      if (p.looking) restHeads(heads);
      p.looking = false;
      return;
    }
    const a = pose.gaze.at;
    const k = toWorldH(1, this.scale);
    this.at.copy(this.eye).addScaledVector(this.fwd, a.ahead * k).addScaledVector(this.right, a.right * k);
    this.at.y += a.up * k;
    p.figure.group.updateMatrixWorld(true);
    for (const h of heads) turnHead(h, this.at, w);
    p.looking = true;
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
    this.unhook();
    const s = this.options.scene;
    s.remove(this.group, this.sun, this.sky);
    if (s.fog === this.fog) s.fog = null;
    this.skin.dispose();
  }
}
