import {
  BufferAttribute,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  Vector3,
  Vector4,
  type ShaderMaterial,
} from "three";
import { LOD_SEGMENTS, buildGrid, lodForDistance, type LodLevel } from "./grid.js";
import { HeightTileArray, MAX_LAYERS, TILE_SAMPLES } from "./tileArray.js";
import { TILE_KM } from "./syntheticTiles.js";
import { SyntheticTileSource, type TileSource } from "./tileSource.js";
import type { AreaBounds, HeroCover } from "./heroSource.js";
import { createTerrainMaterial, MAX_CUT_RECTS } from "./terrainMaterial.js";
import {
  hazeDensityPerWorldUnit,
  hazeFalloffPerWorldUnit,
  type WorldScale,
} from "../sim/scale.js";
import { DEFAULT_HAZE_DENSITY_PER_M, HAZE_SCALE_HEIGHT_M } from "./palette.js";

/**
 * Terrain renderer: four instanced draws, whatever the view holds.
 *
 * Tiles are addressed in real kilometres and drawn in world units. The camera
 * is kept near the origin (build plan D5) by subtracting a rebase point from
 * every instance origin - at 1:8 the world is 650 km of float32 across, which
 * is only about 6 cm of precision at the far edge and reads as camera jitter.
 *
 * TWO LATTICES, NOT ONE (F51)
 * ---------------------------
 * The country grid is 65 samples of 1 km; a hero area is 129 samples of 90 m
 * (D47). Those cannot share a draw: a texture array has one size for every
 * layer in it, the vertex shader's texel stride is baked into the geometry,
 * and `uTileWorldSize` is one number. So each lattice gets its own array, its
 * own four buckets and its own material, and this class holds both and keeps
 * one rebase point between them.
 *
 * Where they overlap, the finer one wins outright and the coarser is cut away
 * - see `terrainMaterial.ts` for why it cannot simply be drawn over.
 */

/**
 * How far the skirt ring drops below a tile edge, in real metres.
 *
 * Shared with `pipeline/nineskies/hero.py`, which refuses to publish a hero
 * area whose rim disagrees with the country grid by more than this - so the
 * number is a contract between the two, not a rendering constant, and the
 * pipeline's own test reads this file to check they still agree.
 */
export const SKIRT_DEPTH_M = 900;

/**
 * The hero grid's LOD ladder.
 *
 * 128 segments at the finest level, not the country grid's 64, because 129
 * samples strided by two is 180 m ground - which is not what a 90 m area is
 * for. Each level still halves, and 128 divides 128 at every one of them, so
 * every LOD lands on real samples.
 */
export const HERO_LOD_SEGMENTS = [128, 64, 32, 16] as const;

export interface TerrainOptions {
  scale: WorldScale;
  /** How many tiles out to draw, in each direction. */
  viewRadiusTiles: number;
  layers: number;
  /** Where heightmaps come from. Defaults to the stand-in world. */
  source?: TileSource;
  /**
   * 90 m cover over a few named places. Null - the default - is the world as
   * it was: one lattice, no cuts, and a shader with no `discard` in it.
   */
  hero?: HeroCover | null;
}

export interface TerrainStats {
  drawCalls: number;
  instances: number;
  triangles: number;
  resident: number;
  generatedThisFrame: number;
  /** Tiles the view wanted and the source could not supply. */
  missing: number;
  /**
   * Of those, how many the source is fetching. Zero for a world that arrived
   * whole; while a streamed one is arriving it is what says the view is not
   * finished, where `generatedThisFrame` only says nothing landed this frame
   * (F67).
   */
  pending: number;
  /**
   * Instances in each bucket, nearest first; sums to `instances`.
   *
   * Kept because the totals hide the number the frame budget is about: 8,192
   * triangles of L0 and 128 of L3 are the same triangle to `triangles` and
   * are not the same draw. Index-aligned with `meshes`, so when hero cover is
   * flying this is eight entries rather than four - `bucketLabels` says which
   * is which.
   */
  perLod: number[];
  /** One name per bucket, index-aligned with `perLod` and `meshes`. */
  bucketLabels: string[];
  /** Of the totals above, what the hero lattice contributed. */
  hero: {
    areasDrawn: number;
    instances: number;
    triangles: number;
    resident: number;
  };
}

