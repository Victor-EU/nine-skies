/**
 * The Eight Immortals (D91) crossing the sea, each by their own art
 * (八仙过海，各显神通), cued at Turpan over the one ground in the film that
 * lies below the sea. Left to right as the camera sees them: Tieguai Li
 * on his iron crutch with the gourd on his back; Zhongli Quan, belly
 * bare, with the fan; Lü Dongbin the scholar with the sword; Zhang Guolao
 * riding his donkey backwards with the fish drum; He Xiangu with the
 * lotus; Lan Caihe with the flower basket; Han Xiangzi with the flute;
 * Cao Guojiu in court dress with the jade tablets. Eight from the one
 * doll and the shared horse, each on a puff of cloud, in a loose line
 * abreast; in place as `still`, or drifting round a wide circle.
 *
 * Native length 15 units, the line.
 */
import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, SphereGeometry, TorusGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure } from "../figure.js";
import { Wardrobe, breathe, cloudBank, horse, horseWalk, humanoid, type Horse, type Humanoid } from "../parts.js";
import type { Skin } from "../skin.js";

const FACE = 0xf6dcc4;
const HAIR = 0x2a2226;
const WHITE = 0xf2f2ee;
const GOLD = 0xf1c24c;
const IRON = 0x3a2f2a;
const TAN = 0xd9b57a;
const CLOUD = 0xffffff;

type Pose = readonly [shoulderX: number, shoulderZ: number, elbowX: number];

interface Rider {
  readonly g: Group;
  readonly phase: number;
  readonly donkey: Horse | null;
}

function eyes(w: Wardrobe, g: Group): void {
  for (const s of [-1, 1]) w.part(new SphereGeometry(0.045, 8, 6), "eye", 0x111111, g, s * 0.16, 1.84, 0.46);
}

function beard(w: Wardrobe, g: Group, colour: number, length = 0.5): void {
  w.part(new ConeGeometry(0.15, length, 8), "hair", colour, g, 0, 1.75 - length / 2, 0.36).rotation.x = Math.PI + 0.2;
}

function knot(w: Wardrobe, g: Group): void {
  w.part(new SphereGeometry(0.52, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), "hair", HAIR, g, 0, 1.82, 0);
  w.part(new SphereGeometry(0.16, 10, 8), "hair", HAIR, g, 0, 2.35, -0.05);
}

/** Arms held: the left and the right, each a shoulder's forward and outward turn and the elbow's bend. */
function hold(h: Humanoid, left: Pose, right: Pose): void {
  const [l, r] = h.arms;
  l!.shoulder.rotation.set(left[0], 0, -left[1]);
  l!.elbow.rotation.set(left[2], 0, 0);
  r!.shoulder.rotation.set(right[0], 0, right[1]);
  r!.elbow.rotation.set(right[2], 0, 0);
}

function li(w: Wardrobe, g: Group): void {
  const h = humanoid(w, { face: FACE, torso: 0x6e4b2a, legs: 0x5a3e24, shoe: IRON }, g);
  beard(w, g, HAIR);
  eyes(w, g);
  const crutch = new Group();
  crutch.position.y = -0.5;
  crutch.rotation.z = 0.25;
  w.part(new CylinderGeometry(0.035, 0.035, 2.3, 8), "iron", IRON, crutch, 0, 0.4, 0);
  w.part(new TorusGeometry(0.14, 0.03, 6, 12, Math.PI), "iron", IRON, crutch, 0, 1.55, 0);
  h.arms[1]!.elbow.add(crutch);
  w.part(new SphereGeometry(0.2, 12, 10), "matte", 0xd9862a, g, 0, 1.0, -0.42);
  w.part(new SphereGeometry(0.14, 10, 8), "matte", 0xd9862a, g, 0, 1.3, -0.42);
  hold(h, [0.3, 0.3, -0.6], [-0.2, 0.3, -0.3]);
}

