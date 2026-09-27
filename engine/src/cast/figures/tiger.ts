/**
 * The tiger (D91): the one Wukong killed for his kilt (ch. 14), and the
 * one the gorge at the First Bend is named for, walking on air. A heavy
 * body in stripes computed in code, a pale belly and muzzle, round ears,
 * gold eyes, the 王 on the brow, a long tail rewritten each frame with a
 * black tip, and paws on puffs of cloud. It prowls a slow circle, or in
 * place as a companion.
 *
 * The body is shared: `tigerBody` builds it in any livery, with or without
 * the mark, and `prowl` walks it; the goddess's tigress is the same body
 * in gold. Both are baked into one skinned mesh per material (F112), all
 * but the tail, rebuilt each frame, and the striped coat, which wears its
 * own stripes; the tail's tip rides a pivot of its own, and the cloud
 * holds still.
 *
 * Native length 4.2 units, nose to tail tip.
 */
import { BoxGeometry, CapsuleGeometry, CatmullRomCurve3, ConeGeometry, Group, Mesh, SphereGeometry, TubeGeometry, Vector3, type DataTexture, type Material } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure, type Head } from "../figure.js";
import { Wardrobe, cloudBank, neckWithin, stripesTexture } from "../parts.js";
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

export interface TigerLivery {
  readonly coat: number;
  readonly stripe: number;
  readonly pale: number;
  readonly nose: number;
  readonly eye: number;
  /** The 王 on the brow, or a plain one. */
  readonly mark: boolean;
}

export interface TigerBody {
  readonly head: Group;
  readonly legs: readonly Leg[];
  readonly tail: Mesh;
  /** The tail's dark tip, on a pivot that follows the tail's end. */
  readonly tip: Group;
  readonly tailPts: Vector3[];
  readonly tailCurve: CatmullRomCurve3;
}

