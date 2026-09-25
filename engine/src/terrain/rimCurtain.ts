import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  type ShaderMaterial,
} from "three";
import type { AreaBounds } from "./heroSource.js";
import { splineAt, tileFetch, type TexelFetch } from "./spline.js";

/**
 * The country grid's curtain along the rim of each hero area (F74).
 *
 * The country grid is cut out inside a hero rectangle by a per-fragment
 * `discard`, and the hero tiles' skirts hang 900 m down from the area's edge.
 * A skirt only hangs down. So where the hero edge stands above the country
 * ground outside it, the hero skirt is the cliff between them, and where the
 * country ground stands above the hero edge nothing was. That was 73-77 % of
 * both rims (F73), and from inside an area the sky showed through it.
 *
 * The country side of the seam now hangs a curtain of its own from the surface
 * it actually draws there. That surface is not the country grid bilinearly
 * read: it is whatever triangles the tile's LOD draws, and at the rim those
 * are cut along a line that runs through them. So the curtain's top is a
 * polyline with a point wherever that line crosses a triangle's edge - a grid
 * line or a diagonal - and it is straight between them exactly where the
 * surface is.
 *
 * It hangs to below the lowest ground the hero cover draws, not the skirts'
 * 900 m, because the step it closes grows with the country's LOD and 900 m is
 * not enough: at the LODs that meet a drawn rim it reaches 452 m at the
 * finest and 1,032 m at the third, where the hero edge standing higher is at
 * most 803 m and the hero skirts close it (F74). Hidden below the hero ground
 * from inside and below the country ground from outside, the extra depth is
 * never drawn.
 *
 * Built on the CPU each frame from the same Int16 copy the texture array is
 * uploaded from, because it is a few hundred points and the LOD that decides
 * them is the CPU's choice anyway.
 *
 * Lit as the ground it hangs from (F97). With the flat normal of its own
 * triangles, a wall, it took no snow, was painted the palette's rock and
 * stood in shadow: at the Wall's hero rim, a black wedge down Everest's
 * spires. Each point now carries the ground's slope and height at its top,
 * from the spline through the country's samples, and the whole column is
 * lit, coloured and snowed as that ground is.
 */

/**
 * The height the lattice's grid draws at a tile-local position, in texels.
 *
 * `grid.ts` builds each quad from corners `a = (i, j)`, `b = (i+1, j)`,
 * `c = (i, j+1)` and `d = (i+1, j+1)` as the triangles `(a, c, b)` and
 * `(b, c, d)`, so every quad is split on its `b-c` diagonal. At a coarser
 * LOD the quads stride across the same samples. At a finer one a corner
 * between samples stands where the spline puts it (F97), read past the
 * tile's edge by `fetch` as the vertex shader reads it; without one, the
 * edge is held.
 */
export function drawnHeightAt(
  data: ArrayLike<number>,
  base: number,
  samples: number,
  segments: number,
  u: number,
  v: number,
  fetch?: TexelFetch,
): number {
  const stride = (samples - 1) / segments;
  const fu = Math.min(segments, Math.max(0, u / stride));
  const fv = Math.min(segments, Math.max(0, v / stride));
  const i = Math.min(segments - 1, Math.floor(fu));
  const j = Math.min(segments - 1, Math.floor(fv));
  const s = fu - i;
  const t = fv - j;
  const read = stride < 1 ? (fetch ?? tileFetch({ data, base }, samples)) : null;
  const at = (ci: number, cj: number): number => {
    const x = ci * stride;
    const y = cj * stride;
    if (read && !(Number.isInteger(x) && Number.isInteger(y))) return splineAt(read, samples, x, y).h;
    return data[base + y * samples + x] ?? 0;
  };
  const a = at(i, j);
  const b = at(i + 1, j);
  const c = at(i, j + 1);
  const d = at(i + 1, j + 1);
  return s + t <= 1
    ? a + s * (b - a) + t * (c - a)
    : d + (1 - s) * (c - d) + (1 - t) * (b - d);
}

/**
 * Where a line held at `across` texels crosses the edges of the triangles a
 * LOD draws, between `from` and `to` along it: the points between which the
 * drawn surface along the line is straight. Both ends are included.
 *
 * Symmetric in the two axes: inside a quad the line crosses the grid line at
 * the quad's start and then the `b-c` diagonal, which on a line at fraction
 * `f` across the quad is at `1 - f` along it.
 */
export function crossings(
  samples: number,
  segments: number,
  across: number,
  from: number,
  to: number,
): number[] {
  const stride = (samples - 1) / segments;
  const f = Math.min(segments, Math.max(0, across / stride));
  const cell = Math.min(segments - 1, Math.floor(f));
  const frac = f - cell;
  const out = [from];
  const first = Math.max(0, Math.floor(from / stride));
  const last = Math.min(segments - 1, Math.floor(to / stride));
  for (let k = first; k <= last; k++) {
    for (const t of [k * stride, (k + 1 - frac) * stride]) {
      if (t > out[out.length - 1]! && t < to) out.push(t);
    }
  }
  if (to > out[out.length - 1]!) out.push(to);
  return out;
}

