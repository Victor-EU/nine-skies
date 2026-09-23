/**
 * The film's scene packs at run time (plan v2, stage 4): fetched one at a
 * time, the playing scene's first and the next one behind it, and the only
 * place the terrain's tiles come from.
 *
 * The terrain asks for a tile by URL, as it always has (`FetchBytes`), and
 * this answers from whichever pack holds it, waiting for that pack when it
 * is on its way. A tile no pack holds is fetched on its own and counted: the
 * horizon field is the one file meant to arrive that way, and anything else
 * is a hole in the packs (`__ns.packs.stats`). A hero area arrives with its
 * scene's pack and is handed to its cover, which draws it from the next frame.
 *
 * With no packs to hand - a checkout that has not run `make scenes` - every
 * pack fails, every tile is fetched on its own, and each hero area is
 * fetched whole as before: slower, and the same film.
 */
import { readPack, type PackHeader } from "../../engine/src/film/pack.js";
import { decodeHeroArea, loadHeroArea, type HeroCover } from "../../engine/src/terrain/heroSource.js";
import { fetchBytes, type FetchBytes, type TileIndex } from "../../engine/src/terrain/tileStream.js";

export interface PackIndexScene {
  readonly id: string;
  readonly file: string;
  readonly bytes: number;
  /** Flat pairs: tx, ty, tx, ty, ... */
  readonly tiles: readonly number[];
  readonly hero: { readonly dir: string; readonly area: string; readonly bytes: number } | null;
}

export interface PackIndex {
  readonly version: number;
  readonly world: string;
  readonly heightsSha256: string;
  readonly totalBytes: number;
  readonly scenes: readonly PackIndexScene[];
}

export async function loadPackIndex(url: string): Promise<PackIndex | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as PackIndex;
  } catch {
    return null;
  }
}

export interface PackStats {
  packs: number;
  bytes: number;
  failed: number;
  /** Tiles fetched on their own that are not the horizon: holes in the packs. */
  misses: number;
  missNames: string[];
}

type State = "queued" | "loading" | "loaded" | "failed";

const nameOf = (url: string): string => url.slice(url.lastIndexOf("/") + 1).replace(/\.bin$/, "");

export class ScenePacks {
  readonly stats: PackStats = { packs: 0, bytes: 0, failed: 0, misses: 0, missNames: [] };
  private readonly held = new Map<string, Uint8Array>();
  private readonly owners = new Map<string, number[]>();
  private readonly state = new Map<number, State>();
  private readonly waiters = new Map<number, Array<() => void>>();
  private queue: number[] = [];
  private busy = false;
  private current = 0;
  private covers: readonly HeroCover[] = [];
  private horizonName: string | null = null;
  private attached = false;

  constructor(
    readonly index: PackIndex,
    /** Where pack files are served from, joined with each scene's `file`. */
    private readonly baseUrl: string,
    /** The world's own base, for a hero area whose pack will not come. */
    private readonly worldUrl: string,
    private readonly fetch: FetchBytes = fetchBytes,
  ) {}

  /**
   * Learn which tile names each pack holds, from the world's tile index, and
   * which covers its hero areas go to. Until this, requests pass straight
   * through: the only one made before it is the horizon field.
   */
  attach(tiles: TileIndex, covers: readonly HeroCover[]): void {
    const w = tiles.window;
    const width = w.tx1 - w.tx0;
    this.horizonName = tiles.horizon?.name ?? null;
    this.covers = covers;
    if (tiles.heightsSha256 !== this.index.heightsSha256) {
      console.warn("scene packs were cut from other heights than this world's; fetching tiles one at a time");
      for (let i = 0; i < this.index.scenes.length; i++) this.state.set(i, "failed");
    }
    this.index.scenes.forEach((scene, i) => {
      for (let k = 0; k < scene.tiles.length; k += 2) {
        const tx = scene.tiles[k]!;
        const ty = scene.tiles[k + 1]!;
        if (tx < w.tx0 || tx >= w.tx1 || ty < w.ty0 || ty >= w.ty1) continue;
        const at = (ty - w.ty0) * width + (tx - w.tx0);
        for (const name of [tiles.names[at], tiles.water?.names[at]]) {
          if (!name) continue;
          const list = this.owners.get(name);
          if (!list) this.owners.set(name, [i]);
          else if (list[list.length - 1] !== i) list.push(i);
        }
      }
    });
    this.attached = true;
  }

