/**
 * A bird's wings beating (D96). Each wing is a part of the picture drawn on
 * its own (a layer): the near wing in front of the body, the far one
 * behind it. A wing turns about its hinge, the line where it meets the
 * body, as a plate turns about an edge seen from the side: it reaches
 * further or less far across its hinge, and past it, shows its other side.
 * The painting is one moment of the stroke; the rig says how far each wing
 * reaches, as a share of how it is painted, at the top of the stroke and at
 * the bottom, and while it glides.
 *
 * The downstroke is the longer half, the tips lag the root so the wing
 * bends through each turn, and the body rises on every downstroke. A bird
 * beats in bursts and glides between them if its kind does; it glides
 * whenever it dives and beats whenever it climbs, and beats quicker the
 * harder it works. Since the hinge is the seam, what a wing uncovers is
 * sky and the body behind it is the body as painted: nothing is painted in.
 */
import { cadence, FEATHER, insideBy, registerLife, shareOf, whose, type Body, type Layer, type Life, type LifeRig, type Px, type Stride, type Who } from "../life.js";

export interface Wing {
  /** The wing where it lies over sky, pixels, its seam with the body along its hinge. */
  readonly outline: readonly Px[];
  /** Two points on its seam, pixels: the line it turns about. */
  readonly hinge: readonly [Px, Px];
  /**
   * How far across its hinge it reaches, as a share of how it is painted:
   * at the top of its stroke, at the bottom, and held while it glides.
   * Below nought it has swung over its hinge and shows its other side.
   */
  readonly top: number;
  readonly bottom: number;
  readonly glide?: number;
  /** The seam's feather, pixels. */
  readonly feather?: number;
  /**
   * A far wing drawn in front of the picture rather than behind it: one
   * painted over something beside the bird, a robe, which it would go
   * behind as it beat. It reaches no less far than painted, so it never
   * uncovers what it lies over.
   */
  readonly front?: boolean;
}

export interface FlapRig extends LifeRig {
  readonly kind: "flap";
  readonly near: Wing;
  readonly far?: Wing;
  /** Wingbeats a second keeping pace with the flight. */
  readonly beatHz: number;
  /** Beats in a burst, and seconds it glides between bursts: none flaps on. */
  readonly burst?: number;
  readonly rest?: number;
  /** How far the body rises from the top of a downstroke to its bottom, pixels. */
  readonly bob: number;
  /** Which bird it is, in a picture of several. */
  readonly who?: Who;
}

/** The share of a beat the downstroke takes. */
export const DOWN = 0.55;
/** How late the tip is behind the root, a share of a beat. */
export const TIP_LAG = 0.15;
/** It glides when its path dives more steeply than this, radians, and beats when it climbs more steeply than `CLIMB`. */
export const DIVE = -0.12;
export const CLIMB = 0.08;
/** Seconds it takes to go from gliding to beating and back. */
export const TAKE_S = 0.25;

export const NEAR = "wing-near";
export const FAR = "wing-far";

export function flap(rig: Omit<FlapRig, "kind">): FlapRig {
  return { kind: "flap", ...rig };
}

/** How far through its stroke a wing is at a share of a beat: 0 at the top, 1 at the bottom, down in `DOWN` of the beat and up in the rest. */
export function strokeAt(phase: number): number {
  const p = phase - Math.floor(phase);
  const w = p < DOWN ? (0.5 * p) / DOWN : 0.5 + (0.5 * (p - DOWN)) / (1 - DOWN);
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * w);
}

/** A wing's reach across its hinge at a point of its stroke, beating by `beating` (0 gliding to 1). */
export function reachAt(wing: Wing, stroke: number, beating: number): number {
  const glide = wing.glide ?? (wing.top + wing.bottom) / 2;
  return glide + beating * (wing.top + (wing.bottom - wing.top) * stroke - glide);
}

/** A wing bound to the vertices of its layer that may show: on its side of its hinge, and within a few cells of its outline. */
interface Bound {
  readonly wing: Wing;
  readonly verts: Int32Array;
  readonly nx: number;
  readonly ny: number;
  /** Each vertex's distance across the hinge, pixels, and how far out along the wing it is (0 at the hinge, 1 at its furthest). */
  readonly across: Float32Array;
  readonly out: Float32Array;
}

function bind(body: Body, wing: Wing, name: string): Bound | null {
  const span = body.layers.find((l) => l.name === name);
  if (!span) return null;
  const [[ax, ay], [bx, by]] = wing.hinge;
  const l = Math.hypot(bx - ax, by - ay);
  const nx = -(by - ay) / l;
  const ny = (bx - ax) / l;
  const acrossOf = (x: number, y: number) => (x - ax) * nx + (y - ay) * ny;
  // The wing's side of its hinge, and how far it reaches there.
  let cx = 0;
  let cy = 0;
  for (const [x, y] of wing.outline) {
    cx += x / wing.outline.length;
    cy += y / wing.outline.length;
  }
  const side = Math.sign(acrossOf(cx, cy)) || 1;
  let reach = 1;
  for (const [x, y] of wing.outline) reach = Math.max(reach, side * acrossOf(x, y));
  // A cell of the layer is drawn only where its share, made whole a cell past its feather, reaches: three cells is room enough.
  const margin = (wing.feather ?? FEATHER) / 2 + (3 * body.width) / (body.across - 1);
  const verts: number[] = [];
  const across: number[] = [];
  const out: number[] = [];
  for (let k = 0; k < span.count; k++) {
    const v = span.start + k;
    const x = body.rest[2 * v]!;
    const y = body.rest[2 * v + 1]!;
    const b = acrossOf(x, y);
    if (side * b <= 0 || insideBy(x, y, wing.outline) < -margin) continue;
    verts.push(v);
    across.push(b);
    out.push(Math.min(1, (side * b) / reach));
  }
  return { wing, verts: Int32Array.from(verts), nx, ny, across: Float32Array.from(across), out: Float32Array.from(out) };
}

