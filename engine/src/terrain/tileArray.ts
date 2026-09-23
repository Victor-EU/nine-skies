import {
  DataArrayTexture,
  NearestFilter,
  RGBAIntegerFormat,
  RedIntegerFormat,
  ShortType,
  UnsignedByteType,
} from "three";

/**
 * Heightmap residency (build plan D4).
 *
 * Every resident tile's heightmap lives in one R16I texture array, so drawing
 * the terrain is a handful of instanced draws rather than one per tile. A tile
 * becoming resident is a write into a typed array plus an upload of its own
 * layer; it never touches geometry.
 *
 * Int16 metres (D2) spans Ayding Lake at -154 m to Everest at 8,849 m exactly,
 * and needs no decode step at all - the bytes off the wire are the bytes the
 * GPU reads.
 *
 * Integer textures cannot be hardware-filtered. That costs nothing here:
 * vertices land exactly on texels, and the ground elevation the HUD and the
 * collision check need is interpolated on the CPU from the same Int16 buffer.
 */

/** WebGL2 guarantees at least 256 array layers. */
export const MAX_LAYERS = 256;

/** Heightmap texels per side. 64 km tiles at 1 km, sharing an edge row. */
export const TILE_SAMPLES = 65;

/**
 * Hero tiles are 129 (stage 6): 11.52 km at 90 m, sharing an edge row the
 * same way. They cannot share this array -- a texture array has one width and
 * one height for every layer in it -- so a second one is built beside it.
 * That is why `samples` is a constructor argument rather than a constant.
 */
export const HERO_TILE_SAMPLES = 129;

/**
 * Past this share of an array's layers changed in one frame, the whole array
 * is uploaded in one call rather than a layer at a time (F70). Measured on an
 * M3 against the country array's 256 layers: a layer at a time costs the main
 * thread under 0.1 ms up to 32 layers where the whole array costs 2.0, the two
 * meet near 137, and at 256 a layer at a time is 11.3 ms. A streamed world
 * lands 1-13 tiles a frame in cruise and ~30 a frame after a jump; a packed
 * world's first disc is 137 at once.
 */
export const WHOLE_UPLOAD_SHARE = 0.5;

export interface TileKey {
  x: number;
  y: number;
}