  /** The scene now playing: its pack first, then the next one's. */
  play(i: number): void {
    this.current = i;
    this.want(i, true);
    if (i + 1 < this.index.scenes.length) this.want(i + 1, false);
    // Packs refused wholesale still owe their scenes a hero.
    for (const j of [i, i + 1]) {
      const hero = this.index.scenes[j]?.hero;
      if (hero && this.state.get(j) === "failed") void this.heroWithoutPack(hero.dir, hero.area);
    }
  }

  /** Whether scene `i`'s pack is in (or will not come). */
  isSettled(i: number): boolean {
    const s = this.state.get(i);
    return s === "loaded" || s === "failed";
  }

  /** `FetchBytes` for the tile source: from a pack when one holds the file. */
  readonly fetchTile: FetchBytes = async (url) => {
    const name = nameOf(url);
    const have = this.held.get(name);
    if (have) return have;
    const owners = this.attached ? this.owners.get(name) : undefined;
    if (owners) {
      const i = owners.includes(this.current) ? this.current : owners[0]!;
      if (!owners.some((o) => this.state.get(o) === "loaded" || this.state.get(o) === "loading")) this.want(i, true);
      const waitFor = owners.find((o) => this.state.get(o) === "loading") ?? owners.find((o) => this.state.get(o) === "loaded") ?? i;
      await this.settled(waitFor);
      const got = this.held.get(name);
      if (got) return got;
    }
    // Before `attach` the one request is the horizon field, whose name is not known yet.
    if (this.attached && name !== this.horizonName) {
      this.stats.misses++;
      if (this.stats.missNames.length < 20) this.stats.missNames.push(name);
    }
    return this.fetch(url);
  };

  private want(i: number, first: boolean): void {
    if (i < 0 || i >= this.index.scenes.length) return;
    const s = this.state.get(i);
    if (s === "loaded" || s === "loading" || s === "failed") return;
    this.queue = this.queue.filter((q) => q !== i);
    if (first) this.queue.unshift(i);
    else this.queue.push(i);
    this.state.set(i, "queued");
    void this.pump();
  }

  private settled(i: number): Promise<void> {
    if (this.isSettled(i)) return Promise.resolve();
    return new Promise((resolve) => {
      const list = this.waiters.get(i) ?? [];
      list.push(resolve);
      this.waiters.set(i, list);
    });
  }

  private async pump(): Promise<void> {
    if (this.busy) return;
    const i = this.queue.shift();
    if (i === undefined) return;
    this.busy = true;
    this.state.set(i, "loading");
    const scene = this.index.scenes[i]!;
    let header: PackHeader | null = null;
    try {
      const bytes = await this.fetch(`${this.baseUrl}/${scene.file}`);
      const pack = readPack(bytes);
      header = pack.header;
      if (header.heightsSha256 !== this.index.heightsSha256) throw new Error("cut from other heights than its index");
      for (const e of header.files) this.held.set(e.name, pack.file(e));
      if (header.hero) {
        const h = header.hero;
        const cover = this.covers.find((c) => c.awaitingManifest(h.area));
        const manifest = cover?.awaitingManifest(h.area);
        if (cover && manifest) cover.addArea(await decodeHeroArea(manifest, pack.file(h.heights), h.water ? pack.file(h.water) : null));
      }
      this.stats.packs++;
      this.stats.bytes += bytes.length;
      this.state.set(i, "loaded");
    } catch (error) {
      console.warn(`scene pack ${scene.file} did not come; its tiles will be fetched one at a time`, error);
      this.stats.failed++;
      this.state.set(i, "failed");
      if (scene.hero) void this.heroWithoutPack(scene.hero.dir, scene.hero.area);
    }
    for (const resolve of this.waiters.get(i) ?? []) resolve();
    this.waiters.delete(i);
    this.busy = false;
    void this.pump();
  }

  /** The area fetched whole from the world, as before packs: a checkout without them still has its heroes. */
  private async heroWithoutPack(dir: string, area: string): Promise<void> {
    const cover = this.covers.find((c) => c.awaitingManifest(area));
    const manifest = cover?.awaitingManifest(area);
    if (!cover || !manifest) return;
    try {
      cover.addArea(await loadHeroArea(this.worldUrl, dir, manifest));
    } catch (error) {
      console.warn(`${area}: no pack and no heights; the country grid draws it`, error);
    }
  }
}
