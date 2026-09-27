/**
 * Nezha (D91): the child on wind-fire wheels, as the New Year prints draw
 * him - double buns with red ties, the red bib, a lotus-leaf skirt, the
 * 乾坤圈 on the right wrist, the 火尖枪 with its flame, and the 混天绫
 * streaming behind. The wheels are a gold ring under each foot with six
 * flames spinning on it. He circles his place in the air, leaning into the
 * turn. Canonical in two scenes: the chase over Huangshan (ch. 4) and the
 * Flaming Mountains (ch. 61).
 *
 * Native height 2.3 units; the sash and the circuit are in the same units.
 * Baked into one skinned mesh per material (F110), all but the sash,
 * rebuilt each frame; the wheels spin and the flame flickers by groups.
 */
import { BoxGeometry, CatmullRomCurve3, ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, TorusGeometry, TubeGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure } from "../figure.js";
import { Wardrobe, humanoid, type Humanoid } from "../parts.js";
import type { Skin } from "../skin.js";

const RED = 0xd8382a;
const GOLD = 0xf2c25a;
const SKIN = 0xf6dcc4;
const HAIR = 0x2a2226;
const LEAF = 0x4f9a5a;
const FLAME = 0xffa030;

class Nezha implements Figure {
  readonly group = new Group();
  readonly nativeSize = 2.3;
  readonly triangles: number;
  private readonly w: Wardrobe;
  private readonly body = new Group();
  private readonly h: Humanoid;
  private readonly wheels: Group[] = [];
  private readonly fire = new Group();
  private readonly sash: Mesh;
  private readonly sashPts: Vector3[] = [];
  private readonly sashCurve: CatmullRomCurve3;
  /** The circuit's radius in the figure's units: none for a companion, which rides in place. */
  private readonly circuit: number;

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    const B = this.body;
    this.group.add(B);
    this.circuit = ctx.variant === "still" ? 0 : 6;
    this.h = humanoid(w, { face: SKIN, torso: RED, legs: SKIN, shoe: RED, skirt: LEAF, headR: 0.52 }, B);
    // the hair: a cap of it, a fringe, two buns with red ties
    w.part(new SphereGeometry(0.54, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.5), "hair", HAIR, B, 0, 1.88, 0);
    const fringe = w.part(new SphereGeometry(0.53, 24, 8, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.12), "hair", HAIR, B, 0, 1.9, 0);
    fringe.rotation.y = Math.PI;
    for (const s of [-1, 1]) {
      w.part(new SphereGeometry(0.2, 14, 12), "hair", HAIR, B, s * 0.42, 2.32, -0.05);
      const tie = w.part(new TorusGeometry(0.16, 0.035, 8, 20), "silk", RED, B, s * 0.42, 2.22, -0.05);
      tie.rotation.x = Math.PI / 2;
      w.part(new SphereGeometry(0.06, 8, 8), "eye", 0x111111, B, s * 0.19, 1.86, 0.47);
      const brow = w.part(new BoxGeometry(0.16, 0.03, 0.04), "hair", HAIR, B, s * 0.19, 1.99, 0.48);
      brow.rotation.z = s * -0.35;
      const cheek = w.part(new SphereGeometry(0.07, 8, 8), "silk", RED, B, s * 0.3, 1.74, 0.42);
      cheek.scale.z = 0.4;
    }
    const belt = w.part(new TorusGeometry(0.36, 0.04, 8, 24), "gold", GOLD, B, 0, 0.85, 0);
    belt.rotation.x = Math.PI / 2;
    // the wheels: a gold ring under each foot, six flames on it
    for (const s of [-1, 1]) {
      const wheel = new Group();
      wheel.position.set(s * 0.2, -0.22, 0.05);
      const ring = w.part(new TorusGeometry(0.3, 0.05, 8, 28), "gold", GOLD, wheel);
      ring.rotation.y = Math.PI / 2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const fl = w.part(new ConeGeometry(0.08, 0.32, 5), "flame", FLAME, wheel, 0, Math.cos(a) * 0.36, Math.sin(a) * 0.36);
        fl.rotation.x = -a;
      }
      B.add(wheel);
      this.wheels.push(wheel);
    }
    // the ring on the right wrist, the spear in the left hand
    const ring = w.part(new TorusGeometry(0.2, 0.035, 8, 24), "gold", GOLD, this.h.arms[1]!.elbow, 0, -0.42, 0);
    ring.rotation.x = 0.2;
    const spear = new Group();
    w.part(new CylinderGeometry(0.035, 0.035, 3.2, 8), "silk", RED, spear);
    w.part(new ConeGeometry(0.09, 0.5, 6), "gold", GOLD, spear, 0, 1.8, 0);
    // the flame flickers on a pivot of its own
    this.fire.position.y = 2.25;
    spear.add(this.fire);
    w.part(new ConeGeometry(0.16, 0.6, 6), "flame", FLAME, this.fire);
    spear.position.y = -0.5;
    spear.rotation.z = 0.35;
    this.h.arms[0]!.elbow.add(spear);
    // the sash, streaming behind along a curve rewritten each frame
    for (let i = 0; i <= 14; i++) this.sashPts.push(new Vector3(0, 1.4, -0.3 - i * 0.2));
    this.sashCurve = new CatmullRomCurve3(this.sashPts);
    this.sash = w.dress(new Mesh(new TubeGeometry(this.sashCurve, 40, 0.06, 6, false)), "silk", RED);
    B.add(this.sash);
    // A capsule for the legs' silk was the doll's; Nezha's legs are bare.
    w.bake(this.body, [this.sash]);
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.w.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    const a = t * 0.45;
    if (this.circuit > 0) {
      this.body.position.set(Math.cos(a) * this.circuit, Math.sin(a * 2) * 0.8, Math.sin(a) * this.circuit * 0.5);
      this.body.rotation.set(0.12, -a + Math.PI / 2, 0.18);
    } else {
      this.body.position.set(0, Math.sin(t * 1.7) * 0.15, 0);
      this.body.rotation.set(0.08, 0, Math.sin(t * 0.9) * 0.06);
    }
    for (const arm of this.h.arms) {
      arm.shoulder.rotation.set(-0.4, 0, arm.side * (2.2 + Math.sin(t * 2 + arm.side) * 0.2));
      arm.elbow.rotation.set(-0.9 + Math.sin(t * 2.3) * 0.2, 0, 0);
    }
    for (const wheel of this.wheels) wheel.rotation.x = -t * 9;
    this.fire.scale.y = 1 + Math.sin(t * 17) * 0.25;
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      this.sashPts[i]!.set(Math.sin(u * 5 - t * 4) * 0.35 * u + 0.35 * (1 - u) * (u < 0.5 ? -1 : 1), 1.35 + u * 0.9 - u * u * 1.6 + Math.sin(u * 4 - t * 3.5) * 0.25 * u, -0.25 - u * 2.6);
    }
    // The sash is the one part rebuilt per frame: forty rings of six, small.
    this.sash.geometry.dispose();
    this.sash.geometry = new TubeGeometry(this.sashCurve, 40, 0.06, 6, false);
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("nezha", (ctx) => new Nezha(ctx));
