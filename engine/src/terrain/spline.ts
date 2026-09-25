/**
 * The ground between its samples, where a mesh is finer than its heights (F97).
 *
 * The country grid's samples are a kilometre apart, and at the film's six
 * times relief a kilometre-wide triangle is a facet: F86 lit the country
 * smooth, but its silhouettes stayed polygons wherever the camera is low
 * over it, and on the Wall's approach the plateau's ridges read as shards.
 * The finest country level, L-1, draws 500 m quads over the same 1 km
 * samples, and a vertex between samples takes the height a Catmull-Rom
 * spline through the 4 × 4 samples around it gives.
 *
 * Catmull-Rom because it passes through every sample: a vertex that lands on
 * a sample keeps its height, so a coarser level beside a finer one still
 * meets it at every sample it draws, and the skirts close what is between.
 * And because its slope at a sample is the central difference the lit pass
 * already reads (`groundNormal`), so the normal the spline gives between
 * samples runs smoothly into the one at them.
 *
 * The same spline twice, once here for the CPU (the curtain along a hero rim
 * hangs from exactly the surface the tile draws) and once in GLSL for the
 * vertex shader, with one rule for a sample off the tile's edge, so the two
 * agree.
 */

/** A height sample by texel, which may be up to two texels off the tile. */
export type TexelFetch = (x: number, y: number) => number;

/** The four Catmull-Rom weights at `t` in [0, 1] across the middle cell. */
export function splineWeights(t: number): [number, number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [0.5 * (-t + 2 * t2 - t3), 0.5 * (2 - 5 * t2 + 3 * t3), 0.5 * (t + 4 * t2 - 3 * t3), 0.5 * (-t2 + t3)];
}

/** Their derivative in `t`: the slope's weights, per texel. */
export function splineSlopeWeights(t: number): [number, number, number, number] {
  const t2 = t * t;
  return [0.5 * (-1 + 4 * t - 3 * t2), 0.5 * (-10 * t + 9 * t2), 0.5 * (1 + 8 * t - 9 * t2), 0.5 * (-2 * t + 3 * t2)];
}

/**
 * Height and slope at a texel position of a tile `samples` a side: metres,
 * and metres a texel east (`dx`) and north (`dy`).
 *
 * The cell is the one the position is in, and on the tile's last row or
 * column the one before it at t = 1, so a position on the edge reads the
 * edge's own samples and no further.
 */
export function splineAt(fetch: TexelFetch, samples: number, x: number, y: number): { h: number; dx: number; dy: number } {
  const last = samples - 1;
  const cx = Math.min(Math.floor(x), last - 1);
  const cy = Math.min(Math.floor(y), last - 1);
  const wx = splineWeights(x - cx);
  const sx = splineSlopeWeights(x - cx);
  const wy = splineWeights(y - cy);
  const sy = splineSlopeWeights(y - cy);
  let h = 0;
  let dx = 0;
  let dy = 0;
  for (let j = 0; j < 4; j++) {
    let row = 0;
    let rowSlope = 0;
    for (let i = 0; i < 4; i++) {
      const v = fetch(cx + i - 1, cy + j - 1);
      row += wx[i]! * v;
      rowSlope += sx[i]! * v;
    }
    h += wy[j]! * row;
    dx += wy[j]! * rowSlope;
    dy += sy[j]! * row;
  }
  return { h, dx, dy };
}

/** A tile's heights as the lattice keeps them, row-major from `base`. */
export interface TileHeights {
  readonly data: ArrayLike<number>;
  readonly base: number;
}

/**
 * The texel reader the vertex shader uses, for the CPU: in the tile, or in
 * the tile beside it past an edge, since tiles share their edge row, or held
 * at the edge where that tile is not resident. Off both axes at once, the row
 * is held first and the column then read across, which is the shader's rule
 * too; no position on a tile's edge reads a sample there.
 *
 * `beside(di, dj)` is the resident tile at that offset, or null.
 */
