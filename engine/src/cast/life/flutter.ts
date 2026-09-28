/**
 * Loose parts fluttering (D96): a mane, whiskers, plumes, a sash, a
 * pennant; flames, which do it quicker. They trail from where they grow and stir in the air the figure
 * makes, the more the further they reach from their root and the faster it
 * goes, and never in step with the body that carries them.
 *
 * The rig is where they grow from and the circles of the picture they fill,
 * with any circles inside those that must keep still: an antler in a mane,
 * a face under hair.
 */
import { cadence, clamp01, inCircles, moveEverywhere, registerLife, wobble, type Body, type Circle, type Life, type LifeRig, type Px, type Stride } from "../life.js";

export interface FlutterRig extends LifeRig {
  readonly kind: "flutter";
  /** Where the loose parts grow from, pixels: they move more the further from it they reach. */
  readonly root: Px;
  /** The circles of the picture they fill. */
  readonly regions: readonly Circle[];
  /** Circles inside those that keep still. */
  readonly stiff?: readonly Circle[];
  /** How far their furthest tips stir, pixels. */
  readonly stir: number;
  /** The size of a ripple along them, pixels. */
  readonly ripple?: number;
  /** How many times quicker than cloth they stir: flames lick. */
  readonly pace?: number;
}

/** Stirs a second: in still air, keeping pace with the flight, and quicker for each unit more of effort. */
export const REST_HZ = 0.35;
export const CRUISE_HZ = 0.8;
export const HURRY_HZ = 0.4;
/** A ripple's length along the loose parts, pixels of the picture, when the rig names none. */
export const RIPPLE = 160;

export function flutter(rig: Omit<FlutterRig, "kind">): FlutterRig {
  return { kind: "flutter", ...rig };
}

class Flutter implements Life {
  private phase: number;
  /** The points of the picture that stir, and how far, as a share of the rig's `stir`. */
  private readonly at: Int32Array;
  private readonly free: Float32Array;

  constructor(private readonly body: Body, private readonly rig: FlutterRig, seed: number) {
    this.phase = ((seed >>> 10) % 1000) / 1000;
    let far = 0;
    for (const c of rig.regions) far = Math.max(far, Math.hypot(c.at[0] - rig.root[0], c.at[1] - rig.root[1]) + c.r);
    const at: number[] = [];
    const free: number[] = [];
    // The picture's grid: every layer's is the same points again.
    for (let v = 0; v < body.layers[0]!.count; v++) {
      const x = body.rest[2 * v]!;
      const y = body.rest[2 * v + 1]!;
      const m = inCircles(x, y, rig.regions) * (1 - inCircles(x, y, rig.stiff ?? [], 0.8)) * clamp01(Math.hypot(x - rig.root[0], y - rig.root[1]) / far);
      if (m === 0) continue;
      at.push(v);
      free.push(m);
    }
    this.at = Int32Array.from(at);
    this.free = Float32Array.from(free);
  }

  move(st: Stride, out: Float32Array): void {
    this.phase += st.dt * (this.rig.pace ?? 1) * cadence(st.effort, REST_HZ, CRUISE_HZ, HURRY_HZ);
    const f = 1 / (this.rig.ripple ?? RIPPLE);
    const stir = this.rig.stir * (0.6 + 0.4 * Math.min(1.5, st.effort));
    const rest = this.body.rest;
    for (let k = 0; k < this.at.length; k++) {
      const v = this.at[k]!;
      const m = this.free[k]! * stir;
      const x = rest[2 * v]!;
      const y = rest[2 * v + 1]!;
      moveEverywhere(this.body, v, m * wobble(x, y, this.phase, f), m * wobble(y + 97, x - 41, this.phase + 0.3, f), out);
    }
  }
}

registerLife<FlutterRig>("flutter", {
  check(rig) {
    if (rig.regions.length === 0) throw new Error("a flutter needs a region to fill");
    if (!(rig.stir > 0)) throw new Error("a flutter's stir must be above nought");
    if (rig.pace !== undefined && !(rig.pace > 0)) throw new Error("a flutter's pace must be above nought");
  },
  build: (body, rig, seed) => new Flutter(body, rig, seed),
});
