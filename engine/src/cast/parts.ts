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
  Bone,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  NoColorSpace,
  RepeatWrapping,
  Skeleton,
  SkinnedMesh,
  Sphere,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Uint16BufferAttribute,
  Vector3,
  type Material,
  type Object3D,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
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
  /** Baked into a skinned mesh, so dressed in the skin's skinned material. */
  readonly skinned?: boolean;
}

/** The parts a figure has dressed, so a skin swap and the budget can find them all. */
export class Wardrobe {
  readonly parts: Dressed[] = [];
  private readonly skeletons: Skeleton[] = [];
  constructor(private skin: Skin) {}

  dress(mesh: Mesh, role: Role, colour: number, skinned = false): Mesh {
    mesh.material = this.skin.material(role, colour, skinned);
    this.parts.push({ mesh, role, colour, skinned });
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
    for (const p of this.parts) p.mesh.material = skin.material(p.role, p.colour, p.skinned);
  }

  get triangles(): number {
    return this.parts.reduce((n, p) => n + triangleCount(p.mesh.geometry), 0);
  }

  materials(): Material[] {
    return this.parts.map((p) => p.mesh.material as Material);
  }

  /**
   * Draw a figure as one mesh per material instead of one per part
   * (F108, F109). Every part under `root` is merged by material into a
   * skinned mesh, and bound to a bone at the group that carries it, so a
   * group that moves - a wing, a leg, a bird in its flock - still moves
   * what it carries; a flock of eleven cranes draws as three meshes and
   * flaps every wing.
   *
   * What a group carries is fixed at the bake: a part's own transform, and
   * its geometry, are baked in. So `keep` names what the figure rewrites
   * each frame - a tail rebuilt along its curve, a sash - which stays as it
   * was; and so does a part hidden, or dressed in a material of its own (a
   * stripe, a print), which the skin would not give back on a swap. A part
   * mirrored by a negative scale is wound again. The triangles are the
   * same, and the skin still dresses the result.
   */
  bake(root: Group, keep: readonly Object3D[] = []): void {
    root.updateMatrixWorld(true);
    const toRoot = new Matrix4().copy(root.matrixWorld).invert();
    const kept = new Set<Object3D>();
    for (const k of keep) k.traverse((o) => kept.add(o));
    // The object a part hangs from, if the part is under the root, drawn and not kept.
    const carrierOf = (mesh: Mesh): Object3D | null => {
      let carrier: Object3D | null = null;
      for (let o: Object3D | null = mesh; o; o = o.parent) {
        if (!o.visible || kept.has(o)) return null;
        if (!carrier && o !== mesh && !(o as Mesh).isMesh) carrier = o;
        if (o === root) return carrier;
      }
      return null;
    };
    const chosen: { p: Dressed; carrier: Object3D }[] = [];
    for (const p of this.parts) {
      if (p.skinned || p.mesh.material !== this.skin.material(p.role, p.colour)) continue;
      const carrier = carrierOf(p.mesh);
      if (carrier) chosen.push({ p, carrier });
    }
    if (!chosen.length) return;
    // A bone at each carrier, at its origin, so the bone moves as the carrier does.
    const bones: Bone[] = [];
    const boneOf = new Map<Object3D, number>();
    for (const { carrier } of chosen) {
      if (boneOf.has(carrier)) continue;
      const bone = new Bone();
      bone.name = `bone:${carrier.name || bones.length}`;
      carrier.add(bone);
      boneOf.set(carrier, bones.length);
      bones.push(bone);
    }
    root.updateMatrixWorld(true);
    const skeleton = new Skeleton(
      bones,
      bones.map((b) => new Matrix4().copy(b.matrixWorld).invert()),
    );
    this.skeletons.push(skeleton);
    // Where each bone stands at the bake, in the root's frame, to measure the reach of what it carries.
    const bindAt = bones.map((b) => new Vector3().setFromMatrixPosition(b.matrixWorld).applyMatrix4(toRoot));
    const batches = new Map<string, { role: Role; colour: number; geometries: BufferGeometry[]; reach: Map<number, number> }>();
    const m = new Matrix4();
    const v = new Vector3();
    for (const { p, carrier } of chosen) {
      m.multiplyMatrices(toRoot, p.mesh.matrixWorld);
      const g = p.mesh.geometry.clone().applyMatrix4(m);
      // A part mirrored by a negative scale is wound the other way round.
      if (m.determinant() < 0) flipWinding(g);
      const key = `${p.role}:${p.colour}`;
      let batch = batches.get(key);
      if (!batch) batches.set(key, (batch = { role: p.role, colour: p.colour, geometries: [], reach: new Map() }));
      const position = g.getAttribute("position");
      const n = position.count;
      const index = new Uint16Array(n * 4);
      const weight = new Float32Array(n * 4);
      const b = boneOf.get(carrier)!;
      let reach = batch.reach.get(b) ?? 0;
      for (let k = 0; k < n; k++) {
        index[k * 4] = b;
        weight[k * 4] = 1;
        reach = Math.max(reach, v.fromBufferAttribute(position, k).distanceTo(bindAt[b]!));
      }
      batch.reach.set(b, reach);
      g.setAttribute("skinIndex", new Uint16BufferAttribute(index, 4));
      g.setAttribute("skinWeight", new Float32BufferAttribute(weight, 4));
      batch.geometries.push(g);
    }
    const baked = new Set(chosen.map((c) => c.p.mesh));
    const rest = this.parts.filter((p) => !baked.has(p.mesh));
    this.parts.length = 0;
    this.parts.push(...rest);
    for (const mesh of baked) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    const bind = root.matrixWorld.clone();
    for (const { role, colour, geometries, reach } of batches.values()) {
      const merged = mergeGeometries(mergeable(geometries));
      for (const g of geometries) g.dispose();
      if (!merged) throw new Error(`bake: the ${role} parts in ${colour.toString(16)} would not merge`);
      const mesh = new SkinnedMesh(merged);
      mesh.name = `baked:${role}:${colour.toString(16)}`;
      followBounds(mesh, bones, reach);
      root.add(mesh);
      mesh.bind(skeleton, bind);
      this.dress(mesh, role, colour, true);
    }
    // Groups left with nothing to carry are taken out.
    const prune = (o: Object3D): void => {
      for (const c of [...o.children]) {
        prune(c);
        if ((c as Group).isGroup && c.children.length === 0 && !kept.has(c)) c.removeFromParent();
      }
    };
    prune(root);
  }