/**
 * One stretch of a rim inside one country tile.
 *
 * `alongU` says which way the stretch runs: along the tile's `u` (east) with
 * `v` held at `across`, or along `v` (north) with `u` held. `from` and `to`
 * are texels along it. `inward` is the side the area is on, +1 toward larger
 * texels across the line and -1 toward smaller: the side the curtain faces.
 */
export interface RimPiece {
  i: number;
  j: number;
  alongU: boolean;
  across: number;
  from: number;
  to: number;
  inward: 1 | -1;
}

/**
 * The stretches of an area's rim, each in the country tile that draws the
 * ground just outside it. A rim that falls on a tile boundary belongs to the
 * tile outside it, since the one inside is cut away there.
 */
export function rimPieces(area: AreaBounds, tileM: number, samples: number): RimPiece[] {
  const cellM = tileM / (samples - 1);
  const cells = samples - 1;
  const out: RimPiece[] = [];
  const run = (
    alongU: boolean,
    lineM: number,
    outsideTile: number,
    startM: number,
    endM: number,
    inward: 1 | -1,
  ): void => {
    const across = lineM / cellM - outsideTile * cells;
    for (let k = Math.floor(startM / tileM); k * tileM < endM; k++) {
      const from = Math.max(startM, k * tileM) / cellM - k * cells;
      const to = Math.min(endM, (k + 1) * tileM) / cellM - k * cells;
      if (to <= from) continue;
      out.push({
        i: alongU ? k : outsideTile,
        j: alongU ? outsideTile : k,
        alongU,
        across,
        from,
        to,
        inward,
      });
    }
  };
  const { eastM0, northM0, eastM1, northM1 } = area;
  run(false, eastM0, Math.ceil(eastM0 / tileM) - 1, northM0, northM1, 1);
  run(false, eastM1, Math.floor(eastM1 / tileM), northM0, northM1, -1);
  run(true, northM0, Math.ceil(northM0 / tileM) - 1, eastM0, eastM1, 1);
  run(true, northM1, Math.floor(northM1 / tileM), eastM0, eastM1, -1);
  return out;
}

/** What the curtain needs of the lattice that draws the country grid. */
export interface DrawnTiles {
  readonly tileM: number;
  readonly samples: number;
  /**
   * A tile drawn this frame: its heights, where in them it starts, how many
   * quads a side its LOD draws, and its samples read past its edge as the
   * vertex shader reads them. Null for a tile not drawn.
   */
  drawn(i: number, j: number): { data: ArrayLike<number>; base: number; segments: number; fetch?: TexelFetch } | null;
}

/** Points along one piece at the finest LOD, which no coarser LOD exceeds. */
function capacityOf(piece: RimPiece, samples: number, finest: number): number {
  const stride = (samples - 1) / finest;
  return 2 * (Math.ceil((piece.to - piece.from) / stride) + 2) + 2;
}

export class RimCurtain {
  readonly mesh: Mesh;
  /** Stretches of rim hung this frame. */
  pieces = 0;
  triangles = 0;
  /** Points along the rim hung this frame, each a top and a bottom vertex. */
  points = 0;
  private readonly geometry: BufferGeometry;
  private readonly position: BufferAttribute;
  private readonly skirt: BufferAttribute;
  private readonly index: BufferAttribute;
  /** The ground's slope at each point's top, metres a world unit east and north, and its height. */
  private readonly ground: BufferAttribute;
  /** This frame's positions, ground and triangles, compared with the last before upload. */
  private readonly nextPosition: Float32Array;
  private readonly nextGround: Float32Array;
  private readonly nextIndex: Uint32Array;

