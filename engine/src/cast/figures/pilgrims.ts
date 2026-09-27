/**
 * The pilgrims (D91): the monk on the white horse, Bajie, Sha Wujing,
 * walking a road of cloud. Wukong scouts ahead as his own figure. The monk
 * wears the five-leaf Vairocana crown and the patched kasaya and carries
 * the ringed staff; Bajie has the snout, the ears, the belly and the
 * nine-tooth rake; Sha the red hair and beard, the necklace of nine skulls,
 * the crescent staff and the luggage pole. All three from the one doll.
 *
 * Native length 8 units, the horse's nose to Sha's pack; the party walks a
 * slow circle of that order round its place, or in place as a companion.
 * The `monk` variant is the departure (ch. 12-13): the monk and the horse
 * alone, in place, 3.6 units long, before the road gave him his company.
 */
import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, SphereGeometry, TorusGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure } from "../figure.js";
import { Wardrobe, cloudBank, horse, horseWalk, humanoid, walk, type Horse, type Humanoid } from "../parts.js";
import type { Skin } from "../skin.js";

const COAT = 0xf7f4ee;
const MANE = 0xe8e0d0;
const HOOF = 0x3a2f2a;
const SADDLE = 0xd8382a;
const GOLD = 0xf1c24c;
const FACE = 0xf6dcc4;
const ROBE = 0xf3e2b8;
const KASAYA = 0xc8442c;
const PINK = 0xf2b8a2;
const JACKET = 0x2b3a6b;
const BELLY = 0xf5d5c0;
const IRON = 0x3a2f2a;
const TAN = 0xd9a37a;
const RUST = 0x8a2a1e;
const DRAB = 0x5a4a3a;
const BONE = 0xf2ecdc;
const PACK = 0x8f6b3e;
const CLOUD = 0xffffff;

function monk(w: Wardrobe, parent: Group): Humanoid {
  const h = humanoid(w, { face: FACE, torso: ROBE, legs: ROBE, shoe: IRON }, parent);
  for (let i = 0; i < 6; i++) w.part(new BoxGeometry(0.28, 0.22, 0.08), i % 2 ? "silk" : "gold", i % 2 ? KASAYA : GOLD, parent, -0.3 + i * 0.11, 1.4 - i * 0.16, 0.34).rotation.z = -0.55;
  w.part(new TorusGeometry(0.45, 0.06, 8, 24), "gold", GOLD, parent, 0, 2.05, 0).rotation.x = Math.PI / 2;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leaf = w.part(new ConeGeometry(0.17, 0.45, 4), "silk", KASAYA, parent, Math.sin(a) * 0.4, 2.3, Math.cos(a) * 0.4);
    leaf.rotation.set(0.2, -a, 0);
    w.part(new SphereGeometry(0.05, 6, 6), "gold", GOLD, parent, Math.sin(a) * 0.4, 2.55, Math.cos(a) * 0.4);
  }
  for (const s of [-1, 1]) w.part(new SphereGeometry(0.045, 8, 6), "eye", 0x111111, parent, s * 0.16, 1.84, 0.46);
  const staff = new Group();
  staff.position.y = -0.5;
  staff.rotation.z = -0.15;
  w.part(new CylinderGeometry(0.03, 0.03, 2.6, 8), "gold", GOLD, staff, 0, 0.6, 0);
  w.part(new TorusGeometry(0.2, 0.025, 6, 20), "gold", GOLD, staff, 0, 2.0, 0);
  for (let i = 0; i < 6; i++) w.part(new TorusGeometry(0.06, 0.012, 6, 12), "gold", GOLD, staff, Math.cos(i) * 0.2, 2.0 + Math.sin(i) * 0.2 - 0.02, 0.02);
  h.arms[1]!.elbow.add(staff);
  return h;
}

