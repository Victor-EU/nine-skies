/**
 * The ground's colour, from a satellite mosaic (stage 7, F87).
 *
 * `pipeline/nineskies/imagery.py` cuts EOX's Sentinel-2 cloudless 2016
 * mosaic onto every tile the film can see: a WebP image per tile,
 * `COLOUR_CELLS` cells a side and one more sample, rows north to south, the
 * same shared-edge rule as the heights. Its `index.json` names each
 * country tile's file and each hero area's, tile by tile.
 *
 * This file is the index and the source that answers a lattice's "what
 * colour is tile (i, j)?": the image, decoded and ready to upload; `NO_COLOUR`
 * for a tile the index has none for; or null while its file is on its way.
 * Files are kept as they came (a few tens of kB each), and decoded again if a
 * tile evicted from the GPU comes back, because decoded images are a quarter
 * of a megabyte each and the GPU already holds the ones on screen.
 *
 * A hero tile has a second image, its fine one (F91): 10 m, Sentinel-2's
 * own, drawn over the tiles nearest the camera (`fineColour.ts`). Its grid
 * is the lattice's own (`fine`), and its broad tone the colour tile's.
 *
 * So do the country's sub-tiles along the rails (F95), the near relief's
 * 16 km (`near.ts`): 10 m, their broad tone their country tile's, in a pool
 * of the country lattice's own (`fine.near`, and `near` for their files).
 */
import { NEAR_TILE_M } from "./near.js";
import { FileCache, fetchBytes, type FetchBytes, type FileStats } from "./tileStream.js";

export const COLOUR_INDEX_VERSION = 1;
export const COLOUR_CODEC = "webp";
/** Cells a side of a colour tile, whatever its lattice; samples are one more. */
export const COLOUR_CELLS = 256;
export const COLOUR_SAMPLES = COLOUR_CELLS + 1;

export interface ColourHeroArea {
  /** The hero lattice's directory: `hero` or `hero-30m`. */
  readonly lattice: string;
  readonly window: { readonly hx0: number; readonly hy0: number; readonly hx1: number; readonly hy1: number };
  /** One file a tile, rows south to north and west to east within a row. */
  readonly tiles: readonly string[];
  /** The fine images (F91), in the same order. */
  readonly fine?: readonly string[];
}

/** A lattice's fine grid (F91): cells a side, and one more sample. */
export interface ColourFineGrid {
  readonly cells: number;
  readonly samples: number;
}

export interface ColourIndex {
  readonly version: number;
  readonly codec: string;
  readonly cells: number;
  readonly samples: number;
  readonly rows: string;
  readonly source: {
    readonly layer: string;
    readonly year: number;
    readonly attribution: string;
    readonly licence: string;
    readonly licenceUrl: string;
  };
  /** Country tiles by `tx_ty`. */
  readonly country: Readonly<Record<string, string>>;
  /** Hero areas by id. */
  readonly hero: Readonly<Record<string, ColourHeroArea>>;
  /** The fine grids (F91), by hero lattice, and the near sub-tiles' (F95) as `near`. */
  readonly fine?: Readonly<Record<string, ColourFineGrid>>;
  /** The country's sub-tiles along the rails at 10 m (F95): by `i_j`, in `tileM` from the grid's corner. */
  readonly near?: { readonly tileM: number; readonly tiles: Readonly<Record<string, string>> };
}

/** Why an index cannot colour this engine's ground, or null when it can. */
export function colourProblem(index: ColourIndex): string | null {
  if (index.version !== COLOUR_INDEX_VERSION) return `colour index version ${index.version}, the engine reads ${COLOUR_INDEX_VERSION}`;
  if (index.codec !== COLOUR_CODEC) return `colour is coded ${index.codec}, the engine reads ${COLOUR_CODEC}`;
  if (index.cells !== COLOUR_CELLS || index.samples !== COLOUR_SAMPLES) {
    return `colour tiles are ${index.samples} samples, the engine draws ${COLOUR_SAMPLES}`;
  }
  if (index.rows !== "north to south") return `colour rows run ${index.rows}`;
  for (const [lattice, grid] of Object.entries(index.fine ?? {})) {
    if (grid.samples !== grid.cells + 1) return `${lattice}'s fine colour is ${grid.cells} cells and ${grid.samples} samples`;
  }
  if (index.near && Object.keys(index.near.tiles).length > 0) {
    if (index.near.tileM !== NEAR_TILE_M) return `near colour is cut in ${index.near.tileM} m sub-tiles, the engine reads ${NEAR_TILE_M}`;
    if (!index.fine?.near) return "near colour has no grid";
  }
  return null;
}

