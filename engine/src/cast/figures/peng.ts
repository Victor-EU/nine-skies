/**
 * The Peng (D91): Zhuangzi's bird whose back is who knows how many
 * thousand li and whose wings are clouds hanging from the sky, and the
 * Golden-Winged Great Peng of Lion Camel Ridge (ch. 74-77), the one thing
 * Wukong could not outrun. An eagle in gold: a long body, a hooked beak,
 * gold eyes under a brow, two vast feathered wings with dark tips, a fan
 * of a tail, and talons tucked under. It soars: the wings beat slowly and
 * bank, on a wide loop or held beside the camera as `still`.
 *
 * Native size 20 units, the wingspan.
 */
import { CapsuleGeometry, ConeGeometry, CylinderGeometry, Group, SphereGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure } from "../figure.js";
import { Wardrobe, featherFan, flapWing, wing, type Wing } from "../parts.js";
import type { Skin } from "../skin.js";

const GOLD = 0xd9a441;
const DEEP = 0xa9782a;
const PALE = 0xe6c36a;
const DARK = 0x3a2a10;

class Peng implements Figure {
  readonly group = new Group();
  readonly nativeSize = 20;
  readonly triangles: number;
  private readonly w: Wardrobe;
  private readonly body = new Group();
  private readonly wings: Wing[] = [];
  private readonly loop: number;

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    this.loop = ctx.variant === "still" ? 0 : 40;
    const B = this.body;
    this.group.add(B);
    w.part(new CapsuleGeometry(0.9, 3.0, 6, 16), "silk", DEEP, B).rotation.x = Math.PI / 2;
    w.part(new SphereGeometry(0.95, 16, 12), "silk", PALE, B, 0, -0.15, 1.0).scale.set(1, 0.9, 1.3);
    w.part(new SphereGeometry(0.6, 16, 12), "silk", DEEP, B, 0, 0.35, 2.4).scale.set(0.9, 0.9, 1.15);
    w.part(new ConeGeometry(0.22, 0.9, 8), "gold", GOLD, B, 0, 0.2, 3.1).rotation.x = Math.PI / 2;
    w.part(new ConeGeometry(0.1, 0.35, 6), "gold", GOLD, B, 0, 0.02, 3.5).rotation.x = Math.PI;
    for (const s of [-1, 1]) {
      w.part(new SphereGeometry(0.12, 10, 8), "gold", GOLD, B, s * 0.28, 0.45, 2.72);
      w.part(new SphereGeometry(0.07, 8, 6), "eye", 0x111111, B, s * 0.3, 0.46, 2.82);
      w.part(new CapsuleGeometry(0.06, 0.4, 3, 6), "silk", DARK, B, s * 0.3, 0.62, 2.7).rotation.set(0, 0, s * 1.2);
    }
    for (const side of [-1, 1]) {
      const wg = wing(w, { body: GOLD, tip: DARK, span: 9, primaries: 8 }, side, B);
      wg.pivot.position.set(side * 0.7, 0.3, 0.6);
      this.wings.push(wg);
    }
    // the tail: a fan of seven, dark at the tips, pointing back
    const tail = new Group();
    tail.position.set(0, 0, -1.6);
    // the fan spreads from its first feather, so it starts a half-spread before straight back
    tail.rotation.y = Math.PI / 2 - 0.45;
    B.add(tail);
    const fan = featherFan(7, 3.2, 0.9, 0.9, 0.3, 0.02);
    w.part(fan.shafts, "silk", GOLD, tail);
    if (fan.tips) w.part(fan.tips, "iron", DARK, tail);
    // talons, tucked under
    for (const s of [-1, 1]) {
      const leg = new Group();
      leg.position.set(s * 0.45, -0.7, 0.4);
      leg.rotation.x = 1.1;
      B.add(leg);
      w.part(new CylinderGeometry(0.12, 0.15, 0.8, 8), "silk", PALE, leg, 0, -0.4, 0);
      for (let k = 0; k < 3; k++) w.part(new ConeGeometry(0.06, 0.4, 6), "iron", DARK, leg, (k - 1) * 0.14, -0.85, 0.1).rotation.x = 2.2;
    }
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.w.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    if (this.loop > 0) {
      const a = t * 0.05;
      this.body.position.set(Math.cos(a) * this.loop, Math.sin(a * 2) * 3, Math.sin(a) * this.loop);
      this.body.rotation.set(0.05, -a, 0.35);
    } else {
      this.body.position.set(0, Math.sin(t * 0.5) * 0.6, 0);
      this.body.rotation.set(0.05, 0, Math.sin(t * 0.3) * 0.12);
    }
    // a slow beat, the wings held high between: a soaring bird, not a flapping one
    const beat = Math.sin(t * 0.9);
    for (const wg of this.wings) flapWing(wg, beat * 0.5, 0.2, 0.2);
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("peng", (ctx) => new Peng(ctx));
