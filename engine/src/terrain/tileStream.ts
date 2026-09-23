/**
 * A world fetched a tile at a time, as the aeroplane reaches it (F67).
 *
 * `PackedTileSource` holds a world that arrived whole: the corridor's 9.8 MB
 * before the first frame. The country is 61.2 MB that way, and the ring the
 * engine draws is ~137 tiles of it, so here each tile is its own file (stage
 * 11, `pipeline/nineskies/package.py`) and is asked for when `Terrain` first
 * wants it. The `TileSource` contract was written for this - "samples if you
 * have them, null if you do not", and the caller asks again next frame - so
 * nothing downstream changes.
 *
 * What it keeps is everything it has decoded, with no eviction. That is a
 * number rather than an oversight: every land tile in the country is 39 MB
 * decoded, against a memory target of 900 MB, and a tile evicted here would be
 * a tile fetched twice by a player who turned round. The GPU-side array does
 * evict, and is the thing bounded by the view radius.
 */
import { TILE_SAMPLES } from "./tileArray.js";
import { TILE_CODEC, WATER_CHANNELS, WATER_CODEC, decodeTile, decodeWater } from "./tileCodec.js";
import { OFFSET_STEP_M, OFFSET_ZERO, REACH_M, WATER_LAKE, WATER_LAND, WATER_RIVER, WATER_SEA } from "./water.js";
import type {
  TileSource,
  WorldManifest,
  WorldTileSource,
  WorldWindow,
} from "./tileSource.js";

/** The horizon field's file in a package, as `package.py` names it (F69). */
export interface PackedHorizon {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** The raw `horizon.bin` it was coded from, which the manifest names too. */
  readonly sha256: string;
  readonly bytes: number;
}

/**
 * The water layer's files in a package, as `package.py` names them (F72): one
 * per tile that has any water, and "" for one that is dry.
 */
/** How a layer numbers its standing water; `river` since F73. */
export interface WaterClasses {
  readonly land: number;
  readonly sea: number;
  readonly lake: number;
  readonly river?: number;
}

export interface PackedWater {
  readonly codec: string;
  readonly channels: number;
  readonly layout: string;
  /** Metres per unit of an offset byte, and the byte that means none. */
  readonly offsetStepM: number;
  readonly offsetZero: number;
  /** How far from a river a sample still carries its offset. */
  readonly reachM: number;
  readonly classes: WaterClasses;
  /** The `water.bin` these were coded from. */
  readonly sha256: string;
  /** The `heights.bin` it was cut against, which has to be this package's. */
  readonly heightsSha256: string;
  readonly files: number;
  readonly bytes: number;
  readonly names: readonly string[];
}

/** `tiles/index.json`, as `package.py` writes it. */
export interface TileIndex {
  readonly version: number;
  readonly codec: string;
  readonly tileSamples: number;
  /** The `heights.bin` these files were cut from, which stays authoritative. */
  readonly heightsSha256: string;
  readonly window: WorldWindow;
  readonly order: string;
  readonly tiles: number;
  readonly files: number;
  readonly bytes: number;
  /** One per tile in `heights.bin` order: a file's digest, or "" for zeros. */
  readonly names: readonly string[];
  /** Absent from a package cut before the horizon field was coded (F69). */
  readonly horizon?: PackedHorizon;
  /** Absent from a package cut before the water layer existed (F72). */
  readonly water?: PackedWater;
}

/**
 * What a tile's water is when there is none: a dry tile, or a world with no
 * water layer. Empty rather than null, because null is "not here yet".
 */
export const NO_WATER = new Uint8Array(0);

export type FetchBytes = (url: string) => Promise<Uint8Array>;

export async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  // A 404 still resolves, and its HTML body would decode as a bad tile rather
  // than as a missing one.
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Why an index cannot be flown with a manifest, or null when it can.
 *
 * The digest is the one that matters. `heights.bin` is what every committed
 * section and patch is signed against (D23); a package cut from an older one
 * is a different world delivered under the same name.
 */
