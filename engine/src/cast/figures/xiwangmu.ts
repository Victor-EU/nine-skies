/**
 * The Queen Mother of the West on her cloud (D91), with the three blue
 * birds of the Shan Hai Jing circling her: a court robe to the ground,
 * wide gold sleeves, a jade belt, the tall coiffure with the 胜 headdress
 * - a bar with a disc at each end - and a peach in her hand. Her home in
 * the film is the Jade Pool on Bogda, the Peach Banquet Wukong was not
 * asked to.
 *
 * Native height 2.7 units to the headdress; the birds circle at 2.2.
 * Baked into one skinned mesh per material (F111): the arms and each
 * bird and wing move by their groups; the cloud holds still.
 */
import { ConeGeometry, CylinderGeometry, Group, SphereGeometry, TorusGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure, type Head } from "../figure.js";
import { Wardrobe, bird, cloudBank, humanHead, humanoid, type Bird, type Humanoid } from "../parts.js";
import type { Skin } from "../skin.js";

const FACE = 0xf7e3d2;
const ROBE = 0x8b1e2d;
const SLEEVE = 0xf1c24c;
const HAIR = 0x1e1a1c;
const GOLD = 0xf1c24c;
const JADE = 0x5fb08a;
const PEACH = 0xf6a8b0;
const CLOUD = 0xffffff;
const BLUE = 0x2aa6a0;
const RED = 0xd8382a;

class Xiwangmu implements Figure {
  readonly group = new Group();
  readonly nativeSize = 2.7;
  readonly triangles: number;
  readonly heads: readonly Head[];
  private readonly w: Wardrobe;
  private readonly h: Humanoid;
  private readonly birds: { bird: Bird; phase: number }[] = [];

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    const B = new Group();
    B.rotation.y = -0.35;
    this.group.add(B);
    this.h = humanoid(w, { face: FACE, torso: ROBE, legs: ROBE, shoe: HAIR, headR: 0.48 }, B);
    for (const l of this.h.legs) l.hip.visible = false;
    w.part(new ConeGeometry(0.95, 1.7, 16, 1, true), "silk", ROBE, B, 0, 0.55, 0);
    w.part(new TorusGeometry(0.4, 0.05, 8, 24), "gold", JADE, B, 0, 1.2, 0).rotation.x = Math.PI / 2;
    for (const a of this.h.arms) w.part(new ConeGeometry(0.34, 0.9, 12, 1, true), "silk", SLEEVE, a.elbow, 0, -0.35, 0).rotation.x = Math.PI;
    // the coiffure and the 胜
    w.part(new SphereGeometry(0.5, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), "hair", HAIR, B, 0, 1.83, 0);
    for (const s of [-1, 1]) {
      w.part(new SphereGeometry(0.2, 12, 10), "hair", HAIR, B, s * 0.42, 2.25, -0.1);
      w.part(new SphereGeometry(0.045, 8, 6), "eye", 0x111111, B, s * 0.15, 1.84, 0.44);
      w.part(new CylinderGeometry(0.16, 0.16, 0.06, 16), "gold", JADE, B, s * 0.55, 2.5, 0).rotation.z = Math.PI / 2;
    }
    w.part(new CylinderGeometry(0.03, 0.03, 1.1, 8), "gold", GOLD, B, 0, 2.5, 0).rotation.z = Math.PI / 2;
    w.part(new ConeGeometry(0.08, 0.3, 6), "gold", GOLD, B, 0, 2.6, 0);
    // the peach in the right hand
    w.part(new SphereGeometry(0.13, 12, 10), "matte", PEACH, this.h.arms[1]!.elbow, 0, -0.55, 0.1);
    w.part(new ConeGeometry(0.05, 0.16, 4), "matte", JADE, this.h.arms[1]!.elbow, 0.06, -0.42, 0.1);
    cloudBank(
      w,
      CLOUD,
      [
        [0, -0.5, 0, 0.9],
        [-0.9, -0.55, 0.2, 0.6],
        [0.9, -0.55, 0.1, 0.65],
        [0.2, -0.4, 0.8, 0.5],
        [-0.3, -0.45, -0.7, 0.55],
        [1.5, -0.7, -0.2, 0.42],
        [-1.5, -0.7, 0, 0.4],
        [-2.1, -0.85, -0.4, 0.28],
      ],
      B,
    );
    for (let i = 0; i < 3; i++) this.birds.push({ bird: bird(w, { body: BLUE, crown: RED, tip: HAIR, beak: GOLD, size: 0.28 }, this.group), phase: i * 2.1 });
    // her head, coiffure and 胜 on a pivot at the neck, and each bird's own (D93)
    this.heads = [humanHead(this.h, B), ...this.birds.map((b) => b.bird.head)];
    w.bake(this.group);
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.w.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    const [l, r] = this.h.arms;
    r!.shoulder.rotation.set(-0.9, 0, 0.5);
    r!.elbow.rotation.set(-1.1, 0, 0);
    l!.shoulder.rotation.set(-0.5, 0, -0.45);
    l!.elbow.rotation.set(-1.2, 0, 0);
    this.birds.forEach(({ bird, phase }, i) => {
      const a = t * 1.1 + phase;
      const g = bird.group;
      g.position.set(Math.cos(a) * 2.2, 2.0 + Math.sin(a * 2) * 0.5 + i * 0.3, Math.sin(a) * 1.4);
      g.lookAt(g.position.x - Math.sin(a), g.position.y + Math.cos(a * 2) * 0.3, g.position.z + Math.cos(a) * 0.64);
      bird.flap(Math.sin(t * 14 + i));
    });
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("xiwangmu", (ctx) => new Xiwangmu(ctx));
