/**
 * The carp (D91): the fish that swims up the Yellow River and, if it
 * leaps the Dragon Gate at Longmen, is a dragon (鲤鱼跃龙门, the scholar's
 * examination in a fish). Longmen lies past everything the Loess rail
 * reaches at one speed, so the carp leaps beside the camera instead, over
 * and over, out of a spray of cloud. A gold-red body in scales, a pale
 * belly, barbels, round gold eyes, a dorsal fin and pectorals in
 * translucent silk, a forked tail that beats. As `still` it leaps in
 * place; otherwise it leaps its way round a loop.
 *
 * Native length 3 units, lips to tail.
 */
import { ConeGeometry, CylinderGeometry, Group, SphereGeometry, TorusGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure } from "../figure.js";
import { Wardrobe, breathe, cloudBank, featherFan } from "../parts.js";
import type { Skin } from "../skin.js";

const COPPER = 0xe06a2a;
const BELLY = 0xf5cf86;
const FIN = 0xf29a4a;
const GOLD = 0xf1c24c;
const SPRAY = 0xffffff;

class Carp implements Figure {
  readonly group = new Group();
  readonly nativeSize = 3;
  readonly triangles: number;
  private readonly w: Wardrobe;
  private readonly body = new Group();
  private readonly fish = new Group();
  private readonly tail = new Group();
  private readonly spray: Group;
  private readonly loop: number;

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    this.loop = ctx.variant === "still" ? 0 : 8;
    this.group.add(this.body);
    const F = this.fish;
    this.body.add(F);
    w.part(new SphereGeometry(0.5, 18, 14), "scale", COPPER, F).scale.set(1, 0.8, 2.2);
    w.part(new SphereGeometry(0.42, 16, 12), "belly", BELLY, F, 0, -0.15, 0.1).scale.set(0.85, 0.55, 1.9);
    w.part(new SphereGeometry(0.36, 16, 12), "scale", COPPER, F, 0, 0.05, 0.95).scale.set(0.9, 0.7, 1);
    w.part(new TorusGeometry(0.12, 0.04, 8, 16), "matte", BELLY, F, 0, -0.02, 1.32);
    for (const s of [-1, 1]) {
      w.part(new SphereGeometry(0.09, 10, 8), "gold", GOLD, F, s * 0.28, 0.14, 1.05);
      w.part(new SphereGeometry(0.05, 8, 6), "eye", 0x111111, F, s * 0.31, 0.15, 1.12);
      w.part(new CylinderGeometry(0.012, 0.012, 0.4, 5), "gold", GOLD, F, s * 0.1, -0.12, 1.3).rotation.set(1.2, 0, s * 0.4);
      // pectoral and pelvic fins
      w.part(new ConeGeometry(0.18, 0.5, 4), "mane", FIN, F, s * 0.45, -0.1, 0.5).rotation.set(0.3, 0, s * (Math.PI / 2 + 0.3));
      w.part(new ConeGeometry(0.12, 0.35, 4), "mane", FIN, F, s * 0.32, -0.3, -0.2).rotation.set(0.3, 0, s * (Math.PI / 2 + 0.5));
    }
    const dorsal = w.part(new ConeGeometry(0.25, 0.7, 4), "mane", FIN, F, 0, 0.55, -0.1);
    dorsal.scale.set(0.25, 1, 1.4);
    dorsal.rotation.x = -0.35;
    // the forked tail: a fan of three blades in the vertical plane, on a pivot that beats
    const T = this.tail;
    T.position.set(0, 0, -1.05);
    F.add(T);
    const upright = new Group();
    upright.rotation.z = Math.PI / 2;
    T.add(upright);
    const fan = new Group();
    fan.rotation.y = Math.PI / 2 - 0.36;
    upright.add(fan);
    w.part(featherFan(3, 0.95, 0.42, 0.72, 0, 0).shafts, "mane", FIN, fan);
    this.spray = cloudBank(
      w,
      SPRAY,
      [
        [0, -0.4, 0.2, 0.42],
        [-0.55, -0.45, -0.1, 0.34],
        [0.55, -0.45, 0, 0.36],
        [0.1, -0.35, -0.7, 0.3],
        [-0.3, -0.4, 0.9, 0.28],
      ],
      this.group,
    );
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.w.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    // the leap: up the front of a tall ellipse, over, and down the back through the spray
    const a = t * 1.4;
    const ry = 1.4;
    const rz = 1.2;
    const y = ry * (1 - Math.cos(a));
    const z = rz * Math.sin(a);
    const pitch = -Math.atan2(ry * Math.sin(a), rz * Math.cos(a));
    if (this.loop > 0) {
      const b = t * 0.25;
      this.body.position.set(Math.cos(b) * this.loop, y, Math.sin(b) * this.loop + z);
      this.body.rotation.set(pitch, -b, 0);
      this.spray.position.set(Math.cos(b) * this.loop, 0, Math.sin(b) * this.loop);
    } else {
      this.body.position.set(0, y, z);
      this.body.rotation.set(pitch, 0, Math.sin(t * 0.7) * 0.05);
    }
    this.tail.rotation.y = Math.sin(t * 9) * 0.4;
    breathe(this.spray, t, 0.12);
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("carp", (ctx) => new Carp(ctx));