interface LodBucket {
  mesh: Mesh;
  geometry: InstancedBufferGeometry;
  origins: InstancedBufferAttribute;
  layers: InstancedBufferAttribute;
  trianglesPerInstance: number;
  count: number;
}

/**
 * One grid of tiles: its heightmaps, its geometry, its material, its draws.
 *
 * Everything here is in terms of `tileM` and `samples`, so the country grid
 * and a hero grid are the same code with different numbers in it.
 */
class TileLattice {
  readonly heights: HeightTileArray;
  readonly material: ShaderMaterial;
  readonly meshes: Mesh[] = [];
  readonly buckets: LodBucket[] = [];
  private readonly maxInstances: number;
  /** Tiles this lattice made resident during the current frame. */
  generated = 0;

  constructor(
    readonly name: string,
    readonly tileM: number,
    readonly samples: number,
    readonly segments: readonly number[],
    readonly source: TileSource,
    layers: number,
    maxInstances: number,
    scale: WorldScale,
    hazeDensityPerM: number,
    maxCuts: number,
  ) {
    this.maxInstances = maxInstances;
    this.heights = new HeightTileArray(layers, samples);
    this.material = createTerrainMaterial(this.heights.texture, {
      tileWorldSize: tileM / scale.horizontalCompression,
      verticalExaggeration: scale.verticalExaggeration,
      // Skirts must out-reach the worst height disagreement between LODs -
      // and, for a hero area, between grids: the cutter measures its own rim
      // against the country grid and refuses to publish one deeper than this.
      skirtDepth: SKIRT_DEPTH_M * scale.verticalExaggeration,
      sunDirection: new Vector3(0.45, 0.72, 0.53).normalize(),
      sunColor: new Color(1.0, 0.97, 0.92),
      hazeColor: new Color(0.72, 0.79, 0.86),
      maxCuts,
      // Authored per real metre; the shader integrates in world units.
      hazeDensity: hazeDensityPerWorldUnit(hazeDensityPerM, scale),
      hazeHeightFalloff: hazeFalloffPerWorldUnit(HAZE_SCALE_HEIGHT_M, scale),
    });
    for (const s of segments) this.buckets.push(this.makeBucket(s));
  }

  tileWorldSize(scale: WorldScale): number {
    return this.tileM / scale.horizontalCompression;
  }

  /** The tile holding a position, in metres from the country grid's corner. */
  tileOf(eastM: number, northM: number): { i: number; j: number } {
    return { i: Math.floor(eastM / this.tileM), j: Math.floor(northM / this.tileM) };
  }

  /** Ground under a position, or null if that tile is not resident. */
  sampleGroundM(eastM: number, northM: number): number | null {
    const { i, j } = this.tileOf(eastM, northM);
    return this.heights.sample(
      i,
      j,
      (eastM - i * this.tileM) / this.tileM,
      (northM - j * this.tileM) / this.tileM,
    );
  }

  beginFrame(): void {
    for (const b of this.buckets) b.count = 0;
    this.generated = 0;
  }

  /**
   * Make one tile resident if it is not, and queue it for drawing.
   * Returns false when the source has nothing for it.
   */
  place(
    i: number,
    j: number,
    lod: LodLevel,
    originEastM: number,
    originNorthM: number,
    scale: WorldScale,
  ): boolean {
    if (!this.heights.has(i, j)) {
      const samples = this.source.request(i, j);
      // Not ready, or outside the built world. Skip it and ask again next
      // frame rather than drawing a hole at sea level.
      if (samples === null) return false;
      this.heights.insert(i, j, samples);
      this.generated++;
    }
    const layer = this.heights.layerFor(i, j);
    if (layer < 0) return false;

    const b = this.buckets[lod]!;
    if (b.count >= this.maxInstances) return true;
    const c = scale.horizontalCompression;
    const arr = b.origins.array as Float32Array;
    arr[b.count * 2] = (i * this.tileM - originEastM) / c;
    arr[b.count * 2 + 1] = (j * this.tileM - originNorthM) / c;
    (b.layers.array as Float32Array)[b.count] = layer;
    b.count++;
    return true;
  }

