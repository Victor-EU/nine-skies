import {
  BufferAttribute,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  Vector3,
  type ShaderMaterial,
} from "three";
import { LOD_SEGMENTS, buildGrid, lodForDistance, type LodLevel } from "./grid.js";
import { HeightTileArray, TILE_SAMPLES } from "./tileArray.js";
import { TILE_KM } from "./syntheticTiles.js";
import { SyntheticTileSource, type TileSource } from "./tileSource.js";
import { createTerrainMaterial } from "./terrainMaterial.js";
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
 */

export interface TerrainOptions {
  scale: WorldScale;
  /** How many tiles out to draw, in each direction. */
  viewRadiusTiles: number;
  layers: number;
  /** Where heightmaps come from. Defaults to the stand-in world. */
  source?: TileSource;
}

export interface TerrainStats {
  drawCalls: number;
  instances: number;
  triangles: number;
  resident: number;
  generatedThisFrame: number;
  /** Tiles the view wanted and the source could not supply. */
  missing: number;
}

interface LodBucket {
  mesh: Mesh;
  geometry: InstancedBufferGeometry;
  origins: InstancedBufferAttribute;
  layers: InstancedBufferAttribute;
  trianglesPerInstance: number;
  count: number;
}

export class Terrain {
  readonly heights: HeightTileArray;
  readonly source: TileSource;
  readonly material: ShaderMaterial;
  readonly meshes: Mesh[] = [];
  private readonly buckets: LodBucket[] = [];
  /**
   * Extinction per **real** metre. Held in real units so a scale change
   * re-derives the uniform rather than inheriting whatever the last scale
   * left in it. The app overwrites it every frame with the blended region
   * value; this is what the first frame and the tests fly through.
   */
  private readonly hazeDensityPerM = DEFAULT_HAZE_DENSITY_PER_M;
  private readonly maxInstances: number;
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
  };

  constructor(private readonly options: TerrainOptions) {
    this.heights = new HeightTileArray(options.layers);
    this.source = options.source ?? new SyntheticTileSource();
    const span = options.viewRadiusTiles * 2 + 1;
    this.maxInstances = span * span;

    this.material = createTerrainMaterial(this.heights.texture, {
      tileWorldSize: this.tileWorldSize,
      verticalExaggeration: options.scale.verticalExaggeration,
      // Skirts must out-reach the worst height disagreement between LODs.
      skirtDepth: 900 * options.scale.verticalExaggeration,
      sunDirection: new Vector3(0.45, 0.72, 0.53).normalize(),
      sunColor: new Color(1.0, 0.97, 0.92),
      hazeColor: new Color(0.72, 0.79, 0.86),
      // Authored per real metre; the shader integrates in world units.
      hazeDensity: hazeDensityPerWorldUnit(this.hazeDensityPerM, options.scale),
      hazeHeightFalloff: hazeFalloffPerWorldUnit(HAZE_SCALE_HEIGHT_M, options.scale),
    });

    for (const segments of LOD_SEGMENTS) {
      this.buckets.push(this.makeBucket(segments));
    }
  }

  get tileWorldSize(): number {
    return (TILE_KM * 1000) / this.options.scale.horizontalCompression;
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
   * Reads the same Int16 buffer the GPU draws, so the HUD number and the
   * picture can never disagree.
   */
  groundElevationM(eastM: number, northM: number): number | null {
    const kmE = eastM / 1000;
    const kmN = northM / 1000;
    const tx = Math.floor(kmE / TILE_KM);
    const ty = Math.floor(kmN / TILE_KM);
    const u = (kmE - tx * TILE_KM) / TILE_KM;
    const v = (kmN - ty * TILE_KM) / TILE_KM;
    return this.heights.sample(tx, ty, u, v);
  }

  /**
   * Called once per frame with the aircraft's real position.
   * Makes nearby tiles resident, buckets the visible ones by LOD and fills the
   * instance buffers. Returns the camera's world-space position.
   */
  update(eastM: number, northM: number, altitudeM: number): Vector3 {
    this.rebaseIfNeeded(eastM, northM);

    const radius = this.options.viewRadiusTiles;
    const centreX = Math.floor(eastM / 1000 / TILE_KM);
    const centreY = Math.floor(northM / 1000 / TILE_KM);
    const size = this.tileWorldSize;

    for (const b of this.buckets) b.count = 0;
    let generated = 0;
    let missing = 0;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = centreX + dx;
        const ty = centreY + dy;
        if (tx < 0 || ty < 0) continue;

        // Circular rather than square view, so the corners cost nothing.
        const distTiles = Math.hypot(dx, dy);
        if (distTiles > radius + 0.5) continue;

        if (!this.heights.has(tx, ty)) {
          const samples = this.source.request(tx, ty);
          if (samples === null) {
            // Not ready, or outside the built world. Skip it and ask again
            // next frame rather than drawing a hole at sea level.
            missing++;
            continue;
          }
          this.heights.insert(tx, ty, samples);
          generated++;
        }
        const layer = this.heights.layerFor(tx, ty);
        if (layer < 0) continue;

        const lod = lodForDistance(distTiles * size, size);
        this.push(lod, tx, ty, layer);
      }
    }

    this.heights.flush();

    let instances = 0;
    let triangles = 0;
    let drawCalls = 0;
    for (const b of this.buckets) {
      b.geometry.instanceCount = b.count;
      b.mesh.visible = b.count > 0;
      if (b.count > 0) {
        b.origins.needsUpdate = true;
        b.layers.needsUpdate = true;
        drawCalls++;
        instances += b.count;
        triangles += b.count * b.trianglesPerInstance;
      }
    }
    this.stats.drawCalls = drawCalls;
    this.stats.instances = instances;
    this.stats.triangles = triangles;
    this.stats.resident = this.heights.residentCount;
    this.stats.generatedThisFrame = generated;
    this.stats.missing = missing;

    const cameraWorld = this.toWorld(eastM, northM, altitudeM);
    (this.material.uniforms.uCameraWorld!.value as Vector3).copy(cameraWorld);
    return cameraWorld;
  }

  setScale(scale: WorldScale): void {
    this.options.scale = scale;
    this.material.uniforms.uTileWorldSize!.value = this.tileWorldSize;
    this.material.uniforms.uVerticalExaggeration!.value = scale.verticalExaggeration;
    this.material.uniforms.uSkirtDepth!.value = 900 * scale.verticalExaggeration;
    // The air is a real quantity; only its expression in world units moves.
    this.material.uniforms.uHazeHeightFalloff!.value = hazeFalloffPerWorldUnit(
      HAZE_SCALE_HEIGHT_M,
      scale,
    );
    this.material.uniforms.uHazeDensity!.value = hazeDensityPerWorldUnit(
      this.hazeDensityPerM,
      scale,
    );
  }

  private push(lod: LodLevel, tx: number, ty: number, layer: number): void {
    const b = this.buckets[lod]!;
    if (b.count >= this.maxInstances) return;
    const c = this.options.scale.horizontalCompression;
    const originX = (tx * TILE_KM * 1000 - this.originEastM) / c;
    const originY = (ty * TILE_KM * 1000 - this.originNorthM) / c;
    const arr = b.origins.array as Float32Array;
    arr[b.count * 2] = originX;
    arr[b.count * 2 + 1] = originY;
    (b.layers.array as Float32Array)[b.count] = layer;
    b.count++;
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

  private makeBucket(segments: number): LodBucket {
    const grid = buildGrid(segments, TILE_SAMPLES);
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
