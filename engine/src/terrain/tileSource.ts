import { TILE_SAMPLES } from "./tileArray.js";
import { generateTile } from "./syntheticTiles.js";
import { decodeField } from "./tileCodec.js";
import {
  StreamingTileSource,
  fetchBytes as fetchUrl,
  indexProblem,
  packedHorizon,
  type FetchBytes,
  type TileIndex,
} from "./tileStream.js";

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
  /**
   * The tile's water layer (F72), in the same answer shape: its bytes, an
   * empty array for none, and null while it is on its way. A source without
   * the method has no water anywhere, which is every source but a package.
   */
  water?(tx: number, ty: number): Uint8Array | null;
  /** How many tiles are in flight. Zero for sources that answer immediately. */
  readonly pending: number;
  /** How many water files are in flight; absent where water never streams. */
  readonly waterPending?: number;
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

import type { CoverageRecord } from "./coverage.js";

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
  heights: {
    file: string;
    tiles: number;
    /** How many of them hold any ground above zero. The other kind is F54's. */
    tilesWithLand: number;
    bytes: number;
    sha256: string;
  };
  horizon: {
    file: string;
    width: number;
    height: number;
    sampleKm: number;
    silhouetteBias: number;
    /** Of the raw file. Absent from worlds cut before a package named it. */
    bytes?: number;
    sha256?: string;
  };
  /**
   * What the source had under each published tile, one character each (F54).
   * Absent on every world built before it, which `WorldCoverage.from` answers
   * null for rather than guessing.
   */
  coverage?: CoverageRecord;
  /** Named places along the route, in country-grid metres. */
  anchors: Record<string, WorldAnchor>;
  /** Where a flight begins in this corridor, and which way it faces. */
  start: WorldStart;
  elevationM: { min: number; max: number };
}

/**
 * What the app flies over, whichever way it was delivered.
 *
 * `has` is the question streaming makes matter: a tile inside the world that
 * is not resident is on its way, where one outside it is not coming at all.
 */
export interface WorldTileSource extends TileSource {
  readonly manifest: WorldManifest;
  has(tx: number, ty: number): boolean;
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
export class PackedTileSource implements WorldTileSource {
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
  source: WorldTileSource;
  horizon: Int16Array;
  /**
   * How the heights came: one file fetched before the first frame, or a file
   * per tile as the aeroplane reaches it (F67). `refused` is why a published
   * package was passed over for the packed file, when one was. `horizonBytes`
   * is what the horizon field cost over the wire: coded when the package
   * names it, and raw otherwise (F69).
   */
  delivery: {
    kind: "packed" | "streamed";
    bytes: number;
    refused: string | null;
    horizonBytes: number;
  };
}

/**
 * Fetch a built world. Resolves to null when nothing is published, which is
 * the normal state of a fresh checkout - the app then flies the stand-in world
 * and says so in the HUD rather than failing to boot.
 *
 * A world with a tile package (`make package`, F67) streams: the manifest, the
 * package's index and the horizon field come before the first frame, and each
 * tile when the engine first asks for it. A world without one - every world
 * built before stage 11, and any whose package is stale - comes as one
 * `heights.bin`, as it always has. The package is only ever a way of
 * delivering that file, so a package that does not match it is refused and
 * the file is fetched instead.
 *
 * The horizon field waits for the index, because the index is what names its
 * coded file (F69). That is one round trip more than fetching the two side by
 * side, against 577 kB fewer on the country.
 */
export async function loadWorld(
  baseUrl: string,
  fallback: TileSource | null = null,
  fetchTile?: FetchBytes,
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

  const index = await fetchIndex(`${baseUrl}/tiles/index.json`);
  const refused = index ? indexProblem(manifest, index) : null;
  const streamed = index && !refused ? index : null;
  const { horizon, horizonBytes } = await loadHorizon(
    manifest,
    streamed,
    baseUrl,
    fetchBytes,
    fetchTile,
  );

  if (streamed) {
    return {
      manifest,
      source: new StreamingTileSource(
        manifest,
        streamed,
        `${baseUrl}/tiles`,
        fetchTile,
        undefined,
        fallback,
      ),
      horizon,
      delivery: { kind: "streamed", bytes: streamed.bytes, refused: null, horizonBytes },
    };
  }
  if (refused) console.warn(`tile package refused, fetching heights.bin: ${refused}`);

  const heightsBytes = await fetchBytes(manifest.heights.file);
  if (heightsBytes.byteLength !== manifest.heights.bytes) {
    throw new Error(
      `${manifest.heights.file} is ${heightsBytes.byteLength} bytes, ` +
        `manifest says ${manifest.heights.bytes}`,
    );
  }
  return {
    manifest,
    source: new PackedTileSource(manifest, new Int16Array(heightsBytes), fallback),
    horizon,
    delivery: { kind: "packed", bytes: heightsBytes.byteLength, refused, horizonBytes },
  };
}

/**
 * The horizon field: the package's coded file when the index names this
 * manifest's field, and the raw `horizon.bin` otherwise, as it always was.
 * A coded file that will not come or will not decode is not a world that
 * failed to load - the raw one is published beside it - so it is warned
 * about and passed over.
 */
async function loadHorizon(
  manifest: WorldManifest,
  index: TileIndex | null,
  baseUrl: string,
  fetchFile: (file: string) => Promise<ArrayBuffer>,
  fetchTile: FetchBytes = fetchUrl,
): Promise<{ horizon: Int16Array; horizonBytes: number }> {
  const { file, width, height } = manifest.horizon;
  const packed = index ? packedHorizon(manifest, index) : null;
  if (packed) {
    try {
      const bytes = await fetchTile(`${baseUrl}/tiles/${packed.name}.bin`);
      return { horizon: await decodeField(bytes, width, height), horizonBytes: bytes.length };
    } catch (error) {
      console.warn(`packed horizon field passed over, fetching ${file}: ${String(error)}`);
    }
  }
  const raw = await fetchFile(file);
  if (raw.byteLength !== width * height * 2) {
    throw new Error(`${file} is ${raw.byteLength} bytes, manifest wants ${width * height * 2}`);
  }
  return { horizon: new Int16Array(raw), horizonBytes: raw.byteLength };
}

/** The package's index, or null when the world has none. */
async function fetchIndex(url: string): Promise<TileIndex | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as TileIndex;
  } catch {
    // The dev server answers an unknown path with the app's own index.html,
    // which is not JSON. That is "no package", not a failure to load one.
    return null;
  }
}
