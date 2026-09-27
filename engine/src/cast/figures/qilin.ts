/**
 * The qilin (D91): the beast of good omen, which walks on air and treads on
 * nothing living, and comes when a sage is born. A deer's body in scales,
 * a dragon's head with two antlers and a beard, a mane, cloven hooves,
 * flames at the shoulders and the hocks, an ox's tail with a tuft. The
 * Ming woodblocks give it a golden coat with a green mane and belly; that
 * is the livery here. It walks a slow circle on puffs of cloud, or in
 * place as a companion.
 *
 * Native length 4.6 units, nose to tail.
 * Baked into one skinned mesh per material (F111), all but the tail,
 * rebuilt each frame: the legs and head move by their groups, each flame
 * flickers and the tuft follows the tail on a pivot of its own, and the
 * cloud holds still.
 */
import { CapsuleGeometry, CatmullRomCurve3, ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, TubeGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure } from "../figure.js";
import { Wardrobe, cloudBank } from "../parts.js";
import type { Skin } from "../skin.js";

const COAT = 0xe0a63a;
const BELLY = 0xdbe3b0;
const MANE = 0x2f7a5a;
const HORN = 0xf3d9a0;
const DARK = 0x2a2320;
const FIRE = 0xff9a3a;
const CLOUD = 0xffffff;

interface Leg {
  readonly hip: Group;
  readonly knee: Group;
  readonly phase: number;
}

