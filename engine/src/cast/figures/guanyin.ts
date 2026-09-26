/**
 * Guanyin (D91), the Bodhisattva of Compassion, who in the novel sets the
 * pilgrimage going, takes each disciple's vow and comes when they cannot
 * win, and whose seat is Putuo in the South Sea. She is worshipped, so
 * the film does not draw her; it draws what her own iconography sets
 * beside her, the way early Buddhist art showed the Buddha by an empty
 * seat. A lotus throne on cloud, empty; on it the vase of pure water with
 * the willow sprig; and the white parrot of the novel circling it. In
 * place as `still`, or turning slowly. No part of her is skin
 * (`LIVING_FAITHS`).
 *
 * Native size 3.8 units, the parrot's circle.
 */
import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, SphereGeometry, TorusGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure } from "../figure.js";
import { Wardrobe, breathe, cloudBank, flapWing, wing, type Wing } from "../parts.js";
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

class Guanyin implements Figure {
  readonly group = new Group();
  readonly nativeSize = 3.8;
  readonly triangles: number;
  /** Open, so the cast tests can hold her to the rule: nothing here is skin. */
  readonly wardrobe: Wardrobe;
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
    w.part(new CylinderGeometry(0.35, 0.3, 0.2, 12), "gold", POD, S, 0, 0.4, 0);
    // the vase of pure water, and the willow sprig in it
    w.part(new SphereGeometry(0.32, 16, 12), "horn", JADE, S, 0, 0.78, 0);
    w.part(new CylinderGeometry(0.08, 0.1, 0.45, 10), "horn", JADE, S, 0, 1.12, 0);
    w.part(new TorusGeometry(0.1, 0.03, 8, 16), "horn", JADE, S, 0, 1.34, 0).rotation.x = Math.PI / 2;
    this.willow.position.set(0.02, 1.3, 0);
    S.add(this.willow);
    w.part(new CylinderGeometry(0.015, 0.015, 1.0, 6), "silk", WILLOW, this.willow, 0, 0.5, 0);
    for (let i = 0; i < 6; i++) {
      const s = i % 2 ? 1 : -1;
      w.part(new ConeGeometry(0.035, 0.16, 4), "silk", WILLOW, this.willow, s * 0.06, 0.15 + i * 0.13, 0).rotation.z = s * 1.2;
    }
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