  dispose(): void {
    for (const p of this.parts) p.mesh.geometry.dispose();
    for (const s of this.skeletons) s.dispose();
  }
}

/**
 * A skinned mesh's bounds, read from its bones as they stand: each bone's
 * place, and the reach of the parts it carries as the bake measured it,
 * half again for what a bone's scale may add (a flame's flicker). three.js
 * culls and sorts a skinned mesh by this sphere and would otherwise
 * compute it once, from the pose at the bake; this one is computed each
 * time it is read, from the few bones the mesh uses.
 */
function followBounds(mesh: SkinnedMesh, bones: readonly Bone[], reach: ReadonlyMap<number, number>): void {
  const used = [...reach.entries()].map(([b, r]) => ({ bone: bones[b]!, r: r * 1.5, at: new Vector3() }));
  const sphere = new Sphere();
  const box = new Box3();
  const toMesh = new Matrix4();
  const corner = new Vector3();
  const read = (): Sphere => {
    toMesh.copy(mesh.matrixWorld).invert();
    box.makeEmpty();
    for (const u of used) {
      u.at.setFromMatrixPosition(u.bone.matrixWorld).applyMatrix4(toMesh);
      box.expandByPoint(corner.copy(u.at).subScalar(u.r));
      box.expandByPoint(corner.copy(u.at).addScalar(u.r));
    }
    box.getCenter(sphere.center);
    sphere.radius = 0;
    for (const u of used) sphere.radius = Math.max(sphere.radius, sphere.center.distanceTo(u.at) + u.r);
    return sphere;
  };
  Object.defineProperty(mesh, "boundingSphere", { get: read, set: () => {}, configurable: true });
}

