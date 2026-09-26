/**
 * What the figures share (D91): the textures a skin paints with, made in
 * code so nothing is fetched and nothing is copied; and the spine tube, a
 * body of any length swimming along a curve with its belly kept down.
 *
 * Everything here runs without a canvas or a GL context, so a figure can be
 * built and measured in a test. The second half is the figurine: every
 * human figure of the cast starts from the same doll, and a character is
 * what a builder adds afterwards.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  DataTexture,
  Group,
  Mesh,
  NoColorSpace,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type Material,
} from "three";
import type { Role, Skin } from "./skin.js";

/** A height field of overlapping scales, as a tangent-space normal map. */
export function scaleNormalTexture(size = 256, cols = 8, rows = 6): DataTexture {
  const h = new Float32Array(size * size);
  const cw = size / cols;
  const ch = size / rows;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let best = 0;
      for (let r = -1; r <= rows; r++) {
        const off = r % 2 ? cw / 2 : 0;
        for (let c = -1; c <= cols + 1; c++) {
          const dx = (x - (c * cw + off)) / (cw * 0.62);
          const dy = (y - r * ch) / (ch * 0.9);
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 1) best = Math.max(best, (1 - d * d) * (0.6 + 0.4 * (1 - Math.max(0, dy))));
        }
      }
      h[y * size + x] = best;
    }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const l = h[y * size + ((x + size - 1) % size)]!;
      const r = h[y * size + ((x + 1) % size)]!;
      const u = h[((y + size - 1) % size) * size + x]!;
      const d = h[((y + 1) % size) * size + x]!;
      let nx = (l - r) * 3;
      let ny = (u - d) * 3;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      data[i * 4] = (nx * 0.5 + 0.5) * 255;
      data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255;
      data[i * 4 + 2] = (nz * 0.5 + 0.5) * 255;
      data[i * 4 + 3] = 255;
    }
  const t = new DataTexture(data, size, size);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Silk over bamboo: a pale field with the frame's dark ribs showing through. */
export function silkRibTexture(size = 256): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const rib = (x + 10) % Math.floor(size / 6) < 3 ? 0.35 : (y + 15) % Math.floor(size / 4) < 2 ? 0.6 : 1;
      // A little weave, so the silk is not paper.
      const weave = 0.96 + 0.04 * (((x >> 1) + (y >> 1)) & 1);
      const v = 255 * rib * weave;
      data[i] = v;
      data[i + 1] = v * (rib < 1 ? 0.8 : 1);
      data[i + 2] = v * (rib < 1 ? 0.65 : 1);
      data[i + 3] = 255;
    }
  const t = new DataTexture(data, size, size);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * A body along a curve: `segments` rings of `radial` vertices, each ring an
 * ellipse whose radius the caller gives per station, kept upright so the
 * belly stays down whatever the spine does. Two index groups, the back and
 * the belly, so a skin can dress them apart. `update` rewrites the vertices
 * in place from the current spine, which is the only per-frame work.
 */
export class SpineTube {
  readonly geometry = new BufferGeometry();
  readonly spine: Vector3[] = [];
  private readonly curve: CatmullRomCurve3;
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private readonly N = new Vector3();
  private readonly B = new Vector3();
  private readonly up = new Vector3(0, 1, 0);

  constructor(
    readonly segments: number,
    readonly radial: number,
    /** The radius at a station `s` in 0..1 from head to tail. */
    readonly radiusAt: (s: number) => number,
    /** Length repeats of the texture along the body, and around it. */
    uvRepeat: readonly [number, number] = [26, 4],
    bellyShare: readonly [number, number] = [0.36, 0.64],
  ) {
    for (let i = 0; i <= segments; i++) this.spine.push(new Vector3(i, 0, 0));
    this.curve = new CatmullRomCurve3(this.spine, false, "catmullrom", 0.5);
    const n = (segments + 1) * (radial + 1);
    this.positions = new Float32Array(n * 3);
    this.normals = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    for (let i = 0; i <= segments; i++)
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        uv[k * 2] = (i / segments) * uvRepeat[0];
        uv[k * 2 + 1] = (j / radial) * uvRepeat[1];
      }
    const back: number[] = [];
    const belly: number[] = [];
    const lo = Math.floor(radial * bellyShare[0]);
    const hi = Math.ceil(radial * bellyShare[1]);
    for (let i = 0; i < segments; i++)
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j;
        const b = a + radial + 1;
        (j >= lo && j < hi ? belly : back).push(a, b, a + 1, b, b + 1, a + 1);
      }
    this.geometry.setAttribute("position", new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("normal", new BufferAttribute(this.normals, 3));
    this.geometry.setAttribute("uv", new BufferAttribute(uv, 2));
    this.geometry.setIndex([...back, ...belly]);
    this.geometry.addGroup(0, back.length, 0);
    this.geometry.addGroup(back.length, belly.length, 1);
  }

  /** The frame at a station: tangent, and the upright normal. */
  frameAt(i: number, T: Vector3, N: Vector3, B: Vector3): void {
    const a = this.spine[Math.max(0, i - 1)]!;
    const b = this.spine[Math.min(this.segments, i + 1)]!;
    T.subVectors(b, a).normalize();
    N.copy(this.up).addScaledVector(T, -this.up.dot(T)).normalize();
    B.copy(T).cross(N).normalize();
  }

  /** Rewrite the rings from the spine as it is now. */
  update(): void {
    const { positions: pos, normals: nor, radial, segments, N, B } = this;
    const T = new Vector3();
    for (let i = 0; i <= segments; i++) {
      const s = i / segments;
      const r = this.radiusAt(s);
      const P = this.spine[i]!;
      this.frameAt(i, T, N, B);
      const rx = r * 0.95;
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const ry = r * 1.15 * (ca < 0 ? 0.92 : 1);
        const k = (i * (radial + 1) + j) * 3;
        pos[k] = P.x + N.x * ca * ry + B.x * sa * rx;
        pos[k + 1] = P.y + N.y * ca * ry + B.y * sa * rx;
        pos[k + 2] = P.z + N.z * ca * ry + B.z * sa * rx;
        const nx = (N.x * ca) / ry + (B.x * sa) / rx;
        const ny = (N.y * ca) / ry + (B.y * sa) / rx;
        const nz = (N.z * ca) / ry + (B.z * sa) / rx;
        const nl = Math.hypot(nx, ny, nz);
        nor[k] = nx / nl;
        nor[k + 1] = ny / nl;
        nor[k + 2] = nz / nl;
      }
    }
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.normal!.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  /** The spine as a curve, for anything that wants a point between stations. */
  get asCurve(): CatmullRomCurve3 {
    return this.curve;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}