  /** Upload, flip visibility, and report what this lattice costs the frame. */
  endFrame(): { drawCalls: number; instances: number; triangles: number } {
    this.heights.flush();
    let drawCalls = 0;
    let instances = 0;
    let triangles = 0;
    for (const b of this.buckets) {
      b.geometry.instanceCount = b.count;
      b.mesh.visible = b.count > 0;
      if (b.count === 0) continue;
      b.origins.needsUpdate = true;
      b.layers.needsUpdate = true;
      drawCalls++;
      instances += b.count;
      triangles += b.count * b.trianglesPerInstance;
    }
    return { drawCalls, instances, triangles };
  }

  setScale(scale: WorldScale, hazeDensityPerM: number): void {
    const u = this.material.uniforms;
    u.uTileWorldSize!.value = this.tileWorldSize(scale);
    u.uVerticalExaggeration!.value = scale.verticalExaggeration;
    u.uSkirtDepth!.value = SKIRT_DEPTH_M * scale.verticalExaggeration;
    // The air is a real quantity; only its expression in world units moves.
    u.uHazeHeightFalloff!.value = hazeFalloffPerWorldUnit(HAZE_SCALE_HEIGHT_M, scale);
    u.uHazeDensity!.value = hazeDensityPerWorldUnit(hazeDensityPerM, scale);
  }

  private makeBucket(segments: number): LodBucket {
    const grid = buildGrid(segments, this.samples);
    const geometry = new InstancedBufferGeometry();

    // `position` carries tile-local (u, 0, v); the shader builds the world
    // position from it plus the instance origin.
    const position = new Float32Array(grid.vertexCount * 3);
    for (let i = 0; i < grid.vertexCount; i++) {
      position[i * 3] = grid.uv[i * 2]!;
      position[i * 3 + 1] = 0;
      position[i * 3 + 2] = grid.uv[i * 2 + 1]!;
    }
    geometry.setAttribute("position", new BufferAttribute(position, 3));
    geometry.setAttribute("aTexel", new BufferAttribute(grid.texel, 2));
    geometry.setAttribute("aSkirt", new BufferAttribute(grid.skirt, 1));
    geometry.setIndex(new BufferAttribute(grid.index, 1));

    const origins = new InstancedBufferAttribute(
      new Float32Array(this.maxInstances * 2),
      2,
    );
    const layers = new InstancedBufferAttribute(
      new Float32Array(this.maxInstances),
      1,
    );
    origins.setUsage(35048 /* DynamicDrawUsage */);
    layers.setUsage(35048);
    geometry.setAttribute("iOrigin", origins);
    geometry.setAttribute("iLayer", layers);
    geometry.instanceCount = 0;

    const mesh = new Mesh(geometry, this.material);
    // The geometry is tile-local, so three's bounds are meaningless here and
    // its culling would throw the whole terrain away. We cull by tile instead.
    mesh.frustumCulled = false;
    this.meshes.push(mesh);

    return {
      mesh,
      geometry,
      origins,
      layers,
      trianglesPerInstance: grid.triangleCount,
      count: 0,
    };
  }
}