class Qilin implements Figure {
  readonly group = new Group();
  readonly nativeSize = 4.6;
  readonly triangles: number;
  private readonly w: Wardrobe;
  private readonly body = new Group();
  private readonly head = new Group();
  private readonly legs: Leg[] = [];
  private readonly flames: Group[] = [];
  private readonly tail: Mesh;
  private readonly tuft = new Group();
  private readonly tailPts: Vector3[] = [];
  private readonly tailCurve: CatmullRomCurve3;
  private readonly circuit: number;

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    this.circuit = ctx.variant === "still" ? 0 : 8;
    const B = this.body;
    this.group.add(B);
    // the trunk: a deer's, deep at the chest, pale below
    w.part(new CapsuleGeometry(0.5, 1.5, 6, 14), "scale", COAT, B, 0, 1.35, 0).rotation.x = Math.PI / 2;
    w.part(new SphereGeometry(0.52, 16, 12), "scale", COAT, B, 0, 1.4, 0.75).scale.set(0.95, 0.95, 0.75);
    w.part(new SphereGeometry(0.42, 16, 12), "belly", BELLY, B, 0, 1.05, 0.05).scale.set(0.9, 0.55, 1.8);
    w.part(new CapsuleGeometry(0.22, 0.9, 6, 12), "scale", COAT, B, 0, 1.9, 1.15).rotation.x = -0.75;
    for (let i = 0; i < 7; i++) w.part(new ConeGeometry(0.09, 0.42, 5), "mane", MANE, B, 0, 1.75 + i * 0.13, 0.7 + i * 0.1).rotation.x = -1.0;
    // the head: a dragon's, on the deer's neck
    const H = this.head;
    H.position.set(0, 2.42, 1.62);
    B.add(H);
    w.part(new SphereGeometry(0.32, 16, 12), "scale", COAT, H).scale.set(0.9, 0.8, 1.3);
    w.part(new SphereGeometry(0.2, 12, 10), "scale", COAT, H, 0, -0.08, 0.38).scale.set(0.9, 0.7, 1.5);
    w.part(new SphereGeometry(0.075, 8, 6), "matte", DARK, H, 0, 0.02, 0.66);
    w.part(new ConeGeometry(0.08, 0.36, 6), "mane", MANE, H, 0, -0.28, 0.3).rotation.x = Math.PI - 0.4;
    for (const s of [-1, 1]) {
      w.part(new SphereGeometry(0.055, 8, 6), "eye", 0x111111, H, s * 0.17, 0.1, 0.3);
      w.part(new ConeGeometry(0.07, 0.22, 5), "scale", COAT, H, s * 0.26, 0.24, -0.05).rotation.set(-0.5, 0, s * 0.9);
      w.part(new ConeGeometry(0.05, 0.85, 6), "horn", HORN, H, s * 0.15, 0.55, -0.08).rotation.set(-0.45, 0, s * 0.35);
      w.part(new ConeGeometry(0.035, 0.42, 5), "horn", HORN, H, s * 0.3, 0.72, -0.2).rotation.set(-0.2, 0, s * 1.0);
    }
    // flames at the shoulders and the hocks
    for (const [x, y, z] of [
      [-0.5, 1.55, 0.7],
      [0.5, 1.55, 0.7],
      [-0.5, 1.3, -0.7],
      [0.5, 1.3, -0.7],
    ] as const)
      for (let i = 0; i < 3; i++) {
        // each flame flickers on a pivot of its own, so the bake gives it a bone
        const fl = new Group();
        fl.position.set(x + Math.sign(x) * i * 0.08, y + i * 0.05, z - i * 0.12);
        fl.rotation.set(0.5 + i * 0.25, 0, Math.sign(x) * 0.5);
        B.add(fl);
        w.part(new ConeGeometry(0.07, 0.42, 5), "flame", FIRE, fl);
        this.flames.push(fl);
      }
    // four legs on hips, each with a knee and a cloven hoof
    for (const [x, z] of [
      [-0.3, 0.62],
      [0.3, 0.62],
      [-0.3, -0.55],
      [0.3, -0.55],
    ] as const) {
      const hip = new Group();
      hip.position.set(x, 1.05, z);
      B.add(hip);
      w.part(new CapsuleGeometry(0.11, 0.62, 4, 10), "scale", COAT, hip, 0, -0.33, 0);
      const knee = new Group();
      knee.position.y = -0.68;
      hip.add(knee);
      w.part(new CapsuleGeometry(0.08, 0.58, 4, 10), "scale", COAT, knee, 0, -0.3, 0);
      for (const s of [-1, 1]) w.part(new CylinderGeometry(0.05, 0.06, 0.14, 8), "horn", DARK, knee, s * 0.05, -0.66, 0.02);
      this.legs.push({ hip, knee, phase: x < 0 !== z < 0 ? 0 : Math.PI });
    }
    // the tail, rewritten each frame, and the tuft that follows its end
    for (let i = 0; i <= 6; i++) this.tailPts.push(new Vector3(0, 1.4 - i * 0.1, -0.95 - i * 0.18));
    this.tailCurve = new CatmullRomCurve3(this.tailPts);
    this.tail = w.dress(new Mesh(new TubeGeometry(this.tailCurve, 14, 0.05, 6, false)), "scale", COAT);
    B.add(this.tail);
    B.add(this.tuft);
    w.part(new ConeGeometry(0.12, 0.42, 6), "mane", MANE, this.tuft);
    cloudBank(
      w,
      CLOUD,
      [
        [0, -0.4, 0.4, 0.42],
        [-0.45, -0.45, -0.3, 0.36],
        [0.5, -0.45, -0.35, 0.34],
        [0.1, -0.42, -0.95, 0.3],
        [-0.2, -0.5, 1.0, 0.28],
      ],
      B,
    );
    w.bake(this.body, [this.tail]);
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.w.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    const bob = Math.abs(Math.sin(t * 4)) * 0.05;
    if (this.circuit > 0) {
      const a = -t * 0.05;
      this.body.position.set(Math.cos(a) * this.circuit, bob, Math.sin(a) * this.circuit);
      this.body.rotation.y = -a;
    } else this.body.position.set(0, bob, 0);
    for (const l of this.legs) {
      l.hip.rotation.x = Math.sin(t * 4 + l.phase) * 0.45;
      l.knee.rotation.x = Math.max(0, Math.sin(t * 4 + l.phase + 0.6)) * 0.7;
    }
    this.head.rotation.x = Math.sin(t * 4) * 0.06 - 0.1;
    this.flames.forEach((fl, i) => {
      fl.scale.y = 1 + Math.sin(t * 13 + i) * 0.25;
    });
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      this.tailPts[i]!.set(Math.sin(t * 2.2 + u * 3) * 0.2 * u, 1.4 - u * 0.5 - u * u * 0.4, -0.95 - u * 1.0);
    }
    this.tail.geometry.dispose();
    this.tail.geometry = new TubeGeometry(this.tailCurve, 14, 0.05, 6, false);
    this.tuft.position.copy(this.tailPts[6]!);
    this.tuft.rotation.x = Math.PI * 0.8;
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("qilin", (ctx) => new Qilin(ctx));