/** Reverse every triangle's winding, for a part mirrored by a negative scale. */
function flipWinding(g: BufferGeometry): void {
  const index = g.getIndex();
  if (index) {
    const a = index.array;
    for (let i = 0; i + 2 < a.length; i += 3) {
      const t = a[i + 1]!;
      a[i + 1] = a[i + 2]!;
      a[i + 2] = t;
    }
    index.needsUpdate = true;
    return;
  }
  for (const attr of Object.values(g.attributes) as BufferAttribute[]) {
    const n = attr.itemSize;
    const a = attr.array;
    for (let v = 0; v + 2 < attr.count; v += 3)
      for (let k = 0; k < n; k++) {
        const t = a[(v + 1) * n + k]!;
        a[(v + 1) * n + k] = a[(v + 2) * n + k]!;
        a[(v + 2) * n + k] = t;
      }
    attr.needsUpdate = true;
  }
}

const MERGED = ["position", "normal", "uv", "skinIndex", "skinWeight"];

/** Geometries the merge will take: the same attributes, all indexed or none, no groups. */
function mergeable(geometries: BufferGeometry[]): BufferGeometry[] {
  const indexed = geometries.every((g) => g.getIndex());
  return geometries.map((g) => {
    const h = indexed || !g.getIndex() ? g : g.toNonIndexed();
    for (const name of Object.keys(h.attributes)) if (!MERGED.includes(name)) h.deleteAttribute(name);
    if (!h.getAttribute("uv")) h.setAttribute("uv", new BufferAttribute(new Float32Array(h.getAttribute("position").count * 2), 2));
    h.morphAttributes = {};
    h.clearGroups();
    return h;
  });
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

/** Each puff swells and eases on its own; a bank that has been baked (F109) holds still. */
export function breathe(bank: Group, t: number, amount = 0.07): void {
  bank.children.forEach((p, i) => {
    if ((p as Mesh).isMesh) p.scale.setScalar(1 + Math.sin(t * 2 + i * 1.9) * amount);
  });
}

// ---- The horse -------------------------------------------------------------
//
// The second body the cast shares: the pilgrims' white horse, an immortal's
// donkey, a god's riderless mount. Built standing on y = 0, facing +z, 3.2
// units nose to tail; the walk swings the legs and swishes the tail.

export interface Horse {
  readonly legs: readonly { hip: Group; phase: number }[];
  readonly tail: Mesh;
  readonly tailPts: Vector3[];
  readonly tailCurve: CatmullRomCurve3;
  /** The head, for a toss or a pair of longer ears. */
  readonly head: Mesh;
}

export interface HorseOptions {
  readonly coat: number;
  readonly mane: number;
  readonly hoof: number;
  /** The saddle, or none for a bare back. */
  readonly saddle?: number;
  /** The girth ring and the bridle. */
  readonly tack: number;
}

export function horse(w: Wardrobe, o: HorseOptions, parent: Group): Horse {
  const body = w.part(new CapsuleGeometry(0.42, 1.3, 6, 14), "silk", o.coat, parent, 0, 1.1, 0);
  body.rotation.x = Math.PI / 2;
  const neck = w.part(new CapsuleGeometry(0.2, 0.8, 6, 12), "silk", o.coat, parent, 0, 1.55, 0.95);
  neck.rotation.x = -0.6;
  const head = w.part(new SphereGeometry(0.26, 16, 12), "silk", o.coat, parent, 0, 1.95, 1.35);
  head.scale.set(0.8, 0.8, 1.6);
  for (const s of [-1, 1]) {
    w.part(new ConeGeometry(0.06, 0.22, 6), "silk", o.coat, parent, s * 0.12, 2.22, 1.15).rotation.x = -0.3;
    w.part(new SphereGeometry(0.035, 8, 6), "eye", 0x111111, parent, s * 0.17, 2.02, 1.55);
  }
  for (let i = 0; i < 7; i++) w.part(new ConeGeometry(0.07, 0.3, 5), "mane", o.mane, parent, 0, 1.75 + i * 0.07, 1.05 - i * 0.16).rotation.x = -0.8;
  const legs: { hip: Group; phase: number }[] = [];
  for (const [x, z] of [
    [-0.25, 0.55],
    [0.25, 0.55],
    [-0.25, -0.55],
    [0.25, -0.55],
  ] as const) {
    const hip = new Group();
    hip.position.set(x, 0.95, z);
    parent.add(hip);
    w.part(new CapsuleGeometry(0.09, 0.7, 4, 10), "silk", o.coat, hip, 0, -0.45, 0);
    w.part(new CylinderGeometry(0.1, 0.11, 0.12, 10), "iron", o.hoof, hip, 0, -0.88, 0);
    legs.push({ hip, phase: x < 0 !== z < 0 ? 0 : Math.PI });
  }
  const tailPts: Vector3[] = [];
  for (let i = 0; i <= 6; i++) tailPts.push(new Vector3(0, 1.3 - i * 0.15, -0.75 - i * 0.05));
  const tailCurve = new CatmullRomCurve3(tailPts);
  const tail = w.dress(new Mesh(new TubeGeometry(tailCurve, 14, 0.06, 6, false)), "mane", o.mane);
  parent.add(tail);
  if (o.saddle !== undefined) w.part(new BoxGeometry(0.6, 0.18, 0.7), "silk", o.saddle, parent, 0, 1.55, -0.05);
  w.part(new TorusGeometry(0.44, 0.03, 6, 20), "gold", o.tack, parent, 0, 1.12, -0.05).rotation.y = Math.PI / 2;
  w.part(new TorusGeometry(0.28, 0.025, 6, 20), "gold", o.tack, parent, 0, 1.95, 1.4).rotation.x = Math.PI / 2;
  return { legs, tail, tailPts, tailCurve, head };
}

/** The walk: legs swinging against each other, the tail rewritten along its curve. */
export function horseWalk(h: Horse, t: number, rate = 5): void {
  for (const l of h.legs) l.hip.rotation.x = Math.sin(t * rate + l.phase) * 0.4;
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    h.tailPts[i]!.set(Math.sin(t * 2.5 + u * 3) * 0.15 * u, 1.35 - u * 0.9, -0.75 - u * 0.35);
  }
  h.tail.geometry.dispose();
  h.tail.geometry = new TubeGeometry(h.tailCurve, 14, 0.06, 6, false);
}

