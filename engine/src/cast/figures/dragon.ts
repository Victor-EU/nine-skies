/**
 * The dragon (D91): the classical nine likenesses as far as a lantern can
 * carry them - a serpent's body swimming through the air in the painted
 * S-curves, a camel's head, deer antlers, a mane, whiskers, four legs with
 * four claws each (five is the emperor's), and no wings, since a dragon
 * rides the cloud.
 *
 * Built at a native length of 30 units, head to tail; the layer scales it
 * to the cue's metres. The body is a `SpineTube` rewritten each frame from
 * a loop the head follows; the fins are one instanced blade; nothing else
 * is rebuilt per frame, so the frame cost is the tube's vertices and a
 * handful of transforms.
 */
import { CatmullRomCurve3, CapsuleGeometry, ConeGeometry, Group, InstancedMesh, Matrix4, Mesh, Quaternion, SphereGeometry, TubeGeometry, Vector3, type Material } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure } from "../figure.js";
import { SpineTube, triangleCount } from "../parts.js";
import type { Role, Skin } from "../skin.js";

const SEGMENTS = 72;
const RADIAL = 20;
export const DRAGON_LENGTH = 30;
const FINS = Math.floor((SEGMENTS - 8) / 2);

/** The four kings by their seas, in the Four Symbols' colours; the default is the east's. */
const VARIANTS: Readonly<Record<string, { body: number; belly: number; mane: number }>> = {
  "east-king": { body: 0x2f7a5a, belly: 0xe9d9a0, mane: 0xe0a030 },
  "south-king": { body: 0xc93b2a, belly: 0xf2c58a, mane: 0xf0a030 },
  "west-king": { body: 0xe8e2d4, belly: 0xf6f0e0, mane: 0xd8c8a0 },
  "north-king": { body: 0x2b2f3a, belly: 0x8a8f9a, mane: 0x6a6f7a },
  lantern: { body: 0xd9452c, belly: 0xf2c58a, mane: 0xf0a030 },
};

/** Neck thick just behind the head, a long body, a tapered tail. */
export function dragonRadius(s: number): number {
  return 0.68 * (0.55 + 0.55 * Math.sin(Math.PI * Math.pow(s, 0.55))) * (1 - 0.85 * Math.pow(s, 6));
}

class Dragon implements Figure {
  readonly group = new Group();
  readonly nativeSize = DRAGON_LENGTH;
  readonly triangles: number;
  private readonly tube: SpineTube;
  private readonly body: Mesh;
  private readonly fins: InstancedMesh;
  private readonly head = new Group();
  private readonly jaw: Mesh;
  private readonly whiskers: Mesh[] = [];
  private readonly mane: Mesh[] = [];
  private readonly legs: { leg: Group; knee: Group; side: number; at: number }[] = [];
  private readonly tuft = new Group();
  private readonly parts: { mesh: Mesh; role: Role; colour: number }[] = [];
  private readonly loop: CatmullRomCurve3;
  private readonly colours: { body: number; belly: number; mane: number };
  private readonly tmp = { T: new Vector3(), N: new Vector3(), B: new Vector3(), P: new Vector3(), m: new Matrix4(), q: new Quaternion(), s: new Vector3(), up: new Vector3(0, 1, 0), yAxis: new Vector3(0, 1, 0) };

