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
import { TILE_CODEC, decodeTile } from "./tileCodec.js";
import type {
  TileSource,
  WorldManifest,
  WorldTileSource,
  WorldWindow,
} from "./tileSource.js";

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
}

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

/** How long a failed file waits before it is asked for again, doubling to a cap. */
const RETRY_FIRST_MS = 2_000;
const RETRY_CAP_MS = 32_000;

export class StreamingTileSource implements WorldTileSource {
  readonly label: string;
  private readonly zeros = new Int16Array(TILE_SAMPLES * TILE_SAMPLES);
  /** Decoded tiles by file, so two tiles that are one file are fetched once. */
  private readonly ready = new Map<string, Int16Array>();
  private readonly inFlight = new Map<string, Promise<Int16Array | null>>();
  private readonly failed = new Map<string, { atMs: number; waitMs: number }>();
  /** What has come over the wire, for the HUD and for F67's measurements. */
  readonly stats = { files: 0, bytes: 0, failures: 0, lastError: "" };

  constructor(
    readonly manifest: WorldManifest,
    readonly index: TileIndex,
    private readonly baseUrl: string,
    private readonly fetch: FetchBytes = fetchBytes,
    private readonly nowMs: () => number = () => performance.now(),
    private readonly fallback: TileSource | null = null,
  ) {
    const problem = indexProblem(manifest, index);
    if (problem) throw new Error(problem);
    this.label = `${manifest.corridor} (${index.files} files streamed)`;
  }

  /** Files being fetched right now. */
  get pending(): number {
    return this.inFlight.size;
  }

  /** Tiles decoded and held, counting a shared file once. */
  get held(): number {
    return this.ready.size;
  }

  has(tx: number, ty: number): boolean {
    const w = this.manifest.window;
    return tx >= w.tx0 && tx < w.tx1 && ty >= w.ty0 && ty < w.ty1;
  }

  private nameAt(tx: number, ty: number): string {
    const w = this.manifest.window;
    return this.index.names[(ty - w.ty0) * (w.tx1 - w.tx0) + (tx - w.tx0)]!;
  }

  request(tx: number, ty: number): Int16Array | null {
    if (!this.has(tx, ty)) return this.fallback?.request(tx, ty) ?? null;
    const name = this.nameAt(tx, ty);
    if (name === "") return this.zeros;
    const tile = this.ready.get(name);
    if (tile) return tile;
    void this.start(name);
    return null;
  }

  private start(name: string): Promise<Int16Array | null> {
    const flying = this.inFlight.get(name);
    if (flying) return flying;
    const failure = this.failed.get(name);
    if (failure && this.nowMs() < failure.atMs + failure.waitMs) return Promise.resolve(null);

    const job = (async (): Promise<Int16Array | null> => {
      try {
        const bytes = await this.fetch(`${this.baseUrl}/${name}.bin`);
        const tile = await decodeTile(bytes, TILE_SAMPLES);
        this.ready.set(name, tile);
        this.failed.delete(name);
        this.stats.files++;
        this.stats.bytes += bytes.length;
        return tile;
      } catch (error) {
        // Asked for again after a wait rather than never: a dropped request is
        // not a missing tile, and a hole that stays for the rest of a session
        // is the one thing this must not turn a network blip into.
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
