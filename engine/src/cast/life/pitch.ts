/**
 * A flier nosing into its path (D96): the whole picture turned about the
 * figure's origin as its path climbs or dives, so it rises head first and
 * comes down head first, rather than drifting up and down level like a
 * picture on a string. It follows its path a moment late, as a body with
 * weight does, and never further than the rig lets it.
 *
 * Last among a painting's lives, since it turns what the others moved.
 */
import { registerLife, type Body, type Life, type LifeRig, type Stride } from "../life.js";

export interface PitchRig extends LifeRig {
  readonly kind: "pitch";
  /** The most it noses up or down, radians. */
  readonly most: number;
  /** The share of its path's climb it follows. */
  readonly follows?: number;
}

/** Seconds it takes to come round to its path. */
export const LAG_S = 0.6;
export const FOLLOWS = 0.8;

export function pitch(rig: Omit<PitchRig, "kind">): PitchRig {
  return { kind: "pitch", ...rig };
}

/** Turned by `angle`, nose up, about the origin, in the picture's pixels (y down) for a figure facing right; mirrored for one facing left. */
export function noseUp(dx: number, dy: number, angle: number, faces: Body["faces"]): [number, number] {
  const a = faces === "right" ? angle : -angle;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [dx * c + dy * s, -dx * s + dy * c];
}

class Pitch implements Life {
  private angle: number | null = null;

  constructor(private readonly body: Body, private readonly rig: PitchRig) {}

  move(st: Stride, out: Float32Array): void {
    const want = Math.max(-this.rig.most, Math.min(this.rig.most, st.climb * (this.rig.follows ?? FOLLOWS)));
    this.angle = this.angle === null ? want : this.angle + (want - this.angle) * (1 - Math.exp(-st.dt / LAG_S));
    if (Math.abs(this.angle) < 1e-4) return;
    const [ox, oy] = this.body.origin;
    const rest = this.body.rest;
    // noseUp, its turn taken once for the frame.
    const [c, s] = noseUp(1, 0, this.angle, this.body.faces);
    for (let v = 0; v < rest.length / 2; v++) {
      const x = rest[2 * v]! + out[2 * v]! - ox;
      const y = rest[2 * v + 1]! + out[2 * v + 1]! - oy;
      out[2 * v]! += x * c - y * s - x;
      out[2 * v + 1]! += x * s + y * c - y;
    }
  }
}

registerLife<PitchRig>("pitch", {
  check(rig) {
    if (!(rig.most > 0 && rig.most < Math.PI / 2)) throw new Error("a pitch's most must be a turn of less than a quarter");
  },
  build: (body, rig) => new Pitch(body, rig),
});