function zhongli(w: Wardrobe, g: Group): void {
  const h = humanoid(w, { face: FACE, torso: 0x3d7d55, legs: 0x3d7d55, shoe: IRON }, g);
  w.part(new SphereGeometry(0.34, 14, 10), "skin", FACE, g, 0, 1.02, 0.22).scale.set(1, 0.9, 0.7);
  for (const s of [-1, 1]) w.part(new SphereGeometry(0.14, 10, 8), "hair", HAIR, g, s * 0.28, 2.3, -0.05);
  beard(w, g, HAIR, 0.6);
  eyes(w, g);
  const fan = new Group();
  fan.position.y = -0.5;
  w.part(new CylinderGeometry(0.02, 0.02, 0.6, 6), "iron", TAN, fan, 0, 0.25, 0);
  w.part(new SphereGeometry(0.32, 12, 8), "matte", 0xf0e6c8, fan, 0, 0.75, 0).scale.set(1, 1.2, 0.08);
  h.arms[1]!.elbow.add(fan);
  hold(h, [0.2, 0.2, -0.4], [-1.4, 0.5, -0.8]);
}

function lu(w: Wardrobe, g: Group): void {
  const h = humanoid(w, { face: FACE, torso: 0x2f4f8f, legs: 0x2f4f8f, shoe: IRON }, g);
  w.part(new BoxGeometry(0.5, 0.25, 0.45), "hair", HAIR, g, 0, 2.2, 0);
  beard(w, g, HAIR, 0.45);
  eyes(w, g);
  const sword = new Group();
  sword.position.set(0.15, 1.15, -0.4);
  sword.rotation.z = 0.5;
  g.add(sword);
  w.part(new CylinderGeometry(0.03, 0.03, 1.5, 8), "iron", IRON, sword, 0, 0.3, 0);
  w.part(new BoxGeometry(0.3, 0.05, 0.08), "gold", GOLD, sword, 0, -0.45, 0);
  w.part(new SphereGeometry(0.05, 8, 6), "gold", GOLD, sword, 0, -0.7, 0);
  hold(h, [-0.6, 0.2, -1.4], [-0.6, 0.2, -1.4]);
}

function zhang(w: Wardrobe, g: Group): Horse {
  const donkeyG = new Group();
  donkeyG.scale.setScalar(0.7);
  g.add(donkeyG);
  const donkey = horse(w, { coat: 0x9a9590, mane: 0x5a5550, hoof: IRON, saddle: 0xb03030, tack: GOLD }, donkeyG);
  for (const s of [-1, 1]) w.part(new ConeGeometry(0.07, 0.4, 6), "silk", 0x9a9590, donkeyG, s * 0.13, 2.4, 1.15).rotation.x = -0.3;
  // the rider, facing the tail
  const rider = new Group();
  rider.position.set(0, 1.02, -0.05);
  rider.rotation.y = Math.PI;
  rider.scale.setScalar(0.8);
  g.add(rider);
  const h = humanoid(w, { face: FACE, torso: 0x8a8f96, legs: 0x8a8f96, shoe: IRON }, rider);
  beard(w, rider, WHITE, 0.7);
  w.part(new BoxGeometry(0.44, 0.2, 0.44), "hair", HAIR, rider, 0, 2.15, 0);
  eyes(w, rider);
  const drum = w.part(new CylinderGeometry(0.09, 0.09, 0.9, 8), "matte", TAN, rider, 0.05, 1.1, -0.4);
  drum.rotation.z = 0.3;
  for (const s of [-1, 1]) w.part(new CylinderGeometry(0.015, 0.015, 0.6, 5), "iron", IRON, rider, s * 0.08, 1.35, -0.42).rotation.z = 0.3 + s * 0.1;
  for (const leg of h.legs) leg.hip.rotation.x = -1.3;
  hold(h, [-0.5, 0.4, -0.9], [-0.5, 0.4, -0.9]);
  return donkey;
}

function he(w: Wardrobe, g: Group): void {
  const h = humanoid(w, { face: FACE, torso: 0xf0b8c0, legs: 0xf9e0e6, shoe: IRON, skirt: 0xf9e0e6 }, g);
  knot(w, g);
  eyes(w, g);
  const lotus = new Group();
  lotus.position.y = -0.5;
  w.part(new CylinderGeometry(0.02, 0.02, 1.3, 6), "silk", 0x4f9a5a, lotus, 0, 0.5, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    w.part(new ConeGeometry(0.08, 0.26, 4), "silk", 0xf3a3b5, lotus, Math.cos(a) * 0.09, 1.2, Math.sin(a) * 0.09).rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
  }
  w.part(new SphereGeometry(0.06, 8, 6), "gold", GOLD, lotus, 0, 1.22, 0);
  h.arms[1]!.elbow.add(lotus);
  hold(h, [0.2, 0.2, -0.5], [-1.2, 0.3, -0.9]);
}