/** The tiger's body on `B`, standing on its cloud, 4.2 units nose to tail tip. */
export function tigerBody(w: Wardrobe, B: Group, o: TigerLivery): TigerBody {
  // The stripes are a texture the skin does not know; a striped part keeps its own map through a swap.
  const striped = (mesh: Mesh): Mesh => {
    const m = (mesh.material as Material).clone() as Material & { map?: DataTexture | null };
    m.map = stripesTexture(o.stripe, o.coat);
    mesh.material = m;
    return mesh;
  };
  striped(w.part(new CapsuleGeometry(0.55, 1.7, 6, 16), "matte", o.coat, B, 0, 1.25, 0)).rotation.x = Math.PI / 2;
  w.part(new SphereGeometry(0.45, 16, 12), "silk", o.pale, B, 0, 0.98, 0.05).scale.set(0.9, 0.5, 1.7);
  // the head
  const head = new Group();
  head.position.set(0, 1.72, 1.35);
  B.add(head);
  striped(w.part(new SphereGeometry(0.42, 18, 14), "matte", o.coat, head)).scale.set(1, 0.9, 1);
  w.part(new SphereGeometry(0.25, 14, 10), "silk", o.pale, head, 0, -0.12, 0.32).scale.set(1.1, 0.7, 0.9);
  w.part(new SphereGeometry(0.07, 8, 6), "matte", o.nose, head, 0, -0.04, 0.56);
  for (const s of [-1, 1]) {
    w.part(new SphereGeometry(0.06, 8, 6), "gold", o.eye, head, s * 0.16, 0.08, 0.36);
    w.part(new SphereGeometry(0.035, 8, 6), "eye", 0x111111, head, s * 0.16, 0.08, 0.41);
    w.part(new SphereGeometry(0.13, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), "matte", o.coat, head, s * 0.3, 0.32, -0.05).rotation.z = s * -0.5;
    w.part(new SphereGeometry(0.08, 8, 6), "silk", o.pale, head, s * 0.3, 0.33, 0.0).scale.set(0.6, 0.6, 0.3);
  }
  // the 王 on the brow: three bars and a stroke through them
  if (o.mark) {
    for (let i = 0; i < 3; i++) w.part(new BoxGeometry(0.2 - i * 0.02, 0.03, 0.02), "iron", o.stripe, head, 0, 0.3 - i * 0.07, 0.4 - i * 0.01);
    w.part(new BoxGeometry(0.03, 0.18, 0.02), "iron", o.stripe, head, 0, 0.23, 0.4);
  }
  // four legs on hips, with a knee and a paw
  const legs: Leg[] = [];
  for (const [x, z] of [
    [-0.35, 0.62],
    [0.35, 0.62],
    [-0.35, -0.62],
    [0.35, -0.62],
  ] as const) {
    const hip = new Group();
    hip.position.set(x, 0.95, z);
    B.add(hip);
    w.part(new CapsuleGeometry(0.16, 0.55, 4, 10), "matte", o.coat, hip, 0, -0.3, 0);
    const knee = new Group();
    knee.position.y = -0.6;
    hip.add(knee);
    w.part(new CapsuleGeometry(0.13, 0.5, 4, 10), "matte", o.coat, knee, 0, -0.27, 0);
    w.part(new SphereGeometry(0.17, 10, 8), "silk", o.pale, knee, 0, -0.58, 0.05).scale.set(1.1, 0.6, 1.2);
    legs.push({ hip, knee, phase: x < 0 !== z < 0 ? 0 : Math.PI });
  }
  // the tail, rewritten each frame, with a dark tip that follows its end
  const tailPts: Vector3[] = [];
  for (let i = 0; i <= 7; i++) tailPts.push(new Vector3(0, 1.45, -0.95 - i * 0.2));
  const tailCurve = new CatmullRomCurve3(tailPts);
  const tail = striped(w.dress(new Mesh(new TubeGeometry(tailCurve, 16, 0.07, 6, false)), "matte", o.coat));
  B.add(tail);
  const tip = new Group();
  B.add(tip);
  w.part(new ConeGeometry(0.08, 0.3, 6), "iron", o.stripe, tip);
  cloudBank(
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
  return { head, legs, tail, tip, tailPts, tailCurve };
}

/** The walk: legs, a look about, the tail along its curve. Returns the body's sway. */
export function prowl(b: TigerBody, t: number, rate = 3.4): number {
  for (const l of b.legs) {
    l.hip.rotation.x = Math.sin(t * rate + l.phase) * 0.5;
    l.knee.rotation.x = Math.max(0, Math.sin(t * rate + l.phase + 0.7)) * 0.75;
  }
  b.head.rotation.set(Math.sin(t * rate * 0.5) * 0.05 - 0.05, Math.sin(t * 0.7) * 0.2, 0);
  for (let i = 0; i <= 7; i++) {
    const u = i / 7;
    b.tailPts[i]!.set(Math.sin(t * 1.8 + u * 3) * 0.3 * u, 1.45 + Math.sin(u * 2.5 + t * 1.5) * 0.3 * u + u * 0.5, -0.95 - u * 1.5);
  }
  b.tail.geometry.dispose();
  b.tail.geometry = new TubeGeometry(b.tailCurve, 16, 0.07, 6, false);
  b.tip.position.copy(b.tailPts[7]!);
  b.tip.rotation.x = -Math.PI / 2;
  return Math.sin(t * rate) * 0.04;
}

class Tiger implements Figure {
  readonly group = new Group();
  readonly nativeSize = 4.2;
  readonly triangles: number;
  readonly heads: readonly Head[];
  private readonly w: Wardrobe;
  private readonly body = new Group();
  private readonly b: TigerBody;
  private readonly circuit: number;

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    this.circuit = ctx.variant === "still" ? 0 : 8;
    this.group.add(this.body);
    this.b = tigerBody(w, this.body, { coat: ORANGE, stripe: BLACK, pale: CREAM, nose: PINK, eye: GOLD, mark: true });
    // the head on a pivot inside the one the prowl turns (D93)
    this.heads = [neckWithin(this.b.head, 0.8, 0.35)];
    w.bake(this.body, [this.b.tail]);
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.w.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    const rate = 3.4;
    const sway = prowl(this.b, t, rate);
    const bob = Math.abs(Math.sin(t * rate)) * 0.04;
    if (this.circuit > 0) {
      const a = -t * 0.045;
      this.body.position.set(Math.cos(a) * this.circuit, bob, Math.sin(a) * this.circuit);
      this.body.rotation.set(0, -a, sway);
    } else {
      this.body.position.set(0, bob, 0);
      this.body.rotation.set(0, 0, sway);
    }
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("tiger", (ctx) => new Tiger(ctx));
