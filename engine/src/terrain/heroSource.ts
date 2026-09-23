import { bilinearSample, HERO_TILE_SAMPLES } from "./tileArray.js";
import { decodeField, decodeWaterArea, WATER_CHANNELS, WATER_CODEC } from "./tileCodec.js";
import type { TileSource } from "./tileSource.js";
import { NO_WATER, waterLayoutProblem, type WaterClasses } from "./tileStream.js";
import { NO_RIVER, WATER_LAND } from "./water.js";

/**
 * The 90 m hero grid (pipeline stage 6, build plan D47, finding F50).
 *
 * A few named places are cut at 90 m because the 1 km country grid is wrong
 * about them in a way no amount of resampling fixes: through Tiger Leaping
 * Gorge the country grid stands as much as 764 m *above* the hero grid and
 * 390 m below its ridges. It fills the gorge in and shaves the peaks, and the
 * golden probe that reads the Jinsha cannot pass on it at all.
 *
 * THE ADDRESSING
 * --------------
 * A hero tile is not a country tile subdivided. `gcd(90, 64000) = 10`, so no
 * tile of 90 m cells divides a 64 km country tile and there is no nesting to
 * exploit at any tile size. The hero lattice therefore stands on its own,
 * sharing only the country grid's south-west origin so both are indexed from
 * the same corner: hero tile `(hx, hy)` covers `[hx * 11520, (hx+1) * 11520)`
 * metres east of it.
 *
 * Every area published for a corridor lives on that one lattice, so however
 * many there are they are one source, one texture array and one set of draws.
 * Areas that disagree about the lattice are refused rather than merged.
 *
 * What makes a non-nesting grid safe is the skirt, not shared samples: the
 * cutter measures its own boundary against the country grid and refuses to
 * write an area that disagrees by more than the 900 m the skirts drop (this
 * one: mean 71 m, worst 333 m).
 *
 * An area cut since F73 carries its water beside its heights: the country's
 * layer, four bytes a sample on the same 129 x 129 tiles, one gzip file for
 * the whole area because an area is fetched whole. An area without one, or
 * with one that does not fit its heights, is drawn dry - the ground is still
 * right - and says so.
 */

export interface HeroWindow {
  hx0: number;
  hy0: number;
  hx1: number;
  hy1: number;
}

export interface HeroOrigin {
  originXM: number;
  originYM: number;
}

/** One entry of `hero/index.json` - enough to fetch an area, not to draw it. */
export interface HeroAreaEntry {
  id: string;
  name: string;
  file: string;
  window: HeroWindow;
  bytes: number;
}

export interface HeroIndex {
  version: number;
  resolutionM: number;
  tileM: number;
  tileSamples: number;
  origin: HeroOrigin;
  areas: HeroAreaEntry[];
}

/** An area's water file, as `hero.py` writes it (F73). */
export interface HeroWater {
  file: string;
  codec: string;
  /** The file's own size; `bytes` is what it decodes to. */
  fileBytes: number;
  channels: number;
  tileSamples: number;
  offsetStepM: number;
  offsetZero: number;
  reachM: number;
  classes: WaterClasses;
  tiles: number;
  tilesWithWater: number;
  bytes: number;
  sha256: string;
  /** The heights file it was cut against, which has to be this area's. */
  heightsSha256: string;
}

/** One area's own manifest, written beside its heights by `hero.py`. */
export interface HeroManifest {
  version: number;
  area: string;
  name: string;
  resolutionM: number;
  tileM: number;
  tileSamples: number;
  silhouetteBias: number;
  window: HeroWindow;
  origin: HeroOrigin;
  countryTiles: number[][];
  holds: string[];
  heights: { file: string; tiles: number; bytes: number; sha256: string };
  water?: HeroWater;
  boundary: { meanM?: number; worstM?: number; skirtDepthM?: number; unchecked?: boolean };
  elevationM: { min: number; max: number };
  /** What stage 3 read and did to this area as it was cut (F63). */
  conditioning?: { rule?: string; radiusCells?: number; sha256?: string };
}

/** A rectangle of the world, in metres from the country grid's south-west corner. */
export interface AreaBounds {
  eastM0: number;
  northM0: number;
  eastM1: number;
  northM1: number;
}