export class Terrain {
  readonly heights: HeightTileArray;
  readonly source: TileSource;
  readonly material: ShaderMaterial;
  readonly meshes: Mesh[] = [];
  /** Every material this terrain draws with; the app writes haze into all. */
  readonly materials: ShaderMaterial[] = [];
  readonly heroCover: HeroCover | null;
  private readonly country: TileLattice;
  private readonly hero: TileLattice | null;
  /** Each drawn area's rectangle, world units from the rebase point. */
  private readonly cutRects: Vector4[] = [];
  /** Every published area, in real metres. Fixed for the life of the cover. */
  private readonly publishedAreas: AreaBounds[];
  /** Those of them drawn this frame - and so cut out of the country grid. */
  private readonly drawnAreas: AreaBounds[] = [];
  /**
   * Extinction per **real** metre. Held in real units so a scale change
   * re-derives the uniform rather than inheriting whatever the last scale
   * left in it. The app overwrites it every frame with the blended region
   * value; this is what the first frame and the tests fly through.
   */
  private readonly hazeDensityPerM = DEFAULT_HAZE_DENSITY_PER_M;
  /** Rebase point in real metres; world units are measured from here. */
  private originEastM = 0;
  private originNorthM = 0;
  readonly stats: TerrainStats = {
    drawCalls: 0,
    instances: 0,
    triangles: 0,
    resident: 0,
    generatedThisFrame: 0,
    missing: 0,
    pending: 0,
    perLod: [],
    bucketLabels: [],
    hero: { areasDrawn: 0, instances: 0, triangles: 0, resident: 0 },
  };

  constructor(private readonly options: TerrainOptions) {
    this.source = options.source ?? new SyntheticTileSource();
    this.heroCover = options.hero ?? null;
    const span = options.viewRadiusTiles * 2 + 1;

    this.country = new TileLattice(
      "country",
      TILE_KM * 1000,
      TILE_SAMPLES,
      LOD_SEGMENTS,
      this.source,
      options.layers,
      span * span,
      options.scale,
      this.hazeDensityPerM,
      this.heroCover ? MAX_CUT_RECTS : 0,
    );
    this.heights = this.country.heights;
    this.material = this.country.material;

    this.publishedAreas = this.heroCover?.bounds() ?? [];

    if (this.heroCover) {
      if (this.publishedAreas.length > MAX_CUT_RECTS) {
        throw new Error(
          `${this.publishedAreas.length} hero areas published, the terrain ` +
            `shader can cut ${MAX_CUT_RECTS}`,
        );
      }
      const t = this.heroCover.tileM;
      const tiles = this.publishedAreas.reduce(
        (n, a) => n + ((a.eastM1 - a.eastM0) / t) * ((a.northM1 - a.northM0) / t),
        0,
      );
      // Every published tile is a layer of one array texture, because an area
      // is drawn whole (below) and there is therefore no eviction. WebGL2
      // guarantees 256 layers and no more, so this is the ceiling on the whole
      // cover rather than on any one area -- and with two areas published it
      // is 60 of them. Checked here rather than left to fail at upload, where
      // it would read as a driver problem (F52).
      if (tiles > MAX_LAYERS) {
        throw new Error(
          `hero cover is ${tiles} tiles and every one has to be resident at ` +
            `once; WebGL2 guarantees ${MAX_LAYERS} array layers`,
        );
      }
      this.hero = new TileLattice(
        "hero",
        this.heroCover.tileM,
        this.heroCover.tileSamples,
        HERO_LOD_SEGMENTS,
        this.heroCover,
        // An area is drawn whole or not at all, so every published tile has
        // to be able to be resident at once. There is no eviction story to
        // get wrong and the whole of this cover is under a megabyte.
        Math.max(1, tiles),
        tiles,
        options.scale,
        this.hazeDensityPerM,
        0,
      );
      for (let i = 0; i < MAX_CUT_RECTS; i++) this.cutRects.push(new Vector4());
    } else {
      this.hero = null;
    }

    for (const lattice of this.lattices) {
      this.materials.push(lattice.material);
      for (const [i, mesh] of lattice.meshes.entries()) {
        this.meshes.push(mesh);
        this.stats.perLod.push(0);
        this.stats.bucketLabels.push(
          lattice === this.country ? `L${i}` : `hero L${i}`,
        );
      }
    }
  }

