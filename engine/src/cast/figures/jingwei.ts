/**
 * Jingwei (D91): the Yan Emperor's youngest daughter, drowned in the
 * Eastern Sea, who became a bird and has carried twigs and pebbles from
 * the western hills to fill it ever since (Shan Hai Jing, the Northern
 * Mountains). The book gives her a crow's shape, a patterned head, a
 * white bill and red feet; she carries a twig here. Her mountain, Fajiu,
 * is in Shanxi across the river from the Loess rail. Fast wingbeats, in
 * place beside the camera as `still`, or on a loop.
 *
 * Native length 2 units, bill to tail.
 */
import { ConeGeometry, CylinderGeometry, Group, SphereGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure } from "../figure.js";
import { Wardrobe, featherFan, flapWing, wing, type Wing } from "../parts.js";
import type { Skin } from "../skin.js";

const BLACK = 0x1e1e26;
const TIP = 0x3a3a48;
const PALE = 0xe6e2d8;
const WHITE = 0xf6f6f2;
const RED = 0xd8382a;
const TWIG = 0x6e4b2a;

class Jingwei implements Figure {
  readonly group = new Group();
  readonly nativeSize = 2;
  readonly triangles: number;
  private readonly w: Wardrobe;
  private readonly body = new Group();
  private readonly wings: Wing[] = [];
  private readonly loop: number;

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    this.loop = ctx.variant === "still" ? 0 : 6;
    const B = this.body;
    this.group.add(B);
    w.part(new SphereGeometry(0.3, 14, 10), "silk", BLACK, B).scale.set(1, 0.9, 1.6);
    w.part(new SphereGeometry(0.2, 12, 10), "silk", BLACK, B, 0, 0.14, 0.5);
    // the patterned head: pale flecks over the black
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4;
      w.part(new SphereGeometry(0.04, 6, 5), "silk", PALE, B, Math.cos(a) * 0.17, 0.14 + Math.abs(Math.sin(a * 1.3)) * 0.16, 0.5 + Math.sin(a) * 0.12);
    }
    w.part(new ConeGeometry(0.04, 0.3, 6), "iron", WHITE, B, 0, 0.1, 0.78).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) w.part(new SphereGeometry(0.03, 8, 6), "eye", 0x111111, B, s * 0.12, 0.2, 0.6);
    for (const side of [-1, 1]) {
      const wg = wing(w, { body: BLACK, tip: TIP, span: 1.7, primaries: 6 }, side, B);
      wg.pivot.position.set(side * 0.15, 0.1, 0.12);
      this.wings.push(wg);
    }
    const tail = new Group();
    tail.position.set(0, 0, -0.42);
    tail.rotation.y = Math.PI / 2 - 0.3;
    B.add(tail);
    w.part(featherFan(5, 0.7, 0.18, 0.6, 0).shafts, "silk", BLACK, tail);
    // red feet, trailing
    for (const s of [-1, 1]) {
      w.part(new CylinderGeometry(0.015, 0.015, 0.35, 5), "iron", RED, B, s * 0.08, -0.22, -0.05).rotation.x = 0.6;
      w.part(new SphereGeometry(0.03, 6, 5), "iron", RED, B, s * 0.08, -0.36, -0.15);
    }
    // the twig across the bill
    w.part(new CylinderGeometry(0.018, 0.018, 0.7, 5), "iron", TWIG, B, 0, 0.07, 0.86).rotation.z = Math.PI / 2;
    w.part(new CylinderGeometry(0.012, 0.012, 0.25, 4), "iron", TWIG, B, 0.22, 0.14, 0.88).rotation.z = 0.6;
    w.part(new CylinderGeometry(0.012, 0.012, 0.2, 4), "iron", TWIG, B, -0.18, 0.13, 0.84).rotation.z = -0.8;
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.w.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    if (this.loop > 0) {
      const a = t * 0.4;
      this.body.position.set(Math.cos(a) * this.loop, Math.sin(a * 3) * 0.5, Math.sin(a) * this.loop);
      this.body.rotation.set(0, -a, 0.3);
    } else {
      this.body.position.set(0, Math.sin(t * 2.3) * 0.12, 0);
      this.body.rotation.set(0.12, 0, Math.sin(t * 0.9) * 0.1);
    }
    const flap = Math.sin(t * 11);
    for (const wg of this.wings) flapWing(wg, flap, 0.3, 0.35);
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("jingwei", (ctx) => new Jingwei(ctx));