/** One area's manifest and its heights, however they were fetched. */
export interface HeroAreaData {
  manifest: HeroManifest;
  heights: Int16Array;
  /** Every tile's water, decoded, in the heights' order; absent flies it dry. */
  water?: Uint8Array;
}

/**
 * Why an area's water cannot be drawn on its heights, or null when it can.
 * Checked on the decoded bytes, so a host that undid the gzip on the way is
 * no different from one that did not.
 */
export function heroWaterProblem(area: HeroAreaData): string | null {
  const water = area.manifest.water;
  if (!water || !area.water) return null;
  const m = area.manifest;
  if (water.codec !== WATER_CODEC) return `${m.area}: water is coded ${water.codec}, the engine reads ${WATER_CODEC}`;
  const layout = waterLayoutProblem(water);
  if (layout) return `${m.area}: ${layout}`;
  if (water.heightsSha256 !== m.heights.sha256) {
    return `${m.area}: water was cut against other heights than these: re-run \`make hero\``;
  }
  const expected = m.heights.tiles * water.tileSamples * water.tileSamples * WATER_CHANNELS;
  if (water.tileSamples !== m.tileSamples || area.water.length !== expected) {
    return `${m.area}: ${area.water.length} bytes of water, its heights want ${expected}`;
  }
  return null;
}

/** Whether a tile of water has anything to draw: `water.has_water`. */
function wet(bytes: Uint8Array): boolean {
  for (let k = 0; k < bytes.length; k += WATER_CHANNELS) {
    if (bytes[k + 2] !== NO_RIVER || bytes[k + 3] !== WATER_LAND) return true;
  }
  return false;
}

/**
 * Every hero area published for one corridor, as a single position-addressed
 * source.
 *
 * `TileSource.request` is here so the renderer's tile loop is the same loop it
 * runs over the country grid - but the indices it takes are hero indices, and
 * nothing else in the engine may assume otherwise. The position methods are
 * what callers that hold metres should use.
 */
export class HeroCover implements TileSource {
  readonly pending = 0;
  readonly tileM: number;
  readonly tileSamples: number;
  readonly resolutionM: number;
  readonly origin: HeroOrigin;
  private readonly areas: HeroAreaData[] = [];
  /** Announced by manifest, heights still to come, by area id. */
  private readonly awaiting = new Map<string, HeroManifest>();
  private readonly stride: number;
  /** Per area, per tile: its water, or `NO_WATER` for a dry one. Absent flies it dry. */
  private readonly waters = new Map<HeroAreaData, Uint8Array[]>();
  /** Why an area's water was passed over, for the HUD and the console. */
  readonly waterRefused: string[] = [];
  /**
   * A tile's water, in `TileSource`'s answer shape. Defined only when some
   * area has water, so hero cover cut before F73 costs no water texture.
   */
  readonly water?: (hx: number, hy: number) => Uint8Array | null;

  constructor(index: HeroIndex, areas: HeroAreaData[], awaiting: readonly HeroManifest[] = []) {
    this.tileM = index.tileM;
    this.tileSamples = index.tileSamples;
    this.resolutionM = index.resolutionM;
    this.origin = index.origin;
    this.stride = index.tileSamples * index.tileSamples;

    if (index.tileSamples !== HERO_TILE_SAMPLES) {
      throw new Error(
        `hero index tileSamples ${index.tileSamples} != engine ${HERO_TILE_SAMPLES}`,
      );
    }
    if (index.tileM !== index.resolutionM * (index.tileSamples - 1)) {
      throw new Error(
        `hero index says ${index.tileM} m tiles of ${index.resolutionM} m cells, ` +
          `which is not ${index.tileSamples} samples`,
      );
    }

    for (const m of awaiting) {
      this.fits(m);
      this.awaiting.set(m.area, m);
    }
    for (const area of areas) this.admit(area);
    // Decided now, because a lattice decides at construction whether it has
    // a water texture at all: an area whose water arrives later needs one.
    const anyWater = this.waters.size > 0 || awaiting.some((m) => m.water !== undefined);
    if (anyWater) this.water = (hx, hy) => this.waterOf(hx, hy);
  }

