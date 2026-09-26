/**
 * The tiger (D91): the one Wukong killed for his kilt (ch. 14), and the
 * one the gorge at the First Bend is named for, walking on air. A heavy
 * body in stripes computed in code, a pale belly and muzzle, round ears,
 * gold eyes, the 王 on the brow, a long tail rewritten each frame with a
 * black tip, and paws on puffs of cloud. It prowls a slow circle, or in
 * place as a companion.
 *
 * Native length 4.2 units, nose to tail tip.
 */
import { BoxGeometry, CapsuleGeometry, CatmullRomCurve3, ConeGeometry, Group, Mesh, SphereGeometry, TubeGeometry, Vector3, type DataTexture, type Material } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure } from "../figure.js";
import { Wardrobe, breathe, cloudBank, stripesTexture } from "../parts.js";
import type { Skin } from "../skin.js";

const ORANGE = 0xe8922a;
const BLACK = 0x1f1712;
const CREAM = 0xf5eee0;
const PINK = 0xd98a8a;
const GOLD = 0xf1c24c;
const CLOUD = 0xffffff;

interface Leg {
  readonly hip: Group;
  readonly knee: Group;
  readonly phase: number;
}

class Tiger implements Figure {
  readonly group = new Group();
  readonly nativeSize = 4.2;
  readonly triangles: number;
  private readonly w: Wardrobe;
  private readonly body = new Group();
  private readonly head = new Group();
  private readonly legs: Leg[] = [];
  private readonly tail: Mesh;
  private readonly tip: Mesh;
  private readonly tailPts: Vector3[] = [];
  private readonly tailCurve: CatmullRomCurve3;
  private readonly cloud: Group;
  private readonly circuit: number;

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    this.circuit = ctx.variant === "still" ? 0 : 8;
    const B = this.body;
    this.group.add(B);
    // The stripes are a texture the skin does not know; a striped part keeps its own map through a swap.
    const striped = (mesh: Mesh): Mesh => {
      const m = (mesh.material as Material).clone() as Material & { map?: DataTexture | null };
      m.map = stripesTexture(BLACK, ORANGE);
      mesh.material = m;
      return mesh;
    };
    striped(w.part(new CapsuleGeometry(0.55, 1.7, 6, 16), "matte", ORANGE, B, 0, 1.25, 0)).rotation.x = Math.PI / 2;
    w.part(new SphereGeometry(0.45, 16, 12), "silk", CREAM, B, 0, 0.98, 0.05).scale.set(0.9, 0.5, 1.7);
    // the head
    const H = this.head;
    H.position.set(0, 1.72, 1.35);
    B.add(H);
    striped(w.part(new SphereGeometry(0.42, 18, 14), "matte", ORANGE, H)).scale.set(1, 0.9, 1);
    w.part(new SphereGeometry(0.25, 14, 10), "silk", CREAM, H, 0, -0.12, 0.32).scale.set(1.1, 0.7, 0.9);
    w.part(new SphereGeometry(0.07, 8, 6), "matte", PINK, H, 0, -0.04, 0.56);
    for (const s of [-1, 1]) {
      w.part(new SphereGeometry(0.06, 8, 6), "gold", GOLD, H, s * 0.16, 0.08, 0.36);
      w.part(new SphereGeometry(0.035, 8, 6), "eye", 0x111111, H, s * 0.16, 0.08, 0.41);
      w.part(new SphereGeometry(0.13, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), "matte", ORANGE, H, s * 0.3, 0.32, -0.05).rotation.z = s * -0.5;
      w.part(new SphereGeometry(0.08, 8, 6), "silk", CREAM, H, s * 0.3, 0.33, 0.0).scale.set(0.6, 0.6, 0.3);
    }
    // the 王 on the brow: three bars and a stroke through them
    for (let i = 0; i < 3; i++) w.part(new BoxGeometry(0.2 - i * 0.02, 0.03, 0.02), "iron", BLACK, H, 0, 0.3 - i * 0.07, 0.4 - i * 0.01);
    w.part(new BoxGeometry(0.03, 0.18, 0.02), "iron", BLACK, H, 0, 0.23, 0.4);
    // four legs on hips, with a knee and a paw
    for (const [x, z] of [
      [-0.35, 0.62],
      [0.35, 0.62],
      [-0.35, -0.62],
      [0.35, -0.62],
    ] as const) {
      const hip = new Group();
      hip.position.set(x, 0.95, z);
      B.add(hip);
      w.part(new CapsuleGeometry(0.16, 0.55, 4, 10), "matte", ORANGE, hip, 0, -0.3, 0);
      const knee = new Group();
      knee.position.y = -0.6;
      hip.add(knee);
      w.part(new CapsuleGeometry(0.13, 0.5, 4, 10), "matte", ORANGE, knee, 0, -0.27, 0);
      w.part(new SphereGeometry(0.17, 10, 8), "silk", CREAM, knee, 0, -0.58, 0.05).scale.set(1.1, 0.6, 1.2);
      this.legs.push({ hip, knee, phase: x < 0 !== z < 0 ? 0 : Math.PI });
    }
    // the tail, rewritten each frame, with a black tip that follows its end
    for (let i = 0; i <= 7; i++) this.tailPts.push(new Vector3(0, 1.45, -0.95 - i * 0.2));
    this.tailCurve = new CatmullRomCurve3(this.tailPts);
    this.tail = striped(w.dress(new Mesh(new TubeGeometry(this.tailCurve, 16, 0.07, 6, false)), "matte", ORANGE));
    B.add(this.tail);
    this.tip = w.part(new ConeGeometry(0.08, 0.3, 6), "iron", BLACK, B);
    this.cloud = cloudBank(
      w,
      CLOUD,
      [
        [0, -0.35, 0.4, 0.45],
        [-0.5, -0.4, -0.35, 0.38],
        [0.55, -0.4, -0.3, 0.36],
        [0.1, -0.38, -1.0, 0.3],
        [-0.15, -0.45, 1.05, 0.3],
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
    const rate = 3.4;
    const sway = Math.sin(t * rate) * 0.04;
    if (this.circuit > 0) {
      const a = -t * 0.045;
      this.body.position.set(Math.cos(a) * this.circuit, Math.abs(Math.sin(t * rate)) * 0.04, Math.sin(a) * this.circuit);
      this.body.rotation.set(0, -a, sway);
    } else {
      this.body.position.set(0, Math.abs(Math.sin(t * rate)) * 0.04, 0);
      this.body.rotation.set(0, 0, sway);
    }
    for (const l of this.legs) {
      l.hip.rotation.x = Math.sin(t * rate + l.phase) * 0.5;
      l.knee.rotation.x = Math.max(0, Math.sin(t * rate + l.phase + 0.7)) * 0.75;
    }
    this.head.rotation.set(Math.sin(t * rate * 0.5) * 0.05 - 0.05, Math.sin(t * 0.7) * 0.2, 0);
    for (let i = 0; i <= 7; i++) {
      const u = i / 7;
      this.tailPts[i]!.set(Math.sin(t * 1.8 + u * 3) * 0.3 * u, 1.45 + Math.sin(u * 2.5 + t * 1.5) * 0.3 * u + u * 0.5, -0.95 - u * 1.5);
    }
    this.tail.geometry.dispose();
    this.tail.geometry = new TubeGeometry(this.tailCurve, 16, 0.07, 6, false);
    this.tip.position.copy(this.tailPts[7]!);
    this.tip.rotation.x = -Math.PI / 2;
    breathe(this.cloud, t, 0.05);
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("tiger", (ctx) => new Tiger(ctx));
