/**
 * The old turtle of the Tongtian River (D91), the 鼋 who carried the
 * pilgrims over on his back (ch. 49) and, asked one question too few,
 * tipped the scriptures into the water on the way home (ch. 99). A great
 * soft-shelled turtle: a domed shell with a rim and moss on it, a pale
 * plastron, a long neck with the soft-shell's tube of a nose, four paddles
 * that row the air, a short tail. He swims a slow circle, or holds beside
 * the camera as `still`.
 *
 * Native length 4 units, nose to tail.
 */
import { CapsuleGeometry, ConeGeometry, CylinderGeometry, Group, SphereGeometry, TorusGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure } from "../figure.js";
import { Wardrobe } from "../parts.js";
import type { Skin } from "../skin.js";

const SHELL = 0x3b5a48;
const RIM = 0x2c4436;
const PLASTRON = 0xd9c9a0;
const HIDE = 0x6f7a4a;
const MOSS = 0x5f8a3a;

class Turtle implements Figure {
  readonly group = new Group();
  readonly nativeSize = 4;
  readonly triangles: number;
  private readonly w: Wardrobe;
  private readonly body = new Group();
  private readonly neck = new Group();
  private readonly paddles: { g: Group; phase: number; side: number }[] = [];
  private readonly circuit: number;

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    this.circuit = ctx.variant === "still" ? 0 : 8;
    const B = this.body;
    this.group.add(B);
    w.part(new SphereGeometry(1.0, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), "scale", SHELL, B, 0, 0.72, 0).scale.set(1.15, 0.55, 1.4);
    w.part(new TorusGeometry(1.2, 0.12, 8, 32), "scale", RIM, B, 0, 0.72, 0).rotation.x = Math.PI / 2;
    B.children[1]!.scale.set(1, 1.2, 1);
    w.part(new SphereGeometry(1.0, 20, 12), "belly", PLASTRON, B, 0, 0.62, 0).scale.set(1.05, 0.22, 1.3);
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4;
      w.part(new SphereGeometry(0.18, 8, 6), "matte", MOSS, B, Math.cos(a) * 0.6, 0.72 + 0.5 * Math.sqrt(Math.max(0, 1 - 0.3 * (i % 3))), Math.sin(a) * 0.8).scale.set(1, 0.35, 1);
    }
    // the neck and head, the soft-shell's nose out front
    const N = this.neck;
    N.position.set(0, 0.85, 1.4);
    B.add(N);
    w.part(new CapsuleGeometry(0.2, 0.8, 6, 12), "skin", HIDE, N, 0, 0.1, 0.35).rotation.x = -1.25;
    w.part(new SphereGeometry(0.28, 14, 10), "skin", HIDE, N, 0, 0.25, 0.8).scale.set(0.9, 0.8, 1.2);
    w.part(new CylinderGeometry(0.06, 0.09, 0.28, 8), "skin", HIDE, N, 0, 0.3, 1.15).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) w.part(new SphereGeometry(0.05, 8, 6), "eye", 0x111111, N, s * 0.16, 0.36, 0.95);
    // four paddles that row
    for (const [x, z] of [
      [-1.0, 0.7],
      [1.0, 0.7],
      [-0.95, -0.75],
      [0.95, -0.75],
    ] as const) {
      const g = new Group();
      g.position.set(x, 0.66, z);
      B.add(g);
      const paddle = w.part(new CapsuleGeometry(0.22, 0.9, 6, 10), "skin", HIDE, g, Math.sign(x) * 0.5, 0, 0);
      paddle.rotation.z = Math.PI / 2;
      paddle.scale.set(1, 1, 0.35);
      this.paddles.push({ g, phase: z > 0 ? 0 : Math.PI * 0.7, side: Math.sign(x) });
    }
    w.part(new ConeGeometry(0.12, 0.6, 6), "skin", HIDE, B, 0, 0.66, -1.55).rotation.x = -Math.PI / 2 - 0.2;
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.w.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    const rate = 1.6;
    if (this.circuit > 0) {
      const a = -t * 0.04;
      this.body.position.set(Math.cos(a) * this.circuit, Math.sin(t * rate) * 0.08, Math.sin(a) * this.circuit);
      this.body.rotation.set(Math.sin(t * rate + 1) * 0.04, -a, Math.sin(t * 0.5) * 0.03);
    } else {
      this.body.position.set(0, Math.sin(t * rate) * 0.08, 0);
      this.body.rotation.set(Math.sin(t * rate + 1) * 0.04, 0, Math.sin(t * 0.5) * 0.03);
    }
    for (const p of this.paddles) {
      p.g.rotation.y = p.side * Math.sin(t * rate + p.phase) * 0.55;
      p.g.rotation.z = p.side * Math.cos(t * rate + p.phase) * 0.25;
    }
    this.neck.rotation.set(Math.sin(t * 0.9) * 0.08, Math.sin(t * 0.4) * 0.25, 0);
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("turtle", (ctx) => new Turtle(ctx));
