/**
 * Egrets (D91): the little egrets of the Li, all white, black bill, black
 * legs and yellow feet, the two long plumes of the breeding season on the
 * nape, which fish the shallows under the karst towers and fly the river
 * in loose lines with the neck drawn in, as herons do. Nine of them, each
 * beating at its own rate, banked so a wing always shows. The line flies
 * a wide loop round its place, or holds beside the camera as `still`.
 *
 * Native size is the loop's reach, 26 units; the birds are 2.2 across.
 */
import { CapsuleGeometry, CatmullRomCurve3, ConeGeometry, Group, Mesh, SphereGeometry, TubeGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure } from "../figure.js";
import { Wardrobe, flapWing, wing, type Wing } from "../parts.js";
import type { Skin } from "../skin.js";

const WHITE = 0xf8f8f4;
const BLACK = 0x1c1c1e;
const FOOT = 0xf0d040;

interface Egret {
  readonly group: Group;
  readonly wings: Wing[];
  readonly phase: number;
  readonly rate: number;
  readonly slot: number;
}

function egret(w: Wardrobe, parent: Group): { group: Group; wings: Wing[] } {
  const g = new Group();
  parent.add(g);
  w.part(new SphereGeometry(0.26, 12, 10), "silk", WHITE, g).scale.set(1, 0.8, 2);
  // the neck drawn in, an S along a fixed curve
  const neck = new CatmullRomCurve3([new Vector3(0, 0.05, 0.4), new Vector3(0, 0.3, 0.55), new Vector3(0, 0.36, 0.85), new Vector3(0, 0.28, 1.05)]);
  const n = w.dress(new Mesh(new TubeGeometry(neck, 8, 0.055, 6, false)), "silk", WHITE);
  g.add(n);
  w.part(new SphereGeometry(0.1, 10, 8), "silk", WHITE, g, 0, 0.3, 1.1);
  w.part(new ConeGeometry(0.025, 0.42, 6), "iron", BLACK, g, 0, 0.28, 1.4).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    w.part(new SphereGeometry(0.02, 6, 5), "eye", 0x111111, g, s * 0.07, 0.33, 1.14);
    w.part(new ConeGeometry(0.012, 0.5, 4), "silk", WHITE, g, s * 0.03, 0.36, 0.9).rotation.x = -Math.PI / 2 + 0.25;
  }
  const legs = w.part(new CapsuleGeometry(0.015, 0.5, 2, 4), "iron", BLACK, g, 0, -0.06, -0.6);
  legs.rotation.x = Math.PI / 2 + 0.1;
  for (const s of [-1, 1]) w.part(new SphereGeometry(0.03, 6, 5), "iron", FOOT, g, s * 0.03, -0.1, -0.92);
  const wings: Wing[] = [];
  for (const side of [-1, 1]) {
    const wg = wing(w, { body: WHITE, tip: WHITE, span: 2.2, primaries: 6 }, side, g);
    wg.pivot.position.set(side * 0.17, 0.08, 0.1);
    wings.push(wg);
  }
  return { group: g, wings };
}

class Egrets implements Figure {
  readonly group = new Group();
  readonly nativeSize = 26;
  readonly triangles: number;
  private readonly w: Wardrobe;
  private readonly line = new Group();
  private readonly birds: Egret[] = [];
  private readonly loop: number;

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    this.loop = ctx.variant === "still" ? 0 : 10;
    this.group.add(this.line);
    for (let i = 0; i < 9; i++) {
      const b = egret(w, this.line);
      this.birds.push({ group: b.group, wings: b.wings, phase: (i * 2.399) % 6.28, rate: 3.6 + ((i * 0.41) % 1.1), slot: i - 4 });
    }
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.w.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    const a = t * 0.1;
    if (this.loop > 0) {
      this.line.position.set(Math.cos(a) * this.loop, Math.sin(a * 2) * 1.2, Math.sin(a) * this.loop);
      this.line.rotation.y = -a;
    } else this.line.position.set(0, Math.sin(t * 0.6) * 0.5, 0);
    for (const b of this.birds) {
      const g = b.group;
      // a loose line, each a little behind and below the one before, drifting
      g.position.set(b.slot * 1.5 + Math.sin(t * 0.6 + b.phase) * 0.3, -Math.abs(b.slot) * 0.15 + Math.sin(t * 0.8 + b.phase) * 0.3, -Math.abs(b.slot) * 0.9 + Math.cos(t * 0.5 + b.phase) * 0.3);
      g.rotation.set(-0.08, 0, Math.sign(b.slot || 1) * 0.3 + Math.sin(t * 0.5 + b.phase) * 0.12);
      const flap = Math.sin(t * b.rate + b.phase);
      for (const wg of b.wings) flapWing(wg, flap, 0.4, 0.3);
    }
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("egrets", (ctx) => new Egrets(ctx));