/** A decoded colour tile: whatever `texSubImage3D` takes, and how to let it go. */
export interface ColourImage {
  readonly width: number;
  readonly height: number;
  readonly source: TexImageSource | Uint8Array;
  close(): void;
}

/** A tile the index has no colour for: it keeps the palette. */
export const NO_COLOUR: unique symbol = Symbol("no colour");

export type ColourAnswer = ColourImage | typeof NO_COLOUR | null;

/** What a lattice asks its colour: tile (i, j) of its own grid. */
export type ColourProvider = (i: number, j: number) => ColourAnswer;

/** What a lattice asks its fine colour (F91). */
export interface FineColourSource {
  /** Samples a side of every fine image. */
  readonly samples: number;
  readonly take: ColourProvider;
  /**
   * The tile no longer wants its image. One decoded and not yet taken is let
   * go: at five megabytes a fine image is not one to keep on the chance.
   */
  drop(i: number, j: number): void;
}

export type DecodeColour = (bytes: Uint8Array) => Promise<ColourImage>;

/** The browser's decoder: no colour management, no premultiplying, rows as stored. */
export async function decodeColourImage(bytes: Uint8Array): Promise<ColourImage> {
  const blob = new Blob([bytes as BlobPart], { type: "image/webp" });
  const bitmap = await createImageBitmap(blob, {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
    imageOrientation: "none",
  });
  return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
}

export async function loadColourIndex(url: string, fetch: FetchBytes = fetchBytes): Promise<ColourIndex | null> {
  try {
    const index = JSON.parse(new TextDecoder().decode(await fetch(url))) as ColourIndex;
    const problem = colourProblem(index);
    if (problem) {
      console.warn(`ground colour passed over: ${problem}`);
      return null;
    }
    return index;
  } catch {
    return null;
  }
}

/**
 * Image files fetched as they are asked for, decoded once and handed over
 * once: the colour's (F87), and the relief's (F93). Files are kept as they
 * came, and decoded again if a tile that was let go comes back.
 */
export class ImageFiles {
  private readonly files: FileCache<Uint8Array>;
  /** Decoded and not yet taken. */
  private readonly decoded = new Map<string, ColourImage>();
  private readonly decoding = new Set<string>();
  /** Files that would not decode: their tiles go without. */
  private readonly broken = new Set<string>();
  readonly stats: FileStats = { files: 0, bytes: 0, failures: 0, lastError: "" };
  decodes = 0;

  constructor(
    /** Where the files are: `<base>/<name>.webp`. */
    private readonly baseUrl: string,
    fetch: FetchBytes = fetchBytes,
    private readonly decode: DecodeColour = decodeColourImage,
    nowMs: () => number = () => performance.now(),
  ) {
    this.files = new FileCache((name) => `${this.baseUrl}/${name}.webp`, fetch, async (b) => b, nowMs, this.stats);
  }

  /** Files on their way, or being decoded. */
  get pending(): number {
    return this.files.pending + this.decoding.size;
  }

  /** A lattice's answer, from its names by `i,j`. */
  answer(names: ReadonlyMap<string, string>): ColourProvider {
    return (i, j) => {
      const name = names.get(`${i},${j}`);
      return name && !this.broken.has(name) ? this.take(name) : NO_COLOUR;
    };
  }

  /** A pool's source (`fineColour.ts`): the answer, and the letting go of an image decoded and not taken. */
  pool(names: ReadonlyMap<string, string>, samples: number): FineColourSource {
    return {
      samples,
      take: this.answer(names),
      drop: (i, j) => {
        const name = names.get(`${i},${j}`);
        const ready = name && this.decoded.get(name);
        if (!ready) return;
        ready.close();
        this.decoded.delete(name);
      },
    };
  }

