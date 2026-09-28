/**
 * A beast walking the air (D96). Its legs stride in the order a walking
 * animal sets its feet down, near hind, near fore, far hind, far fore, a
 * quarter of a stride apart; a person's two, near and far, half a stride
 * apart. Each leg turns about its hip or shoulder:
 * back steadily while its foot bears the body, forward quickly while it is
 * lifted, its lower leg folding back at the knee or hock as it lifts. The
 * cloud under a foot is carried level with it and pressed flat as the foot
 * comes down on it. The body rises as each leg passes under it, the
 * hindquarters and the forequarters in turn so the back rocks, and the
 * head nods.
 *
 * The painting is one moment of the stride. The rig traces each leg as
 * painted, hip, knee and foot, how thick it is and where in its swing the
 * painting caught it, and the circles of cloud under its foot. Each leg is
 * drawn on its own (a layer), the near legs in front of the body and the
 * far ones behind it, so legs and their clouds pass over one another
 * rather than stretching the sky between them; the body about a hip goes
 * with its leg, so the seam there never shows. What a leg uncovers as it
 * swings is the sky beside it: the legs must stand clear of the body below
 * it, as a beast painted walking from the side has them.
 *
 * A leg painted into what it stands in (the pilgrims' feet sunk in their
 * road of cloud) is not drawn on its own, since it would leave a hole in
 * the cloud where it stood: the picture about it is bent with it, so its
 * foot wades, the cloud stretching about it. A leg too slight to draw
 * apart from the one beside it (a turtle's far flipper against the near)
 * may be painted all the way back, so it swings only forward, behind the
 * near one, and never uncovers the edge of it it carries.
 */
import { cadence, inCircles, insideLayer, registerLife, shareOf, smoothstep, whose, type Body, type Circle, type Layer, type Life, type LifeRig, type Px, type Stride, type Who } from "../life.js";

export type Foot = "near-hind" | "near-fore" | "far-hind" | "far-fore" | "near" | "far";

/** Where in a stride each foot comes down, a share of it after the near hind's: a walk's four even beats, or a person's two. */
export const BEAT: Readonly<Record<Foot, number>> = { "near-hind": 0, "near-fore": 0.25, "far-hind": 0.5, "far-fore": 0.75, near: 0, far: 0.5 };

/** A person's feet, which do not go with a beast's in one gait. */
const TWO: readonly Foot[] = ["near", "far"];

export interface Leg {
  readonly foot: Foot;
  /** Its hip or shoulder, its knee or hock, and its foot, pixels, as painted. */
  readonly line: readonly [Px, Px, Px];
  /** Half its thickness, pixels: the leg is drawn on its own within this of its line, feathered into the sky past it. */
  readonly radius: number;
  /** The cloud it treads, circles of the picture carried level with its foot. */
  readonly cloud?: readonly Circle[];
  /** Circles of the picture off its line that turn with it all the same: a paw tucked behind it. */
  readonly with?: readonly Circle[];
  /** Where in its swing the painting caught it: -1 all the way back, 1 all the way forward. */
  readonly painted: number;
  /** Painted into what it stands in: bent with the picture, not drawn on its own. */
  readonly inPicture?: boolean;
  /** Half the arc it swings through, radians, if less than the gait's: a leg with less room to swing in. */
  readonly swing?: number;
  /** Where in a stride it comes down, a share after the near hind's, if not as its foot's in a walk: a turtle's hind flippers stroke together. */
  readonly beat?: number;
}

export interface GaitRig extends LifeRig {
  readonly kind: "gait";
  readonly legs: readonly Leg[];
  /** Strides a second keeping pace with the flight: each foot comes down once a stride. */
  readonly strideHz: number;
  /** Half the arc a leg swings through, radians. */
  readonly swing: number;
  /** How far the lower leg folds back at the top of its lift, radians. */
  readonly fold?: number;
  /** How far the body rises and falls over its legs, pixels. */
  readonly bob: number;
  /** The head, circles of the picture, and how far it nods, pixels. */
  readonly head?: { readonly regions: readonly Circle[]; readonly nod: number };
  /** Which walker it is, in a picture of several. */
  readonly who?: Who;
}

