/**
 * Yao Ji (D91), the Goddess of Wu Mountain: the Red Emperor's daughter who
 * died unwed and became the morning cloud and the evening rain over the
 * gorge (Song Yu's Gaotang fu), and in the boatmen's telling helped Yu cut
 * the gorges and stayed to see the boats through the rapids until she
 * turned to stone: Goddess Peak, on the north bank of the Wu Gorge, where
 * the film stands her. A maiden in jade green on a cloud, her hair in two
 * loops, two white ribbons streaming from her shoulders, one hand raised
 * over the river. She is a monument, and does not leave her peak.
 *
 * Native height 3 units to the hair.
 */
import { CatmullRomCurve3, ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, TorusGeometry, TubeGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure, type Head } from "../figure.js";
import { Wardrobe, breathe, cloudBank, humanHead, humanoid, type Humanoid } from "../parts.js";
import type { Skin } from "../skin.js";

const FACE = 0xf7e3d2;
const JADE = 0x7fc4ad;
const SKIRT = 0xdff0e8;
const SLEEVE = 0xf7f3ea;
const RIBBON = 0xffffff;
const HAIR = 0x1e1a1c;
const GOLD = 0xf1c24c;
const CLOUD = 0xffffff;

interface Ribbon {
  readonly mesh: Mesh;
  readonly pts: Vector3[];
  readonly curve: CatmullRomCurve3;
  readonly side: number;
}

class YaoJi implements Figure {
  readonly group = new Group();
  readonly nativeSize = 3;
  readonly triangles: number;
  readonly heads: readonly Head[];
  private readonly w: Wardrobe;
  private readonly body = new Group();
  private readonly h: Humanoid;
  private readonly cloud: Group;
  private readonly ribbons: Ribbon[] = [];

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    const B = this.body;
    this.group.add(B);
    this.h = humanoid(w, { face: FACE, torso: JADE, legs: JADE, shoe: HAIR, headR: 0.46 }, B);
    for (const l of this.h.legs) l.hip.visible = false;
    w.part(new ConeGeometry(0.9, 1.7, 16, 1, true), "silk", SKIRT, B, 0, 0.55, 0);
    w.part(new TorusGeometry(0.38, 0.045, 8, 24), "gold", GOLD, B, 0, 1.22, 0).rotation.x = Math.PI / 2;
    for (const a of this.h.arms) w.part(new ConeGeometry(0.3, 0.85, 12, 1, true), "silk", SLEEVE, a.elbow, 0, -0.32, 0).rotation.x = Math.PI;
    // the hair: a cap of it, two loops over the crown, a gold pin
    w.part(new SphereGeometry(0.48, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), "hair", HAIR, B, 0, 1.83, 0);
    for (const s of [-1, 1]) {
      w.part(new TorusGeometry(0.2, 0.06, 8, 18), "hair", HAIR, B, s * 0.3, 2.35, -0.05).rotation.y = s * 0.5;
      w.part(new SphereGeometry(0.045, 8, 6), "eye", 0x111111, B, s * 0.15, 1.84, 0.42);
    }
    w.part(new CylinderGeometry(0.02, 0.02, 0.9, 6), "gold", GOLD, B, 0, 2.28, -0.1).rotation.z = Math.PI / 2 + 0.15;
    // the head, hair, loops and pin on a pivot at the neck (D93)
    this.heads = [humanHead(this.h, B)];
    // two ribbons from the shoulders, along curves rewritten each frame
    for (const side of [-1, 1]) {
      const pts: Vector3[] = [];
      for (let i = 0; i <= 12; i++) pts.push(new Vector3(side * 0.45, 1.4, -0.2 - i * 0.2));
      const curve = new CatmullRomCurve3(pts);
      const mesh = w.dress(new Mesh(new TubeGeometry(curve, 30, 0.05, 5, false)), "silk", RIBBON);
      B.add(mesh);
      this.ribbons.push({ mesh, pts, curve, side });
    }
    this.cloud = cloudBank(
      w,
      CLOUD,
      [
        [0, -0.5, 0, 0.9],
        [-0.9, -0.55, 0.2, 0.6],
        [0.9, -0.55, 0.1, 0.62],
        [0.2, -0.4, 0.8, 0.5],
        [-0.3, -0.45, -0.7, 0.55],
        [1.5, -0.7, -0.2, 0.4],
        [-1.5, -0.7, 0, 0.4],
      ],
      B,
    );
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.w.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    const [l, r] = this.h.arms;
    // the right hand raised over the river, the left in its sleeve
    r!.shoulder.rotation.set(-2.3, 0, 0.45 + Math.sin(t * 0.8) * 0.04);
    r!.elbow.rotation.set(-0.5, 0, 0);
    l!.shoulder.rotation.set(-0.4, 0, -0.35);
    l!.elbow.rotation.set(-1.1, 0, 0);
    this.body.rotation.z = Math.sin(t * 0.6) * 0.02;
    for (const rb of this.ribbons) {
      for (let i = 0; i <= 12; i++) {
        const u = i / 12;
        rb.pts[i]!.set(rb.side * (0.45 + u * 0.7) + Math.sin(u * 5 - t * 2.5) * 0.3 * u, 1.4 + u * 1.3 + Math.sin(u * 4 - t * 2) * 0.28 * u, -0.2 - u * 2.3);
      }
      rb.mesh.geometry.dispose();
      rb.mesh.geometry = new TubeGeometry(rb.curve, 30, 0.05, 5, false);
    }
    breathe(this.cloud, t);
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("yaoji", (ctx) => new YaoJi(ctx));
