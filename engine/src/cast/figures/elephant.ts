/**
 * The elephant (D91): the emblem of Guilin. The Emperor of Heaven's mount
 * fell ill on a campaign south, the people of the Li nursed it and it
 * stayed with them, and as it drank from the river the Emperor's sword
 * pinned it to stone: Elephant Trunk Hill, with the pagoda on it for the
 * sword's hilt. Grey-white, a caparison of heaven's red and gold, ears
 * that swing, tusks, and a trunk along a curve rewritten each frame,
 * curling as if to drink from the air; it walks on cloud. In place as
 * `still`, or a slow circle.
 *
 * Native length 5 units, trunk to tail.
 */
import { BoxGeometry, CatmullRomCurve3, CylinderGeometry, Group, Mesh, SphereGeometry, TubeGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure } from "../figure.js";
import { Wardrobe, breathe, cloudBank } from "../parts.js";
import type { Skin } from "../skin.js";

const GREY = 0xd8d4cc;
const SHADE = 0xa9a49b;
const IVORY = 0xf7f1e0;
const RED = 0xc8342a;
const GOLD = 0xf1c24c;
const CLOUD = 0xffffff;

class Elephant implements Figure {
  readonly group = new Group();
  readonly nativeSize = 5;
  readonly triangles: number;
  private readonly w: Wardrobe;
  private readonly body = new Group();
  private readonly head = new Group();
  private readonly ears: { hinge: Group; side: number }[] = [];
  private readonly legs: { hip: Group; phase: number }[] = [];
  private readonly trunk: Mesh;
  private readonly trunkPts: Vector3[] = [];
  private readonly trunkCurve: CatmullRomCurve3;
  private readonly tail = new Group();
  private readonly cloud: Group;
  private readonly circuit: number;

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    this.circuit = ctx.variant === "still" ? 0 : 8;
    const B = this.body;
    this.group.add(B);
    w.part(new SphereGeometry(1.0, 20, 14), "silk", GREY, B, 0, 1.75, 0).scale.set(1.2, 1.05, 1.6);
    // the caparison, red with a gold hem
    w.part(new BoxGeometry(1.8, 0.1, 1.5), "silk", RED, B, 0, 2.6, -0.1);
    w.part(new BoxGeometry(1.86, 0.04, 1.56), "gold", GOLD, B, 0, 2.55, -0.1);
    // the head: skull, ears on hinges, tusks along a curve, the trunk
    const H = this.head;
    H.position.set(0, 2.05, 1.5);
    B.add(H);
    w.part(new SphereGeometry(0.62, 18, 14), "silk", GREY, H).scale.set(1.1, 1, 1);
    for (const s of [-1, 1]) {
      w.part(new SphereGeometry(0.28, 12, 10), "silk", GREY, H, s * 0.3, 0.45, 0.1);
      w.part(new SphereGeometry(0.06, 8, 6), "eye", 0x111111, H, s * 0.4, 0.15, 0.5);
      const hinge = new Group();
      hinge.position.set(s * 0.55, 0.2, 0.05);
      H.add(hinge);
      w.part(new SphereGeometry(0.55, 14, 10), "silk", SHADE, hinge, s * 0.3, -0.1, -0.15).scale.set(0.12, 1, 0.85);
      this.ears.push({ hinge, side: s });
      const tusk = new CatmullRomCurve3([new Vector3(s * 0.22, -0.3, 0.4), new Vector3(s * 0.32, -0.5, 0.9), new Vector3(s * 0.28, -0.32, 1.3)]);
      const tk = w.dress(new Mesh(new TubeGeometry(tusk, 8, 0.06, 6, false)), "horn", IVORY);
      H.add(tk);
    }
    for (let i = 0; i <= 8; i++) this.trunkPts.push(new Vector3(0, -0.15 - i * 0.2, 0.55 + i * 0.1));
    this.trunkCurve = new CatmullRomCurve3(this.trunkPts);
    this.trunk = w.dress(new Mesh(new TubeGeometry(this.trunkCurve, 24, 0.17, 8, false)), "silk", SHADE);
    H.add(this.trunk);
    // four legs, round feet
    for (const [x, z] of [
      [-0.55, 0.65],
      [0.55, 0.65],
      [-0.55, -0.7],
      [0.55, -0.7],
    ] as const) {
      const hip = new Group();
      hip.position.set(x, 1.3, z);
      B.add(hip);
      w.part(new CylinderGeometry(0.26, 0.3, 1.1, 12), "silk", SHADE, hip, 0, -0.55, 0);
      w.part(new CylinderGeometry(0.34, 0.34, 0.16, 12), "silk", SHADE, hip, 0, -1.12, 0);
      this.legs.push({ hip, phase: x < 0 !== z < 0 ? 0 : Math.PI });
    }
    this.tail.position.set(0, 2.0, -1.6);
    B.add(this.tail);
    w.part(new CylinderGeometry(0.03, 0.05, 1.0, 6), "silk", SHADE, this.tail, 0, -0.5, 0);
    w.part(new SphereGeometry(0.08, 8, 6), "hair", 0x3a332c, this.tail, 0, -1.0, 0);
    this.cloud = cloudBank(
      w,
      CLOUD,
      [
        [0, -0.35, 0.5, 0.6],
        [-0.7, -0.4, -0.4, 0.5],
        [0.75, -0.4, -0.35, 0.5],
        [0.1, -0.4, -1.2, 0.4],
        [-0.2, -0.45, 1.4, 0.4],
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
    const rate = 2.2;
    const bob = Math.abs(Math.sin(t * rate)) * 0.04;
    if (this.circuit > 0) {
      const a = -t * 0.04;
      this.body.position.set(Math.cos(a) * this.circuit, bob, Math.sin(a) * this.circuit);
      this.body.rotation.set(0, -a, Math.sin(t * rate) * 0.025);
    } else {
      this.body.position.set(0, bob, 0);
      this.body.rotation.set(0, 0, Math.sin(t * rate) * 0.025);
    }
    for (const l of this.legs) l.hip.rotation.x = Math.sin(t * rate + l.phase) * 0.3;
    for (const e of this.ears) e.hinge.rotation.y = e.side * (0.25 + Math.sin(t * 1.4 + e.side) * 0.3);
    this.head.rotation.set(Math.sin(t * 0.9) * 0.05, Math.sin(t * 0.6) * 0.1, 0);
    // the trunk hangs, sways, and curls its tip up as if to drink
    const curl = 0.3 + Math.sin(t * 0.7) * 0.35;
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      this.trunkPts[i]!.set(Math.sin(t * 0.9) * 0.3 * u, -0.15 - u * 1.55 + curl * u * u * 1.6, 0.55 + u * 1.0 - u * u * 0.6 + curl * u * u * 0.4);
    }
    this.trunk.geometry.dispose();
    this.trunk.geometry = new TubeGeometry(this.trunkCurve, 24, 0.17, 8, false);
    this.tail.rotation.set(0.3, 0, Math.sin(t * 1.7) * 0.2);
    breathe(this.cloud, t, 0.05);
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("elephant", (ctx) => new Elephant(ctx));