/** The share of a stride each foot bears the body: a walk's, over half. */
export const DUTY = 0.6;
/** How far a lower leg folds back at the top of its lift, radians, when the rig names none. */
export const FOLD = 0.35;
/** How much a foot's cloud flattens as it comes down, a share of its size, and how soon it springs back, a share of a stride. */
export const PRESS = 0.1;
export const SPRING = 0.07;
/** How far past a leg's shape the body about it partly goes with it, a share of its radius. */
export const SOFT = 0.5;

export function gait(rig: Omit<GaitRig, "kind">): GaitRig {
  return { kind: "gait", ...rig };
}

/**
 * Where a leg is in its swing at a share of its stride from its foot coming
 * down, -1 all the way back to 1 all the way forward: back at an even pace
 * while the foot bears the body, then forward, lifted, leaving and
 * arriving at that pace so the leg never jerks.
 */
export function swingAt(p: number, duty = DUTY): number {
  const q = p - Math.floor(p);
  if (q < duty) return 1 - (2 * q) / duty;
  const s = (q - duty) / (1 - duty);
  // A cubic from -1 to 1 whose ends run at the stance's pace.
  const m = (-2 * (1 - duty)) / duty;
  const s2 = s * s;
  const s3 = s2 * s;
  return -(2 * s3 - 3 * s2 + 1) + m * (s3 - 2 * s2 + s) + (-2 * s3 + 3 * s2) + m * (s3 - s2);
}

/** How high a foot is lifted at a share of its stride, 0 while it bears the body to 1 midway through its swing. */
export function liftAt(p: number, duty = DUTY): number {
  const q = p - Math.floor(p);
  return q < duty ? 0 : Math.sin((Math.PI * (q - duty)) / (1 - duty));
}

/** A leg's name as a layer, one of several walkers' if `who` says which. */
export function legLayer(foot: Foot, who?: Who): string {
  return whose(`leg-${foot}`, who);
}

/** A leg's layer is feathered narrowly: its edge lies in the sky, and a wide one would take in the clouds of the legs beside it. */
export const LEG_FEATHER = 16;

/**
 * A leg's layer. A far leg's is drawn behind the body, and the lower of two
 * layers is drawn whole a little past its feather: its circles are drawn in
 * by a feather's width, or it would take in a sliver of the cloud of the
 * leg beside it and carry it off.
 */
function shapeOf(leg: Leg, who?: Who): Layer {
  const behind = leg.foot.startsWith("far");
  if (leg.inPicture) return { name: legLayer(leg.foot, who), bands: [{ line: leg.line, radius: leg.radius }], circles: [...(leg.cloud ?? []), ...(leg.with ?? [])], behind };
  const circles = [...(leg.cloud ?? []), ...(leg.with ?? [])].map((c) => (behind ? { at: c.at, r: Math.max(c.r / 2, c.r - LEG_FEATHER) } : c));
  return { name: legLayer(leg.foot, who), bands: [{ line: leg.line, radius: leg.radius }], circles, feather: LEG_FEATHER, behind };
}

/** A leg bound to the vertices it moves: the body's about its hip, and its own. */
interface Bound {
  readonly leg: Leg;
  readonly beat: number;
  readonly verts: Int32Array;
  /**
   * Each vertex's share of the turn at the hip and of the fold at the knee;
   * how much the leg holds it; and how much of it is the cloud under the
   * foot, which is carried level with the foot rather than turned with the
   * leg, and pressed.
   */
  readonly atHip: Float32Array;
  readonly atKnee: Float32Array;
  readonly held: Float32Array;
  readonly level: Float32Array;
  /** The middle of its cloud, pixels, which it presses flat about. */
  readonly cx: number;
  readonly cy: number;
}

/**
 * How much of a foot's cloud a point is: all of it out a cell of the mesh
 * past the edge of the cloud's layer, so its last wisps go with it, and
 * none a cell further, in the clear sky.
 */
function onCloud(x: number, y: number, cloud: readonly Circle[], cell: number): number {
  let m = 0;
  for (const c of cloud) m = Math.max(m, smoothstep(c.r + LEG_FEATHER / 2 + 2 * cell, c.r + LEG_FEATHER / 2 + cell, Math.hypot(x - c.at[0], y - c.at[1])));
  return m;
}

/** How far a point lies along a line from `a` toward `b`, pixels. */
function along(x: number, y: number, [ax, ay]: Px, [bx, by]: Px): number {
  const l = Math.hypot(bx - ax, by - ay);
  return ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l;
}

