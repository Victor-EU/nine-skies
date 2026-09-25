import { DataArrayTexture, RGBAFormat, UnsignedByteType } from "three";
import { NO_COLOUR, type FineColourSource } from "./colour.js";
import { ColourLayers } from "./colourLayers.js";
import { tileId } from "./tileArray.js";

/**
 * The ground's colour at 10 m, over the tiles nearest the camera (F91).
 *
 * A hero tile's colour layer is 257 samples: 45 m on the 90 m lattice and
 * 15 m on the 30 m one, where the camera flies a few hundred metres up and a
 * 45 m texel under it is dozens of pixels wide. Sentinel-2 sees 10 m, and at
 * 10 m every tile of every hero area would be 800 MB of GPU memory. Only the
 * tiles near the camera need it, so a lattice keeps a small pool of fine
 * layers and hands them to the nearest tiles, taking back the ones it has
 * flown away from.
 *
 * The shader fades from the fine layer to the colour layer between
 * `fullM` and `goneM` from the camera, and a tile claims its layer within
 * `reachM`, further out, so its image is fetched, decoded and uploaded
 * before the fade reaches it, and it is let go only once the fade has left
 * it. The two images share their broad tone (the pipeline cuts the fine one
 * onto the colour tile's), so the fade changes the detail and nothing else.
 *
 * The array is allocated when a tile first wants it and freed when none has
 * for `IDLE_FRAMES`: the pools are 30 to 115 MB, and a scene flies over one
 * lattice's areas at most, so only one is held at a time.
 *
 * The ground's relief (F93) is held in pools of the same kind, its images
 * data rather than colour (`linear`). So are the country's sub-tiles along
 * the rails (F94, F95), placed by the lattice a sub-tile at a time.
 */

export interface FineReach {
  /** Real metres from the camera within which the fine colour is drawn whole. */
  readonly fullM: number;
  /** Past which it is gone, and the colour layer drawn alone. */
  readonly goneM: number;
  /** A tile whose nearest point is this close holds a fine layer. */
  readonly reachM: number;
  /** Layers in the pool: every tile within `reachM` of a point, and a few more. */
  readonly layers: number;
  /** Images uploaded a frame at most. */
  readonly uploadsPerFrame: number;
}

/**
 * By hero lattice. The 90 m lattice's tiles are 11.52 km, and its colour
 * 45 m, four and a half times the fine: a texel of it is a pixel only 45 km
 * out, so the fine is kept to 12 km, where its own texel is under a pixel,
 * with 16 layers of 1,153² (113 MB with mips) for the 14 tiles at most
 * within 16 km of a point. The 30 m lattice's are 3.84 km and 15 m, only
 * one and a half times the fine, so the step at 8 km is a small one: 40
 * layers of 385² (32 MB) for the 37 within 10 km.
 *
 * The country's near sub-tiles (F95) are 16 km, their colour 10 m against
 * the country's 250 m, a step no distance hides: 250 m is still sixteen
 * pixels wide at 16 km. So they reach as far as the near relief (F94) does,
 * and the colour sharpens over the same ground the relief does: whole to
 * 10 km, gone by 16, claimed within 20, with 16 layers of 1,601² (219 MB
 * with mips) for the 14 at most that near a point. One image a frame, as
 * each is twice a 90 m tile's.
 */
export const FINE_REACH: Readonly<Record<string, FineReach>> = {
  hero: { fullM: 8_000, goneM: 12_000, reachM: 16_000, layers: 16, uploadsPerFrame: 2 },
  "hero-30m": { fullM: 5_000, goneM: 8_000, reachM: 10_000, layers: 40, uploadsPerFrame: 6 },
  near: { fullM: 10_000, goneM: 16_000, reachM: 20_000, layers: 16, uploadsPerFrame: 1 },
};

/** Frames with no tile wanting a fine layer before the pool's array is freed: ten seconds at 60 Hz. */
export const IDLE_FRAMES = 600;

/** What the material samples while the pool holds no array. */
function placeholder(): DataArrayTexture {
  const t = new DataArrayTexture(new Uint8Array(4), 1, 1, 1);
  t.format = RGBAFormat;
  t.type = UnsignedByteType;
  t.needsUpdate = true;
  return t;
}

interface Wanted {
  i: number;
  j: number;
  key: string;
  distM: number;
}

export class FineColour {
  /** The pool's array, while it holds one. */
  layers: ColourLayers | null = null;
  readonly placeholder = placeholder();
  private readonly tileOf: (string | null)[];
  private readonly at: { i: number; j: number }[];
  private readonly layerOf = new Map<string, number>();
  /** The frame each layer's tile was last wanted in. */
  private readonly lastWanted: Int32Array;
  private readonly wanted: Wanted[] = [];
  private frame = 0;
  private idle = 0;

