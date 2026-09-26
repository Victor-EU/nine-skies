/**
 * What the figures share (D91): the textures a skin paints with, made in
 * code so nothing is fetched and nothing is copied; and the spine tube, a
 * body of any length swimming along a curve with its belly kept down.
 *
 * Everything here runs without a canvas or a GL context, so a figure can be
 * built and measured in a test.
 */
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, DataTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace, Vector3 } from "three";

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
