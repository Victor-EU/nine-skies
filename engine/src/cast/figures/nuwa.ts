/**
 * Nüwa mending the sky (D98). When Gonggong broke the pillar at Buzhou
 * the sky tilted to the north-west, and Nüwa smelted stones of five
 * colours and mended it (Huainanzi, the book of the film's nine skies).
 * As the Han reliefs show her: a woman to the waist, in a wrapped Han robe
 * crossed at the collar, her hair in a high knot with a jade pin, and
 * below it a long serpent's body of bronze-green scale; she rises with
 * both hands over her head holding up the stone, which glows in the five
 * colours: blue-green, red, yellow, white and black. Wisps of cloud about
 * her coils. The body swims a slow wave to its tail; she holds still. In
 * place as `still`, or a slow circle.
 *
 * The painted card (`paintings/nuwa.ts`) is what the film draws; this is
 * the figure made in code, for `?paint=off`. Baked into one skinned mesh
 * per material but the serpent's body, rebuilt each frame; the cloud holds
 * still.
 *
 * Native length 5.2 units, stone to tail tip.
 */
import { CatmullRomCurve3, ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, TubeGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure, type Head } from "../figure.js";
import { Wardrobe, cloudBank, humanHead, humanoid } from "../parts.js";
import type { Skin } from "../skin.js";

const FACE = 0xecd2b8;
const ROBE = 0x9a6a32;
const UNDER = 0xe8dcc6;
const HAIR = 0x1b1816;
const JADE = 0x7fb89a;
const SCALE = 0x3c5a48;
const CLOUD = 0xffffff;
/** The five colours of the stone: blue-green, red, yellow, white and black. */
const STONE = [0x2f8f7a, 0xd83a2a, 0xf1c24c, 0xf4f4f0, 0x2c2c34];

/** Rings along the serpent's body, and its thickness at the waist and at the tip. */
const BODY_SEGMENTS = 40;
const BODY_RADIUS = [0.3, 0.04] as const;

class Nuwa implements Figure {
  readonly group = new Group();
  readonly nativeSize = 5.2;
  readonly triangles: number;
  readonly heads: readonly Head[];
  private readonly w: Wardrobe;
  private readonly body = new Group();
  private readonly coil: Mesh;
  private readonly coilPts: Vector3[] = [];
  private readonly coilCurve: CatmullRomCurve3;
  private readonly circuit: number;

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    this.circuit = ctx.variant === "still" ? 0 : 9;
    const B = this.body;
    this.group.add(B);
    // the woman, leaning into her rise, legs none: the robe's hem closes over the serpent's waist
    const woman = new Group();
    woman.rotation.x = 0.25;
    B.add(woman);
    const h = humanoid(w, { face: FACE, torso: ROBE, legs: ROBE, shoe: HAIR, skirt: UNDER, headR: 0.46 }, woman);
    for (const l of h.legs) l.hip.visible = false;
    // the high knot of hair and its jade pin
    w.part(new SphereGeometry(0.48, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), "hair", HAIR, woman, 0, 1.83, -0.02);
    w.part(new SphereGeometry(0.2, 12, 10), "hair", HAIR, woman, 0, 2.38, -0.12);
    w.part(new CylinderGeometry(0.02, 0.02, 0.5, 6), "gold", JADE, woman, 0, 2.4, -0.12).rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) w.part(new SphereGeometry(0.045, 8, 6), "eye", 0x111111, woman, s * 0.15, 1.86, 0.42);
    // both arms raised over her head, the stone of five colours between the hands
    for (const a of h.arms) {
      a.shoulder.rotation.set(-2.6, 0, -a.side * 0.25);
      a.elbow.rotation.set(-0.35, 0, 0);
      w.part(new ConeGeometry(0.3, 0.8, 12, 1, true), "silk", ROBE, a.shoulder, 0, -0.45, 0);
    }
    const stone = new Group();
    stone.position.set(-0.3, -0.75, 0.1);
    h.arms[1]!.elbow.add(stone);
    STONE.forEach((c, i) => {
      const a = (i / STONE.length) * Math.PI * 2;
      w.part(new SphereGeometry(0.17, 10, 8), i === 4 ? "matte" : "flame", c, stone, Math.cos(a) * 0.1, Math.sin(a) * 0.1, (i % 2) * 0.08 - 0.04);
    });
    this.heads = [humanHead(h, woman, 0.9, 0.35)];
    // the serpent from the robe's hem back to its tip, thick at the waist
    for (let i = 0; i <= 8; i++) this.coilPts.push(new Vector3(0, 0.5 - i * 0.05, -0.1 - i * 0.55));
    this.coilCurve = new CatmullRomCurve3(this.coilPts);
    this.coil = w.dress(new Mesh(taperedTube(this.coilCurve)), "scale", SCALE);
    B.add(this.coil);
    // wisps of cloud about the coils
    cloudBank(
      w,
      CLOUD,
      [
        [0.35, 0.2, -1.2, 0.35],
        [-0.3, 0.1, -2.3, 0.3],
        [0.25, 0.35, -3.3, 0.26],
        [-0.2, -0.2, -0.5, 0.3],
      ],
      B,
    );
    w.bake(B, [this.coil]);
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.w.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    if (this.circuit > 0) {
      const a = -t * 0.04;
      this.body.position.set(Math.cos(a) * this.circuit, 0, Math.sin(a) * this.circuit);
      this.body.rotation.set(0, -a, 0);
    }
    // a slow wave from the waist to the tail, growing as it goes
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      this.coilPts[i]!.set(Math.sin(t * 0.6 - u * 4) * 0.3 * u, 0.5 - u * 0.4 + Math.sin(t * 0.9 - u * 5) * 0.45 * u, -0.1 - u * 4.4);
    }
    this.coil.geometry.dispose();
    this.coil.geometry = taperedTube(this.coilCurve);
  }

  dispose(): void {
    this.w.dispose();
  }
}

/** A tube along the curve whose rings narrow from the waist's thickness to the tip's. */
function taperedTube(curve: CatmullRomCurve3): TubeGeometry {
  const radial = 10;
  const g = new TubeGeometry(curve, BODY_SEGMENTS, 1, radial, false);
  const pos = g.attributes.position!;
  const at = new Vector3();
  const v = new Vector3();
  for (let i = 0; i <= BODY_SEGMENTS; i++) {
    const u = i / BODY_SEGMENTS;
    curve.getPointAt(u, at);
    const r = BODY_RADIUS[0] + (BODY_RADIUS[1] - BODY_RADIUS[0]) * u * u;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(at).multiplyScalar(r).add(at);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

registerFigure("nuwa", (ctx) => new Nuwa(ctx));