  constructor(
    readonly reach: FineReach,
    readonly source: FineColourSource,
    /** Told when the array the material should sample changes. */
    private readonly onTexture: (texture: DataArrayTexture) => void = () => {},
    /** Images of data, read as stored rather than as sRGB: the relief's (F93). */
    private readonly linear = false,
  ) {
    this.tileOf = new Array<string | null>(reach.layers).fill(null);
    this.at = Array.from({ length: reach.layers }, () => ({ i: 0, j: 0 }));
    this.lastWanted = new Int32Array(reach.layers).fill(-1);
  }

  /** The texture the material samples now. */
  get texture(): DataArrayTexture {
    return this.layers?.texture ?? this.placeholder;
  }

  /** Tiles holding a fine layer whose image is on the GPU. */
  get held(): number {
    if (!this.layers) return 0;
    let n = 0;
    for (let l = 0; l < this.reach.layers; l++) if (this.tileOf[l] !== null && this.layers.held(l)) n++;
    return n;
  }

  /** Images on their way to the GPU: queued, or wanted and not yet answered. */
  get pending(): number {
    if (!this.layers) return 0;
    let n = this.layers.pending;
    for (let l = 0; l < this.reach.layers; l++) if (this.tileOf[l] !== null && this.layers.wanted(l)) n++;
    return n;
  }

  /**
   * A tile drawn this frame, `distM` from the camera at its nearest point:
   * what its instance carries, its fine layer + 1 where that layer holds its
   * image, else 0. Within `reachM` it is noted as wanting one.
   */
  place(i: number, j: number, distM: number): number {
    if (distM > this.reach.reachM) return 0;
    const key = tileId(i, j);
    this.wanted.push({ i, j, key, distM });
    const layer = this.layerOf.get(key);
    return layer !== undefined && this.layers?.held(layer) ? layer + 1 : 0;
  }

  /**
   * Once a frame, after every tile is placed: the nearest wanted tiles claim
   * layers, from the pool's free ones and then from the tiles flown away
   * from longest ago, and ask for their images.
   */
  endFrame(): void {
    this.frame++;
    if (this.wanted.length === 0) {
      if (this.layers && ++this.idle >= IDLE_FRAMES) this.free();
      return;
    }
    this.idle = 0;
    if (!this.layers) {
      this.layers = new ColourLayers(this.reach.layers, this.source.samples, this.linear);
      this.onTexture(this.layers.texture);
    }
    const layers = this.layers;
    this.wanted.sort((a, b) => a.distM - b.distM);
    // A tile wanted this frame keeps its layer whatever else is wanted.
    for (const w of this.wanted) {
      const layer = this.layerOf.get(w.key);
      if (layer !== undefined) this.lastWanted[layer] = this.frame;
    }
    for (const w of this.wanted) {
      let layer = this.layerOf.get(w.key);
      if (layer === undefined) {
        layer = this.oldest();
        if (layer < 0) break; // every layer is a nearer tile's
        const was = this.tileOf[layer];
        if (was) {
          this.layerOf.delete(was);
          this.source.drop(this.at[layer]!.i, this.at[layer]!.j);
        }
        this.tileOf[layer] = w.key;
        this.at[layer] = { i: w.i, j: w.j };
        this.layerOf.set(w.key, layer);
        this.lastWanted[layer] = this.frame;
        layers.reset(layer);
      }
      if (layers.wanted(layer)) {
        const image = this.source.take(w.i, w.j);
        if (image === NO_COLOUR) layers.none(layer);
        else if (image) layers.queue(layer, image);
      }
    }
    this.wanted.length = 0;
  }

  /** The layer to give a tile: a free one, else the one wanted longest ago, but not this frame. */
  private oldest(): number {
    let best = -1;
    for (let l = 0; l < this.reach.layers; l++) {
      if (this.tileOf[l] === null) return l;
      if (this.lastWanted[l]! < this.frame && (best < 0 || this.lastWanted[l]! < this.lastWanted[best]!)) best = l;
    }
    return best;
  }

  /** The array given back: nothing near has wanted it for `IDLE_FRAMES`. */
  private free(): void {
    for (let l = 0; l < this.reach.layers; l++) {
      const key = this.tileOf[l];
      if (key) this.source.drop(this.at[l]!.i, this.at[l]!.j);
      this.layers!.reset(l);
      this.tileOf[l] = null;
    }
    this.layerOf.clear();
    this.lastWanted.fill(-1);
    this.layers!.texture.dispose();
    this.layers = null;
    this.idle = 0;
    this.onTexture(this.placeholder);
  }
}