  /** What the cover holds, for the HUD and the console. */
  get label(): string {
    const tiles = this.areas.reduce((n, a) => n + a.manifest.heights.tiles, 0);
    const wetText = this.waters.size > 0 ? `, ${this.wetTiles} with water` : "";
    const waiting = this.awaiting.size > 0 ? `; ${[...this.awaiting.keys()].join(", ")} to come` : "";
    return this.areas.length === 0 && this.awaiting.size === 0
      ? "no hero cover"
      : `${this.areas.map((a) => a.manifest.area).join(", ") || "none yet"} ` +
          `(${tiles} tiles at ${this.resolutionM} m${wetText})${waiting}`;
  }

  /** Areas announced by their manifests whose heights have not arrived. */
  get awaitingAreas(): readonly string[] {
    return [...this.awaiting.keys()];
  }

  /** An announced area's manifest, while its heights are still to come. */
  awaitingManifest(id: string): HeroManifest | undefined {
    return this.awaiting.get(id);
  }

  /**
   * Give an announced area its heights (a scene pack has arrived, stage 4).
   * From the next frame the terrain draws it and cuts the country grid for
   * it; until then it was neither, because an area is drawn whole or not at
   * all.
   */
  addArea(area: HeroAreaData): void {
    const id = area.manifest.area;
    if (this.areas.some((a) => a.manifest.area === id)) return;
    this.admit(area);
    this.awaiting.delete(id);
    this.lowest = null;
  }

  /** One lattice or none: an area cut at another resolution or origin is refused. */
  private fits(m: HeroManifest): void {
    // Two areas cut at different resolutions cannot share a texture array,
    // and silently keeping the first would put the second somewhere it is not.
    if (m.tileM !== this.tileM || m.tileSamples !== this.tileSamples) {
      throw new Error(
        `${m.area} is ${m.tileSamples} samples of ${m.tileM} m, ` +
          `the index says ${this.tileSamples} of ${this.tileM} m`,
      );
    }
    if (m.origin.originXM !== this.origin.originXM || m.origin.originYM !== this.origin.originYM) {
      throw new Error(`${m.area} is indexed from a different origin than the index`);
    }
  }

  private admit(area: HeroAreaData): void {
    const m = area.manifest;
    this.fits(m);
    const w = m.window;
    const expected = (w.hx1 - w.hx0) * (w.hy1 - w.hy0) * this.stride;
    if (area.heights.length !== expected) {
      throw new Error(`${m.area} holds ${area.heights.length} samples, its manifest wants ${expected}`);
    }
    this.areas.push(area);

    const problem = heroWaterProblem(area);
    if (problem) {
      this.waterRefused.push(problem);
      console.warn(`hero water passed over: ${problem}`);
    } else if (area.water) {
      const bytes = this.stride * WATER_CHANNELS;
      const tiles: Uint8Array[] = [];
      for (let t = 0; t < m.heights.tiles; t++) {
        const tile = area.water.subarray(t * bytes, (t + 1) * bytes);
        tiles.push(wet(tile) ? tile : NO_WATER);
      }
      this.waters.set(area, tiles);
    }
  }

  get areaCount(): number {
    return this.areas.length;
  }

  private lowest: number | null = null;

  /**
   * The lowest sample any area holds, in metres: what the country's curtain
   * along a rim hangs below (F74). Read off the heights rather than the
   * manifests, since it is the ground drawn that the curtain has to reach.
   */
  get lowestM(): number {
    if (this.lowest === null) {
      let lowest = Infinity;
      for (const { heights } of this.areas) {
        for (let k = 0; k < heights.length; k++) lowest = Math.min(lowest, heights[k]!);
      }
      // An area still to come hangs the curtain by its manifest, which
      // hero.py writes from the same heights (checked for all seven, F84).
      for (const m of this.awaiting.values()) lowest = Math.min(lowest, m.elevationM.min);
      this.lowest = Number.isFinite(lowest) ? lowest : 0;
    }
    return this.lowest;
  }

  /** The hero tile holding a position given in metres from the country origin. */
  tileAt(eastM: number, northM: number): { hx: number; hy: number } {
    return {
      hx: Math.floor(eastM / this.tileM),
      hy: Math.floor(northM / this.tileM),
    };
  }