/** Triangles in a geometry, for the budget a figure is held to. */
export function triangleCount(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  return Math.floor((index ? index.count : geometry.getAttribute("position")?.count ?? 0) / 3);
}

// ---- The figurine ----------------------------------------------------------
//
// Every human figure of the cast starts from the same doll: a head a third
// of its height, a torso, two arms with an elbow, two legs with a hip, and
// a walk. The character is what a builder adds afterwards - a crown, a
// snout, a rake - so the cast reads as one company, and a new figure is a
// costume, not a body.


export interface Dressed {
  readonly mesh: Mesh;
  readonly role: Role;
  readonly colour: number;
}

/** The parts a figure has dressed, so a skin swap and the budget can find them all. */
export class Wardrobe {
  readonly parts: Dressed[] = [];
  constructor(private skin: Skin) {}

  dress(mesh: Mesh, role: Role, colour: number): Mesh {
    mesh.material = this.skin.material(role, colour);
    this.parts.push({ mesh, role, colour });
    return mesh;
  }

  /** A dressed part at a place, added to a parent. */
  part(geometry: Mesh["geometry"], role: Role, colour: number, parent: Group, x = 0, y = 0, z = 0): Mesh {
    const mesh = this.dress(new Mesh(geometry), role, colour);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  redress(skin: Skin): void {
    this.skin = skin;
    for (const p of this.parts) p.mesh.material = skin.material(p.role, p.colour);
  }

  get triangles(): number {
    return this.parts.reduce((n, p) => n + triangleCount(p.mesh.geometry), 0);
  }

  materials(): Material[] {
    return this.parts.map((p) => p.mesh.material as Material);
  }

  dispose(): void {
    for (const p of this.parts) p.mesh.geometry.dispose();
  }
}

export interface Arm {
  readonly shoulder: Group;
  readonly elbow: Group;
  readonly hand: Mesh;
  readonly side: number;
}
export interface Leg {
  readonly hip: Group;
  readonly side: number;
}
export interface Humanoid {
  readonly head: Mesh;
  readonly arms: readonly Arm[];
  readonly legs: readonly Leg[];
}

export interface HumanoidOptions {
  /** Colours by part; the roles are fixed: skin for the face and hands, silk for the clothes. */
  readonly face: number;
  readonly torso: number;
  readonly legs: number;
  readonly shoe: number;
  /** A lotus-leaf skirt over the legs, or none. */
  readonly skirt?: number;
  readonly headR?: number;
}

/** The doll, standing on y = 0, 2.3 units tall to the crown of the head. */
export function humanoid(w: Wardrobe, o: HumanoidOptions, parent: Group): Humanoid {
  const head = w.part(new SphereGeometry(o.headR ?? 0.5, 24, 18), "skin", o.face, parent, 0, 1.8, 0);
  w.part(new CapsuleGeometry(0.34, 0.5, 6, 14), "silk", o.torso, parent, 0, 1.05, 0);
  if (o.skirt !== undefined) w.part(new ConeGeometry(0.62, 0.55, 12, 1, true), "silk", o.skirt, parent, 0, 0.6, 0);
  const arms: Arm[] = [];
  for (const side of [-1, 1]) {
    const shoulder = new Group();
    shoulder.position.set(side * 0.4, 1.32, 0);
    parent.add(shoulder);
    w.part(new CapsuleGeometry(0.11, 0.42, 4, 10), "silk", o.torso, shoulder, 0, -0.26, 0);
    const elbow = new Group();
    elbow.position.y = -0.52;
    shoulder.add(elbow);
    w.part(new CapsuleGeometry(0.1, 0.38, 4, 10), "silk", o.torso, elbow, 0, -0.24, 0);
    const hand = w.part(new SphereGeometry(0.12, 10, 8), "skin", o.face, elbow, 0, -0.5, 0);
    arms.push({ shoulder, elbow, hand, side });
  }
  const legs: Leg[] = [];
  for (const side of [-1, 1]) {
    const hip = new Group();
    hip.position.set(side * 0.2, 0.5, 0);
    parent.add(hip);
    w.part(new CapsuleGeometry(0.12, 0.35, 4, 10), "silk", o.legs, hip, 0, -0.25, 0);
    const shoe = w.part(new SphereGeometry(0.15, 10, 8), "iron", o.shoe, hip, 0, -0.48, 0.06);
    shoe.scale.set(1, 0.6, 1.5);
    legs.push({ hip, side });
  }
  return { head, arms, legs };
}

/** The walk: legs and arms swinging against each other. */
export function walk(t: number, h: Humanoid, rate = 5): void {
  for (const l of h.legs) l.hip.rotation.x = Math.sin(t * rate + (l.side > 0 ? 0 : Math.PI)) * 0.45;
  for (const a of h.arms) {
    a.shoulder.rotation.x = Math.sin(t * rate + (a.side > 0 ? Math.PI : 0)) * 0.35;
    a.shoulder.rotation.z = a.side * 0.15;
    a.elbow.rotation.x = -0.4;
  }
}

/** A bank of silk puffs: `[x, y, z, r]` each; they breathe in `breathe`. */
export function cloudBank(w: Wardrobe, colour: number, puffs: readonly (readonly [number, number, number, number])[], parent: Group): Group {
  const g = new Group();
  parent.add(g);
  for (const [x, y, z, r] of puffs) {
    const p = w.part(new SphereGeometry(r, 14, 10), "cloud", colour, g, x, y, z);
    p.userData.r = r;
  }
  return g;
}

export function breathe(bank: Group, t: number, amount = 0.07): void {
  bank.children.forEach((p, i) => p.scale.setScalar(1 + Math.sin(t * 2 + i * 1.9) * amount));
}

export interface Bird {
  readonly group: Group;
  /** Flap: the inner and outer wing of each side. */
  flap(f: number): void;
}

/** A bird with a red crown and black wingtips at `size` 1: a crane; smaller and blue, one of the Queen Mother's. */
export function bird(w: Wardrobe, o: { body: number; crown: number; tip: number; beak: number; size?: number }, parent: Group): Bird {
  const g = new Group();
  parent.add(g);
  const body = w.part(new SphereGeometry(0.28, 12, 10), "silk", o.body, g);
  body.scale.set(1, 0.8, 2.2);
  const neck = w.part(new CapsuleGeometry(0.06, 1.1, 4, 8), "silk", o.body, g, 0, 0.25, 0.95);
  neck.rotation.x = Math.PI / 2 - 0.35;
  w.part(new SphereGeometry(0.11, 10, 8), "silk", o.body, g, 0, 0.48, 1.5);
  w.part(new SphereGeometry(0.06, 8, 6), "silk", o.crown, g, 0, 0.56, 1.52);
  const beak = w.part(new ConeGeometry(0.035, 0.35, 6), "iron", o.beak, g, 0, 0.46, 1.75);
  beak.rotation.x = Math.PI / 2;
  const legs = w.part(new CapsuleGeometry(0.02, 0.7, 2, 4), "iron", o.tip, g, 0, -0.05, -0.75);
  legs.rotation.x = Math.PI / 2 + 0.1;
  const wings: { pivot: Group; outer: Group; side: number }[] = [];
  for (const side of [-1, 1]) {
    const pivot = new Group();
    pivot.position.set(side * 0.2, 0.1, 0.1);
    w.part(new BoxGeometry(1.2, 0.03, 0.9), "silk", o.body, pivot, side * 0.6, 0, 0);
    const outer = new Group();
    outer.position.x = side * 1.2;
    w.part(new BoxGeometry(1.0, 0.03, 0.7), "silk", o.body, outer, side * 0.5, 0, 0);
    w.part(new BoxGeometry(0.5, 0.032, 0.7), "iron", o.tip, outer, side * 1.22, 0, 0);
    pivot.add(outer);
    g.add(pivot);
    wings.push({ pivot, outer, side });
  }
  g.scale.setScalar(o.size ?? 1);
  return {
    group: g,
    flap(f) {
      for (const { pivot, outer, side } of wings) {
        pivot.rotation.z = side * (f * 0.7 + 0.45);
        outer.rotation.z = side * (f * 0.5 - 0.35);
      }
    },
  };
}