function bajie(w: Wardrobe, parent: Group): Humanoid {
  const h = humanoid(w, { face: PINK, torso: JACKET, legs: JACKET, shoe: IRON, headR: 0.55 }, parent);
  w.part(new SphereGeometry(0.4, 16, 12), "skin", BELLY, parent, 0, 1.0, 0.18).scale.set(1, 0.9, 0.8);
  w.part(new CylinderGeometry(0.2, 0.24, 0.3, 14), "skin", PINK, parent, 0, 1.68, 0.55).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    w.part(new SphereGeometry(0.04, 6, 6), "eye", 0x111111, parent, s * 0.08, 1.68, 0.71);
    w.part(new SphereGeometry(0.05, 8, 6), "eye", 0x111111, parent, s * 0.2, 1.92, 0.5);
    w.part(new ConeGeometry(0.18, 0.5, 4), "skin", PINK, parent, s * 0.55, 2.1, -0.05).rotation.set(-0.3, 0, s * 0.9);
  }
  const rake = new Group();
  rake.position.y = -0.5;
  rake.rotation.set(-0.6, 0, 0.3);
  w.part(new CylinderGeometry(0.035, 0.035, 2.6, 8), "iron", IRON, rake, 0, 0.6, 0);
  w.part(new BoxGeometry(0.9, 0.08, 0.08), "gold", GOLD, rake, 0, 1.95, 0);
  for (let i = 0; i < 9; i++) w.part(new ConeGeometry(0.03, 0.28, 5), "iron", IRON, rake, -0.4 + i * 0.1, 2.12, 0);
  h.arms[0]!.elbow.add(rake);
  return h;
}

function sha(w: Wardrobe, parent: Group): Humanoid {
  const h = humanoid(w, { face: TAN, torso: DRAB, legs: DRAB, shoe: IRON, skirt: DRAB }, parent);
  w.part(new SphereGeometry(0.53, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), "hair", RUST, parent, 0, 1.82, 0);
  w.part(new ConeGeometry(0.3, 0.7, 10), "hair", RUST, parent, 0, 1.35, 0.3).rotation.x = Math.PI + 0.3;
  for (const s of [-1, 1]) {
    w.part(new SphereGeometry(0.05, 8, 6), "eye", 0x111111, parent, s * 0.17, 1.84, 0.46);
    w.part(new BoxGeometry(0.18, 0.04, 0.05), "hair", RUST, parent, s * 0.18, 1.98, 0.47).rotation.z = s * 0.4;
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 1.2 - Math.PI * 0.6 + Math.PI;
    w.part(new SphereGeometry(0.07, 8, 6), "matte", BONE, parent, Math.sin(a) * 0.4, 1.27 - Math.cos(a) * 0.1, Math.cos(a) * 0.4);
  }
  const staff = new Group();
  staff.position.y = -0.5;
  staff.rotation.z = -0.2;
  w.part(new CylinderGeometry(0.035, 0.035, 2.8, 8), "iron", IRON, staff, 0, 0.5, 0);
  w.part(new TorusGeometry(0.22, 0.03, 6, 16, Math.PI), "gold", GOLD, staff, 0, 1.9, 0).rotation.z = Math.PI;
  h.arms[1]!.elbow.add(staff);
  const pole = new Group();
  pole.position.set(0, -0.3, 0);
  pole.rotation.set(0.2, 0, 1.3);
  w.part(new CylinderGeometry(0.03, 0.03, 2.4, 8), "iron", IRON, pole);
  for (const e of [-1, 1]) {
    w.part(new BoxGeometry(0.42, 0.34, 0.3), "silk", PACK, pole, 0, e * 1.05, 0.25);
    w.part(new CylinderGeometry(0.01, 0.01, 0.3, 4), "iron", IRON, pole, 0, e * 1.05, 0.12).rotation.x = Math.PI / 2;
  }
  h.arms[0]!.elbow.add(pole);
  return h;
}