  /** Is there 90 m ground at this position? */
  covers(eastM: number, northM: number): boolean {
    const { hx, hy } = this.tileAt(eastM, northM);
    return this.find(hx, hy) !== null;
  }

  /**
   * The 90 m ground at a position, or null where this cover has none.
   *
   * The renderer does not call this -- it reads the texture array, because
   * only a resident tile can be drawn. This is the same number for a caller
   * that holds the whole area in memory and has no frame to be in: a content
   * check asking what the game would draw here, which is a question the 1 km
   * corridor those checks are cut from cannot answer (F53).
   *
   * Both go through `bilinearSample`, so "the same number" is by construction
   * and not by inspection.
   */
  groundAt(eastM: number, northM: number): number | null {
    const { hx, hy } = this.tileAt(eastM, northM);
    const tile = this.request(hx, hy);
    if (tile === null) return null;
    return bilinearSample(
      tile,
      0,
      this.tileSamples,
      (eastM - hx * this.tileM) / this.tileM,
      (northM - hy * this.tileM) / this.tileM,
    );
  }

  /** The area covering a position, by id, or null. */
  areaAt(eastM: number, northM: number): string | null {
    const { hx, hy } = this.tileAt(eastM, northM);
    return this.find(hx, hy)?.manifest.area ?? null;
  }

  /**
   * Each area's footprint, in metres from the country origin.
   *
   * This is the overlap rule's other half: the country grid must not be drawn
   * inside these rectangles, because inside them it is the wrong ground rather
   * than a coarser version of the right one.
   */
  bounds(): AreaBounds[] {
    // Announced areas too: the terrain sizes its lattice and its rim for
    // every area it may draw, and draws only those whose heights are here.
    const manifests = [...this.areas.map((a) => a.manifest), ...this.awaiting.values()];
    return manifests.map(({ window: w }) => ({
      eastM0: w.hx0 * this.tileM,
      northM0: w.hy0 * this.tileM,
      eastM1: w.hx1 * this.tileM,
      northM1: w.hy1 * this.tileM,
    }));
  }

  /** Hero tile indices, not country ones. */
  request(hx: number, hy: number): Int16Array | null {
    const area = this.find(hx, hy);
    if (area === null) return null;
    const w = area.manifest.window;
    const index = (hy - w.hy0) * (w.hx1 - w.hx0) + (hx - w.hx0);
    const start = index * this.stride;
    return area.heights.subarray(start, start + this.stride);
  }

  /** Hero tile indices. Dry, or in an area with no water, is `NO_WATER`. */
  private waterOf(hx: number, hy: number): Uint8Array | null {
    const area = this.find(hx, hy);
    if (area === null) return null;
    const tiles = this.waters.get(area);
    if (!tiles) return NO_WATER;
    const w = area.manifest.window;
    return tiles[(hy - w.hy0) * (w.hx1 - w.hx0) + (hx - w.hx0)] ?? NO_WATER;
  }

  /** How many tiles of all the cover carry water. */
  get wetTiles(): number {
    let n = 0;
    for (const tiles of this.waters.values()) n += tiles.filter((t) => t !== NO_WATER).length;
    return n;
  }

  private find(hx: number, hy: number): HeroAreaData | null {
    for (const area of this.areas) {
      const w = area.manifest.window;
      if (hx >= w.hx0 && hx < w.hx1 && hy >= w.hy0 && hy < w.hy1) return area;
    }
    return null;
  }
}

/**
 * Fetch every hero area published for a corridor.
 *
 * Resolves to null when there is no index, which is the normal state of a
 * corridor built before stage 6 ran and of a checkout with no world at all.
 * The app then flies the country grid alone, exactly as it did.
 */
/** The hero lattices a world may carry, as directories under it: one resolution each. */
export const HERO_DIRS = ["hero", "hero-30m"] as const;

/** Every hero cover a world publishes, one per lattice directory that exists. */
export async function loadHeroCovers(baseUrl: string, options: HeroLoadOptions = {}): Promise<HeroCover[]> {
  const covers = await Promise.all(HERO_DIRS.map((dir) => loadHeroCover(baseUrl, dir, options)));
  return covers.filter((c): c is HeroCover => c !== null);
}