  private get lattices(): TileLattice[] {
    return this.hero ? [this.country, this.hero] : [this.country];
  }

  get tileWorldSize(): number {
    return this.country.tileWorldSize(this.options.scale);
  }

  /** Convert a real position to world units, relative to the current rebase. */
  toWorld(eastM: number, northM: number, altitudeM: number): Vector3 {
    const c = this.options.scale.horizontalCompression;
    return new Vector3(
      (eastM - this.originEastM) / c,
      altitudeM * this.options.scale.verticalExaggeration,
      (northM - this.originNorthM) / c,
    );
  }

  /**
   * Ground elevation under a real position, in real metres.
   *
   * Reads the same Int16 buffers the GPU draws, so the HUD number and the
   * picture can never disagree - including which grid is under the aeroplane.
   * Where a hero area is resident it answers, because that is what is on
   * screen there; the country grid would be a different mountain. Over Tiger
   * Leaping Gorge the two differ by 390 m at the waypoint and by up to 764 m
   * inside the area (F51).
   */
  groundElevationM(eastM: number, northM: number): number | null {
    const fine = this.hero?.sampleGroundM(eastM, northM);
    if (fine !== null && fine !== undefined) return fine;
    return this.country.sampleGroundM(eastM, northM);
  }

  /** Is the aeroplane over 90 m ground right now? For the HUD to say so. */
  overHeroGround(eastM: number, northM: number): boolean {
    return this.hero?.sampleGroundM(eastM, northM) != null;
  }

