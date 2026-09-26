/**
 * The magpie (D91): the bird of the Manchu origin story, which dropped a
 * red fruit for the youngest of three maidens bathing in Changbai's lake,
 * and of every 喜鹊 on a New Year print since. Black head, back and
 * breast, a white belly and white shoulders, feathered wings with a white
 * flash, a long tail of blue-black, and the red fruit in its beak. It
 * flies a loop, or holds beside the camera as `still`.
 *
 * Native length 2.4 units, beak to tail.
 */
import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, SphereGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure } from "../figure.js";
import { Wardrobe, flapWing, wing, type Wing } from "../parts.js";
import type { Skin } from "../skin.js";

const BLACK = 0x1b1b24;
const WHITE = 0xf4f4f0;
const BLUE = 0x2b3d6b;
const RED = 0xd8382a;
const LEAF = 0x4f9a5a;

class Magpie implements Figure {
  readonly group = new Group();
  readonly nativeSize = 2.4;
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
    w.part(new SphereGeometry(0.3, 14, 10), "silk", BLACK, B).scale.set(1, 0.9, 1.7);
    w.part(new SphereGeometry(0.25, 12, 10), "silk", WHITE, B, 0, -0.1, 0.02).scale.set(0.95, 0.75, 1.2);
    w.part(new SphereGeometry(0.2, 12, 10), "silk", BLACK, B, 0, 0.16, 0.55);
    w.part(new ConeGeometry(0.04, 0.24, 6), "iron", BLACK, B, 0, 0.12, 0.8).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) w.part(new SphereGeometry(0.035, 8, 6), "eye", 0x111111, B, s * 0.12, 0.2, 0.66);
    for (const side of [-1, 1]) {
      const wg = wing(w, { body: BLACK, tip: BLUE, span: 1.6, primaries: 6 }, side, B);
      wg.pivot.position.set(side * 0.15, 0.1, 0.15);
      w.part(new SphereGeometry(0.13, 8, 6), "silk", WHITE, wg.pivot, 0.3, 0.02, 0).scale.set(1.8, 0.3, 1);
      this.wings.push(wg);
    }
    for (let i = -1; i <= 1; i++) w.part(new BoxGeometry(0.08, 0.02, 1.3), "silk", BLUE, B, i * 0.07, 0, -0.95 + Math.abs(i) * 0.1).rotation.x = -0.08;
    for (const s of [-1, 1]) w.part(new CylinderGeometry(0.015, 0.015, 0.3, 5), "iron", BLACK, B, s * 0.08, -0.3, 0.1).rotation.x = 0.5;
    // the red fruit, and a leaf on it
    w.part(new SphereGeometry(0.09, 10, 8), "matte", RED, B, 0, 0.1, 0.95);
    w.part(new ConeGeometry(0.035, 0.12, 4), "matte", LEAF, B, 0.04, 0.19, 0.95).rotation.z = -0.6;
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.w.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    if (this.loop > 0) {
      const a = t * 0.35;
      this.body.position.set(Math.cos(a) * this.loop, Math.sin(a * 3) * 0.6, Math.sin(a) * this.loop);
      this.body.rotation.set(0, -a, 0.3);
    } else {
      this.body.position.set(0, Math.sin(t * 2.1) * 0.15, 0);
      this.body.rotation.set(0.1, 0, Math.sin(t * 0.8) * 0.1);
    }
    const flap = Math.sin(t * 9);
    for (const wg of this.wings) flapWing(wg, flap, 0.3, 0.35);
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("magpie", (ctx) => new Magpie(ctx));