export function indexProblem(manifest: WorldManifest, index: TileIndex): string | null {
  if (index.codec !== TILE_CODEC) return `tiles are coded ${index.codec}, the engine reads ${TILE_CODEC}`;
  if (index.tileSamples !== TILE_SAMPLES) {
    return `tiles are ${index.tileSamples} samples, the engine draws ${TILE_SAMPLES}`;
  }
  if (index.heightsSha256 !== manifest.heights.sha256) {
    return (
      `tiles were cut from heights ${index.heightsSha256.slice(0, 12)} and the manifest ` +
      `names ${manifest.heights.sha256.slice(0, 12)}: re-run \`make package\``
    );
  }
  const a = index.window;
  const b = manifest.window;
  if (a.tx0 !== b.tx0 || a.ty0 !== b.ty0 || a.tx1 !== b.tx1 || a.ty1 !== b.ty1) {
    return "tiles cover a different window from the manifest";
  }
  const count = (b.tx1 - b.tx0) * (b.ty1 - b.ty0);
  if (index.names.length !== count) return `${index.names.length} names for a ${count}-tile window`;
  return null;
}

/**
 * The package's horizon field, when it is the one this manifest names: null
 * for a package cut before it had one, or one whose field was reduced again
 * since. Either way the raw `horizon.bin` is still published beside it, so
 * this is a choice between two deliveries and never a refusal.
 */
export function packedHorizon(manifest: WorldManifest, index: TileIndex): PackedHorizon | null {
  const packed = index.horizon;
  const raw = manifest.horizon;
  if (!packed || packed.sha256 !== raw.sha256) return null;
  if (packed.width !== raw.width || packed.height !== raw.height) return null;
  return packed;
}

/**
 * Why a package's water cannot be drawn with this index, or null when it can.
 * A package with no water layer is not a problem: it flies dry.
 */
export function waterProblem(index: TileIndex): string | null {
  const water = index.water;
  if (!water) return null;
  if (water.codec !== WATER_CODEC) return `water is coded ${water.codec}, the engine reads ${WATER_CODEC}`;
  const layout = waterLayoutProblem(water);
  if (layout) return layout;
  if (water.heightsSha256 !== index.heightsSha256) {
    return "water was cut against other heights than these tiles: re-run `make water package`";
  }
  if (water.names.length !== index.names.length) return `${water.names.length} water names for ${index.names.length} tiles`;
  return null;
}

/** A water layer's constants against the engine's, whatever carried them. */
export function waterLayoutProblem(water: {
  channels: number;
  offsetStepM: number;
  offsetZero: number;
  reachM: number;
  classes: WaterClasses;
}): string | null {
  if (water.channels !== WATER_CHANNELS) return `water has ${water.channels} bytes a sample, the engine reads ${WATER_CHANNELS}`;
  if (water.offsetStepM !== OFFSET_STEP_M || water.offsetZero !== OFFSET_ZERO || water.reachM !== REACH_M) {
    return (
      `water offsets are ${water.offsetStepM} m about ${water.offsetZero} to ${water.reachM} m, ` +
      `the engine reads ${OFFSET_STEP_M} m about ${OFFSET_ZERO} to ${REACH_M} m`
    );
  }
  return waterClassesProblem(water.classes);
}

/**
 * A layer written before a river's own surface existed has no `river` class
 * and no sample of it, so it is read as it always was (F73).
 */
function waterClassesProblem(c: WaterClasses): string | null {
  if (c.land !== WATER_LAND || c.sea !== WATER_SEA || c.lake !== WATER_LAKE || (c.river ?? WATER_RIVER) !== WATER_RIVER) {
    return "water classes are numbered differently from the engine's";
  }
  return null;
}

const RETRY_FIRST_MS = 2_000;
const RETRY_CAP_MS = 32_000;

/** What has come over the wire of one kind of file. */
export interface FileStats {
  files: number;
  bytes: number;
  failures: number;
  lastError: string;
}

/**
 * Files by name: fetched once, decoded once, kept, and asked for again after
 * a wait when a fetch fails, doubling to a cap. A dropped request is not a
 * missing file, and a hole that stays for the rest of a session is the one
 * thing this must not turn a network blip into.
 */
class FileCache<T> {
  private readonly ready = new Map<string, T>();
  private readonly inFlight = new Map<string, Promise<T | null>>();
  private readonly failed = new Map<string, { atMs: number; waitMs: number }>();

  constructor(
    private readonly url: (name: string) => string,
    private readonly fetch: FetchBytes,
    private readonly decode: (bytes: Uint8Array) => Promise<T>,
    private readonly nowMs: () => number,
    readonly stats: FileStats,
  ) {}

  get pending(): number {
    return this.inFlight.size;
  }

  get held(): number {
    return this.ready.size;
  }

  /** The decoded file, or null while it is on its way. */
  get(name: string): T | null {
    const value = this.ready.get(name);
    if (value !== undefined) return value;
    void this.start(name);
    return null;
  }