export function tileFetch(
  tile: TileHeights,
  samples: number,
  beside: (di: number, dj: number) => TileHeights | null = () => null,
): TexelFetch {
  const last = samples - 1;
  const at = (t: TileHeights, x: number, y: number): number => t.data[t.base + y * samples + x] ?? 0;
  return (x, y) => {
    if ((x < 0 || x > last) && (y < 0 || y > last)) y = Math.min(last, Math.max(0, y));
    if (x < 0) {
      const t = beside(-1, 0);
      return t ? at(t, x + last, y) : at(tile, 0, y);
    }
    if (x > last) {
      const t = beside(1, 0);
      return t ? at(t, x - last, y) : at(tile, last, y);
    }
    if (y < 0) {
      const t = beside(0, -1);
      return t ? at(t, x, y + last) : at(tile, x, 0);
    }
    if (y > last) {
      const t = beside(0, 1);
      return t ? at(t, x, y - last) : at(tile, x, last);
    }
    return at(tile, x, y);
  };
}

/**
 * The same in GLSL, for the terrain's vertex shader. Needs `uHeights`,
 * `iLayer` and `iNeighbours` (west, east, south, north layers, or -1).
 */
export const SPLINE_GLSL = /* glsl */ `
float heightOffTile(ivec2 p, int last) {
  if ((p.x < 0 || p.x > last) && (p.y < 0 || p.y > last)) p.y = clamp(p.y, 0, last);
  float layer = iLayer;
  if (p.x < 0) { if (iNeighbours.x >= 0.0) { layer = iNeighbours.x; p.x += last; } else p.x = 0; }
  else if (p.x > last) { if (iNeighbours.y >= 0.0) { layer = iNeighbours.y; p.x -= last; } else p.x = last; }
  else if (p.y < 0) { if (iNeighbours.z >= 0.0) { layer = iNeighbours.z; p.y += last; } else p.y = 0; }
  else if (p.y > last) { if (iNeighbours.w >= 0.0) { layer = iNeighbours.w; p.y -= last; } else p.y = last; }
  return float(texelFetch(uHeights, ivec3(p, int(layer)), 0).r);
}

vec4 splineWeights(float t) {
  float t2 = t * t;
  float t3 = t2 * t;
  return 0.5 * vec4(-t + 2.0 * t2 - t3, 2.0 - 5.0 * t2 + 3.0 * t3, t + 4.0 * t2 - 3.0 * t3, -t2 + t3);
}

vec4 splineSlopeWeights(float t) {
  float t2 = t * t;
  return 0.5 * vec4(-1.0 + 4.0 * t - 3.0 * t2, -10.0 * t + 9.0 * t2, 1.0 + 8.0 * t - 9.0 * t2, -2.0 * t + 3.0 * t2);
}

// Height in metres and its slope in metres a texel, east and north, through
// the 4 x 4 samples around a texel position (spline.ts).
vec3 splineAt(vec2 texel) {
  int last = textureSize(uHeights, 0).x - 1;
  ivec2 c = min(ivec2(floor(texel)), ivec2(last - 1));
  vec2 f = texel - vec2(c);
  vec4 wx = splineWeights(f.x);
  vec4 sx = splineSlopeWeights(f.x);
  vec4 wy = splineWeights(f.y);
  vec4 sy = splineSlopeWeights(f.y);
  float h = 0.0;
  float dx = 0.0;
  float dy = 0.0;
  for (int j = 0; j < 4; j++) {
    vec4 row = vec4(
      heightOffTile(c + ivec2(-1, j - 1), last),
      heightOffTile(c + ivec2(0, j - 1), last),
      heightOffTile(c + ivec2(1, j - 1), last),
      heightOffTile(c + ivec2(2, j - 1), last)
    );
    float across = dot(wx, row);
    h += wy[j] * across;
    dx += wy[j] * dot(sx, row);
    dy += sy[j] * across;
  }
  return vec3(h, dx, dy);
}`;
