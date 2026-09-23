/**
 * Which country tiles the terrain draws around a camera: a disc of tiles,
 * `radius` out from the camera's own, circular so the corners cost nothing.
 *
 * One definition, because two things have to agree on it exactly: the
 * terrain, which asks for these tiles every frame, and the scene packs
 * (stage 4), which promise to hold every tile the terrain will ask for.
 */

export interface ViewOffset {
  readonly dx: number;
  readonly dy: number;
  /** Distance from the camera's tile, in tiles. */
  readonly distTiles: number;
}

const cache = new Map<number, readonly ViewOffset[]>();

/** The tile offsets inside the view disc of `radius` tiles. */
export function viewOffsets(radius: number): readonly ViewOffset[] {
  const hit = cache.get(radius);
  if (hit) return hit;
  const out: ViewOffset[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const distTiles = Math.hypot(dx, dy);
      if (distTiles > radius + 0.5) continue;
      out.push({ dx, dy, distTiles });
    }
  }
  cache.set(radius, out);
  return out;
}

/** The tiles in view of a camera standing in tile (cx, cy); none west or south of the grid. */
export function tilesInView(cx: number, cy: number, radius: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const o of viewOffsets(radius)) {
    const tx = cx + o.dx;
    const ty = cy + o.dy;
    if (tx < 0 || ty < 0) continue;
    out.push([tx, ty]);
  }
  return out;
}
