/**
 * Laozi (D97), Taishang Laojun, riding his green ox west out of the Hangu
 * Pass, when the pass keeper Yin Xi saw a purple air come from the east and
 * knew a sage was coming. He left the five thousand characters at the pass
 * and was not seen again. The old sage of the painters, not the enthroned
 * Daode Tianzun of the altar: a very old man in plain hemp and a dark
 * over-robe, a long white beard, a horsetail whisk over his shoulder and a
 * gourd at his side, seated sideways on a placid ox of slate blue-green
 * with long horns swept back, which walks a bank of violet cloud. The ox
 * walks, its head nodding and its tail swinging; the old man sits still.
 * In place as `still`, or a slow circle.
 *
 * The painted card (`paintings/laozi.ts`) is what the film draws; this is
 * the figure made in code, for `?paint=off`. Baked into one skinned mesh
 * per material but the tail, rebuilt each frame; the cloud holds still.
 *
 * Native length 6 units, muzzle to tail.
 */
import { CapsuleGeometry, CatmullRomCurve3, ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, TubeGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure, type Head } from "../figure.js";
import { Wardrobe, cloudBank, humanHead, humanoid, neckWithin } from "../parts.js";
import type { Skin } from "../skin.js";

const QING = 0x3f5a58;
const MUZZLE = 0x5d6f6c;
const HORN = 0x6a6258;
const HOOF = 0x2a2a28;
const FACE = 0xe9cdb2;
const HEMP = 0xe6dccb;
const ROBE = 0x2f3a5a;
const WHITE = 0xf2f0ea;
const GOURD = 0xb07a3a;
const WOOD = 0x5a4130;
const VIOLET = 0xc8b4e8;

interface Leg {
  readonly hip: Group;
  readonly knee: Group;
  readonly phase: number;
}