class Gait implements Life {
  private phase: number;
  private readonly legs: Bound[];
  /** Each vertex's share of the forequarters' rise rather than the hindquarters', and of the head's nod. */
  private readonly fore: Float32Array;
  private readonly head: Float32Array | null;
  /** How much of each vertex is the walker, in a picture of several. */
  private readonly share: Float32Array | null;
  private readonly dir: number;

  constructor(private readonly body: Body, private readonly rig: GaitRig, seed: number) {
    this.phase = ((seed >>> 12) % 1000) / 1000;
    this.dir = body.faces === "right" ? 1 : -1;
    const count = body.rest.length / 2;
    const rest = body.rest;
    const picture = body.layers[0]!;
    const shapes = rig.legs.map((leg) => shapeOf(leg, rig.who));
    // How far the body about each leg goes with it: all of it across the leg's seam, less out to `SOFT` past, shared where two legs reach;
    // and all of its cloud, though a far leg's layer is drawn in from the rim, so no wisp of it is left behind.
    const holds = rig.legs.map((leg, k) => {
      const shape: Layer = { ...shapes[k]!, circles: [...(leg.cloud ?? []), ...(leg.with ?? [])] };
      // A leg in the picture holds all of it within its line's reach, and bends what is about it over as far again.
      const [from, to] = leg.inPicture ? [-leg.radius, 0] : [-LEG_FEATHER / 2 - (LEG_FEATHER / 2 + SOFT * leg.radius), -LEG_FEATHER / 2];
      const w = new Float32Array(picture.count);
      for (let v = 0; v < picture.count; v++) {
        const i = picture.start + v;
        w[v] = smoothstep(from, to, insideLayer(rest[2 * i]!, rest[2 * i + 1]!, shape));
      }
      return w;
    });
    for (let v = 0; v < picture.count; v++) {
      let sum = 0;
      for (const w of holds) sum += w[v]!;
      if (sum > 1) for (const w of holds) w[v]! /= sum;
    }
    const cell = body.width / (body.across - 1);
    this.legs = rig.legs.map((leg, k) => {
      const [hip, knee, foot] = leg.line;
      const upper = Math.hypot(knee[0] - hip[0], knee[1] - hip[1]);
      const lower = Math.hypot(foot[0] - knee[0], foot[1] - knee[1]);
      const own = leg.inPicture ? undefined : body.layers.find((l) => l.name === legLayer(leg.foot, rig.who));
      const verts: number[] = [];
      const held: number[] = [];
      for (let v = 0; v < picture.count; v++) {
        if (holds[k]![v]! > 1e-3) {
          verts.push(picture.start + v);
          held.push(holds[k]![v]!);
        }
      }
      // Its own layer wholly, wherever a cell of it may show: out past its feather by the cell it is made whole across, and a cell more.
      if (own) {
        for (let v = 0; v < own.count; v++) {
          const i = own.start + v;
          if (insideLayer(rest[2 * i]!, rest[2 * i + 1]!, shapes[k]!) < -LEG_FEATHER / 2 - 3 * cell) continue;
          verts.push(i);
          held.push(1);
        }
      }
      const atHip = new Float32Array(verts.length);
      const atKnee = new Float32Array(verts.length);
      const level = new Float32Array(verts.length);
      verts.forEach((v, i) => {
        const x = rest[2 * v]!;
        const y = rest[2 * v + 1]!;
        // The turn grows from nothing at the hip, so the body above it keeps still, to all of it halfway to the knee.
        atHip[i] = held[i]! * smoothstep(0, 0.5 * upper, along(x, y, hip, knee));
        atKnee[i] = held[i]! * smoothstep(-0.15 * lower, 0.25 * lower, along(x, y, knee, foot));
        level[i] = onCloud(x, y, leg.cloud ?? [], cell);
      });
      let cx = foot[0];
      let cy = foot[1];
      if (leg.cloud?.length) {
        cx = leg.cloud.reduce((s, c) => s + c.at[0], 0) / leg.cloud.length;
        cy = leg.cloud.reduce((s, c) => s + c.at[1], 0) / leg.cloud.length;
      }
      return { leg, beat: leg.beat ?? BEAT[leg.foot], verts: Int32Array.from(verts), atHip, atKnee, held: Float32Array.from(held), level, cx, cy };
    });
    // The back rocks between the hips and the shoulders.
    // A person's legs rise the body as a beast's hind legs do: all of it together.
    const xs = (end: "hind" | "fore") => rig.legs.filter((l) => l.foot.endsWith("fore") === (end === "fore")).map((l) => l.line[0][0]);
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    const hinds = xs("hind");
    const fores = xs("fore");
    const hindX = hinds.length ? mean(hinds) : body.width * (this.dir > 0 ? 0.3 : 0.7);
    const foreX = fores.length ? mean(fores) : body.width * (this.dir > 0 ? 0.7 : 0.3);
    this.fore = new Float32Array(count);
    for (let v = 0; v < count; v++) this.fore[v] = smoothstep(hindX, foreX, rest[2 * v]!);
    this.share = shareOf(body, rig.who);
    this.head = null;
    if (rig.head) {
      const head = new Float32Array(count);
      for (let v = 0; v < count; v++) head[v] = inCircles(rest[2 * v]!, rest[2 * v + 1]!, rig.head.regions);
      this.head = head;
    }
  }

