/**
 * The ground's relief below its grid, from GLO-30 (F93).
 *
 * The country grid is 1 km and draws nothing smaller: the Loess's gullies,
 * the plateau's drainage, the ridges between the Wall's valleys all
 * average away, and the ground reads smooth as clay. The source is 30 m.
 * `pipeline/nineskies/relief.py` cuts it again, finer than each grid, as the
 * ground's normal at every sample (125 m on a country tile, 30 m on a 90 m
 * hero tile), and the tiles nearest the camera are lit by it. The ground's
 * shape stays the grid's; the relief moves only the light.
 *
 * A tile's image is its grid's samples, rows north to south, the shared-edge
 * rule the colour keeps. Red and green are the east and north parts of the
 * source's normal as the ground stands, each the signed square root of its
 * size: the shader squares them back and exaggerates the slope by the
 * world's own factor, so the relief is as steep as the ground drawn round
 * it. Lossless, since lossy WebP halves the resolution of its colour and
 * would smear one part into the other.
 *
 * The images are held in a pool per lattice over the tiles nearest the
 * camera, as the fine colour is (`fineColour.ts`), and faded to the grid's
 * own normal before the pool's reach runs out.
 */
import { ImageFiles, decodeColourImage, heroTileNames, type DecodeColour, type FineColourSource } from "./colour.js";
import type { FineReach } from "./fineColour.js";
import { fetchBytes, type FetchBytes, type FileStats } from "./tileStream.js";

export const RELIEF_INDEX_VERSION = 1;
export const RELIEF_CODEC = "webp";
export const RELIEF_ENCODING = "normal-east-north-sqrt";

export interface ReliefHeroArea {
  readonly lattice: string;
  readonly window: { readonly hx0: number; readonly hy0: number; readonly hx1: number; readonly hy1: number };
  /** One file a tile, rows south to north and west to east within a row. */
  readonly tiles: readonly string[];
}

export interface ReliefIndex {
  readonly version: number;
  readonly codec: string;
  readonly encoding: string;
  readonly rows: string;
  readonly source: string;
  /** Each lattice's relief grid: cells a side, and one more sample. */
  readonly grids: Readonly<Record<string, { readonly cells: number; readonly samples: number }>>;
  /** Country tiles by `tx_ty`. */
  readonly country: Readonly<Record<string, string>>;
  /** Hero areas by id. */
  readonly hero: Readonly<Record<string, ReliefHeroArea>>;
}

/**
 * How far the relief reaches, by lattice. A country tile's is 125 m, a
 * pixel about 125 km off; it is drawn whole to 40 km and gone by 70, where
 * the grid's own 1 km normal takes over, and a tile claims its image
 * within 90 km: 20 layers of 513² (28 MB with mips) for the 16 tiles at
 * most that near a point. A 90 m hero tile's is 30 m, a pixel 30 km off,
 * drawn whole to 8 km and gone by 16: 24 layers of 385² (19 MB) for the 21
 * within 20 km.
 */
export const RELIEF_REACH: Readonly<Record<string, FineReach>> = {
  country: { fullM: 40_000, goneM: 70_000, reachM: 90_000, layers: 20, uploadsPerFrame: 2 },
  hero: { fullM: 8_000, goneM: 16_000, reachM: 20_000, layers: 24, uploadsPerFrame: 3 },
};

/** Why an index cannot light this engine's ground, or null when it can. */
export function reliefProblem(index: ReliefIndex): string | null {
  if (index.version !== RELIEF_INDEX_VERSION) return `relief index version ${index.version}, the engine reads ${RELIEF_INDEX_VERSION}`;
  if (index.codec !== RELIEF_CODEC) return `relief is coded ${index.codec}, the engine reads ${RELIEF_CODEC}`;
  if (index.encoding !== RELIEF_ENCODING) return `relief is encoded ${index.encoding}, the engine reads ${RELIEF_ENCODING}`;
  if (index.rows !== "north to south") return `relief rows run ${index.rows}`;
  for (const [lattice, grid] of Object.entries(index.grids)) {
    if (grid.samples !== grid.cells + 1) return `${lattice}'s relief is ${grid.cells} cells and ${grid.samples} samples`;
  }
  return null;
}

export async function loadReliefIndex(url: string, fetch: FetchBytes = fetchBytes): Promise<ReliefIndex | null> {
  try {
    const index = JSON.parse(new TextDecoder().decode(await fetch(url))) as ReliefIndex;
    const problem = reliefProblem(index);
    if (problem) {
      console.warn(`ground relief passed over: ${problem}`);
      return null;
    }
    return index;
  } catch {
    return null;
  }
}

export class ReliefSource {
  private readonly images: ImageFiles;
  /** Names by lattice, then by `i,j`. */
  private readonly names = new Map<string, Map<string, string>>();

  constructor(
    readonly index: ReliefIndex,
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
    }
  }

  get stats(): FileStats {
    return this.images.stats;
  }

  get decodes(): number {
    return this.images.decodes;
  }

  /** Files on their way, or being decoded. */
  get pending(): number {
    return this.images.pending;
  }

  /** A lattice's relief, for its pool, or null where the index has none. */
  layer(lattice: string): FineColourSource | null {
    const names = this.names.get(lattice);
    const grid = this.index.grids[lattice];
    return names && grid ? this.images.pool(names, grid.samples) : null;
  }
}
