/**
 * The shared terrain grid (build plan D3).
 *
 * One geometry per LOD level, reused by every tile on screen. Tiles differ
 * only by an instance attribute, so the CPU never builds a mesh - a tile
 * becoming visible costs one more instance in a buffer, nothing else.
 *
 * Layout, for `segments = 4`:
 *
 *     S S S S S S S      S = skirt ring, clamped to the edge sample and
 *     S . . . . . S          pushed straight down to hide LOD cracks
 *     S . . . . . S      . = surface vertex, one per heightmap texel, or
 *     S . . . . . S          two to a texel on the country's level
 *     S . . . . . S          finer than its samples (F97)
 *     S . . . . . S
 *     S S S S S S S
 */

export interface GridGeometry {
  /** Tile-local position in [0,1]^2, as (u, v) pairs. */
  uv: Float32Array;
  /**
   * Texel to sample in the heightmap, as (x, y) pairs: whole numbers, or
   * between them where the grid is finer than its samples, where the vertex
   * shader reads the spline through the samples round it (`spline.ts`).
   */
  texel: Float32Array;
  /** 1 for skirt vertices, 0 for surface vertices. */
  skirt: Float32Array;
  index: Uint32Array;
  /** Vertices per side of the surface (segments + 1). */
  side: number;
  vertexCount: number;
  triangleCount: number;
}

/**
 * @param segments  quads per side at this LOD
 * @param heightmapSide  texels per side of the tile heightmap (always 65)
 *
 * Coarser LODs stride across the same 65x65 heightmap rather than needing a
 * downsampled copy, so one texture array layer serves every level. A finer
 * one strides by half a texel.
 */
export function buildGrid(segments: number, heightmapSide = 65): GridGeometry {
  const side = segments + 1; // surface vertices per side
  const full = side + 2; // plus the skirt ring
  const vertexCount = full * full;
  const stride = (heightmapSide - 1) / segments;

  const uv = new Float32Array(vertexCount * 2);
  const texel = new Float32Array(vertexCount * 2);
  const skirt = new Float32Array(vertexCount);

  const clamp = (v: number) => Math.min(side - 1, Math.max(0, v));

  for (let j = 0; j < full; j++) {
    for (let i = 0; i < full; i++) {
      const v = j * full + i;
      const ci = clamp(i - 1);
      const cj = clamp(j - 1);
      uv[v * 2] = ci / (side - 1);
      uv[v * 2 + 1] = cj / (side - 1);
      texel[v * 2] = ci * stride;
      texel[v * 2 + 1] = cj * stride;
      skirt[v] = i === 0 || j === 0 || i === full - 1 || j === full - 1 ? 1 : 0;
    }
  }

  const quads = (full - 1) * (full - 1);
  const index = new Uint32Array(quads * 6);
  let w = 0;
  for (let j = 0; j < full - 1; j++) {
    for (let i = 0; i < full - 1; i++) {
      const a = j * full + i;
      const b = a + 1;
      const c = a + full;
      const d = c + 1;
      index[w++] = a;
      index[w++] = c;
      index[w++] = b;
      index[w++] = b;
      index[w++] = c;
      index[w++] = d;
    }
  }

  return {
    uv,
    texel,
    skirt,
    index,
    side,
    vertexCount,
    triangleCount: quads * 2,
  };
}

/**
 * LOD ladder from the build plan: 65, 33, 17, 9 vertices per side.
 * Index 0 is the finest. Each level halves the segment count.
 */
export const LOD_SEGMENTS = [64, 32, 16, 8] as const;

export type LodLevel = 0 | 1 | 2 | 3;

/**
 * Pick a LOD for a tile at a given distance, in world units.
 * Doubling distance drops one level, so triangle density per screen area
 * stays roughly constant.
 */
export function lodForDistance(
  distanceWorld: number,
  tileWorldSize: number,
): LodLevel {
  const tiles = distanceWorld / tileWorldSize;
  if (tiles < 2) return 0;
  if (tiles < 5) return 1;
  if (tiles < 11) return 2;
  return 3;
}

/**
 * The country's level finer than its samples (F97), L-1: 500 m quads over
 * the 1 km heights, each vertex between samples on the spline through them.
 * Drawn only on the tiles nearest the camera, where a kilometre-wide
 * triangle is a facet. A 250 m level, L-2, was built and timed: it cost 1.1
 * to 3.4 ms of GPU a frame at the stations, where this one costs 0.3, and
 * the two could not be told apart at 1080p.
 */
export const FINE_SEGMENTS = [128] as const;

/**
 * How near a country tile's nearest point has to be to the camera, in real
 * metres, to be drawn at L-1. Past it it is L0, as before: at 40 km a
 * kilometre is under 1.5 degrees of the frame, and the relief below the
 * grid (F93) is fading by then.
 */
export const FINE_REACH_M = 40_000;

/**
 * The bucket a country tile at L0 is drawn in, by its nearest point's real
 * distance from the camera: 0 for L-1, 1 for L0.
 */
export function fineLevelFor(distanceM: number): 0 | 1 {
  return distanceM < FINE_REACH_M ? 0 : 1;
}