  /**
   * Called once per frame with the aircraft's real position.
   * Makes nearby tiles resident, buckets the visible ones by LOD and fills the
   * instance buffers. Returns the camera's world-space position.
   */
  update(eastM: number, northM: number, altitudeM: number): Vector3 {
    this.rebaseIfNeeded(eastM, northM);

    const scale = this.options.scale;
    const radius = this.options.viewRadiusTiles;
    const tileM = TILE_KM * 1000;
    const centreX = Math.floor(eastM / tileM);
    const centreY = Math.floor(northM / tileM);
    const size = this.country.tileWorldSize(scale);

    for (const lattice of this.lattices) lattice.beginFrame();
    let missing = 0;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = centreX + dx;
        const ty = centreY + dy;
        if (tx < 0 || ty < 0) continue;

        // Circular rather than square view, so the corners cost nothing.
        const distTiles = Math.hypot(dx, dy);
        if (distTiles > radius + 0.5) continue;

        const lod = lodForDistance(distTiles * size, size);
        if (!this.country.place(tx, ty, lod, this.originEastM, this.originNorthM, scale))
          missing++;
      }
    }

    const heroStats = this.drawHeroAreas(eastM, northM, radius * tileM);
    this.publishCutRects();

    let drawCalls = 0;
    let instances = 0;
    let triangles = 0;
    let bucket = 0;
    for (const lattice of this.lattices) {
      const frame = lattice.endFrame();
      drawCalls += frame.drawCalls;
      instances += frame.instances;
      triangles += frame.triangles;
      for (const b of lattice.buckets) this.stats.perLod[bucket++] = b.count;
    }

    this.stats.drawCalls = drawCalls;
    this.stats.instances = instances;
    this.stats.triangles = triangles;
    this.stats.resident =
      this.country.heights.residentCount + (this.hero?.heights.residentCount ?? 0);
    this.stats.generatedThisFrame = this.country.generated + heroStats.generated;
    this.stats.missing = missing;
    this.stats.pending = this.source.pending;
    this.stats.hero = {
      areasDrawn: heroStats.areasDrawn,
      instances: heroStats.instances,
      triangles: heroStats.triangles,
      resident: this.hero?.heights.residentCount ?? 0,
    };

    const cameraWorld = this.toWorld(eastM, northM, altitudeM);
    for (const m of this.materials) {
      (m.uniforms.uCameraWorld!.value as Vector3).copy(cameraWorld);
    }
    return cameraWorld;
  }

  setScale(scale: WorldScale): void {
    this.options.scale = scale;
    for (const lattice of this.lattices) lattice.setScale(scale, this.hazeDensityPerM);
  }

  /**
   * Draw every hero area within reach, whole.
   *
   * Whole, because the cut is what makes this safe: the country grid is
   * removed exactly where hero tiles are drawn, so an area that streamed in
   * tile by tile would show sky through its unfinished half. An area is under
   * a megabyte and already in memory, so "all of it or none of it" costs
   * nothing and cannot get out of step with the hole it punches.
   */
  private drawHeroAreas(
    eastM: number,
    northM: number,
    reachM: number,
  ): { areasDrawn: number; instances: number; triangles: number; generated: number } {
    this.drawnAreas.length = 0;
    if (!this.hero) {
      return { areasDrawn: 0, instances: 0, triangles: 0, generated: 0 };
    }
    const scale = this.options.scale;
    const tileM = this.hero.tileM;
    const size = this.hero.tileWorldSize(scale);
    let instances = 0;
    let triangles = 0;

    for (const area of this.publishedAreas) {
      // Distance from the camera to the rectangle, zero when inside it.
      const dx = Math.max(area.eastM0 - eastM, 0, eastM - area.eastM1);
      const dy = Math.max(area.northM0 - northM, 0, northM - area.northM1);
      if (Math.hypot(dx, dy) > reachM) continue;

      let drawn = 0;
      for (let hy = area.northM0 / tileM; hy < area.northM1 / tileM; hy++) {
        for (let hx = area.eastM0 / tileM; hx < area.eastM1 / tileM; hx++) {
          const centreE = (hx + 0.5) * tileM;
          const centreN = (hy + 0.5) * tileM;
          const distTiles = Math.hypot(eastM - centreE, northM - centreN) / tileM;
          const lod = lodForDistance(distTiles * size, size);
          if (this.hero.place(hx, hy, lod, this.originEastM, this.originNorthM, scale)) {
            drawn++;
            triangles += this.hero.buckets[lod]!.trianglesPerInstance;
          }
        }
      }
      // A hole is only safe if something fills it. An area that could not be
      // drawn whole is not cut out of the country grid either.
      const wanted =
        ((area.eastM1 - area.eastM0) / tileM) * ((area.northM1 - area.northM0) / tileM);
      if (drawn === wanted) {
        this.drawnAreas.push(area);
        instances += drawn;
      }
    }

    return {
      areasDrawn: this.drawnAreas.length,
      instances,
      triangles,
      generated: this.hero.generated,
    };
  }

  /** The drawn areas, in world units from the rebase point, into the shader. */
  private publishCutRects(): void {
    const u = this.country.material.uniforms.uCutCount;
    if (!u) return;
    const c = this.options.scale.horizontalCompression;
    for (const [i, area] of this.drawnAreas.entries()) {
      this.cutRects[i]!.set(
        (area.eastM0 - this.originEastM) / c,
        (area.northM0 - this.originNorthM) / c,
        (area.eastM1 - this.originEastM) / c,
        (area.northM1 - this.originNorthM) / c,
      );
    }
    const rects = this.country.material.uniforms.uCutRects!.value as Vector4[];
    for (let i = 0; i < this.drawnAreas.length; i++) rects[i]!.copy(this.cutRects[i]!);
    u.value = this.drawnAreas.length;
  }

  /** Keep the camera within 4 km of the world origin (D5). */
  private rebaseIfNeeded(eastM: number, northM: number): void {
    const c = this.options.scale.horizontalCompression;
    const dx = (eastM - this.originEastM) / c;
    const dy = (northM - this.originNorthM) / c;
    if (Math.hypot(dx, dy) > 4000) {
      this.originEastM = eastM;
      this.originNorthM = northM;
    }
  }
}
