/**
 * A serpent's life (D96): the long of the cloud seas swimming. A wave runs
 * down its body from head to tail, as down an eel's, and the body carries
 * everything within reach of it along: legs, fins, the cloud wrapped about
 * the coils. The head keeps almost still, as a swimming animal's does, and
 * the wave grows toward the tail. It swims faster and deeper the harder it
 * works, and slowly in place while it hovers.
 *
 * The rig is the body's midline, head first, traced on the painting. A
 * vertex takes the wave from the stretches of midline nearest it, blended
 * by how near, so where two coils pass close each goes its own way and
 * the picture between them stretches rather than tears.
 */
import { cadence, moveEverywhere, registerLife, smoothstep, type Body, type Life, type LifeRig, type Px, type Stride } from "../life.js";

export interface SerpentRig extends LifeRig {
  readonly kind: "serpent";
  /** The body's midline, head first, pixels. */
  readonly spine: readonly Px[];
  /** Half the body's thickness, pixels: how far one stretch of midline holds the picture before the next takes over. */
  readonly radius: number;
  /** How far from the midline the picture goes with the body, pixels: limbs, fins and the cloud about the coils. */
  readonly reach: number;
  /** Waves the body holds, head to tail. */
  readonly waves?: number;
  /** The wave's height at the tail, a share of the body's length. */
  readonly swing?: number;
  /** How far the whole picture rises and falls with each wave, a share of the body's length; nought for a streamer, a plume or a tail, that swims on a body that does not. */
  readonly bob?: number;
}

/** Waves from head to tail, as the East King's body carries them (D96). */
export const WAVES = 1.7;
/** The wave's height at the tail, a share of the body's length: a little over a hundredth, so the coils move and never kink. */
export const SWING = 0.011;
/** The rise and fall of the whole body with each wave, a share of its length. */
export const BOB = 0.006;
/** Waves a second: hovering, keeping pace with the flight, and quicker for each unit more of effort. */
export const REST_HZ = 0.28;
export const CRUISE_HZ = 0.45;
export const HURRY_HZ = 0.3;
/** The stretches of midline a vertex takes the wave from, nearest first. */
const TAKES = 4;

export function serpent(rig: Omit<SerpentRig, "kind">): SerpentRig {
  return { kind: "serpent", ...rig };
}

/** The share of the wave's full height at a length along the body: little at the head, growing to the tail. */
export function swingAt(share: number): number {
  return (0.15 + 0.85 * smoothstep(0, 0.35, share)) * (1 + 0.6 * share);
}

class Serpent implements Life {
  private phase: number;
  private readonly length: number;
  private readonly normals: Float32Array;
  /**
   * For each vertex, `TAKES` stretches of midline: which, and its share of
   * the wave there, the wave's height at that length along the body
   * folded in; and the sine and cosine of where along the wave that length
   * lies, so a frame's wave is two products rather than a sine.
   */
  private readonly takes: Int16Array;
  private readonly share: Float32Array;
  private readonly sinAt: Float32Array;
  private readonly cosAt: Float32Array;
  /** How much of the body's move each vertex takes, by its distance off the midline. */
  private readonly held: Float32Array;

