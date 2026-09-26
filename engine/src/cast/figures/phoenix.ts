/**
 * The fenghuang (D91), the phoenix of the south, "seen when the world is
 * at peace": a pheasant's body in five colours, a crest of three plumes
 * with beads, broad feathered wings, and five tail plumes streaming behind
 * along waving curves rewritten each frame, each with an eye at its end.
 * Red body, gold breast and crest; the plumes red, gold, green, blue and
 * purple. It flies a wide loop, or holds beside the camera as `still`.
 *
 * Native length 7 units, beak to the plumes' ends.
 */
import { CapsuleGeometry, CatmullRomCurve3, ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, TubeGeometry, Vector3 } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure } from "../figure.js";
import { Wardrobe, flapWing, wing, type Wing } from "../parts.js";
import type { Skin } from "../skin.js";

const RED = 0xc8342a;
const GOLD = 0xf1c24c;
const GREEN = 0x2f8f5a;
const BLUE = 0x2a6fb0;
const PURPLE = 0x7a3b8e;
const DARK = 0x2a2320;
const PLUMES = [RED, GOLD, GREEN, BLUE, PURPLE];

interface Plume {
  readonly mesh: Mesh;
  readonly pts: Vector3[];
  readonly curve: CatmullRomCurve3;
  readonly eye: Mesh;
  readonly k: number;
}

class Phoenix implements Figure {
  readonly group = new Group();
  readonly nativeSize = 7;
  readonly triangles: number;
  private readonly w: Wardrobe;
  private readonly body = new Group();
  private readonly wings: Wing[] = [];
  private readonly plumes: Plume[] = [];
  private readonly loop: number;

  constructor(ctx: BuildContext) {
    const w = (this.w = new Wardrobe(ctx.skin));
    this.loop = ctx.variant === "still" ? 0 : 10;
    const B = this.body;
    this.group.add(B);
    w.part(new SphereGeometry(0.45, 16, 12), "silk", RED, B).scale.set(1, 0.85, 1.9);
    w.part(new SphereGeometry(0.36, 14, 10), "silk", GOLD, B, 0, -0.12, 0.45).scale.set(0.9, 0.8, 1.1);
    w.part(new CapsuleGeometry(0.09, 1.1, 4, 8), "silk", RED, B, 0, 0.5, 0.95).rotation.x = -1.0;
    w.part(new SphereGeometry(0.2, 12, 10), "silk", GOLD, B, 0, 1.08, 1.4).scale.set(0.9, 0.9, 1.15);
    w.part(new ConeGeometry(0.05, 0.36, 6), "gold", GOLD, B, 0, 1.02, 1.72).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) w.part(new SphereGeometry(0.045, 8, 6), "eye", 0x111111, B, s * 0.12, 1.14, 1.5);
    // the crest: three plumes with a bead at each tip
    for (let i = 0; i < 3; i++) {
      const c = w.part(new ConeGeometry(0.04, 0.5, 5), "gold", GOLD, B, (i - 1) * 0.08, 1.4, 1.3 - Math.abs(i - 1) * 0.06);
      c.rotation.set(-0.6 - i * 0.12, 0, (i - 1) * 0.35);
      w.part(new SphereGeometry(0.05, 8, 6), "gold", BLUE, B, (i - 1) * 0.22, 1.62 + (i === 1 ? 0.06 : 0), 1.02);
    }
    for (const side of [-1, 1]) {
      const wg = wing(w, { body: RED, tip: GOLD, span: 3.4, primaries: 7 }, side, B);
      wg.pivot.position.set(side * 0.3, 0.2, 0.35);
      this.wings.push(wg);
    }
    for (const s of [-1, 1]) w.part(new CylinderGeometry(0.03, 0.03, 0.5, 6), "iron", DARK, B, s * 0.14, -0.55, 0.1).rotation.x = 0.4;
    PLUMES.forEach((colour, k) => {
      const pts: Vector3[] = [];
      for (let i = 0; i <= 10; i++) pts.push(new Vector3((k - 2) * 0.12, 0.1, -0.7 - i * 0.45));
      const curve = new CatmullRomCurve3(pts);
      const mesh = w.dress(new Mesh(new TubeGeometry(curve, 24, 0.045, 6, false)), "silk", colour);
      B.add(mesh);
      const eye = w.part(new SphereGeometry(0.11, 10, 8), "gold", k % 2 ? GOLD : BLUE, B);
      eye.scale.set(1, 0.6, 1.4);
      this.plumes.push({ mesh, pts, curve, eye, k });
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
      const a = t * 0.16;
      this.body.position.set(Math.cos(a) * this.loop, Math.sin(a * 2) * 1.2, Math.sin(a) * this.loop);
      this.body.rotation.set(0, -a, 0.25);
    } else {
      this.body.position.set(0, Math.sin(t * 1.3) * 0.25, 0);
      this.body.rotation.set(0.05, 0, Math.sin(t * 0.6) * 0.08);
    }
    const flap = Math.sin(t * 3.2);
    for (const wg of this.wings) flapWing(wg, flap, 0.35, 0.3);
    for (const p of this.plumes) {
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        p.pts[i]!.set(
          (p.k - 2) * (0.12 + u * 0.55) + Math.sin(u * 4 - t * 2.5 + p.k) * 0.25 * u,
          0.1 + Math.sin(u * 3 - t * 2 + p.k * 0.7) * 0.35 * u - u * u * 0.6,
          -0.7 - u * 4.5,
        );
      }
      p.mesh.geometry.dispose();
      p.mesh.geometry = new TubeGeometry(p.curve, 24, 0.045, 6, false);
      p.eye.position.copy(p.pts[10]!);
    }
  }

  dispose(): void {
    this.w.dispose();
  }
}

registerFigure("phoenix", (ctx) => new Phoenix(ctx));