class Laozi implements Figure {
  readonly group = new Group();
  readonly nativeSize = 6;
  readonly triangles: number;
  readonly heads: readonly Head[];
  private readonly w: Wardrobe;
  private readonly body = new Group();
  private readonly head = new Group();
  private readonly legs: Leg[] = [];
  private readonly tail: Mesh;
  private readonly tailPts: Vector3[] = [];
  private readonly tailCurve: CatmullRomCurve3;
  private readonly circuit: number;

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    this.circuit = ctx.variant === "still" ? 0 : 9;
    const B = this.body;
    this.group.add(B);
    // the ox: a long barrel of a body, a low head, horns swept back
    w.part(new CapsuleGeometry(0.8, 2.2, 6, 18), "silk", QING, B, 0, 1.55, 0).rotation.x = Math.PI / 2;
    const H = this.head;
    H.position.set(0, 1.75, 1.95);
    B.add(H);
    w.part(new SphereGeometry(0.5, 18, 14), "silk", QING, H).scale.set(1, 0.9, 1.2);
    w.part(new SphereGeometry(0.38, 16, 12), "silk", MUZZLE, H, 0, -0.2, 0.55).scale.set(1, 0.75, 1.1);
    for (const s of [-1, 1]) {
      w.part(new SphereGeometry(0.05, 8, 6), "eye", 0x111111, H, s * 0.3, 0.1, 0.42);
      w.part(new ConeGeometry(0.12, 0.35, 6), "silk", QING, H, s * 0.52, 0.12, -0.05).rotation.set(0, 0, s * 1.4);
      const horn = new CatmullRomCurve3([new Vector3(s * 0.3, 0.3, -0.05), new Vector3(s * 0.8, 0.45, -0.4), new Vector3(s * 1.05, 0.6, -1.0), new Vector3(s * 0.95, 0.8, -1.5)]);
      H.add(w.dress(new Mesh(new TubeGeometry(horn, 12, 0.09, 8, false)), "horn", HORN));
    }
    for (const [x, z] of [
      [-0.45, 0.9],
      [0.45, 0.9],
      [-0.45, -0.9],
      [0.45, -0.9],
    ] as const) {
      const hip = new Group();
      hip.position.set(x, 1.1, z);
      B.add(hip);
      w.part(new CapsuleGeometry(0.2, 0.5, 4, 10), "silk", QING, hip, 0, -0.3, 0);
      const knee = new Group();
      knee.position.y = -0.62;
      hip.add(knee);
      w.part(new CapsuleGeometry(0.15, 0.4, 4, 10), "silk", QING, knee, 0, -0.25, 0);
      w.part(new ConeGeometry(0.19, 0.2, 10), "iron", HOOF, knee, 0, -0.54, 0).rotation.x = Math.PI;
      this.legs.push({ hip, knee, phase: x < 0 !== z < 0 ? 0 : Math.PI });
    }
    for (let i = 0; i <= 6; i++) this.tailPts.push(new Vector3(0, 1.8 - i * 0.2, -1.5 - i * 0.08));
    this.tailCurve = new CatmullRomCurve3(this.tailPts);
    this.tail = w.dress(new Mesh(new TubeGeometry(this.tailCurve, 14, 0.05, 6, false)), "silk", QING);
    B.add(this.tail);
    // the folded cloth he sits on, and the old man, sideways, facing the lens's side
    w.part(new CapsuleGeometry(0.5, 0.5, 4, 12), "silk", HEMP, B, 0, 2.28, -0.1).scale.set(1.3, 0.25, 1);
    const rider = new Group();
    rider.position.set(0.1, 2.0, -0.1);
    rider.rotation.y = Math.PI / 2;
    rider.scale.setScalar(0.72);
    B.add(rider);
    const h = humanoid(w, { face: FACE, torso: ROBE, legs: HEMP, shoe: HOOF, skirt: HEMP }, rider);
    for (const leg of h.legs) leg.hip.rotation.x = -1.3;
    // bald brow and a small knot of white hair with its pin, and the long white beard
    w.part(new SphereGeometry(0.16, 10, 8), "hair", WHITE, rider, 0, 2.3, -0.2);
    w.part(new CylinderGeometry(0.015, 0.015, 0.45, 5), "iron", WOOD, rider, 0, 2.32, -0.2).rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) w.part(new SphereGeometry(0.045, 8, 6), "eye", 0x111111, rider, s * 0.16, 1.84, 0.46);
    const beard = w.part(new ConeGeometry(0.2, 0.9, 8), "hair", WHITE, rider, 0, 1.3, 0.38);
    beard.rotation.x = Math.PI + 0.15;
    // the whisk over his right shoulder, the gourd at his left side
    const [left, right] = h.arms;
    right!.shoulder.rotation.set(-0.9, 0, 0.3);
    right!.elbow.rotation.set(-1.4, 0, 0);
    left!.shoulder.rotation.set(-0.5, 0, -0.2);
    left!.elbow.rotation.set(-0.6, 0, 0);
    const whisk = new Group();
    whisk.position.set(0.45, 1.4, 0.2);
    whisk.rotation.set(0.6, 0, -0.3);
    rider.add(whisk);
    w.part(new CylinderGeometry(0.025, 0.025, 0.9, 6), "horn", WOOD, whisk, 0, 0.4, 0);
    w.part(new ConeGeometry(0.1, 0.9, 8), "hair", WHITE, whisk, 0, 0.5, -0.25).rotation.x = -2.6;
    w.part(new SphereGeometry(0.12, 10, 8), "matte", GOURD, rider, -0.42, 0.85, 0.15);
    w.part(new SphereGeometry(0.17, 10, 8), "matte", GOURD, rider, -0.42, 0.62, 0.15);
    const heads = [humanHead(h, rider, 0.8, 0.3)];
    heads[0]!.pivot.attach(beard);
    // the ox's head on a pivot inside the one it nods (D93)
    heads.push(neckWithin(H, 0.6, 0.3));
    this.heads = heads;
    // the purple air: the bank of cloud it walks
    cloudBank(
      w,
      VIOLET,
      [
        [0, -0.35, 0.6, 0.55],
        [-0.6, -0.4, -0.5, 0.48],
        [0.65, -0.4, -0.4, 0.48],
        [0.1, -0.42, -1.4, 0.42],
        [-0.2, -0.5, 1.5, 0.4],
        [0.2, -0.55, -2.3, 0.34],
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
    const rate = 1.8;
    const bob = Math.abs(Math.sin(t * rate)) * 0.04;
    if (this.circuit > 0) {
      const a = -t * 0.035;
      this.body.position.set(Math.cos(a) * this.circuit, bob, Math.sin(a) * this.circuit);
      this.body.rotation.set(0, -a, 0);
    } else this.body.position.set(0, bob, 0);
    for (const l of this.legs) {
      l.hip.rotation.x = Math.sin(t * rate + l.phase) * 0.3;
      l.knee.rotation.x = Math.max(0, Math.sin(t * rate + l.phase + 0.7)) * 0.45;
    }
    this.head.rotation.set(Math.sin(t * rate * 2) * 0.05 - 0.05, 0, 0);
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      this.tailPts[i]!.set(Math.sin(t * 1.2 + u * 3) * 0.25 * u, 1.8 - u * 1.1 - u * u * 0.25, -1.5 - u * 0.4);
    }
    this.tail.geometry.dispose();
    this.tail.geometry = new TubeGeometry(this.tailCurve, 14, 0.05, 6, false);
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("laozi", (ctx) => new Laozi(ctx));
