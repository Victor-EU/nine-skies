/**
 * Sun Wukong on the somersault cloud (D91), as the Ming novel dresses him:
 * the 凤翅紫金冠 with two pheasant plumes, the 锁子黄金甲, the tiger-skin
 * kilt, the 藕丝步云履, the banded staff on his shoulder, and one hand to
 * his brow, scouting. The cloud is a lump of silk puffs with a trailing
 * swirl. He rides a figure-of-eight and turns a somersault every seven
 * seconds; a `still` variant hovers, for a companion.
 *
 * Native height 2.5 units to the crest, 3.6 to the plumes' tips.
 */
import { CatmullRomCurve3, ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, TorusGeometry, TubeGeometry, Vector3, type DataTexture } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure } from "../figure.js";
import { Wardrobe, breathe, cloudBank, humanoid, stripesTexture, type Humanoid } from "../parts.js";
import type { Skin } from "../skin.js";

const FUR = 0xb9782f;
const FACE = 0xf6dcc4;
const GOLD = 0xf1c24c;
const PURPLE = 0x7a3b8e;
const TIGER = 0xe8922a;
const IRON = 0x2a2320;
const RED = 0xd8382a;
const CLOUD = 0xffffff;

class Wukong implements Figure {
  readonly group = new Group();
  readonly nativeSize = 2.5;
  readonly triangles: number;
  private readonly w: Wardrobe;
  private readonly body = new Group();
  private readonly rider = new Group();
  private readonly h: Humanoid;
  private readonly cloud: Group;
  private readonly tail: Mesh;
  private readonly tailPts: Vector3[] = [];
  private readonly tailCurve: CatmullRomCurve3;
  private readonly plumes: Mesh[] = [];
  private readonly roams: boolean;

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    this.roams = ctx.variant !== "still";
    this.group.add(this.body);
    this.body.add(this.rider);
    const B = this.rider;
    this.h = humanoid(w, { face: FUR, torso: GOLD, legs: FUR, shoe: IRON, headR: 0.5 }, B);
    // the face on the fur, the muzzle, gold eyes, big ears
    const face = w.part(new SphereGeometry(0.42, 20, 16), "skin", FACE, B, 0, 1.74, 0.2);
    face.scale.set(0.82, 0.95, 0.55);
    const muzzle = w.part(new SphereGeometry(0.2, 14, 10), "skin", FACE, B, 0, 1.62, 0.5);
    muzzle.scale.set(1.2, 0.8, 0.8);
    for (const s of [-1, 1]) {
      w.part(new SphereGeometry(0.075, 10, 8), "gold", GOLD, B, s * 0.17, 1.84, 0.53);
      w.part(new SphereGeometry(0.035, 8, 6), "eye", 0x111111, B, s * 0.17, 1.84, 0.6);
      const ear = w.part(new SphereGeometry(0.2, 12, 10), "skin", FUR, B, s * 0.56, 1.86, -0.02);
      ear.scale.set(0.35, 1, 1);
      const earIn = w.part(new SphereGeometry(0.13, 10, 8), "skin", FACE, B, s * 0.6, 1.86, 0.02);
      earIn.scale.set(0.3, 1, 1);
      const plume = w.dress(
        new Mesh(new TubeGeometry(new CatmullRomCurve3([new Vector3(s * 0.2, 2.3, -0.1), new Vector3(s * 0.7, 3.1, -0.6), new Vector3(s * 1.3, 3.6, -1.4), new Vector3(s * 1.9, 3.5, -2.3)]), 16, 0.04, 6, false)),
        "gold",
        GOLD,
      );
      B.add(plume);
      this.plumes.push(plume);
    }
    // the cap, its rim and crest; the collar and belt; the kilt in stripes
    w.part(new SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), "silk", PURPLE, B, 0, 1.9, 0);
    w.part(new TorusGeometry(0.47, 0.05, 8, 28), "gold", GOLD, B, 0, 2.06, 0).rotation.x = Math.PI / 2;
    w.part(new ConeGeometry(0.12, 0.35, 6), "gold", GOLD, B, 0, 2.5, 0.05);
    w.part(new TorusGeometry(0.3, 0.06, 8, 24), "silk", RED, B, 0, 1.36, 0).rotation.x = Math.PI / 2;
    w.part(new TorusGeometry(0.38, 0.05, 8, 24), "silk", RED, B, 0, 0.78, 0).rotation.x = Math.PI / 2;
    const kilt = w.part(new ConeGeometry(0.6, 0.55, 12, 1, true), "matte", TIGER, B, 0, 0.55, 0);
    // The stripes are a texture the skin does not know; the kilt keeps its own map through a swap.
    const striped = (kilt.material as { clone(): typeof kilt.material }).clone() as typeof kilt.material & { map?: DataTexture | null };
    striped.map = stripesTexture(0x1f1712, TIGER);
    kilt.material = striped;
    // the staff on the left shoulder
    const staff = new Group();
    w.part(new CylinderGeometry(0.05, 0.05, 3.4, 10), "iron", IRON, staff);
    for (const e of [-1, 1]) w.part(new CylinderGeometry(0.065, 0.065, 0.3, 10), "gold", GOLD, staff, 0, e * 1.6, 0);
    staff.position.set(0, -0.5, 0);
    staff.rotation.set(-0.35, 0, 0.2);
    this.h.arms[0]!.elbow.add(staff);
    // the shoes' cloud swirl
    for (const s of [-1, 1]) w.part(new TorusGeometry(0.06, 0.02, 6, 12), "cloud", CLOUD, B, s * 0.2, 0.08, 0.22);
    // the tail
    for (let i = 0; i <= 8; i++) this.tailPts.push(new Vector3(0, 0.5, -0.3 - i * 0.15));
    this.tailCurve = new CatmullRomCurve3(this.tailPts);
    this.tail = w.dress(new Mesh(new TubeGeometry(this.tailCurve, 20, 0.06, 6, false)), "skin", FUR);
    B.add(this.tail);
    // the cloud under his feet
    this.cloud = cloudBank(
      w,
      CLOUD,
      [
        [0, -0.35, 0, 0.7],
        [-0.6, -0.4, 0.2, 0.5],
        [0.6, -0.4, 0.1, 0.55],
        [0.1, -0.25, 0.55, 0.45],
        [-0.2, -0.3, -0.5, 0.5],
        [1.1, -0.5, -0.2, 0.38],
        [-1.1, -0.5, 0, 0.36],
        [-1.6, -0.6, -0.3, 0.26],
        [-2.05, -0.65, -0.55, 0.18],
      ],
      this.body,
    );
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.w.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    if (this.roams) {
      const a = t * 0.3;
      this.body.position.set(Math.sin(a) * 7, Math.sin(a * 2) * 1.2 + Math.sin(t * 1.7) * 0.15, Math.sin(a * 2) * 2.5);
      this.body.rotation.set(0, Math.cos(a) > 0 ? Math.PI * 0.35 : -Math.PI * 0.35, 0);
    } else {
      this.body.position.set(0, Math.sin(t * 1.7) * 0.15, 0);
    }
    // a somersault every seven seconds: off the cloud, over, and back on it
    const phase = (t % 7) / 0.9;
    const flip = phase < 1 ? (1 - Math.cos(phase * Math.PI)) / 2 : 0;
    this.rider.rotation.x = -flip * Math.PI * 2;
    this.rider.position.y = Math.sin(flip * Math.PI) * 1.4;
    const [left, right] = this.h.arms;
    right!.shoulder.rotation.set(-2.6, 0, 0.35 + Math.sin(t * 1.5) * 0.05);
    right!.elbow.rotation.set(2.1, 0, 0);
    left!.shoulder.rotation.set(0.6, 0, -0.8);
    left!.elbow.rotation.set(-1.9, 0, 0);
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      this.tailPts[i]!.set(Math.sin(t * 3 + u * 4) * 0.25 * u, 0.55 - u * 0.4 + Math.sin(u * 5 + t * 2.5) * 0.2 * u + u * u * 1.5, -0.3 - u * 1.2);
    }
    this.tail.geometry.dispose();
    this.tail.geometry = new TubeGeometry(this.tailCurve, 20, 0.06, 6, false);
    for (const p of this.plumes) p.rotation.z = Math.sin(t * 2.2) * 0.06;
    breathe(this.cloud, t, 0.08);
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("wukong", (ctx) => new Wukong(ctx));