  private start(name: string): Promise<T | null> {
    const flying = this.inFlight.get(name);
    if (flying) return flying;
    const failure = this.failed.get(name);
    if (failure && this.nowMs() < failure.atMs + failure.waitMs) return Promise.resolve(null);

    const job = (async (): Promise<T | null> => {
      try {
        const bytes = await this.fetch(this.url(name));
        const value = await this.decode(bytes);
        this.ready.set(name, value);
        this.failed.delete(name);
        this.stats.files++;
        this.stats.bytes += bytes.length;
        return value;
      } catch (error) {
        const waitMs = failure ? Math.min(failure.waitMs * 2, RETRY_CAP_MS) : RETRY_FIRST_MS;
        this.failed.set(name, { atMs: this.nowMs(), waitMs });
        this.stats.failures++;
        this.stats.lastError = error instanceof Error ? error.message : String(error);
        return null;
      } finally {
        this.inFlight.delete(name);
      }
    })();
    this.inFlight.set(name, job);
    return job;
  }
}

export class StreamingTileSource implements WorldTileSource {
  readonly label: string;
  private readonly zeros = new Int16Array(TILE_SAMPLES * TILE_SAMPLES);
  /** Decoded tiles by file, so two tiles that are one file are fetched once. */
  private readonly heights: FileCache<Int16Array>;
  /** The water layer's, the same way (F72); null for a package with none. */
  private readonly waters: FileCache<Uint8Array> | null;
  /** What has come over the wire, for the HUD and for F67's measurements. */
  readonly stats: FileStats = { files: 0, bytes: 0, failures: 0, lastError: "" };
  /** The same, for the water layer. */
  readonly waterStats: FileStats = { files: 0, bytes: 0, failures: 0, lastError: "" };
  /** Why the package's water is not drawn, when it has some and it is not. */
  readonly waterRefused: string | null;

  constructor(
    readonly manifest: WorldManifest,
    readonly index: TileIndex,
    private readonly baseUrl: string,
    fetch: FetchBytes = fetchBytes,
    nowMs: () => number = () => performance.now(),
    private readonly fallback: TileSource | null = null,
  ) {
    const problem = indexProblem(manifest, index);
    if (problem) throw new Error(problem);
    this.label = `${manifest.corridor} (${index.files} files streamed)`;
    const url = (name: string): string => `${this.baseUrl}/${name}.bin`;
    this.heights = new FileCache(url, fetch, (b) => decodeTile(b, TILE_SAMPLES), nowMs, this.stats);
    this.waterRefused = waterProblem(index);
    if (this.waterRefused) console.warn(`water layer passed over: ${this.waterRefused}`);
    this.waters =
      index.water && !this.waterRefused
        ? new FileCache(url, fetch, (b) => decodeWater(b, TILE_SAMPLES), nowMs, this.waterStats)
        : null;
  }

  /** Files being fetched right now: the heights, which are what a frame waits on. */
  get pending(): number {
    return this.heights.pending;
  }

  /** Tiles decoded and held, counting a shared file once. */
  get held(): number {
    return this.heights.held;
  }

  /** Water files being fetched right now. */
  get waterPending(): number {
    return this.waters?.pending ?? 0;
  }

  has(tx: number, ty: number): boolean {
    const w = this.manifest.window;
    return tx >= w.tx0 && tx < w.tx1 && ty >= w.ty0 && ty < w.ty1;
  }

  private indexAt(tx: number, ty: number): number {
    const w = this.manifest.window;
    return (ty - w.ty0) * (w.tx1 - w.tx0) + (tx - w.tx0);
  }

  request(tx: number, ty: number): Int16Array | null {
    if (!this.has(tx, ty)) return this.fallback?.request(tx, ty) ?? null;
    const name = this.index.names[this.indexAt(tx, ty)]!;
    if (name === "") return this.zeros;
    return this.heights.get(name);
  }

  /**
   * A tile's water: its bytes, `NO_WATER` for a dry tile or a world with no
   * layer, and null while its file is on its way. Asked for after the heights,
   * so a tile is drawn the frame its ground lands and its water a frame or two
   * later rather than the ground waiting on the water.
   */
  water(tx: number, ty: number): Uint8Array | null {
    if (!this.waters || !this.has(tx, ty)) return NO_WATER;
    const name = this.index.water!.names[this.indexAt(tx, ty)]!;
    if (name === "") return NO_WATER;
    return this.waters.get(name);
  }
}