  move(st: Stride, out: Float32Array): void {
    const rig = this.rig;
    this.phase = (this.phase + st.dt * cadence(st.effort, 0.4 * rig.strideHz, rig.strideHz, 0.3 * rig.strideHz)) % 1;
    // Longer strides the harder it works, and short ones as it idles.
    const reach = 0.6 + 0.4 * Math.min(1.5, st.effort);
    const fold = (rig.fold ?? FOLD) * reach;
    const rest = this.body.rest;
    let foreRise = 0;
    let hindRise = 0;
    let fores = 0;
    let hinds = 0;
    let foreBeat = BEAT["near-fore"];
    for (const b of this.legs) {
      const p = this.phase + b.beat;
      // The body is highest over a leg midway through its stance, twice a stride for the pair.
      const rise = Math.cos(4 * Math.PI * (p - DUTY / 2));
      if (b.leg.foot.endsWith("fore")) {
        foreRise += rise;
        fores++;
        foreBeat = b.beat;
      } else {
        hindRise += rise;
        hinds++;
      }
      const turn = this.dir * (b.leg.swing ?? rig.swing) * reach * (swingAt(p) - b.leg.painted);
      const bend = -this.dir * fold * liftAt(p);
      const q = p - Math.floor(p);
      const press = PRESS * reach * Math.exp(-q / SPRING);
      const [[hx, hy], [kx, ky], [fx, fy]] = b.leg.line;
      // Where the knee has gone with the leg's turn at the hip, and the foot with that and the fold.
      const c = Math.cos(turn);
      const s = Math.sin(turn);
      const cb = Math.cos(bend);
      const sb = Math.sin(bend);
      const kx1 = hx + (kx - hx) * c + (ky - hy) * s;
      const ky1 = hy - (kx - hx) * s + (ky - hy) * c;
      const fx0 = hx + (fx - hx) * c + (fy - hy) * s - kx1;
      const fy0 = hy - (fx - hx) * s + (fy - hy) * c - ky1;
      const footX = kx1 + fx0 * cb + fy0 * sb - fx;
      const footY = ky1 - fx0 * sb + fy0 * cb - fy;
      for (let i = 0; i < b.verts.length; i++) {
        const v = b.verts[i]!;
        const x = rest[2 * v]!;
        const y = rest[2 * v + 1]!;
        const h = b.held[i]!;
        const l = b.level[i]!;
        let dx = 0;
        let dy = 0;
        if (l < 1) {
          // Turned at the hip (x to the right, y down: a turn forward swings the foot toward the way it faces).
          const w1 = b.atHip[i]!;
          const c1 = w1 === 1 ? c : Math.cos(turn * w1);
          const s1 = w1 === 1 ? s : Math.sin(turn * w1);
          let x1 = hx + (x - hx) * c1 + (y - hy) * s1;
          let y1 = hy - (x - hx) * s1 + (y - hy) * c1;
          // Then folded at the knee, where the knee now is.
          const w2 = b.atKnee[i]!;
          if (w2 > 0 && bend !== 0) {
            const c2 = w2 === 1 ? cb : Math.cos(bend * w2);
            const s2 = w2 === 1 ? sb : Math.sin(bend * w2);
            const rx = x1 - kx1;
            const ry = y1 - ky1;
            x1 = kx1 + rx * c2 + ry * s2;
            y1 = ky1 - rx * s2 + ry * c2;
          }
          dx = (1 - l) * (x1 - x);
          dy = (1 - l) * (y1 - y);
        }
        // Its cloud carried level with the foot, and spread and flattened as the foot comes down on it.
        const m = press * l * h;
        out[2 * v]! += dx + l * h * footX + m * (x - b.cx);
        out[2 * v + 1]! += dy + l * h * footY - m * (y - b.cy);
      }
    }
    // The body's rise: y is down, so up is less.
    const bob = 0.5 * rig.bob * reach;
    const fr = fores ? (bob * foreRise) / fores : 0;
    const hr = hinds ? (bob * hindRise) / hinds : fr;
    const f = fores ? fr : hr;
    const nod = rig.head ? 0.5 * rig.head.nod * reach * Math.cos(4 * Math.PI * (this.phase + foreBeat - DUTY / 2) - 1) : 0;
    const share = this.share;
    for (let v = 0; v < this.fore.length; v++) {
      const k = this.fore[v]!;
      out[2 * v + 1]! -= (k * f + (1 - k) * hr) * (share ? share[v]! : 1);
      if (this.head) out[2 * v + 1]! += nod * this.head[v]!;
    }
  }
}

