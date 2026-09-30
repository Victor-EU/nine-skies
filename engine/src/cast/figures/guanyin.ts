/**
 * Guanyin (D91, D97), the Bodhisattva of Compassion, who in the novel sets
 * the pilgrimage going, takes each disciple's vow and comes when they
 * cannot win, and whose seat is Putuo in the South Sea. Guanyin of the
 * South Sea as the novel (ch. 8) and the temples show her: standing on a
 * lotus throne on cloud, in a white robe and hood, the vase of pure water
 * in her left hand and the willow sprig in her right; and the white parrot
 * of the novel circling her. In place as `still`, or turning slowly. Until
 * 29 September 2026 the film drew her seat empty (D97).
 *
 * The painted card (`paintings/guanyin.ts`) is what the film draws; this is
 * the figure made in code, for `?paint=off`.
 *
 * Native size 3.8 units, the parrot's circle.
 */
import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, SphereGeometry, TorusGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure, type Head } from "../figure.js";
import { Wardrobe, breathe, cloudBank, flapWing, humanHead, humanoid, wing, type Wing } from "../parts.js";
import type { Skin } from "../skin.js";

const PETAL = 0xf2b8c6;
const INNER = 0xf9dde5;
const POD = 0xc9c25a;
const JADE = 0xeaf5ef;
const WILLOW = 0x4f9a5a;
const WHITE = 0xf8f8f4;
const CREST = 0xf1c24c;
const BEAK = 0x4a4a52;
const CLOUD = 0xffffff;
const FACE = 0xf4e2d4;
const HAIR = 0x1e1a1c;
const ROBE = 0xf6f4ee;
const CORD = 0xd9b45a;

class Guanyin implements Figure {
  readonly group = new Group();
  readonly nativeSize = 3.8;
  readonly triangles: number;
  readonly wardrobe: Wardrobe;
  readonly heads: readonly Head[];
  private readonly seat = new Group();
  private readonly willow = new Group();
  private readonly parrot = new Group();
  private readonly wings: Wing[] = [];
  private readonly cloud: Group;
  private readonly turns: boolean;

