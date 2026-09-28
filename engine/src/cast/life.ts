/**
 * A painting's life (D96): the cast's seventh plug axis, beside the
 * figure, the skin, the cue, the motion, the omen and the painting (D94).
 * A painting laid on a card
 * flies like a picture however well its motion is drawn: nothing in it
 * moves. Its life is what does. The card is a fine mesh over the picture
 * and each life a module that bends it, frame by frame: a serpent's body
 * swims in a wave from head to tail, a mane streams and flutters, the
 * painted cloud it rides on churns, the whole of it noses up into a climb.
 *
 * A life reads the picture in its own pixels, as the painting's rig traced
 * it (x to the right and y down from the top left), and adds how far each
 * vertex of the mesh moves this frame to what the lives before it moved.
 * It is told only how the figure goes, as a `Stride`: how hard it works and
 * how steeply it climbs. It never knows where the figure is, which way the
 * card is mirrored, or the world's handedness (F100): the picture is bent
 * as painted and mirrored with everything else.
 *
 * Lives register themselves by being imported (`life/index.ts`), as
 * figures and motions do; `LIFE_KINDS` is the list without them, which
 * the tests hold them to. A painting names its lives view by view, each
 * with the rig its module reads, so a figure without any stays a still
 * card.
 */

export const LIFE_KINDS = ["serpent", "flutter", "churn", "flap", "gait", "sway", "pitch"] as const;

export type LifeKind = (typeof LIFE_KINDS)[number];

export function isLifeKind(kind: string): kind is LifeKind {
  return (LIFE_KINDS as readonly string[]).includes(kind);
}

/** A point of the picture, its own pixels from the top left. */
export type Px = readonly [number, number];

/**
 * A part of the picture drawn on its own, so it can move clear of the rest
 * (D96): a bird's wing, a beast's leg. It takes the picture inside its
 * shape, feathered where the shape crosses the figure (the seam), and the
 * rest of the picture gives that up. It is drawn behind the rest (a far
 * wing or leg) or in front of it (a near one). What it uncovers when it
 * moves is whatever the picture had under it, so its shape is drawn where
 * the part lies over sky, and it moves about its seam.
 *
 * Its shape is an outline, or the bands and circles it covers, which suit
 * a limb: all of them together if it has more than one.
 */
export interface Layer {
  readonly name: string;
  /** Its outline, pixels; its seam with the rest of the figure feathered over `feather` pixels. */
  readonly outline?: readonly Px[];
  readonly bands?: readonly Band[];
  readonly circles?: readonly Circle[];
  readonly feather?: number;
  readonly behind: boolean;
}

/** The picture within `radius` pixels of a line: a limb. */
export interface Band {
  readonly line: readonly Px[];
  readonly radius: number;
}

/** The pixels a layer's seam is feathered over when it names none: about a cell of the mesh. */
export const FEATHER = 28;

/** Where a layer's vertices are in a body's lists: the whole picture is first, as `picture`. */
export interface LayerSpan {
  readonly name: string;
  readonly start: number;
  readonly count: number;
}

/** What a life acts on: the card's mesh at rest, in the picture's pixels, and what the picture shows at each vertex once it has been read. */
export interface Body {
  /** The picture's size, pixels. */
  readonly width: number;
  readonly height: number;
  /**
   * x, y of each vertex at rest, pixels, row by row from the top, `across`
   * to a row: the whole grid once for the picture and once again for each
   * layer, as `layers` says where.
   */
  readonly rest: Float32Array;
  readonly across: number;
  readonly layers: readonly LayerSpan[];
  /** Where the figure's origin is, pixels: what it turns about. */
  readonly origin: Px;
  /** Which way the figure faces, or moves, in the picture. */
  readonly faces: "left" | "right";
  /**
   * r, g, b, a of the picture about each vertex, 0 to 1 and not
   * premultiplied; null until the picture has loaded and been read.
   */
  readonly colour: Float32Array | null;
}

/** How the figure goes this frame, as its lives read it. */
export interface Stride {
  /** Seconds, any origin, and since the frame before. */
  readonly timeS: number;
  readonly dt: number;
  /**
   * How hard it works: 0 at rest, about 1 keeping pace with the flight,
   * more as it hurries past that.
   */
  readonly effort: number;
  /** How steeply its path climbs, radians; below nought it dives. */
  readonly climb: number;
}

export interface Life {
  /** Add this frame's move of each vertex, pixels (x, y per vertex), to `out`, which holds what the lives before it moved. */
  move(s: Stride, out: Float32Array): void;
  /** The picture has been read: a life that goes by what it shows builds its masks now. */
  see?(body: Body): void;
}

/** A life as a painting names it: its kind, and whatever its module reads. */
export interface LifeRig {
  readonly kind: LifeKind;
}

export interface LifeModule<R extends LifeRig = LifeRig> {
  /** Throws, naming what is wrong, for a rig the module cannot read in this picture. */
  check(rig: R, width: number, height: number): void;
  /** The parts of the picture it moves on their own, if any. */
  layers?(rig: R): readonly Layer[];
  /** One figure's life, with its own seed so two of a kind are out of step. */
  build(body: Body, rig: R, seed: number): Life;
}

const modules = new Map<LifeKind, LifeModule>();

/** A module for a kind the list knows; registering one it does not is a programming error. */
export function registerLife<R extends LifeRig>(kind: R["kind"], module: LifeModule<R>): void {
  if (!isLifeKind(kind)) throw new Error(`"${kind}" is not in LIFE_KINDS; add it there first`);
  modules.set(kind, module as unknown as LifeModule);
}

export function lifeModule(kind: string): LifeModule | null {
  return isLifeKind(kind) ? (modules.get(kind) ?? null) : null;
}