function checkLeg(leg: Leg, width: number, height: number): void {
  const slack = 0.1;
  for (const [x, y] of leg.line) {
    if (!(x >= -slack * width && x <= (1 + slack) * width && y >= -slack * height && y <= (1 + slack) * height)) throw new Error(`the ${leg.foot} leg reaches off its picture at ${x}, ${y}`);
  }
  const [[hx, hy], [kx, ky], [fx, fy]] = leg.line;
  if (Math.hypot(kx - hx, ky - hy) < 1 || Math.hypot(fx - kx, fy - ky) < 1) throw new Error(`the ${leg.foot} leg's hip, knee and foot must stand apart`);
  if (!(leg.radius > 0)) throw new Error(`the ${leg.foot} leg's radius must be above nought`);
  if (!(leg.painted >= -1 && leg.painted <= 1)) throw new Error(`the ${leg.foot} leg is painted within its swing, -1 to 1`);
  if (leg.swing !== undefined && !(leg.swing > 0 && leg.swing < 0.8)) throw new Error(`the ${leg.foot} leg's swing must be above nought and under 0.8 radians`);
  if (leg.beat !== undefined && !(leg.beat >= 0 && leg.beat < 1)) throw new Error(`the ${leg.foot} leg's beat must be a share of a stride, 0 to 1`);
  for (const c of [...(leg.cloud ?? []), ...(leg.with ?? [])]) if (!(c.r > 0)) throw new Error(`the ${leg.foot} leg's circles must have a radius above nought`);
}

registerLife<GaitRig>("gait", {
  check(rig, width, height) {
    if (rig.legs.length === 0) throw new Error("a gait needs a leg");
    const feet = new Set<Foot>();
    for (const leg of rig.legs) {
      if (!(leg.foot in BEAT)) throw new Error(`"${leg.foot}" is not a foot`);
      if (feet.has(leg.foot)) throw new Error(`a gait has one ${leg.foot} leg`);
      feet.add(leg.foot);
      checkLeg(leg, width, height);
    }
    if (!(rig.strideHz > 0)) throw new Error("a gait's strides a second must be above nought");
    if (!(rig.swing > 0 && rig.swing < 0.8)) throw new Error("a gait's swing must be above nought and under 0.8 radians");
    if (rig.fold !== undefined && !(rig.fold >= 0 && rig.fold <= 1.2)) throw new Error("a gait's fold must be within 0 and 1.2 radians");
    if (!(rig.bob >= 0)) throw new Error("a gait's bob must not be below nought");
    if (rig.head && !(rig.head.regions.length > 0)) throw new Error("a gait's head needs a region");
    if (rig.who && rig.who.within.length === 0) throw new Error(`${rig.who.name}'s gait needs a circle to keep within`);
    if (rig.legs.some((l) => TWO.includes(l.foot)) && rig.legs.some((l) => !TWO.includes(l.foot))) throw new Error("a gait is a beast's four feet or a person's two, not both");
  },
  layers: (rig) => rig.legs.filter((leg) => !leg.inPicture).map((leg) => shapeOf(leg, rig.who)),
  build: (body, rig, seed) => new Gait(body, rig, seed),
});