  constructor(ctx: BuildContext) {
    this.colours = VARIANTS[ctx.variant ?? "east-king"] ?? VARIANTS["east-king"]!;
    const c = this.colours;
    const dress = (mesh: Mesh, role: Role, colour: number): Mesh => {
      this.parts.push({ mesh, role, colour });
      mesh.material = ctx.skin.material(role, colour);
      return mesh;
    };
    this.tube = new SpineTube(SEGMENTS, RADIAL, dragonRadius);
    this.body = new Mesh(this.tube.geometry, [ctx.skin.material("scale", c.body), ctx.skin.material("belly", c.belly)]);
    this.group.add(this.body);

    this.fins = new InstancedMesh(new ConeGeometry(0.13, 0.7, 5), ctx.skin.material("mane", c.mane), FINS);
    this.group.add(this.fins);

    for (let l = 0; l < 4; l++) {
      const leg = new Group();
      const upper = dress(new Mesh(new CapsuleGeometry(0.22, 1.1, 4, 10)), "scale", c.body);
      upper.position.y = -0.55;
      const knee = new Group();
      knee.position.y = -1.15;
      const lower = dress(new Mesh(new CapsuleGeometry(0.17, 1.0, 4, 10)), "scale", c.body);
      lower.position.y = -0.5;
      const foot = new Group();
      foot.position.y = -1.05;
      for (let k = 0; k < 4; k++) {
        const claw = dress(new Mesh(new ConeGeometry(0.07, 0.5, 6)), "horn", 0xf3d9a0);
        const a = (k - 1.5) * 0.5;
        claw.position.set(Math.sin(a) * 0.28, -0.1, Math.cos(a) * 0.28 + 0.1);
        claw.rotation.set(1.9, a, 0);
        foot.add(claw);
      }
      knee.add(lower, foot);
      leg.add(upper, knee);
      leg.scale.setScalar(0.72);
      this.legs.push({ leg, knee, side: l % 2 ? 1 : -1, at: l < 2 ? 0.2 : 0.62 });
      this.group.add(leg);
    }

    // The head: skull, snout, jaw, nose, brows, eyes, antlers, ear fins, whiskers, mane.
    const skull = dress(new Mesh(new SphereGeometry(0.95, 24, 18)), "scale", c.body);
    skull.scale.set(1, 0.85, 1.25);
    const snout = dress(new Mesh(new SphereGeometry(0.62, 20, 14)), "scale", c.body);
    snout.scale.set(1, 0.62, 1.6);
    snout.position.set(0, -0.15, 1.35);
    this.jaw = dress(new Mesh(new SphereGeometry(0.5, 16, 12)), "belly", c.belly);
    this.jaw.scale.set(0.9, 0.35, 1.5);
    this.jaw.position.set(0, -0.62, 1.2);
    const nose = dress(new Mesh(new SphereGeometry(0.2, 10, 8)), "scale", c.body);
    nose.position.set(0, 0.25, 2.2);
    this.head.add(skull, snout, this.jaw, nose);
    for (const s of [-1, 1]) {
      const brow = dress(new Mesh(new SphereGeometry(0.28, 12, 10)), "scale", c.body);
      brow.scale.set(1.3, 0.6, 1);
      brow.position.set(s * 0.55, 0.62, 0.55);
      const eye = dress(new Mesh(new SphereGeometry(0.2, 12, 10)), "eye", 0x111111);
      eye.position.set(s * 0.62, 0.42, 0.7);
      const glint = dress(new Mesh(new SphereGeometry(0.11, 8, 8)), "flame", 0xffd080);
      glint.position.set(s * 0.68, 0.46, 0.86);
      const antler = dress(
        new Mesh(new TubeGeometry(new CatmullRomCurve3([new Vector3(s * 0.45, 0.7, -0.1), new Vector3(s * 0.8, 1.5, -0.7), new Vector3(s * 1.0, 2.3, -1.3), new Vector3(s * 0.9, 2.9, -2.1)]), 14, 0.11, 8, false)),
        "horn",
        0xf3d9a0,
      );
      const tine = dress(new Mesh(new TubeGeometry(new CatmullRomCurve3([new Vector3(s * 0.85, 1.6, -0.8), new Vector3(s * 1.3, 2.1, -0.6), new Vector3(s * 1.55, 2.6, -0.7)]), 8, 0.08, 8, false)), "horn", 0xf3d9a0);
      const ear = dress(new Mesh(new ConeGeometry(0.3, 0.9, 4)), "mane", c.mane);
      ear.position.set(s * 0.95, 0.35, -0.2);
      ear.rotation.set(-0.4, 0, s * -1.2);
      const pts: Vector3[] = [];
      for (let i = 0; i <= 10; i++) pts.push(new Vector3(s * (0.35 + i * 0.32), -0.1 - i * i * 0.02, 1.9 - i * 0.12));
      const whisker = dress(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 30, 0.035, 6, false)), "horn", 0xf3d9a0);
      whisker.userData.side = s;
      this.whiskers.push(whisker);
      this.head.add(brow, eye, glint, antler, tine, ear, whisker);
    }
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      if (Math.abs(Math.sin(a)) < 0.25 && Math.cos(a) < 0) continue;
      const blade = dress(new Mesh(new ConeGeometry(0.22, 1.6 + 0.6 * ((i * 7) % 5) / 5, 4)), "mane", c.mane);
      blade.position.set(Math.sin(a) * 0.95, Math.cos(a) * 0.85 - 0.1, -0.9);
      blade.rotation.set(Math.PI * 0.62, 0, -a);
      blade.userData.phase = i * 1.3;
      this.mane.push(blade);
      this.head.add(blade);
    }
    this.head.scale.setScalar(0.85);
    this.group.add(this.head);

    for (let i = 0; i < 7; i++) {
      const b = dress(new Mesh(new ConeGeometry(0.14, 1.4, 4)), "mane", c.mane);
      b.rotation.set(Math.PI, 0, (i - 3) * 0.35);
      b.position.y = 0.4;
      this.tuft.add(b);
    }
    this.group.add(this.tuft);

    // The loop the head follows, in the figure's units around its anchor:
    // a long lazy ellipse with a rise and a dive.
    this.loop = new CatmullRomCurve3(
      [new Vector3(-14, -1.5, -6), new Vector3(-6, 1.5, 2), new Vector3(3, 0.5, 8), new Vector3(12, -1.5, 2), new Vector3(11, -4, -10), new Vector3(2, -3, -18), new Vector3(-8, 0.5, -16)],
      true,
      "catmullrom",
      0.6,
    );

    let tris = triangleCount(this.tube.geometry) + triangleCount(this.fins.geometry) * FINS;
    for (const p of this.parts) tris += triangleCount(p.mesh.geometry);
    this.triangles = tris;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    const c = this.colours;
    this.body.material = [skin.material("scale", c.body), skin.material("belly", c.belly)];
    this.fins.material = skin.material("mane", c.mane);
    for (const p of this.parts) p.mesh.material = skin.material(p.role, p.colour);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    const { T, N, B, P, m, q, s: sc, up } = this.tmp;
    const pathLen = this.loop.getLength();
    const headU = (t * 0.032) % 1;
    for (let i = 0; i <= SEGMENTS; i++) {
      const s = i / SEGMENTS;
      let u = headU - (s * DRAGON_LENGTH) / pathLen;
      u = ((u % 1) + 1) % 1;
      const p = this.loop.getPointAt(u);
      const tan = this.loop.getTangentAt(u);
      N.set(0, 1, 0).cross(tan).normalize();
      B.copy(tan).cross(N).normalize();
      // The swim: a small wave across, a larger one up and down, both growing to the tail.
      const wave = Math.sin(s * 7 - t * 2.2) * (0.15 + 0.7 * s * s);
      const lift = Math.sin(s * 6.5 - t * 2.4) * (0.6 + 1.6 * s);
      this.tube.spine[i]!.copy(p).addScaledVector(N, wave).addScaledVector(B, lift);
    }
    this.tube.update();

    for (let i = 0; i < FINS; i++) {
      const idx = i * 2 + 4;
      const s = idx / SEGMENTS;
      this.tube.frameAt(idx, T, N, B);
      P.copy(this.tube.spine[idx]!).addScaledVector(N, dragonRadius(s) * 1.15 + 0.25);
      q.setFromUnitVectors(up, this.tmp.yAxis.copy(N).addScaledVector(T, -0.35).normalize());
      sc.set(1, 0.5 + 0.9 * Math.sin(Math.PI * s) * (1 - s * 0.5), 1);
      m.compose(P, q, sc);
      this.fins.setMatrixAt(i, m);
    }
    this.fins.instanceMatrix.needsUpdate = true;

    this.tube.frameAt(0, T, N, B);
    this.head.position.copy(this.tube.spine[0]!).addScaledVector(T, 0.6);
    this.head.up.copy(up);
    this.head.lookAt(P.copy(this.head.position).add(T));
    this.head.rotation.x += Math.sin(t * 1.3) * 0.08;
    this.jaw.rotation.x = 0.25 + 0.12 * Math.max(0, Math.sin(t * 0.9));
    for (const w of this.whiskers) w.rotation.z = (w.userData.side as number) * Math.sin(t * 1.7) * 0.12;
    for (const b of this.mane) b.rotation.x = Math.PI * 0.62 + Math.sin(t * 3 + (b.userData.phase as number)) * 0.18;

    for (const { leg, knee, side, at } of this.legs) {
      const idx = Math.round(at * SEGMENTS);
      const r = dragonRadius(idx / SEGMENTS);
      this.tube.frameAt(idx, T, N, B);
      leg.position.copy(this.tube.spine[idx]!).addScaledVector(B, side * r * 0.85).addScaledVector(N, -r * 0.35);
      leg.up.copy(up);
      leg.lookAt(P.copy(leg.position).add(T));
      leg.rotateZ(side * 0.55);
      leg.rotateX(-0.9 + Math.sin(t * 2.6 - at * 9) * 0.5);
      knee.rotation.x = 1.1 + Math.sin(t * 2.6 - at * 9 + 1.2) * 0.45;
    }

    this.tube.frameAt(SEGMENTS, T, N, B);
    this.tuft.position.copy(this.tube.spine[SEGMENTS]!);
    this.tuft.up.copy(up);
    this.tuft.lookAt(P.copy(this.tuft.position).sub(T));
    this.tuft.rotateX(Math.PI / 2);
  }

  dispose(): void {
    this.tube.dispose();
    this.fins.geometry.dispose();
    for (const p of this.parts) p.mesh.geometry.dispose();
  }
}

registerFigure("dragon", (ctx) => new Dragon(ctx));

/** The material a dressed part wears, for a test of the swap. */
export function dragonMaterials(figure: Figure): Material[] {
  const out: Material[] = [];
  figure.group.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) out.push(...mesh.material);
    else out.push(mesh.material);
  });
  return out;
}