// ---- Stripes, feathers and wings ------------------------------------------

const stripes = new Map<string, DataTexture>();
/** Bands across the v axis with a wave along u, made in code once per pair of colours: a tiger's, a kilt's. */
export function stripesTexture(dark: number, light: number, size = 128): DataTexture {
  const key = `${dark}:${light}`;
  const had = stripes.get(key);
  if (had) return had;
  const data = new Uint8Array(size * size * 4);
  const d = [(dark >> 16) & 255, (dark >> 8) & 255, dark & 255];
  const l = [(light >> 16) & 255, (light >> 8) & 255, light & 255];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const wave = Math.sin((x / size) * Math.PI * 4) * 6;
      const band = (y + wave + size) % (size / 7);
      const c = band < size / 7 / 3 ? d : l;
      data[i] = c[0]!;
      data[i + 1] = c[1]!;
      data[i + 2] = c[2]!;
      data[i + 3] = 255;
    }
  const tex = new DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  stripes.set(key, tex);
  return tex;
}

/** A feather: a flat tapered blade along +x, its root at the origin, 20 triangles. */
function blade(length: number, width: number, thickness = 0.03): BufferGeometry {
  const g = new CylinderGeometry(width * 0.15, width * 0.5, length, 5, 1);
  g.rotateZ(-Math.PI / 2);
  g.translate(length / 2, 0, 0);
  g.scale(1, thickness / width, 1);
  return g;
}