export function registeredLives(): readonly LifeKind[] {
  return [...modules.keys()];
}

// Shared by the modules.

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** 0 at `a`, 1 at `b`, and a smooth step between; `a` may be past `b` to fall. */
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/**
 * A smooth, bounded wobble in two dimensions and time, -1 to 1: a few
 * sines at odd angles and rates, so it never visibly repeats inside a
 * visit. `f` is its frequency in cycles a pixel; `phase` turns it through
 * time in cycles.
 */
export function wobble(x: number, y: number, phase: number, f: number): number {
  const t = 2 * Math.PI * phase;
  const k = 2 * Math.PI * f;
  return (
    (Math.sin(k * (x + 0.3 * y) + t) +
      Math.sin(k * 1.37 * (-0.4 * x + y) + 1.3 * t + 1.7) +
      Math.sin(k * 1.74 * (0.7 * x - 0.8 * y) + 0.8 * t + 3.1) +
      Math.sin(k * 2.11 * (0.2 * x + y) + 1.7 * t + 4.2)) /
    4
  );
}

/** The cycles a second of a rhythm that runs `restHz` at rest, `cruiseHz` keeping pace, and quickens past that at `hurryHz` for each unit more of effort. */
export function cadence(effort: number, restHz: number, cruiseHz: number, hurryHz: number): number {
  const e = Math.max(0, effort);
  return e <= 1 ? restHz + (cruiseHz - restHz) * e : cruiseHz + hurryHz * (e - 1);
}

/** A share of each circle's reach a point is inside, the most of any: 1 within `core` of its radius, falling to 0 at its edge. */
export function inCircles(x: number, y: number, circles: readonly Circle[], core = 0.6): number {
  let m = 0;
  for (const c of circles) {
    const r = Math.hypot(x - c.at[0], y - c.at[1]);
    m = Math.max(m, smoothstep(c.r, c.r * core, r));
  }
  return m;
}

export interface Circle {
  readonly at: Px;
  readonly r: number;
}

/**
 * Which of several a life moves, in a picture of more than one: a walker of
 * the pilgrims, a bird of the Queen Mother's three. Its name goes before
 * its layers' names, so two walkers' legs are two sets of layers, and
 * whatever it moves as a whole, the body's rise over its legs or its wings,
 * it keeps within the circles of the picture that are it.
 */
export interface Who {
  readonly name: string;
  readonly within: readonly Circle[];
}

/** A layer's name for one of several, or for the only one. */
export function whose(name: string, who: Who | undefined): string {
  return who ? `${who.name}:${name}` : name;
}

/** How much each vertex of the body, every layer's, is of the one a life moves: all of it for the only one. */
export function shareOf(body: Body, who: Who | undefined): Float32Array | null {
  if (!who) return null;
  const n = body.rest.length / 2;
  const m = new Float32Array(n);
  for (let v = 0; v < n; v++) m[v] = inCircles(body.rest[2 * v]!, body.rest[2 * v + 1]!, who.within);
  return m;
}

/** Circles along a line, each `r` across its reach and half that apart: a band of the picture, as a churn spares a pale body. */
export function circlesAlong(line: readonly Px[], r: number): Circle[] {
  const out: Circle[] = [];
  for (let k = 0; k + 1 < line.length; k++) {
    const [ax, ay] = line[k]!;
    const [bx, by] = line[k + 1]!;
    const n = Math.max(1, Math.floor(Math.hypot(bx - ax, by - ay) / (r / 2)));
    for (let i = k === 0 ? 0 : 1; i <= n; i++) out.push({ at: [ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n], r });
  }
  return out;
}

/**
 * Add a move to a vertex of the picture and to the same point of every
 * layer's grid: a life that goes by the picture alone moves a point the
 * same wherever it is drawn, so it reckons each point once.
 */
export function moveEverywhere(body: Body, v: number, dx: number, dy: number, out: Float32Array): void {
  for (const span of body.layers) {
    const i = span.start + v;
    out[2 * i]! += dx;
    out[2 * i + 1]! += dy;
  }
}

/** How far inside an outline a point is, pixels; below nought outside it. */
export function insideBy(x: number, y: number, outline: readonly Px[]): number {
  let inside = false;
  let nearest = Infinity;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [ax, ay] = outline[i]!;
    const [bx, by] = outline[j]!;
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    const l2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2)) : 0;
    nearest = Math.min(nearest, Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))));
  }
  return inside ? nearest : -nearest;
}

/** How far from a line a point is, pixels. */
export function offLine(x: number, y: number, line: readonly Px[]): number {
  let nearest = Infinity;
  for (let k = 0; k + 1 < line.length; k++) {
    const [ax, ay] = line[k]!;
    const [bx, by] = line[k + 1]!;
    const l2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2)) : 0;
    nearest = Math.min(nearest, Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))));
  }
  return nearest;
}

/** How far inside a layer's shape a point is, pixels; below nought outside it. */
export function insideLayer(x: number, y: number, layer: Layer): number {
  let m = layer.outline ? insideBy(x, y, layer.outline) : -Infinity;
  for (const b of layer.bands ?? []) m = Math.max(m, b.radius - offLine(x, y, b.line));
  for (const c of layer.circles ?? []) m = Math.max(m, c.r - Math.hypot(x - c.at[0], y - c.at[1]));
  return m;
}

/** How much of a layer a point of the picture is, 0 to 1: its shape feathered half inside and half out. */
export function layerShare(x: number, y: number, layer: Layer): number {
  const f = layer.feather ?? FEATHER;
  return smoothstep(-f / 2, f / 2, insideLayer(x, y, layer));
}
