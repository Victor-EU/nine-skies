import {
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from "three";
import { decodeColourImage, type ColourImage } from "./colour.js";
import { fetchBytes, type FetchBytes } from "./tileStream.js";

/**
 * The walls' rock (F92): photographed cliff faces, laid on the ground that
 * stands steeper than a photograph from above can show.
 *
 * The film draws relief six times steeper than the ground's (F14), so a
 * wall carries about six times the surface its satellite photograph covers,
 * and that photograph's texels ran down it as streaks. On steep ground the
 * shader now reads the photograph blurred to the wall's stretch, for its
 * tone, and lays one of these faces over it: Poly Haven's scans of real
 * rock (CC0), cut by `pipeline/nineskies/rock.py`. Each face is a colour
 * with its height, as a percentile, in alpha, and a normal map.
 *
 * A scene's palette names its face (`ScenePalette.rockFace`); one is held
 * at a time, 11 MB of GPU memory with its mips, and the next is loaded when
 * a scene names another.
 */

export interface RockFaceEntry {
  readonly name: string;
  readonly scan: string;
  readonly title: string;
  readonly url: string;
  readonly authors: readonly string[];
  /** Real metres the scan spans. */
  readonly acrossM: number;
  readonly samples: number;
  /** Colour, and height as a percentile in alpha. */
  readonly albedo: string;
  /** Normals, OpenGL's convention: +y up the image. */
  readonly normal: string;
  /** The colour's mean, linear: the shader divides it out to tint the face. */
  readonly meanLinear: readonly [number, number, number];
}

export interface RockIndex {
  readonly version: number;
  readonly source: string;
  readonly licence: string;
  readonly licenceUrl: string;
  readonly rocks: readonly RockFaceEntry[];
}

/** A face on the GPU. */
export interface RockFace {
  readonly entry: RockFaceEntry;
  readonly albedo: Texture;
  readonly normal: Texture;
}

export const ROCK_INDEX_VERSION = 1;

/**
 * Real metres a face spans on a wall, by the spacing of the grid it lies on:
 * seventeen samples, so a face is the size of the relief its grid can draw,
 * and no more than 1.5 km, which the country grid's 1 km samples would pass.
 * The shader fits a whole number of faces to a tile: eight to a hero tile,
 * 480 m on Guilin's and Huangshan's 30 m grids and 1,440 m on the 90 m ones,
 * whose walls are three times the size; 42 to a country tile.
 */
export function rockAcrossM(sampleM: number): number {
  return Math.min(17 * sampleM, 1_536);
}

/** What is wrong with an index, or null. */
export function rockProblem(index: RockIndex): string | null {
  if (index.version !== ROCK_INDEX_VERSION) return `rock index version ${index.version}, not ${ROCK_INDEX_VERSION}`;
  for (const r of index.rocks) {
    if (!r.albedo || !r.normal) return `rock ${r.name} has no files`;
    if (r.meanLinear.length !== 3 || r.meanLinear.some((v) => !(v > 0))) return `rock ${r.name} has no mean colour`;
  }
  return null;
}

export async function loadRockIndex(url: string, fetch: FetchBytes = fetchBytes): Promise<RockIndex | null> {
  try {
    const index = JSON.parse(new TextDecoder().decode(await fetch(url))) as RockIndex;
    const problem = rockProblem(index);
    if (problem) {
      console.warn(`walls' rock passed over: ${problem}`);
      return null;
    }
    return index;
  } catch {
    return null;
  }
}

function texture(image: ColourImage, colour: boolean): Texture {
  const t = new Texture(image.source as ImageBitmap);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  // An ImageBitmap is uploaded as decoded, top row first, whatever `flipY` says.
  t.flipY = false;
  t.premultiplyAlpha = false;
  t.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** The faces a world has, one loaded at a time. */
export class RockFaces {
  private held: RockFace | null = null;
  private loading: { name: string; done: Promise<RockFace | null> } | null = null;

  constructor(
    readonly index: RockIndex,
    private readonly baseUrl: string,
    private readonly fetch: FetchBytes = fetchBytes,
    private readonly decode: (bytes: Uint8Array) => Promise<ColourImage> = decodeColourImage,
  ) {}

  /** The entry for a face, or undefined. */
  entry(name: string): RockFaceEntry | undefined {
    return this.index.rocks.find((r) => r.name === name);
  }

  /** True while a face is on its way. */
  get pending(): boolean {
    return this.loading !== null;
  }

  /**
   * The face named, loaded (and the one held before it let go), or null for
   * a name the index does not have or files that will not load.
   */
  face(name: string): Promise<RockFace | null> {
    if (this.held?.entry.name === name) return Promise.resolve(this.held);
    if (this.loading?.name === name) return this.loading.done;
    const entry = this.entry(name);
    if (!entry) return Promise.resolve(null);
    const done = this.load(entry).then(
      (face) => {
        if (this.loading?.name === name) this.loading = null;
        if (face) {
          if (this.held && this.held !== face) {
            this.held.albedo.dispose();
            this.held.normal.dispose();
          }
          this.held = face;
        }
        return face;
      },
      (error: unknown) => {
        if (this.loading?.name === name) this.loading = null;
        console.warn(`rock face ${name} would not load`, error);
        return null;
      },
    );
    this.loading = { name, done };
    return done;
  }

  private async load(entry: RockFaceEntry): Promise<RockFace> {
    const [albedo, normal] = await Promise.all(
      [entry.albedo, entry.normal].map(async (file) => this.decode(await this.fetch(`${this.baseUrl}/${file}`))),
    );
    return { entry, albedo: texture(albedo!, true), normal: texture(normal!, false) };
  }
}