/**
 * A fan of feathers from one root, the first along +x and the rest swept
 * back by `spread` radians in all, each a little shorter than the one
 * before, merged into one geometry; the outer `tipShare` of each into a
 * second, for tips of another colour, or null when the share is nought.
 */
export function featherFan(count: number, length: number, width: number, spread: number, tipShare = 0.35, taper = 0.07): { shafts: BufferGeometry; tips: BufferGeometry | null } {
  const shafts: BufferGeometry[] = [];
  const tips: BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const a = count > 1 ? (i / (count - 1)) * spread : 0;
    const len = length * (1 - i * taper);
    const shaft = blade(len * (1 - tipShare), width);
    shaft.rotateY(a);
    // each feather a hair under the one before, so they lie over each other
    shaft.translate(0, -i * 0.004, 0);
    shafts.push(shaft);
    if (tipShare > 0) {
      const tip = blade(len * tipShare, width * 0.75);
      tip.translate(len * (1 - tipShare) * 0.96, 0, 0);
      tip.rotateY(a);
      tip.translate(0, -i * 0.004, 0);
      tips.push(tip);
    }
  }
  const merged = mergeGeometries(shafts)!;
  const mergedTips = tips.length ? mergeGeometries(tips)! : null;
  for (const g of [...shafts, ...tips]) g.dispose();
  return { shafts: merged, tips: mergedTips };
}

export interface Wing {
  /** The shoulder: the whole wing turns on it. */
  readonly pivot: Group;
  /** The wrist: the primaries turn on it. */
  readonly outer: Group;
  readonly side: number;
}

/**
 * A wing of feathers from the shoulder, built along +x and mirrored for
 * the left side: an arm of coverts, and from the wrist a fan of primaries
 * with tips of their own colour. Three meshes, so a flock stays cheap.
 * `span` is the wing's reach at full stretch.
 */
export function wing(w: Wardrobe, o: { body: number; tip: number; span?: number; primaries?: number }, side: number, parent: Group): Wing {
  const span = o.span ?? 2.5;
  const arm = span * 0.42;
  const width = span * 0.14;
  const pivot = new Group();
  pivot.scale.x = side;
  parent.add(pivot);
  const coverts = featherFan(4, arm * 1.05, width * 1.15, 0.5, 0);
  w.part(coverts.shafts, "silk", o.body, pivot);
  const outer = new Group();
  outer.position.x = arm;
  pivot.add(outer);
  const primaries = featherFan(o.primaries ?? 6, span * 0.62, width, 0.85, 0.35);
  w.part(primaries.shafts, "silk", o.body, outer);
  if (primaries.tips) w.part(primaries.tips, "iron", o.tip, outer);
  return { pivot, outer, side };
}

/** Beat a wing: `f` from -1 (down) to 1 (up); `lift` the dihedral at rest, `fold` how much the primaries trail. */
export function flapWing(wg: Wing, f: number, lift = 0.45, fold = 0.35): void {
  wg.pivot.rotation.z = wg.side * (f * 0.7 + lift);
  wg.outer.rotation.z = wg.side * (f * 0.5 - fold);
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
  const wings: Wing[] = [];
  for (const side of [-1, 1]) {
    const wg = wing(w, { body: o.body, tip: o.tip, span: 2.5, primaries: 6 }, side, g);
    wg.pivot.position.set(side * 0.2, 0.1, 0.1);
    wings.push(wg);
  }
  g.scale.setScalar(o.size ?? 1);
  return {
    group: g,
    flap(f) {
      for (const wg of wings) flapWing(wg, f);
    },
  };
}
