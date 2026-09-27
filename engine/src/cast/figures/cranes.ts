/**
 * A flock of cranes (D91): eleven red-crowned cranes in a loose V, each
 * flapping at its own rate, banked so a wing always shows. Huizong painted
 * twenty over his palace gate; the Daoist immortals ride them; Huangshan
 * is named for the emperor who ascended from it. The flock flies a wide
 * loop round its place, or holds its V beside the camera as a companion.
 *
 * Native size is the loop's reach, 30 units; the birds are 2.7 across.
 */
import { Group, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure, type Head } from "../figure.js";
import { Wardrobe, bird, type Bird } from "../parts.js";
import type { Skin } from "../skin.js";

const WHITE = 0xf4f4f0;
const BLACK = 0x1c1c1e;
const CROWN = 0xc62b1e;

class Cranes implements Figure {
  readonly group = new Group();
  readonly nativeSize = 30;
  readonly triangles: number;
  readonly heads: readonly Head[];
  private readonly w: Wardrobe;
  private readonly flock = new Group();
  private readonly birds: { bird: Bird; phase: number; rate: number; row: number; side: number; beat: number; scatter: Vector3 }[] = [];
  private readonly loop: number;
  private last = 0;

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    this.loop = ctx.variant === "still" ? 0 : 12;
    this.group.add(this.flock);
    for (let i = 0; i < 11; i++) {
      const b = bird(w, { body: WHITE, crown: CROWN, tip: BLACK, beak: BLACK }, this.flock);
      // where each breaks to when the flock takes fright (D93): outward from the V, up or down, fore or aft
      const scatter = new Vector3((i % 2 ? 1 : -1) * (1 + ((i * 0.61) % 1)), Math.sin(i * 2.3) * 1.4, Math.cos(i * 1.7) * 1.2);
      this.birds.push({ bird: b, phase: (i * 2.399) % 6.28, rate: 4.2 + ((i * 0.37) % 1.2), row: Math.ceil(i / 2), side: i % 2 ? 1 : -1, beat: 0, scatter });
    }
    // every bird looks on its own (D93); bird() made each head's pivot, so the bake gives it a bone
    this.heads = this.birds.map((b) => b.bird.head);
    // One mesh per material for the eleven, a bone at each bird and each joint of each wing (F109).
    w.bake(this.flock);
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.w.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    // the V flies round a loop; in place it holds its formation, drifting
    const a = t * 0.12;
    if (this.loop > 0) {
      this.flock.position.set(Math.cos(a) * this.loop, Math.sin(a * 2) * 1.5, Math.sin(a) * this.loop);
      this.flock.rotation.y = -a;
    } else {
      this.flock.position.set(0, Math.sin(t * 0.7) * 0.6, 0);
    }
    // Frightened, the V breaks and every bird beats harder.
    const alarm = f.alarm ?? 0;
    const dt = Math.min(0.1, Math.max(0, t - this.last));
    this.last = t;
    for (const b of this.birds) {
      const g = b.bird.group;
      g.position.set(b.side * b.row * 1.3 + Math.sin(t * 0.7 + b.row) * 0.3, -b.row * 0.3 + Math.sin(t * 0.9 + b.phase) * 0.25, -b.row * 1.6);
      g.position.addScaledVector(b.scatter, 2.2 * alarm);
      g.rotation.set(-0.1, 0, b.side * (0.35 + 0.3 * alarm) + Math.sin(t * 0.5 + b.phase) * 0.12);
      b.beat += dt * b.rate * (1 + 1.4 * alarm);
      b.bird.flap(Math.sin(b.beat + b.phase));
    }
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("cranes", (ctx) => new Cranes(ctx));