  constructor(private readonly body: Body, private readonly rig: SerpentRig, seed: number) {
    const spine = rig.spine;
    const n = spine.length - 1;
    const lengths = new Float32Array(n);
    const starts = new Float32Array(n);
    this.normals = new Float32Array(2 * n);
    let total = 0;
    for (let k = 0; k < n; k++) {
      const [ax, ay] = spine[k]!;
      const [bx, by] = spine[k + 1]!;
      const l = Math.hypot(bx - ax, by - ay);
      lengths[k] = l;
      starts[k] = total;
      total += l;
      this.normals[2 * k] = -(by - ay) / l;
      this.normals[2 * k + 1] = (bx - ax) / l;
    }
    this.length = total;
    this.phase = (seed % 1000) / 1000;
    // The picture's grid: every layer's is the same points again.
    const count = body.layers[0]!.count;
    this.takes = new Int16Array(count * TAKES).fill(-1);
    this.share = new Float32Array(count * TAKES);
    this.sinAt = new Float32Array(count * TAKES);
    this.cosAt = new Float32Array(count * TAKES);
    const lambda = total / (rig.waves ?? WAVES);
    this.held = new Float32Array(count);
    const d = new Float32Array(n);
    const s = new Float32Array(n);
    const r2 = rig.radius * rig.radius;
    for (let v = 0; v < count; v++) {
      const px = body.rest[2 * v]!;
      const py = body.rest[2 * v + 1]!;
      let nearest = Infinity;
      for (let k = 0; k < n; k++) {
        const [ax, ay] = spine[k]!;
        const [bx, by] = spine[k + 1]!;
        const l = lengths[k]!;
        const t = Math.max(0, Math.min(l, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l));
        const qx = ax + ((bx - ax) * t) / l;
        const qy = ay + ((by - ay) * t) / l;
        d[k] = Math.hypot(px - qx, py - qy);
        s[k] = starts[k]! + t;
        nearest = Math.min(nearest, d[k]!);
      }
      this.held[v] = 1 - smoothstep(0.5 * rig.reach, rig.reach, nearest);
      if (this.held[v] === 0) continue;
      // The nearest stretches, weighed against the nearest of all so the weights never vanish far out.
      const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => d[a]! - d[b]!);
      let sum = 0;
      for (let j = 0; j < Math.min(TAKES, n); j++) {
        const k = order[j]!;
        const w = Math.exp(-(d[k]! * d[k]! - nearest * nearest) / r2);
        if (w < 1e-3) break;
        this.takes[v * TAKES + j] = k;
        this.share[v * TAKES + j] = w;
        this.sinAt[v * TAKES + j] = Math.sin((2 * Math.PI * s[k]!) / lambda);
        this.cosAt[v * TAKES + j] = Math.cos((2 * Math.PI * s[k]!) / lambda);
        sum += w;
      }
      for (let j = 0; j < TAKES; j++) {
        const k = this.takes[v * TAKES + j]!;
        if (k >= 0) this.share[v * TAKES + j] = (this.share[v * TAKES + j]! / sum) * swingAt(s[k]! / total);
      }
    }
  }

  move(st: Stride, out: Float32Array): void {
    this.phase = (this.phase + st.dt * cadence(st.effort, REST_HZ, CRUISE_HZ, HURRY_HZ)) % 1;
    const L = this.length;
    const height = (this.rig.swing ?? SWING) * L * (0.7 + 0.3 * Math.min(1.5, st.effort));
    const bob = (this.rig.bob ?? BOB) * L * Math.sin(2 * Math.PI * this.phase - 0.8);
    // sin(a - b) = sin a cos b - cos a sin b, with a where along the wave a vertex's midline lies and b how far the wave has come.
    const cb = height * Math.cos(2 * Math.PI * this.phase);
    const sb = height * Math.sin(2 * Math.PI * this.phase);
    const count = this.held.length;
    for (let v = 0; v < count; v++) {
      const held = this.held[v]!;
      if (held === 0) {
        moveEverywhere(this.body, v, 0, bob, out);
        continue;
      }
      let dx = 0;
      let dy = 0;
      for (let j = 0; j < TAKES; j++) {
        const k = this.takes[v * TAKES + j]!;
        if (k < 0) break;
        const i = v * TAKES + j;
        const w = this.share[i]! * (this.sinAt[i]! * cb - this.cosAt[i]! * sb);
        dx += w * this.normals[2 * k]!;
        dy += w * this.normals[2 * k + 1]!;
      }
      moveEverywhere(this.body, v, held * dx, held * dy + bob, out);
    }
  }
}

registerLife<SerpentRig>("serpent", {
  check(rig, width, height) {
    if (rig.spine.length < 3) throw new Error("a serpent's midline needs three points at least");
    for (const [x, y] of rig.spine) if (!(x >= 0 && x <= width && y >= 0 && y <= height)) throw new Error(`a serpent's midline leaves the picture at ${x}, ${y}`);
    if (!(rig.radius > 0 && rig.reach > rig.radius)) throw new Error("a serpent's reach must be past its radius, both above nought");
  },
  build: (body, rig, seed) => new Serpent(body, rig, seed),
});
