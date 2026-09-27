/**
 * The Bull Demon King (D91), Wukong's sworn brother from the Havoc and
 * the Flaming Mountains' master by marriage, in the form he took when the
 * fight was lost (ch. 61): a great white bull, "horns like two iron
 * towers, eyes like lightning", the one Nezha hung his fire wheel on and
 * blew alight. A heavy white body with a hump and a dewlap, a broad pale
 * muzzle, iron-dark horns curving out and up, the fire wheel on the right
 * horn, hooves on cloud. He walks, tossing his head; in place as `still`,
 * or a slow circle.
 *
 * Native length 6.5 units, muzzle to tail.
 * Baked into one skinned mesh per material (F112), all but the tail,
 * rebuilt each frame: the head, legs and wheel move by their groups, each
 * flame flickers and the tuft follows the tail on a pivot of its own, and
 * the cloud holds still.
 */
import { CapsuleGeometry, CatmullRomCurve3, ConeGeometry, Group, Mesh, SphereGeometry, TorusGeometry, TubeGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure } from "../figure.js";
import { Wardrobe, cloudBank } from "../parts.js";
import type { Skin } from "../skin.js";

const WHITE = 0xf3f1ec;
const PALE = 0xdad6cd;
const IRON = 0x3a3a44;
const HOOF = 0x2a2a30;
const LIGHTNING = 0xffb040;
const GOLD = 0xf2c25a;
const FLAME = 0xffa030;
const CLOUD = 0xffffff;

interface Leg {
  readonly hip: Group;
  readonly knee: Group;
  readonly phase: number;
}