export function tileId(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * One square tile of samples, read bilinearly at a tile-local `(u, v)`.
 *
 * Free rather than a method because two callers with nothing else in common
 * have to agree to the metre about it: the renderer, which reads a resident
 * layer of a texture array to tell the cockpit what is under the aeroplane,
 * and the content tooling, which reads a published area off disk to check
 * whether the ground a section was cut from is the ground the game draws
 * (F53). Two copies of this arithmetic would be two answers to the same
 * question, and the first time they disagreed would be the first time anyone
 * looked.
 *
 * `u` and `v` are clamped, so the edge row and column are the tile's own
 * rather than a neighbour's: tiles share their edge samples by construction,
 * which is why a grid of `n` cells carries `n + 1`.
 */
export function bilinearSample(
  data: ArrayLike<number>,
  base: number,
  samples: number,
  u: number,
  v: number,
): number {
  const max = samples - 1;
  const fx = Math.min(max, Math.max(0, u * max));
  const fy = Math.min(max, Math.max(0, v * max));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(max, x0 + 1);
  const y1 = Math.min(max, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const h00 = data[base + y0 * samples + x0] ?? 0;
  const h10 = data[base + y0 * samples + x1] ?? 0;
  const h01 = data[base + y1 * samples + x0] ?? 0;
  const h11 = data[base + y1 * samples + x1] ?? 0;
  const top = h00 + (h10 - h00) * tx;
  const bottom = h01 + (h11 - h01) * tx;
  return top + (bottom - top) * ty;
}

/** Bytes a water sample carries (F72): `tileCodec.WATER_CHANNELS`. */
export const WATER_BYTES = 4;

/**
 * One array texture's uploads: the layers written since the last flush, each
 * as its own `texSubImage3D`, or the whole array when more than
 * `WHOLE_UPLOAD_SHARE` of it changed at once (F70). The heights and the water
 * layer are two arrays over one set of layers, and each uploads what it wrote.
 */
export class LayerUploads {
  /** Layers written since the last flush. */
  private readonly dirty = new Set<number>();
  /**
   * A whole-array upload asked for and not yet made. Two flushes can come
   * before one render, and a second that asked for three layers would
   * otherwise narrow the first's whole array to those three.
   */
  private wholePending = false;
  /** What the last flush sent: how many layers, and whether as the whole array. */
  last: { layers: number; whole: boolean } = { layers: 0, whole: false };

  constructor(
    private readonly texture: DataArrayTexture,
    private readonly layers: number,
  ) {
    // The renderer calls this after every upload it makes. The first one
    // allocates the array, which WebGL fills with zeros, so a layer nothing
    // has written needs no upload of its own.
    texture.onUpdate = () => {
      this.wholePending = false;
    };
  }

  mark(layer: number): void {
    this.dirty.add(layer);
  }

  flush(): void {
    if (this.dirty.size === 0) {
      this.last = { layers: 0, whole: false };
      return;
    }
    const whole = this.wholePending || this.dirty.size > this.layers * WHOLE_UPLOAD_SHARE;
    if (whole) {
      this.texture.clearLayerUpdates();
      this.wholePending = true;
    } else {
      for (const layer of this.dirty) this.texture.addLayerUpdate(layer);
    }
    this.texture.needsUpdate = true;
    this.last = { layers: this.dirty.size, whole };
    this.dirty.clear();
  }
}

/** Where a resident tile's water stands (F72). */
const WATER_ASKED = 0;
const WATER_NONE = 1;
const WATER_HELD = 2;

export class HeightTileArray {
  readonly texture: DataArrayTexture;
  private readonly data: Int16Array;
  private readonly layerOf = new Map<string, number>();
  /** Layer -> tile id, for eviction. */
  private readonly occupant: (string | null)[];
  /** Monotonic clock for LRU. */
  private readonly lastUsed: number[];
  private clock = 0;
  private readonly uploads: LayerUploads;
  /**
   * The water layer, one RGBA8UI layer beside each height layer, or null for
   * an array made without one. A layer's water is only drawn once it has been
   * written for the tile now in it, so a layer that changes tile needs no
   * clearing: `waterState` says whose water it holds.
   */
  readonly water: DataArrayTexture | null;
  private readonly waterData: Uint8Array | null;
  private readonly waterState: Uint8Array;
  private readonly waterUploads: LayerUploads | null;

  /**
   * @param samples texels per side. The country grid's 65, or a hero grid's
   * 129 -- whatever a layer of this array holds, the whole array holds.
   */
  constructor(
    readonly layers: number = MAX_LAYERS,
    readonly samples: number = TILE_SAMPLES,
    withWater = false,
  ) {
    const stride = samples * samples;
    this.data = new Int16Array(stride * layers);
    this.occupant = new Array<string | null>(layers).fill(null);
    this.lastUsed = new Array<number>(layers).fill(-1);

    this.texture = new DataArrayTexture(this.data, samples, samples, layers);
    this.texture.format = RedIntegerFormat;
    this.texture.type = ShortType;
    this.texture.internalFormat = "R16I";
    this.texture.minFilter = NearestFilter;
    this.texture.magFilter = NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
    this.uploads = new LayerUploads(this.texture, layers);

    this.waterState = new Uint8Array(layers);
    if (withWater) {
      this.waterData = new Uint8Array(stride * WATER_BYTES * layers);
      this.water = new DataArrayTexture(this.waterData, samples, samples, layers);
      this.water.format = RGBAIntegerFormat;
      this.water.type = UnsignedByteType;
      this.water.internalFormat = "RGBA8UI";
      this.water.minFilter = NearestFilter;
      this.water.magFilter = NearestFilter;
      this.water.generateMipmaps = false;
      this.water.needsUpdate = true;
      this.waterUploads = new LayerUploads(this.water, layers);
    } else {
      this.waterData = null;
      this.water = null;
      this.waterUploads = null;
    }
  }

  /** What the last flush sent of the heights. */
  get lastUpload(): { layers: number; whole: boolean } {
    return this.uploads.last;
  }

  /** What the last flush sent of the water layer. */
  get lastWaterUpload(): { layers: number; whole: boolean } {
    return this.waterUploads?.last ?? { layers: 0, whole: false };
  }

  has(x: number, y: number): boolean {
    return this.layerOf.has(tileId(x, y));
  }

  /** Layer holding this tile, or -1. Marks it used. */
  layerFor(x: number, y: number): number {
    const layer = this.layerOf.get(tileId(x, y));
    if (layer === undefined) return -1;
    this.lastUsed[layer] = ++this.clock;
    return layer;
  }

  /**
   * Make a tile resident, evicting the least recently used layer if the array
   * is full. `heights` is Int16 metres, `samples`^2, row-major.
   */
  insert(x: number, y: number, heights: Int16Array): number {
    const id = tileId(x, y);
    const existing = this.layerOf.get(id);
    const layer = existing ?? this.claimLayer();
    if (existing === undefined) {
      const evicted = this.occupant[layer];
      if (evicted != null) this.layerOf.delete(evicted);
      this.occupant[layer] = id;
      this.layerOf.set(id, layer);
    }
    this.data.set(heights, layer * this.samples * this.samples);
    this.lastUsed[layer] = ++this.clock;
    this.uploads.mark(layer);
    if (existing === undefined) this.waterState[layer] = WATER_ASKED;
    return layer;
  }

  /** Whether this layer's tile still wants its water asked for. */
  waterWanted(layer: number): boolean {
    return this.water !== null && this.waterState[layer] === WATER_ASKED;
  }

  /** Whether this layer holds water for the tile in it, which is what draws it. */
  hasWater(layer: number): boolean {
    return this.waterState[layer] === WATER_HELD;
  }

  /**
   * The water for the tile in `layer`: `WATER_BYTES` a sample, or an empty
   * array for a tile with none, which is written nowhere and never drawn.
   */
  insertWater(layer: number, water: Uint8Array): void {
    if (!this.waterData || !this.waterUploads) return;
    if (water.length === 0) {
      this.waterState[layer] = WATER_NONE;
      return;
    }
    const stride = this.samples * this.samples * WATER_BYTES;
    if (water.length !== stride) {
      throw new Error(`${water.length} bytes of water for a ${this.samples}-sample layer of ${stride}`);
    }
    this.waterData.set(water, layer * stride);
    this.waterState[layer] = WATER_HELD;
    this.waterUploads.mark(layer);
  }

  /**
   * Read a height back on the CPU, bilinearly interpolated.
   * `u` and `v` are tile-local in [0,1]. Returns metres, or null if the tile
   * is not resident.
   */
  sample(x: number, y: number, u: number, v: number): number | null {
    const layer = this.layerOf.get(tileId(x, y));
    if (layer === undefined) return null;
    return bilinearSample(this.data, layer * this.samples * this.samples, this.samples, u, v);
  }

  /**
   * A resident tile's samples as the GPU has them: the array they live in and
   * where the tile starts. Not a copy, and not a use for eviction's sake.
   */
  tileData(x: number, y: number): { data: Int16Array; base: number } | null {
    const layer = this.layerOf.get(tileId(x, y));
    if (layer === undefined) return null;
    return { data: this.data, base: layer * this.samples * this.samples };
  }

  /**
   * Call once per frame before rendering. Sends the layers written since the
   * last call, each as its own `texSubImage3D`, or the whole array when more
   * than `WHOLE_UPLOAD_SHARE` of it changed at once (F70) - the heights and,
   * each on its own account, the water (F72).
   */
  flush(): void {
    this.uploads.flush();
    this.waterUploads?.flush();
  }

  get residentCount(): number {
    return this.layerOf.size;
  }

  private claimLayer(): number {
    let oldest = 0;
    let oldestUse = Infinity;
    for (let i = 0; i < this.layers; i++) {
      if (this.occupant[i] == null) return i;
      const used = this.lastUsed[i] ?? -1;
      if (used < oldestUse) {
        oldestUse = used;
        oldest = i;
      }
    }
    return oldest;
  }
}
