import { TILE_SAMPLES } from "./tileArray.js";
import { generateTile } from "./syntheticTiles.js";

/**
 * Where a tile's heightmap comes from (build plan, workstream A stage 4).
 *
 * The prototype generated every tile procedurally, synchronously, inside the
 * frame that needed it. Real data cannot promise that, so the contract is
 * "samples if you have them, null if you do not" - a tile that is not ready is
 * simply not drawn, and the caller asks again next frame. That is also the
 * contract a streaming worker pool needs, so this interface does not change
 * when the pool arrives.
 */
export interface TileSource {
  request(tx: number, ty: number): Int16Array | null;
  /** How many tiles are in flight. Zero for sources that answer immediately. */
  readonly pending: number;
  /** Human-readable, for the debug HUD: what world am I actually flying over? */
  readonly label: string;
}

/** The stand-in world: fiction shaped like China's three steps. */
export class SyntheticTileSource implements TileSource {
  readonly pending = 0;
  readonly label = "stand-in";

  request(tx: number, ty: number): Int16Array | null {
    return generateTile(tx, ty);
  }
}

export interface WorldWindow {
  tx0: number;
  ty0: number;
  tx1: number;
  ty1: number;
}

export interface WorldAnchor {
  lat: number;
  lon: number;
  eastM: number;
  northM: number;
}

export interface WorldStart {
  eastM: number;
  northM: number;
  altitudeM: number;
  headingRad: number;
}

export interface WorldManifest {
  version: number;
  corridor: string;
  tileKm: number;
  tileSamples: number;
  country: { tilesX: number; tilesY: number; originXM: number; originYM: number };
  window: WorldWindow;
  heights: { file: string; tiles: number; bytes: number; sha256: string };
  horizon: {
    file: string;
    width: number;
    height: number;
    sampleKm: number;
    silhouetteBias: number;
  };
  /** Named places along the route, in country-grid metres. */
  anchors: Record<string, WorldAnchor>;
  /** Where a flight begins in this corridor, and which way it faces. */
  start: WorldStart;
  elevationM: { min: number; max: number };
}

/**
 * Real elevation, cut by the pipeline and already resident.
 *
 * One `heights.bin` holds every tile in the corridor, tile-row-major, 65 x 65
 * Int16 each. Ten megabytes fetched once beats 1,155 requests, and the bytes
 * need no decode: they are what the GPU reads.
 *
 * Outside the built window the fallback answers, so flying off the edge of a
 * corridor build lands on the stand-in world rather than on a hole.
 */
export class PackedTileSource implements TileSource {
  readonly pending = 0;
  readonly label: string;
  private readonly stride = TILE_SAMPLES * TILE_SAMPLES;

  constructor(
    readonly manifest: WorldManifest,
    private readonly heights: Int16Array,
    private readonly fallback: TileSource | null = null,
  ) {
    const w = manifest.window;
    const expected = (w.tx1 - w.tx0) * (w.ty1 - w.ty0) * this.stride;
    if (heights.length !== expected) {
      throw new Error(
        `heights.bin holds ${heights.length} samples, manifest wants ${expected}`,
      );
    }
    if (manifest.tileSamples !== TILE_SAMPLES) {
      throw new Error(
        `manifest tileSamples ${manifest.tileSamples} != engine ${TILE_SAMPLES}`,
      );
    }
    this.label = `${manifest.corridor} (${manifest.heights.tiles} tiles)`;
  }

  has(tx: number, ty: number): boolean {
    const w = this.manifest.window;
    return tx >= w.tx0 && tx < w.tx1 && ty >= w.ty0 && ty < w.ty1;
  }

  request(tx: number, ty: number): Int16Array | null {
    if (!this.has(tx, ty)) return this.fallback?.request(tx, ty) ?? null;
    const w = this.manifest.window;
    const index = (ty - w.ty0) * (w.tx1 - w.tx0) + (tx - w.tx0);
    const start = index * this.stride;
    return this.heights.subarray(start, start + this.stride);
  }
}

export interface LoadedWorld {
  manifest: WorldManifest;
  source: PackedTileSource;
  horizon: Int16Array;
}

/**
 * Fetch a built corridor. Resolves to null when nothing is published, which is
 * the normal state of a fresh checkout - the app then flies the stand-in world
 * and says so in the HUD rather than failing to boot.
 */
export async function loadWorld(
  baseUrl: string,
  fallback: TileSource | null = null,
): Promise<LoadedWorld | null> {
  let manifest: WorldManifest;
  try {
    const response = await fetch(`${baseUrl}/manifest.json`);
    if (!response.ok) return null;
    manifest = (await response.json()) as WorldManifest;
  } catch {
    return null;
  }

  // A 404 here still resolves, and its HTML body would reach `Int16Array` as
  // plausible garbage. Check the status rather than the length.
  const fetchBytes = async (file: string): Promise<ArrayBuffer> => {
    const response = await fetch(`${baseUrl}/${file}`);
    if (!response.ok) {
      throw new Error(`${file}: ${response.status} ${response.statusText}`);
    }
    return response.arrayBuffer();
  };

  const [heightsBytes, horizonBytes] = await Promise.all([
    fetchBytes(manifest.heights.file),
    fetchBytes(manifest.horizon.file),
  ]);

  if (heightsBytes.byteLength !== manifest.heights.bytes) {
    throw new Error(
      `${manifest.heights.file} is ${heightsBytes.byteLength} bytes, ` +
        `manifest says ${manifest.heights.bytes}`,
    );
  }

  const horizonSamples = manifest.horizon.width * manifest.horizon.height;
  if (horizonBytes.byteLength !== horizonSamples * 2) {
    throw new Error(
      `horizon.bin is ${horizonBytes.byteLength} bytes, manifest wants ${horizonSamples * 2}`,
    );
  }

  return {
    manifest,
    source: new PackedTileSource(manifest, new Int16Array(heightsBytes), fallback),
    horizon: new Int16Array(horizonBytes),
  };
}
