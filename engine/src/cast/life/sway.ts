/**
 * A person standing on the air (D96): on a cloud, on wheels of fire, on a
 * lotus throne. They keep their balance as a person standing in a boat
 * does, leaning a little over their feet one way and then the other, never
 * in time. Their feet keep where they are painted, and the lean grows from
 * nothing at the knees to the most at the crown, so what they stand on
 * keeps still under them. One who walks steps with a gait as well, on two
 * feet.
 *
 * The rig is where the feet are and how high the crown, and how far it
 * leans. A picture of several (the Eight Immortals abreast) gives each its
 * own sway, kept within the circles that are them, so no two lean together.
 */
import { cadence, moveEverywhere, registerLife, shareOf, smoothstep, type Body, type Life, type LifeRig, type Px, type Stride, type Who } from "../life.js";

export interface SwayRig extends LifeRig {
  readonly kind: "sway";
  /** Where they stand, pixels: between the feet, which keep still. */
  readonly feet: Px;
  /** The top of them, pixels down from the top of the picture. */
  readonly crown: number;
  /** How far the crown leans either way, pixels. */
  readonly lean: number;
  readonly who?: Who;
}

/** Leans a second: at rest, keeping pace, and quicker for each unit more of effort. Balance is slow. */
export const REST_HZ = 0.1;
export const CRUISE_HZ = 0.16;
export const HURRY_HZ = 0.06;
/** The share of their height, from the feet, over which the lean grows from nothing: the legs. */
export const LEGS = 0.3;

export function sway(rig: Omit<SwayRig, "kind">): SwayRig {
  return { kind: "sway", ...rig };
}

/** Which way and how far they lean at a point of their balance, -1 to 1: two slow sways out of step, so it never ticks. */
export function leanAt(phase: number): number {
  return 0.65 * Math.sin(2 * Math.PI * phase) + 0.35 * Math.sin(2 * Math.PI * 1.618 * phase + 1.3);
}

class Sway implements Life {
  private phase: number;
  /** For each point of the picture's grid, its share of the lean. */
  private readonly at: Int32Array;
  private readonly leans: Float32Array;
  private readonly height: number;

  constructor(private readonly body: Body, private readonly rig: SwayRig, seed: number) {
    this.phase = ((seed >>> 6) % 1000) / 1000;
    const [, fy] = rig.feet;
    this.height = fy - rig.crown;
    const share = shareOf(body, rig.who);
    const at: number[] = [];
    const leans: number[] = [];
    // The picture's grid: every layer's is the same points again.
    for (let v = 0; v < body.layers[0]!.count; v++) {
      const y = body.rest[2 * v + 1]!;
      const lean = (share ? share[v]! : 1) * smoothstep(fy, fy - LEGS * this.height, y);
      if (lean === 0) continue;
      at.push(v);
      leans.push(lean);
    }
    this.at = Int32Array.from(at);
    this.leans = Float32Array.from(leans);
  }

  move(st: Stride, out: Float32Array): void {
    const rig = this.rig;
    this.phase += st.dt * cadence(st.effort, REST_HZ, CRUISE_HZ, HURRY_HZ);
    // Turned about the feet, as little as a lean is: y is down, so the crown leans right as a point right of the feet goes down.
    const angle = (rig.lean / this.height) * leanAt(this.phase);
    const [fx, fy] = rig.feet;
    const rest = this.body.rest;
    for (let k = 0; k < this.at.length; k++) {
      const v = this.at[k]!;
      const a = angle * this.leans[k]!;
      const x = rest[2 * v]!;
      const y = rest[2 * v + 1]!;
      moveEverywhere(this.body, v, (fy - y) * a, (x - fx) * a, out);
    }
  }
}

registerLife<SwayRig>("sway", {
  check(rig, width, height) {
    const [x, y] = rig.feet;
    if (!(x >= 0 && x <= width && y >= 0 && y <= height)) throw new Error(`a sway's feet are off the picture at ${x}, ${y}`);
    if (!(rig.crown >= 0 && rig.crown < y)) throw new Error("a sway's crown must be in the picture, above its feet");
    if (!(rig.lean > 0)) throw new Error("a sway's lean must be above nought");
    if (rig.who && rig.who.within.length === 0) throw new Error(`${rig.who.name}'s sway needs a circle to keep within`);
  },
  build: (body, rig, seed) => new Sway(body, rig, seed),
});