function lan(w: Wardrobe, g: Group): void {
  const h = humanoid(w, { face: FACE, torso: 0x6aa8d8, legs: 0x6aa8d8, shoe: IRON }, g);
  w.part(new SphereGeometry(0.52, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), "hair", HAIR, g, 0, 1.8, 0);
  eyes(w, g);
  const basket = new Group();
  basket.position.set(0, -0.6, 0.1);
  w.part(new SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), "matte", 0xc9a46a, basket, 0, 0.1, 0);
  w.part(new TorusGeometry(0.2, 0.02, 6, 12, Math.PI), "iron", 0x8f6b3e, basket, 0, 0.12, 0);
  [0xd8382a, 0xf1c24c, 0xf6f6f2, 0xf3a3b5].forEach((c, i) => w.part(new SphereGeometry(0.07, 8, 6), "matte", c, basket, Math.cos(i * 1.6) * 0.12, 0.16, Math.sin(i * 1.6) * 0.12));
  h.arms[0]!.elbow.add(basket);
  hold(h, [-0.6, 0.4, -1.2], [0.2, 0.2, -0.4]);
}

function han(w: Wardrobe, g: Group): void {
  const h = humanoid(w, { face: FACE, torso: 0x7fb069, legs: 0x7fb069, shoe: IRON }, g);
  knot(w, g);
  eyes(w, g);
  const flute = w.part(new CylinderGeometry(0.025, 0.025, 0.9, 6), "matte", TAN, h.arms[1]!.elbow, -0.15, -0.5, 0.1);
  flute.rotation.z = 1.25;
  hold(h, [-1.5, 0.35, -1.6], [-1.5, 0.35, -1.6]);
}

function cao(w: Wardrobe, g: Group): void {
  const h = humanoid(w, { face: FACE, torso: 0xb0302c, legs: 0xb0302c, shoe: IRON }, g);
  w.part(new BoxGeometry(0.42, 0.3, 0.4), "hair", HAIR, g, 0, 2.15, 0);
  for (const s of [-1, 1]) w.part(new BoxGeometry(0.35, 0.05, 0.12), "hair", HAIR, g, s * 0.45, 2.2, 0);
  beard(w, g, HAIR, 0.4);
  eyes(w, g);
  for (const a of h.arms) w.part(new BoxGeometry(0.12, 0.35, 0.03), "horn", 0xeaf5ef, a.elbow, a.side * -0.04, -0.6, 0.1);
  hold(h, [-0.8, 0.25, -1.3], [-0.8, 0.25, -1.3]);
}

const BUILDERS: readonly ((w: Wardrobe, g: Group) => Horse | void)[] = [li, zhongli, lu, zhang, he, lan, han, cao];

class BaXian implements Figure {
  readonly group = new Group();
  readonly nativeSize = 15;
  readonly triangles: number;
  private readonly w: Wardrobe;
  private readonly line = new Group();
  private readonly riders: Rider[] = [];
  private readonly clouds: Group[] = [];
  private readonly loop: number;

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    this.loop = ctx.variant === "still" ? 0 : 14;
    this.group.add(this.line);
    BUILDERS.forEach((build, i) => {
      const g = new Group();
      g.position.set((i - 3.5) * 1.9, 0, i % 2 ? 0.9 : -0.9);
      this.line.add(g);
      const donkey = build(w, g) ?? null;
      this.clouds.push(
        cloudBank(
          w,
          CLOUD,
          [
            [0, -0.35, 0.1, 0.55],
            [-0.5, -0.4, -0.2, 0.4],
            [0.5, -0.4, -0.1, 0.42],
          ],
          g,
        ),
      );
      this.riders.push({ g, phase: i * 0.8, donkey });
    });
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.w.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    if (this.loop > 0) {
      const a = t * 0.05;
      this.line.position.set(Math.cos(a) * this.loop, Math.sin(a * 2) * 0.8, Math.sin(a) * this.loop);
      this.line.rotation.y = -a;
    } else this.line.position.set(0, Math.sin(t * 0.5) * 0.2, 0);
    this.riders.forEach((r, i) => {
      r.g.position.y = Math.sin(t * 0.9 + r.phase) * 0.12;
      r.g.rotation.set(0, Math.sin(t * 0.3 + r.phase) * 0.08, Math.sin(t * 0.6 + r.phase) * 0.03);
      if (r.donkey) horseWalk(r.donkey, t, 4);
      breathe(this.clouds[i]!, t, 0.05);
    });
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("baxian", (ctx) => new BaXian(ctx));