class Pilgrims implements Figure {
  readonly group = new Group();
  readonly nativeSize: number;
  readonly triangles: number;
  private readonly w: Wardrobe;
  private readonly party = new Group();
  private readonly horse: Horse;
  private readonly monk: Humanoid;
  private readonly bajie: Humanoid | null = null;
  private readonly sha: Humanoid | null = null;
  private readonly bajieG = new Group();
  private readonly shaG = new Group();
  private readonly circuit: number;

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    const alone = ctx.variant === "monk";
    this.circuit = ctx.variant === "still" || alone ? 0 : 10;
    this.nativeSize = alone ? 3.6 : 8;
    this.group.add(this.party);
    const horseG = new Group();
    this.horse = horse(w, { coat: COAT, mane: MANE, hoof: HOOF, saddle: SADDLE, tack: GOLD }, horseG);
    const monkG = new Group();
    monkG.position.set(0, 1.45, -0.05);
    monkG.scale.setScalar(0.72);
    this.monk = monk(w, monkG);
    horseG.add(monkG);
    this.party.add(horseG);
    if (!alone) {
      this.bajieG.position.set(0, 0, -2.6);
      this.bajie = bajie(w, this.bajieG);
      this.shaG.position.set(0, 0, -4.6);
      this.sha = sha(w, this.shaG);
      this.party.add(this.bajieG, this.shaG);
    }
    const puffs: [number, number, number, number][] = [];
    for (let i = 0; i < (alone ? 7 : 16); i++) puffs.push([Math.sin(i * 2.1) * 0.5, -0.35 - Math.abs(Math.sin(i * 1.3)) * 0.15, 1.5 - i * 0.55, 0.42 + Math.sin(i * 1.7) * 0.12]);
    cloudBank(w, CLOUD, puffs, this.party);
    // One mesh per material, a bone at every group that walks; the horse's tail is rebuilt each frame (F109).
    w.bake(this.party, [this.horse.tail]);
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.w.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    if (this.circuit > 0) {
      // a slow circle, walking forwards along it
      const a = -t * 0.06;
      this.party.position.set(Math.cos(a) * this.circuit, Math.sin(t * 1.1) * 0.08, Math.sin(a) * this.circuit);
      this.party.rotation.y = -a;
    } else {
      this.party.position.set(0, Math.sin(t * 1.1) * 0.08, 0);
    }
    horseWalk(this.horse, t, 5);
    // the monk sits: legs down, the staff held, the reins in the other hand
    const [ml, mr] = this.monk.arms;
    mr!.shoulder.rotation.set(-0.5, 0, 0.6);
    mr!.elbow.rotation.set(-0.6, 0, 0);
    ml!.shoulder.rotation.set(-0.3, 0, -0.5);
    ml!.elbow.rotation.set(-0.9, 0, 0);
    for (const leg of this.monk.legs) leg.hip.rotation.x = -1.3;
    if (this.bajie) {
      walk(t, this.bajie, 5);
      const [bl] = this.bajie.arms;
      bl!.shoulder.rotation.set(0.5, 0, -0.7);
      bl!.elbow.rotation.set(-1.8, 0, 0);
      this.bajieG.rotation.z = Math.sin(t * 5) * 0.04;
      this.bajieG.position.y = Math.abs(Math.sin(t * 5)) * 0.06;
    }
    if (this.sha) {
      walk(t, this.sha, 5);
      const [sl, sr] = this.sha.arms;
      sl!.shoulder.rotation.set(-0.3, 0, -0.9);
      sl!.elbow.rotation.set(-2.2, 0, 0);
      sr!.shoulder.rotation.set(0.4 + Math.sin(t * 5) * 0.2, 0, 0.3);
      sr!.elbow.rotation.set(-0.5, 0, 0);
      this.shaG.position.y = Math.abs(Math.sin(t * 5 + 1)) * 0.06;
    }
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("pilgrims", (ctx) => new Pilgrims(ctx));
