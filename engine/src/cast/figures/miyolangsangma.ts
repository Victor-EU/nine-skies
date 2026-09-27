/**
 * Miyolangsangma (D91), one of the Five Sisters of Long Life who live on
 * the high peaks, the goddess of Chomolungma, "the immovable good-minded
 * one", the giver without end: golden, riding a tigress, a bowl of food
 * in one hand and a mongoose in the other. Sherpa climbers still make her
 * an offering before they set out. She is a goddess of a living faith, so
 * the film does not draw her; it draws her mount and her gift, the way a
 * faith marks a presence without a face. A golden tigress walking the air
 * with an empty saddle cloth, on it the bowl of inexhaustible food. Slow,
 * in place as `still`, or a circle; cued at the foot of the mountain and
 * never over the summit. No part of her is skin (`LIVING_FAITHS`).
 *
 * Native length 4.2 units, nose to tail tip.
 */
import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, SphereGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure } from "../figure.js";
import { Wardrobe } from "../parts.js";
import type { Skin } from "../skin.js";
import { prowl, tigerBody, type TigerBody } from "./tiger.js";

const GOLD = 0xdea43c;
const UMBER = 0x4a2f14;
const CREAM = 0xf6ead0;
const NOSE = 0xb88a7a;
const DARK = 0x2a2320;
const CLOTH = 0x8c1f2b;
const TRIM = 0xf1c24c;
const BOWL = 0xf1c24c;
const FOOD = 0xf4efe4;
const JEWEL = 0xff8a3a;

class Miyolangsangma implements Figure {
  readonly group = new Group();
  readonly nativeSize = 4.2;
  readonly triangles: number;
  /** Open, so the cast tests can hold her to the rule: nothing here is skin. */
  readonly wardrobe: Wardrobe;
  private readonly body = new Group();
  private readonly b: TigerBody;
  private readonly circuit: number;

  constructor(ctx: BuildContext) {
    const w = (this.wardrobe = new Wardrobe(ctx.skin));
    this.circuit = ctx.variant === "still" ? 0 : 8;
    const B = this.body;
    this.group.add(B);
    this.b = tigerBody(w, B, { coat: GOLD, stripe: UMBER, pale: CREAM, nose: NOSE, eye: DARK, mark: false });
    // the saddle cloth, empty, and the bowl of food on it with the jewel of her giving
    w.part(new BoxGeometry(1.0, 0.03, 1.1), "gold", TRIM, B, 0, 1.79, -0.05);
    w.part(new BoxGeometry(0.95, 0.06, 1.05), "silk", CLOTH, B, 0, 1.83, -0.05);
    w.part(new CylinderGeometry(0.28, 0.2, 0.22, 14, 1, true), "gold", BOWL, B, 0, 1.97, -0.05);
    w.part(new CylinderGeometry(0.2, 0.2, 0.02, 14), "gold", BOWL, B, 0, 1.87, -0.05);
    for (let i = 0; i < 5; i++) {
      const a = i * 2.2;
      w.part(new SphereGeometry(0.09, 8, 6), "matte", FOOD, B, Math.cos(a) * 0.12, 2.06 + (i === 0 ? 0.06 : 0), -0.05 + Math.sin(a) * 0.12);
    }
    w.part(new ConeGeometry(0.07, 0.22, 6), "flame", JEWEL, B, 0, 2.24, -0.05);
    // one skinned mesh per material, the tiger's way (F112)
    w.bake(B, [this.b.tail]);
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.wardrobe.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    const rate = 2.4;
    const sway = prowl(this.b, t, rate);
    const bob = Math.abs(Math.sin(t * rate)) * 0.03;
    if (this.circuit > 0) {
      const a = -t * 0.035;
      this.body.position.set(Math.cos(a) * this.circuit, bob, Math.sin(a) * this.circuit);
      this.body.rotation.set(0, -a, sway);
    } else {
      this.body.position.set(0, bob, 0);
      this.body.rotation.set(0, 0, sway);
    }
  }

  dispose(): void {
    this.wardrobe.dispose();
  }
}

registerFigure("miyolangsangma", (ctx) => new Miyolangsangma(ctx));
