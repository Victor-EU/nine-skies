/**
 * Sanduo (D91), the Naxi protector of Lijiang and the god of Jade Dragon
 * Snow Mountain, which in the Naxi telling is himself: a warrior in white
 * on a white horse, whose festival is the eighth day of the second month.
 * He is a god of a living faith, so the film does not draw him; it draws
 * his mount and his standard, the way a faith marks a presence without a
 * face. A white horse saddled in white and gold, walking the air with no
 * rider, and a white spear upright at the saddle with a white pennant
 * streaming from it. In place as `still`, or a slow circle. No part of
 * him is skin (`LIVING_FAITHS`). Baked into one skinned mesh per material
 * (F112), all but the tail and the pennant, rebuilt each frame; the cloud
 * holds still.
 *
 * Native height 3.9 units, to the spear's blade.
 */
import { BoxGeometry, CatmullRomCurve3, ConeGeometry, CylinderGeometry, Group, Mesh, TubeGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure, type Head } from "../figure.js";
import { Wardrobe, cloudBank, horse, horseHead, horseWalk, type Horse } from "../parts.js";
import type { Skin } from "../skin.js";

const WHITE = 0xf7f5f0;
const MANE = 0xe4ecf4;
const HOOF = 0x7a7570;
const SADDLE = 0xffffff;
const GOLD = 0xf1c24c;
const SILVER = 0xd8dde3;
const CLOUD = 0xffffff;

class Sanduo implements Figure {
  readonly group = new Group();
  readonly nativeSize = 3.9;
  readonly triangles: number;
  /** Open, so the cast tests can hold him to the rule: nothing here is skin. */
  readonly wardrobe: Wardrobe;
  readonly heads: readonly Head[];
  private readonly body = new Group();
  private readonly horse: Horse;
  private readonly pennant: Mesh;
  private readonly pennantPts: Vector3[] = [];
  private readonly pennantCurve: CatmullRomCurve3;
  private readonly circuit: number;

  constructor(ctx: BuildContext) {
    const w = (this.wardrobe = new Wardrobe(ctx.skin));
    this.circuit = ctx.variant === "still" ? 0 : 9;
    const B = this.body;
    this.group.add(B);
    this.horse = horse(w, { coat: WHITE, mane: MANE, hoof: HOOF, saddle: SADDLE, tack: GOLD }, B);
    // the horse's head on a pivot at the poll (D93); the god has none
    this.heads = [horseHead(B)];
    w.part(new BoxGeometry(0.66, 0.05, 0.76), "gold", GOLD, B, 0, 1.47, -0.05);
    // the standard: a white spear upright at the saddle, its pennant along a curve rewritten each frame
    const spear = new Group();
    spear.position.set(0.34, 1.6, -0.15);
    B.add(spear);
    w.part(new CylinderGeometry(0.03, 0.03, 2.0, 8), "horn", WHITE, spear, 0, 1.0, 0);
    w.part(new ConeGeometry(0.06, 0.35, 6), "iron", SILVER, spear, 0, 2.15, 0);
    for (let i = 0; i <= 10; i++) this.pennantPts.push(new Vector3(0.05, 1.85, -i * 0.14));
    this.pennantCurve = new CatmullRomCurve3(this.pennantPts);
    this.pennant = w.dress(new Mesh(new TubeGeometry(this.pennantCurve, 24, 0.045, 5, false)), "silk", 0xffffff);
    spear.add(this.pennant);
    cloudBank(
      w,
      CLOUD,
      [
        [0, -0.3, 0.6, 0.5],
        [-0.5, -0.35, -0.3, 0.42],
        [0.55, -0.35, -0.3, 0.42],
        [0.1, -0.35, -1.0, 0.36],
        [-0.15, -0.4, 1.3, 0.34],
        [0.7, -0.45, 0.9, 0.28],
        [-0.8, -0.45, 0.5, 0.26],
      ],
      B,
    );
    w.bake(B, [this.horse.tail, this.pennant]);
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.wardrobe.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    const rate = 4.5;
    const bob = Math.abs(Math.sin(t * rate)) * 0.05;
    if (this.circuit > 0) {
      const a = -t * 0.05;
      this.body.position.set(Math.cos(a) * this.circuit, bob, Math.sin(a) * this.circuit);
      this.body.rotation.y = -a;
    } else this.body.position.set(0, bob, 0);
    horseWalk(this.horse, t, rate);
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      this.pennantPts[i]!.set(0.05 + Math.sin(u * 5 - t * 4) * 0.2 * u, 1.85 - u * 0.3 + Math.sin(u * 3 - t * 3) * 0.15 * u, -u * 1.4);
    }
    this.pennant.geometry.dispose();
    this.pennant.geometry = new TubeGeometry(this.pennantCurve, 24, 0.045, 5, false);
  }

  dispose(): void {
    this.wardrobe.dispose();
  }
}

registerFigure("sanduo", (ctx) => new Sanduo(ctx));