class Flap implements Life {
  private phase = 0;
  private beating = 1;
  private beats = 0;
  private resting = 0;
  private readonly wings: Bound[];
  /** In a picture of several, the vertices that are the bird, and how much. */
  private readonly mine: { readonly at: Int32Array; readonly m: Float32Array } | null;

  constructor(body: Body, private readonly rig: FlapRig, seed: number) {
    this.phase = ((seed >>> 8) % 1000) / 1000;
    this.wings = [bind(body, rig.near, whose(NEAR, rig.who)), rig.far ? bind(body, rig.far, whose(FAR, rig.who)) : null].filter((w): w is Bound => w !== null);
    const share = shareOf(body, rig.who);
    this.mine = null;
    if (share) {
      const at: number[] = [];
      for (let v = 0; v < share.length; v++) if (share[v]! > 0) at.push(v);
      this.mine = { at: Int32Array.from(at), m: Float32Array.from(at, (v) => share[v]!) };
    }
  }

  move(st: Stride, out: Float32Array): void {
    const rig = this.rig;
    // Beat or glide: glide down a dive, beat up a climb, and otherwise as its kind does, in bursts or on and on.
    if (this.resting > 0) {
      this.resting -= st.dt;
      if (this.resting <= 0) this.phase = 0;
    }
    const wants = st.climb < DIVE ? 0 : st.climb > CLIMB || this.resting <= 0 ? 1 : 0;
    this.beating += (wants - this.beating) * (1 - Math.exp(-st.dt / TAKE_S));
    if (wants > 0 || this.beating > 0.02) {
      const before = Math.floor(this.phase);
      this.phase += st.dt * cadence(st.effort, 0.8 * rig.beatHz, rig.beatHz, 0.25 * rig.beatHz);
      if (Math.floor(this.phase) > before && rig.burst && rig.rest && st.climb <= CLIMB && ++this.beats >= rig.burst) {
        this.beats = 0;
        this.resting = rig.rest;
      }
    }
    const beating = this.beating;
    const stroke = strokeAt(this.phase);
    for (const w of this.wings) {
      for (let k = 0; k < w.verts.length; k++) {
        const u = w.out[k]!;
        // The tip a little behind the root, so the wing bends through each turn.
        const f = reachAt(w.wing, strokeAt(this.phase - TIP_LAG * u), beating);
        const d = (f - 1) * w.across[k]!;
        const v = w.verts[k]!;
        out[2 * v]! += d * w.nx;
        out[2 * v + 1]! += d * w.ny;
      }
    }
    // The body lowest as the wings come over the top, highest as they finish the downstroke.
    const bob = rig.bob * beating * (0.5 - stroke);
    const mine = this.mine;
    if (mine) for (let k = 0; k < mine.at.length; k++) out[2 * mine.at[k]! + 1]! += bob * mine.m[k]!;
    else for (let v = 1; v < out.length; v += 2) out[v]! += bob;
  }
}

function checkWing(wing: Wing, width: number, height: number, which: string): void {
  if (wing.outline.length < 3) throw new Error(`the ${which} wing's outline needs three points at least`);
  const slack = 0.1;
  for (const [x, y] of [...wing.outline, ...wing.hinge]) {
    if (!(x >= -slack * width && x <= (1 + slack) * width && y >= -slack * height && y <= (1 + slack) * height)) throw new Error(`the ${which} wing reaches off its picture at ${x}, ${y}`);
  }
  const [[ax, ay], [bx, by]] = wing.hinge;
  if (Math.hypot(bx - ax, by - ay) < 1) throw new Error(`the ${which} wing's hinge needs two points apart`);
  for (const f of [wing.top, wing.bottom, wing.glide ?? 0]) if (!(f >= -1.2 && f <= 1.3)) throw new Error(`the ${which} wing's reach must be within -1.2 and 1.3 of as painted`);
  if (wing.front && Math.min(wing.top, wing.bottom, wing.glide ?? 1) < 1) throw new Error(`the ${which} wing is drawn in front, so it must reach no less far than painted`);
}

registerLife<FlapRig>("flap", {
  check(rig, width, height) {
    checkWing(rig.near, width, height, "near");
    if (rig.far) checkWing(rig.far, width, height, "far");
    if (!(rig.beatHz > 0)) throw new Error("a flap's beats a second must be above nought");
    if ((rig.burst === undefined) !== (rig.rest === undefined)) throw new Error("a flap's burst and rest go together");
    if (rig.who && rig.who.within.length === 0) throw new Error(`${rig.who.name}'s flap needs a circle to keep within`);
  },
  layers(rig): Layer[] {
    const near: Layer = { name: whose(NEAR, rig.who), outline: rig.near.outline, behind: false, ...(rig.near.feather ? { feather: rig.near.feather } : {}) };
    if (!rig.far) return [near];
    return [near, { name: whose(FAR, rig.who), outline: rig.far.outline, behind: !rig.far.front, ...(rig.far.feather ? { feather: rig.far.feather } : {}) }];
  },
  build: (body, rig, seed) => new Flap(body, rig, seed),
});
