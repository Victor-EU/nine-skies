/**
 * Painted cloud churning (D96): the cloud a figure rides, or trails, boils
 * slowly in eddies, so it is weather rather than a picture of weather.
 *
 * The cloud is found by what the picture shows, once it has loaded: pale
 * and nearly grey. A figure whose own body is pale (the White Dragon, a
 * white horse) names the circles of it the churn must leave alone, or the
 * circles its cloud lies in, the puffs under a walker's feet.
 */
import { cadence, inCircles, moveEverywhere, registerLife, smoothstep, wobble, type Body, type Circle, type Life, type LifeRig, type Stride } from "../life.js";

export interface ChurnRig extends LifeRig {
  readonly kind: "churn";
  /** How far the cloud boils, pixels. */
  readonly swirl: number;
  /** An eddy's size, pixels. */
  readonly eddy?: number;
  /** The most colour cloud has, as a saturation (0 grey to 1 pure), and the least brightness. */
  readonly grey?: number;
  readonly pale?: number;
  /** Circles of the picture it leaves alone though they look like cloud. */
  readonly spare?: readonly Circle[];
  /** Circles of the picture its cloud lies in, if it lies in some only. */
  readonly within?: readonly Circle[];
}

/** Eddies a second, at rest, keeping pace, and quicker for each unit more of effort: cloud turns over slowly. */
export const REST_HZ = 0.12;
export const CRUISE_HZ = 0.22;
export const HURRY_HZ = 0.1;
export const EDDY = 300;
export const GREY = 0.2;
export const PALE = 0.55;

export function churn(rig: Omit<ChurnRig, "kind">): ChurnRig {
  return { kind: "churn", ...rig };
}

/** How much a colour is cloud, 0 to 1: grey enough, pale enough, and there. */
export function cloudiness(r: number, g: number, b: number, a: number, grey = GREY, pale = PALE): number {
  const hi = Math.max(r, g, b);
  const lo = Math.min(r, g, b);
  const saturation = hi > 0 ? (hi - lo) / hi : 0;
  return smoothstep(grey, grey * 0.5, saturation) * smoothstep(pale - 0.15, pale, hi) * smoothstep(0.02, 0.25, a);
}

class Churn implements Life {
  private phase: number;
  /** The points of the picture that are cloud, and how much. */
  private cloud: { readonly at: Int32Array; readonly m: Float32Array } | null = null;

  constructor(private readonly body: Body, private readonly rig: ChurnRig, seed: number) {
    this.phase = ((seed >>> 20) % 1000) / 1000;
    if (body.colour) this.see(body);
  }

  see(body: Body): void {
    const c = body.colour;
    if (!c) return;
    // The picture's grid: every layer's is the same points again.
    const count = body.layers[0]!.count;
    const raw = new Float32Array(count);
    for (let v = 0; v < count; v++) {
      const x = body.rest[2 * v]!;
      const y = body.rest[2 * v + 1]!;
      const where = this.rig.within ? inCircles(x, y, this.rig.within) : 1;
      raw[v] = cloudiness(c[4 * v]!, c[4 * v + 1]!, c[4 * v + 2]!, c[4 * v + 3]!, this.rig.grey, this.rig.pale) * where * (1 - inCircles(x, y, this.rig.spare ?? []));
    }
    // Softened over the vertex and its neighbours, so a wisp's edge stretches rather than shears.
    const across = body.across;
    const down = count / across;
    const at: number[] = [];
    const m: number[] = [];
    for (let j = 0; j < down; j++) {
      for (let i = 0; i < across; i++) {
        let sum = 0;
        let k = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= across || jj >= down) continue;
            sum += raw[jj * across + ii]!;
            k++;
          }
        }
        if (sum / k < 0.01) continue;
        at.push(j * across + i);
        m.push(sum / k);
      }
    }
    this.cloud = { at: Int32Array.from(at), m: Float32Array.from(m) };
  }

  move(st: Stride, out: Float32Array): void {
    this.phase += st.dt * cadence(st.effort, REST_HZ, CRUISE_HZ, HURRY_HZ);
    const cloud = this.cloud;
    if (!cloud) return;
    const f = 1 / (this.rig.eddy ?? EDDY);
    const swirl = this.rig.swirl;
    const rest = this.body.rest;
    for (let k = 0; k < cloud.at.length; k++) {
      const v = cloud.at[k]!;
      const m = cloud.m[k]! * swirl;
      const x = rest[2 * v]!;
      const y = rest[2 * v + 1]!;
      moveEverywhere(this.body, v, m * wobble(x, y, this.phase, f), m * wobble(x + 50, y - 30, this.phase + 0.5, f), out);
    }
  }
}

registerLife<ChurnRig>("churn", {
  check(rig) {
    if (!(rig.swirl > 0)) throw new Error("a churn's swirl must be above nought");
  },
  build: (body, rig, seed) => new Churn(body, rig, seed),
});