class NiuMoWang implements Figure {
  readonly group = new Group();
  readonly nativeSize = 6.5;
  readonly triangles: number;
  private readonly w: Wardrobe;
  private readonly body = new Group();
  private readonly head = new Group();
  private readonly wheel = new Group();
  private readonly flames: Group[] = [];
  private readonly legs: Leg[] = [];
  private readonly tail: Mesh;
  private readonly tuft = new Group();
  private readonly tailPts: Vector3[] = [];
  private readonly tailCurve: CatmullRomCurve3;
  private readonly circuit: number;

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    this.circuit = ctx.variant === "still" ? 0 : 10;
    const B = this.body;
    this.group.add(B);
    w.part(new CapsuleGeometry(0.9, 2.4, 6, 18), "silk", WHITE, B, 0, 1.7, 0).rotation.x = Math.PI / 2;
    w.part(new SphereGeometry(0.8, 16, 12), "silk", WHITE, B, 0, 2.3, 0.9).scale.set(1, 0.85, 1.1);
    w.part(new SphereGeometry(0.55, 14, 10), "silk", PALE, B, 0, 1.1, 1.55).scale.set(0.8, 1.1, 0.7);
    // the head, and the horns like iron towers
    const H = this.head;
    H.position.set(0, 2.25, 2.05);
    B.add(H);
    w.part(new SphereGeometry(0.58, 18, 14), "silk", WHITE, H).scale.set(1.1, 0.9, 1.1);
    w.part(new SphereGeometry(0.45, 16, 12), "silk", PALE, H, 0, -0.22, 0.6).scale.set(1, 0.75, 1.2);
    for (const s of [-1, 1]) {
      w.part(new SphereGeometry(0.07, 8, 6), "iron", HOOF, H, s * 0.17, -0.3, 1.1);
      w.part(new SphereGeometry(0.1, 10, 8), "flame", LIGHTNING, H, s * 0.32, 0.12, 0.44);
      w.part(new SphereGeometry(0.05, 8, 6), "eye", 0x111111, H, s * 0.34, 0.12, 0.52);
      w.part(new ConeGeometry(0.14, 0.4, 6), "silk", PALE, H, s * 0.6, 0.15, -0.1).rotation.set(0, 0, s * 1.4);
      const horn = new CatmullRomCurve3([new Vector3(s * 0.3, 0.35, -0.1), new Vector3(s * 0.95, 0.75, -0.25), new Vector3(s * 1.35, 1.45, -0.15), new Vector3(s * 1.4, 2.05, 0.1)]);
      const shaft = w.dress(new Mesh(new TubeGeometry(horn, 12, 0.13, 8, false)), "iron", IRON);
      H.add(shaft);
      w.part(new ConeGeometry(0.13, 0.4, 8), "iron", IRON, H, s * 1.4, 2.2, 0.12);
    }
    // the fire wheel hooked on the right horn: a gold hoop and six flames
    const W = this.wheel;
    W.position.set(1.15, 1.1, -0.2);
    W.rotation.set(0, 0, 0.55);
    H.add(W);
    w.part(new TorusGeometry(0.5, 0.06, 8, 28), "gold", GOLD, W).rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      // each flame flickers on a pivot of its own, so the bake gives it a bone
      const fl = new Group();
      fl.position.set(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6);
      fl.rotation.set(0, -a, Math.PI / 2);
      W.add(fl);
      w.part(new ConeGeometry(0.1, 0.4, 5), "flame", FLAME, fl);
      this.flames.push(fl);
    }
    // four legs on hips, with a knee and a hoof
    for (const [x, z] of [
      [-0.5, 0.95],
      [0.5, 0.95],
      [-0.5, -0.95],
      [0.5, -0.95],
    ] as const) {
      const hip = new Group();
      hip.position.set(x, 1.25, z);
      B.add(hip);
      w.part(new CapsuleGeometry(0.2, 0.6, 4, 10), "silk", WHITE, hip, 0, -0.35, 0);
      const knee = new Group();
      knee.position.y = -0.7;
      hip.add(knee);
      w.part(new CapsuleGeometry(0.15, 0.5, 4, 10), "silk", WHITE, knee, 0, -0.3, 0);
      w.part(new ConeGeometry(0.2, 0.22, 10), "iron", HOOF, knee, 0, -0.62, 0).rotation.x = Math.PI;
      this.legs.push({ hip, knee, phase: x < 0 !== z < 0 ? 0 : Math.PI });
    }
    for (let i = 0; i <= 6; i++) this.tailPts.push(new Vector3(0, 1.9 - i * 0.2, -1.6 - i * 0.1));
    this.tailCurve = new CatmullRomCurve3(this.tailPts);
    this.tail = w.dress(new Mesh(new TubeGeometry(this.tailCurve, 14, 0.06, 6, false)), "silk", WHITE);
    B.add(this.tail);
    B.add(this.tuft);
    w.part(new ConeGeometry(0.12, 0.4, 6), "mane", PALE, this.tuft);
    cloudBank(
      w,
      CLOUD,
      [
        [0, -0.4, 0.6, 0.6],
        [-0.7, -0.45, -0.5, 0.5],
        [0.75, -0.45, -0.4, 0.5],
        [0.1, -0.42, -1.4, 0.42],
        [-0.2, -0.5, 1.6, 0.4],
        [1.3, -0.6, 0.3, 0.32],
      ],
      B,
    );
    w.bake(B, [this.tail]);
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.w.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    const rate = 2.4;
    const bob = Math.abs(Math.sin(t * rate)) * 0.05;
    if (this.circuit > 0) {
      const a = -t * 0.04;
      this.body.position.set(Math.cos(a) * this.circuit, bob, Math.sin(a) * this.circuit);
      this.body.rotation.set(0, -a, Math.sin(t * rate) * 0.03);
    } else {
      this.body.position.set(0, bob, 0);
      this.body.rotation.set(0, 0, Math.sin(t * rate) * 0.03);
    }
    for (const l of this.legs) {
      l.hip.rotation.x = Math.sin(t * rate + l.phase) * 0.4;
      l.knee.rotation.x = Math.max(0, Math.sin(t * rate + l.phase + 0.7)) * 0.6;
    }
    this.head.rotation.set(Math.sin(t * 1.3) * 0.12 - 0.08, Math.sin(t * 0.5) * 0.15, Math.sin(t * 1.3 + 1) * 0.05);
    this.wheel.rotation.y = t * 3;
    this.flames.forEach((fl, i) => {
      fl.scale.y = 1 + Math.sin(t * 15 + i) * 0.3;
    });
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      this.tailPts[i]!.set(Math.sin(t * 1.6 + u * 3) * 0.35 * u, 1.9 - u * 1.2 - u * u * 0.3, -1.6 - u * 0.5);
    }
    this.tail.geometry.dispose();
    this.tail.geometry = new TubeGeometry(this.tailCurve, 14, 0.06, 6, false);
    this.tuft.position.copy(this.tailPts[6]!);
    this.tuft.rotation.x = Math.PI * 0.85;
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("niumowang", (ctx) => new NiuMoWang(ctx));