  /**
   * The decoded image, handed over once: the caller uploads it and closes
   * it. Null while it is being fetched or decoded.
   */
  private take(name: string): ColourImage | null {
    const ready = this.decoded.get(name);
    if (ready) {
      this.decoded.delete(name);
      return ready;
    }
    if (this.decoding.has(name)) return null;
    const bytes = this.files.get(name);
    if (!bytes) return null;
    this.decoding.add(name);
    this.decode(bytes)
      .then((image) => {
        this.decodes++;
        this.decoded.set(name, image);
      })
      .catch((error: unknown) => {
        this.broken.add(name);
        this.stats.failures++;
        this.stats.lastError = error instanceof Error ? error.message : String(error);
      })
      .finally(() => this.decoding.delete(name));
    return null;
  }
}

/** Every file a hero area's layer is, by tile: rows south to north, then west to east. */
export function heroTileNames(
  window: { readonly hx0: number; readonly hy0: number; readonly hx1: number; readonly hy1: number },
  names: readonly string[],
): Map<string, string> {
  const out = new Map<string, string>();
  let k = 0;
  for (let hy = window.hy0; hy < window.hy1; hy++) {
    for (let hx = window.hx0; hx < window.hx1; hx++) {
      const name = names[k++];
      if (name) out.set(`${hx},${hy}`, name);
    }
  }
  return out;
}

export class ColourSource {
  private readonly images: ImageFiles;
  /** Names by lattice, then by `i,j`. */
  private readonly names = new Map<string, Map<string, string>>();
  /** The fine images' names (F91), the same way. */
  private readonly fineNames = new Map<string, Map<string, string>>();

  constructor(
    readonly index: ColourIndex,
    /** Where the files are: `<base>/<name>.webp`. */
    baseUrl: string,
    fetch: FetchBytes = fetchBytes,
    decode: DecodeColour = decodeColourImage,
    nowMs: () => number = () => performance.now(),
  ) {
    this.images = new ImageFiles(baseUrl, fetch, decode, nowMs);
    const country = new Map<string, string>();
    for (const [key, name] of Object.entries(index.country)) country.set(key.replace("_", ","), name);
    this.names.set("country", country);
    for (const area of Object.values(index.hero)) {
      const lattice = this.names.get(area.lattice) ?? new Map<string, string>();
      for (const [key, name] of heroTileNames(area.window, area.tiles)) lattice.set(key, name);
      this.names.set(area.lattice, lattice);
      if (!area.fine || !index.fine?.[area.lattice]) continue;
      const fine = this.fineNames.get(area.lattice) ?? new Map<string, string>();
      for (const [key, name] of heroTileNames(area.window, area.fine)) fine.set(key, name);
      this.fineNames.set(area.lattice, fine);
    }
    const near = Object.entries(index.near?.tiles ?? {});
    if (near.length > 0 && index.fine?.near) this.fineNames.set("near", new Map(near.map(([key, name]) => [key.replace("_", ","), name])));
  }

  get stats(): FileStats {
    return this.images.stats;
  }

  get decodes(): number {
    return this.images.decodes;
  }

  /** Every file a lattice's tile is, for the scene packs to know their own. */
  nameOf(lattice: string, i: number, j: number): string | null {
    return this.names.get(lattice)?.get(`${i},${j}`) ?? null;
  }

  /** Files on their way, or being decoded. */
  get pending(): number {
    return this.images.pending;
  }

  /** The source a lattice asks: `country`, `hero` or `hero-30m`. */
  provider(lattice: string): ColourProvider | null {
    const names = this.names.get(lattice);
    return names ? this.images.answer(names) : null;
  }

  /** A hero lattice's fine colour (F91), or the country's near sub-tiles' (`near`, F95); null where it has none. */
  fine(lattice: string): FineColourSource | null {
    const names = this.fineNames.get(lattice);
    const grid = this.index.fine?.[lattice];
    if (!names || !grid) return null;
    return this.images.pool(names, grid.samples);
  }
}