export interface HeroLoadOptions {
  /**
   * False to fetch the manifests only, announcing every area and leaving its
   * heights to arrive in a scene pack (stage 4). True, the default, fetches
   * every area whole before the cover exists.
   */
  readonly heights?: boolean;
}

/**
 * An area's heights and water as a scene pack carries them: the heights
 * coded like a country tile (delta, byte planes, gzip) as one field a tile
 * wide and every tile tall, and the water exactly as `hero.py` wrote it.
 */
export async function decodeHeroArea(
  manifest: HeroManifest,
  codedHeights: Uint8Array,
  codedWater: Uint8Array | null,
): Promise<HeroAreaData> {
  const samples = manifest.tileSamples;
  const tiles = manifest.heights.tiles;
  const heights = await decodeField(codedHeights, samples, samples * tiles);
  const area: HeroAreaData = { manifest, heights };
  if (codedWater && manifest.water) area.water = await decodeWaterArea(codedWater, manifest.water.tileSamples, manifest.water.tiles);
  return area;
}

export async function loadHeroCover(
  baseUrl: string,
  dir: string = "hero",
  options: HeroLoadOptions = {},
): Promise<HeroCover | null> {
  let index: HeroIndex;
  try {
    const response = await fetch(`${baseUrl}/${dir}/index.json`);
    if (!response.ok) return null;
    index = (await response.json()) as HeroIndex;
  } catch {
    return null;
  }
  if (index.areas.length === 0) return null;

  if (options.heights === false) {
    const manifests = await Promise.all(
      index.areas.map(async (entry): Promise<HeroManifest> => {
        const response = await fetch(`${baseUrl}/${dir}/${entry.file}`);
        if (!response.ok) throw new Error(`${entry.file}: ${response.status} ${response.statusText}`);
        return (await response.json()) as HeroManifest;
      }),
    );
    return new HeroCover(index, [], manifests);
  }

  const areas = await Promise.all(
    index.areas.map(async (entry): Promise<HeroAreaData> => {
      const manifestResponse = await fetch(`${baseUrl}/${dir}/${entry.file}`);
      if (!manifestResponse.ok) {
        throw new Error(
          `${entry.file}: ${manifestResponse.status} ${manifestResponse.statusText}`,
        );
      }
      return loadHeroArea(baseUrl, dir, (await manifestResponse.json()) as HeroManifest);
    }),
  );

  return new HeroCover(index, areas);
}

/** One area's heights and water, fetched as `hero.py` published them. */
export async function loadHeroArea(baseUrl: string, dir: string, manifest: HeroManifest): Promise<HeroAreaData> {
  const heightsResponse = await fetch(`${baseUrl}/${dir}/${manifest.heights.file}`);
  if (!heightsResponse.ok) {
    throw new Error(`${manifest.heights.file}: ${heightsResponse.status} ${heightsResponse.statusText}`);
  }
  const bytes = await heightsResponse.arrayBuffer();
  if (bytes.byteLength !== manifest.heights.bytes) {
    throw new Error(`${manifest.heights.file} is ${bytes.byteLength} bytes, its manifest says ${manifest.heights.bytes}`);
  }
  const area: HeroAreaData = { manifest, heights: new Int16Array(bytes) };
  const water = await loadHeroWater(baseUrl, dir, manifest);
  if (water) area.water = water;
  return area;
}

/**
 * An area's water, decoded, or null to fly it dry. A water file that will not
 * come is not a reason to lose the ground it lies on, so this warns rather
 * than throws: the heights are what an area cannot be drawn without.
 */
async function loadHeroWater(baseUrl: string, dir: string, manifest: HeroManifest): Promise<Uint8Array | null> {
  const water = manifest.water;
  if (!water) return null;
  try {
    const response = await fetch(`${baseUrl}/${dir}/${water.file}`);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return await decodeWaterArea(bytes, water.tileSamples, water.tiles);
  } catch (error) {
    console.warn(`${water.file}: flying ${manifest.area} dry`, error);
    return null;
  }
}