  constructor(ctx: BuildContext) {
    const w = (this.wardrobe = new Wardrobe(ctx.skin));
    this.turns = ctx.variant !== "still";
    const S = this.seat;
    this.group.add(S);
    // the lotus: two rings of petals leaning out, a seed pod at the centre
    for (const [n, r, lean, colour] of [
      [8, 0.95, 0.75, PETAL],
      [8, 0.6, 0.4, INNER],
    ] as const)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (r < 0.8 ? Math.PI / n : 0);
        const g = new Group();
        g.rotation.y = -a;
        S.add(g);
        const petal = w.part(new ConeGeometry(0.22, 0.75, 5), "silk", colour, g, r, 0.3, 0);
        petal.scale.set(1, 1, 0.35);
        petal.rotation.z = -lean;
      }
    w.part(new CylinderGeometry(0.35, 0.3, 0.12, 12), "gold", POD, S, 0, 0.36, 0);
    // she stands on the lotus, in a white robe and hood with a gold cord
    const her = new Group();
    her.position.set(0, 0.42, 0);
    her.scale.setScalar(0.62);
    S.add(her);
    const h = humanoid(w, { face: FACE, torso: ROBE, legs: ROBE, shoe: FACE, skirt: ROBE, headR: 0.42 }, her);
    w.part(new SphereGeometry(0.44, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), "hair", HAIR, her, 0, 1.84, -0.03);
    w.part(new SphereGeometry(0.18, 10, 8), "hair", HAIR, her, 0, 2.3, -0.05);
    w.part(new SphereGeometry(0.12, 10, 8), "gold", CREST, her, 0, 2.28, 0.16);
    const hood = w.part(new ConeGeometry(0.62, 1.9, 16, 1, true), "silk", ROBE, her, 0, 1.45, -0.12);
    hood.scale.set(1, 1, 0.8);
    w.part(new ConeGeometry(0.8, 1.7, 16, 1, true), "silk", ROBE, her, 0, 0.3, 0);
    w.part(new TorusGeometry(0.36, 0.035, 6, 20), "gold", CORD, her, 0, 0.95, 0).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) w.part(new SphereGeometry(0.04, 8, 6), "eye", 0x111111, her, s * 0.14, 1.84, 0.38);
    const [left, right] = h.arms;
    left!.shoulder.rotation.set(-0.35, 0, -0.1);
    left!.elbow.rotation.set(-1.2, 0, 0);
    right!.shoulder.rotation.set(-0.5, 0, 0.1);
    right!.elbow.rotation.set(-1.5, 0, 0);
    // the vase of pure water in her left hand, and the willow sprig in her right
    const vase = new Group();
    vase.position.set(-0.4, 1.0, 0.55);
    her.add(vase);
    w.part(new SphereGeometry(0.2, 16, 12), "horn", JADE, vase, 0, 0, 0);
    w.part(new CylinderGeometry(0.05, 0.06, 0.28, 10), "horn", JADE, vase, 0, 0.22, 0);
    w.part(new TorusGeometry(0.06, 0.02, 8, 16), "horn", JADE, vase, 0, 0.36, 0).rotation.x = Math.PI / 2;
    this.willow.position.set(0.42, 1.05, 0.6);
    this.willow.scale.setScalar(0.8);
    her.add(this.willow);
    w.part(new CylinderGeometry(0.015, 0.015, 1.0, 6), "silk", WILLOW, this.willow, 0, 0.5, 0);
    for (let i = 0; i < 6; i++) {
      const s = i % 2 ? 1 : -1;
      w.part(new ConeGeometry(0.035, 0.16, 4), "silk", WILLOW, this.willow, s * 0.06, 0.15 + i * 0.13, 0).rotation.z = s * 1.2;
    }
    this.heads = [humanHead(h, her, 0.6, 0.3)];
    // the white parrot: a cockatoo's crest, a hooked bill, feathered wings
    const P = this.parrot;
    this.group.add(P);
    w.part(new SphereGeometry(0.2, 12, 10), "silk", WHITE, P).scale.set(1, 0.9, 1.5);
    w.part(new SphereGeometry(0.15, 12, 10), "silk", WHITE, P, 0, 0.12, 0.32);
    for (let i = 0; i < 3; i++) w.part(new ConeGeometry(0.03, 0.24, 4), "gold", CREST, P, 0, 0.26, 0.3 - i * 0.05).rotation.x = -0.5 - i * 0.35;
    w.part(new ConeGeometry(0.045, 0.14, 6), "iron", BEAK, P, 0, 0.06, 0.46).rotation.x = Math.PI / 2 + 0.7;
    for (const s of [-1, 1]) w.part(new SphereGeometry(0.025, 6, 5), "eye", 0x111111, P, s * 0.09, 0.15, 0.42);
    for (const side of [-1, 1]) {
      const wg = wing(w, { body: WHITE, tip: WHITE, span: 1.3, primaries: 5 }, side, P);
      wg.pivot.position.set(side * 0.12, 0.06, 0.05);
      this.wings.push(wg);
    }
    w.part(new BoxGeometry(0.1, 0.02, 0.5), "silk", WHITE, P, 0, 0, -0.45);
    this.cloud = cloudBank(
      w,
      CLOUD,
      [
        [0, -0.3, 0, 0.8],
        [-0.8, -0.35, 0.2, 0.55],
        [0.8, -0.35, 0.1, 0.55],
        [0.2, -0.25, 0.8, 0.45],
        [-0.3, -0.3, -0.75, 0.48],
        [1.3, -0.5, -0.2, 0.36],
        [-1.3, -0.5, 0, 0.34],
      ],
      S,
    );
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.wardrobe.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    this.seat.position.y = Math.sin(t * 0.8) * 0.06;
    if (this.turns) this.seat.rotation.y = t * 0.1;
    this.willow.rotation.z = -0.12 + Math.sin(t * 1.3) * 0.08;
    const a = t * 0.9;
    const P = this.parrot;
    P.position.set(Math.cos(a) * 1.6, 1.3 + Math.sin(a * 2) * 0.3, Math.sin(a) * 1.6);
    P.lookAt(P.position.x - Math.sin(a), P.position.y + Math.cos(a * 2) * 0.25, P.position.z + Math.cos(a));
    const flap = Math.sin(t * 12);
    for (const wg of this.wings) flapWing(wg, flap, 0.3, 0.3);
    breathe(this.cloud, t);
  }

  dispose(): void {
    this.wardrobe.dispose();
  }
}

registerFigure("guanyin", (ctx) => new Guanyin(ctx));