  /**
   * @param published every area the cover could draw, which sizes the buffers
   *   once.
   * @param finest the finest LOD's quads a side, whose crossings are the most.
   * @param floorM the lowest ground any of those areas draws, in real metres:
   *   the curtain hangs a skirt's depth below it.
   */
  constructor(
    material: ShaderMaterial,
    published: readonly AreaBounds[],
    tileM: number,
    samples: number,
    finest: number,
    private readonly floorM: number,
  ) {
    let capacity = 0;
    for (const area of published) {
      for (const piece of rimPieces(area, tileM, samples)) {
        capacity += capacityOf(piece, samples, finest);
      }
    }
    capacity = Math.max(capacity, 2);
    this.geometry = new BufferGeometry();
    // x and z in world units from the rebase point; y in real metres, which
    // the shader exaggerates and drops, as the lattice's own vertices are.
    this.position = new BufferAttribute(new Float32Array(capacity * 2 * 3), 3);
    this.skirt = new BufferAttribute(new Float32Array(capacity * 2), 1);
    this.index = new BufferAttribute(new Uint32Array(capacity * 6), 1);
    this.ground = new BufferAttribute(new Float32Array(capacity * 2 * 3), 3);
    this.nextPosition = new Float32Array(capacity * 2 * 3);
    this.nextGround = new Float32Array(capacity * 2 * 3);
    this.nextIndex = new Uint32Array(capacity * 6);
    // Every point is a top and a bottom, in that order, whatever it is hung on.
    const skirt = this.skirt.array as Float32Array;
    for (let k = 1; k < skirt.length; k += 2) skirt[k] = 1;
    this.position.setUsage(35048 /* DynamicDrawUsage */);
    this.ground.setUsage(35048);
    this.index.setUsage(35048);
    this.geometry.setAttribute("position", this.position);
    this.geometry.setAttribute("aSkirt", this.skirt);
    this.geometry.setAttribute("aGround", this.ground);
    this.geometry.setIndex(this.index);
    this.geometry.setDrawRange(0, 0);
    this.mesh = new Mesh(this.geometry, material);
    // Rebuilt every frame in rebased world units, so three's bounds would be
    // stale by the next one. The lattices cull by tile; this is a few strips.
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /**
   * Hang the curtain along every drawn area's rim from the country surface
   * drawn there this frame. Uploads only when something moved.
   */
  update(
    areas: readonly AreaBounds[],
    country: DrawnTiles,
    originEastM: number,
    originNorthM: number,
    compression: number,
  ): void {
    const { tileM, samples } = country;
    const cellM = tileM / (samples - 1);
    const next = this.nextPosition;
    const ground = this.nextGround;
    const index = this.nextIndex;
    let points = 0;
    let indices = 0;
    let pieces = 0;
    for (const area of areas) {
      for (const piece of rimPieces(area, tileM, samples)) {
        const tile = country.drawn(piece.i, piece.j);
        if (tile === null) continue;
        const along = crossings(samples, tile.segments, piece.across, piece.from, piece.to);
        const fetch = tile.fetch ?? tileFetch(tile, samples);
        const start = points;
        for (const t of along) {
          const u = piece.alongU ? t : piece.across;
          const v = piece.alongU ? piece.across : t;
          const h = drawnHeightAt(tile.data, tile.base, samples, tile.segments, u, v, fetch);
          const x = (piece.i * tileM + u * cellM - originEastM) / compression;
          const z = (piece.j * tileM + v * cellM - originNorthM) / compression;
          // The ground's own slope there, metres a texel, to metres a world unit.
          const slope = splineAt(fetch, samples, u, v);
          const perWorld = compression / cellM;
          for (let k = 0; k < 2; k++) {
            const w = (points * 2 + k) * 3;
            next[w] = x;
            // The bottom stands at the floor and the shader drops it a skirt.
            next[w + 1] = k === 0 ? h : Math.min(h, this.floorM);
            next[w + 2] = z;
            ground[w] = slope.dx * perWorld;
            ground[w + 1] = slope.dy * perWorld;
            ground[w + 2] = h;
          }
          points++;
        }
        // Facing the area. Worked through with the lattice's own winding:
        // a stretch running north faces east when drawn (top, next top,
        // bottom), and one running east faces south; the other side is the
        // same triangles the other way round.
        const flip = piece.alongU ? piece.inward > 0 : piece.inward < 0;
        for (let p = start; p < points - 1; p++) {
          const top = p * 2;
          const bottom = top + 1;
          const nextTop = top + 2;
          const nextBottom = top + 3;
          index[indices++] = top;
          index[indices++] = flip ? bottom : nextTop;
          index[indices++] = flip ? nextTop : bottom;
          index[indices++] = nextTop;
          index[indices++] = flip ? bottom : nextBottom;
          index[indices++] = flip ? nextBottom : bottom;
        }
        pieces++;
      }
    }

    const livePosition = this.position.array as Float32Array;
    const liveGround = this.ground.array as Float32Array;
    const liveIndex = this.index.array as Uint32Array;
    let changed = indices !== this.geometry.drawRange.count;
    for (let k = 0; !changed && k < points * 6; k++) changed = livePosition[k] !== next[k] || liveGround[k] !== ground[k];
    for (let k = 0; !changed && k < indices; k++) changed = liveIndex[k] !== index[k];
    if (changed) {
      livePosition.set(next.subarray(0, points * 6));
      liveGround.set(ground.subarray(0, points * 6));
      liveIndex.set(index.subarray(0, indices));
      this.position.needsUpdate = true;
      this.ground.needsUpdate = true;
      this.index.needsUpdate = true;
      this.geometry.setDrawRange(0, indices);
    }
    this.points = points;
    this.pieces = pieces;
    this.triangles = indices / 3;
    this.mesh.visible = indices > 0;
  }
}
