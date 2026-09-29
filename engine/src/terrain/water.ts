/**
 * The water the terrain draws: the sea, the lakes, and the rivers stage 3
 * carved, read from the layer `pipeline/nineskies/water.py` cuts beside the
 * heights (F72).
 *
 * A tile's water is four bytes a sample in an RGBA8UI array whose layers are
 * the heights' own. Standing water is a class per sample, read bilinearly as
 * a coverage and drawn where it crosses a half, which puts a smooth shore half
 * a sample out from the last dry one. A river is the offset to each sample
 * from the nearest point of its centreline (`water.py` writes the sample less
 * the point, whatever its docstring says). That offset is linear in position
 * along a straight reach, so read bilinearly between four samples it is the
 * offset from the fragment itself, and a ribbon of any width has a clean edge.
 * A distance read the same way would be off by up to half a sample exactly
 * where the river is, which at 1 km is a river that beads.
 *
 * A line that turns within a sample is not linear in position, and there the
 * offsets read bilinearly miss it: by up to 190 m on the steppe, whose river
 * the 1 km grid draws 120-180 m either side, so it was drawn in pieces with
 * gaps between (F127). But each of the four samples also names a point of the
 * line, its foot (the sample less its offset), and the line through the feet
 * is the river's wherever it turns: the feet joined by chords where two lie
 * close together along the river, the nearest foot where none do. Where the
 * two readings part by more than rounding, the river is the chords'. Only
 * there: a cell's chords are its own four feet's, not its neighbour's, so a
 * distance read from them alone steps at every edge of the grid by the
 * rounding of the bytes, where the bilinear one is continuous.
 *
 * Between two rivers the offsets point opposite ways, and read bilinearly they
 * pass through zero on the line halfway between: a river that is not there. A
 * chord from one river's foot to the other's runs along the offsets rather
 * than across them, and none is drawn so; the chords say the river is where
 * it is. The nearest of the four samples also says how far the nearest river
 * can be, less a sample's half-diagonal, so the distance is held to at least
 * that. On a real river the nearest sample is always within the half-diagonal
 * and nothing changes.
 *
 * A river the grid resolves wider than its channel is standing water too: the
 * fourth class, a river's own surface, drawn with a shore like a lake and in
 * the river's colour (F73). On the 90 m hero grid that is the Three Gorges
 * reservoir, and there the ribbon is held to half a sample, because the grid
 * resolves the valley it runs in: within 45 m of the line no sample stands
 * over the water, and within 600 m - the Yangtze's ribbon - 48 % of them in
 * the Three Gorges and 65 % in Tiger Leaping Gorge are wall more than 20 m up
 * it, as much as 1,276 m. The surface draws the width the ground has, and the
 * ribbon only what is narrower than a sample.
 *
 * **Water keeps its level (F126).** Painted on the ground as the ground lay, a
 * ribbon on the 1 km grid ran 600 m out from a channel one sample wide, which
 * is 60 % of the way up the next sample's wall, and a shore half a sample out
 * from the last wet sample ran half way up a gorge's: at six times relief, the
 * Yangtze below the Three Gorges stood up the walls as a tilted sheet. Water
 * is now drawn only where the ground is at its level, within a few metres or
 * a pixel and a half of height, and the level is the data's own: a standing
 * body's wet samples (GLO-30 flattens it to one value) and a river's channel,
 * the lowest of the four samples round the nearest point of its line, one of
 * which is always a channel sample (the line lies within half a sample's
 * diagonal of one). Where the grid is too coarse to hold a river's floor, the
 * vertex shader carves a channel into the ground drawn: under the level
 * inside the ribbon, up to it at the ribbon's edge and back to the data
 * half a sample beyond, as a function of the distance to the line, so the
 * shore follows the river and not the mesh's lattice; as deep as the lower
 * bank stands over the water there, so a river on a plain is not carved at
 * all and one in a gorge is carved to its walls. The surface is shaded
 * where the sight line meets the level, so what is seen is a flat surface
 * with a shore where the bank rises through it. The channel is drawn only:
 * the ground the camera and the cast stand on is the data's.
 *
 * **What a river looks like is a default and not a finding.** The GDD asks for
 * "bright ribbons" and for the Yangtze and the Yellow River to be "always
 * visible from altitude"; it says nothing of widths or colours. So a river is
 * drawn at a half-width by its Natural Earth scalerank, and the two largest
 * classes - which hold both rivers the GDD names - never narrower than
 * `MIN_PX_GREAT` pixels, however far off. The rest thin with distance and fade
 * once they are under a pixel. Every number below is the engine's to change
 * and the user's to decide.
 */
import { WATER_CHANNELS } from "./tileCodec.js";

/**
 * What an offset byte means, as `water.py` writes it: metres a unit, the byte
 * that means none, and how far from a river a sample still carries one. A
 * package that says otherwise is not drawn (`tileStream.waterProblem`).
 */
export const OFFSET_STEP_M = 32;
export const OFFSET_ZERO = 128;
export const REACH_M = 127 * OFFSET_STEP_M;

/** The standing-water byte, as `water.py` writes it. */
export const WATER_LAND = 0;
export const WATER_SEA = 1;
export const WATER_LAKE = 2;
/** A river's own surface, where the grid resolves it wider than its channel (F73). */
export const WATER_RIVER = 3;

/** The river byte where no river is within reach. */
export const NO_RIVER = 0;

/** How many river bytes the shader's tables cover: scalerank 0-14, plus none. */
export const RIVER_CLASSES = 16;

/**
 * Real half-width of a river, by its river byte (Natural Earth scalerank plus
 * one). The Yangtze is byte 2 and the Yellow River byte 4 in the fetched file.
 * Real rivers are narrower than most of these; at 1:8 a 1 km river is 125 m of
 * world, which is the width a ribbon needs to read as a river from a cockpit.
 */
export function riverHalfWidthM(river: number): number {
  if (river <= NO_RIVER) return 0;
  if (river <= 2) return 600;
  if (river <= 4) return 420;
  if (river <= 6) return 280;
  if (river <= 8) return 180;
  return 120;
}

/**
 * On a grid that resolves a river's valley, the ribbon's half-width in
 * samples: what is wider than this, the grid draws as the river's surface.
 * Half a sample is the widest ribbon that paints no sample standing over the
 * water on either hero area (F73).
 */
export const RESOLVED_RIBBON_SAMPLES = 0.5;

/** No cap: a grid whose rivers are all narrower than a sample of it. */
export const NO_RIBBON_CAP_M = 1e9;

/**
 * The half-width a ribbon is drawn at before the pixel floor: the table's,
 * held to `capM` on a grid that resolves its valleys.
 */
export function ribbonHalfWidthM(river: number, capM = NO_RIBBON_CAP_M): number {
  return Math.min(riverHalfWidthM(river), capM);
}

/** The river bytes held to a width in pixels at any distance: the GDD's two. */
export const GREAT_RIVER_MAX_BYTE = 4;
/** How many pixels wide a great river is drawn at the least. */
export const MIN_PX_GREAT = 2;

/** The minimum drawn width in pixels, by river byte. Zero lets it thin away. */
export function riverMinPx(river: number): number {
  return river > NO_RIVER && river <= GREAT_RIVER_MAX_BYTE ? MIN_PX_GREAT : 0;
}

/**
 * How far over its level water may still be drawn (F126): metres, for the
 * banks of a river on a plain, which the 1 km grid stands a few metres over
 * the water; and pixels of height, so that from far off, where a shore is
 * under a pixel either way, a coarse level of the mesh keeps its water.
 */
export const LEVEL_TOLERANCE_M = 4;
export const LEVEL_TOLERANCE_PX = 1.5;

/**
 * The channel carved under a river (F126): at the line, this many times as
 * deep as the lower bank stands over the water at the ribbon's edge, rising
 * straight to the level at the edge; and let back to the data over this many
 * samples beyond. Continuous in the distance, so neighbouring vertices of the
 * mesh are never one carved and the next not, which drew the shore as the
 * lattice's staircase; and in proportion to the bank, so the shore lands
 * within a tenth of a vertex spacing of the edge in a gorge of any steepness,
 * and a plain's gentle banks are not dug into ditches the water spills along.
 */
export const BED_BANK = 2;
export const BED_BAND_SAMPLES = 0.5;

/**
 * The cell whose four samples hold a river's level, for a point `(fx, fy)`
 * texels into a tile whose offset reads (eastM, northM): the offset runs from
 * the line to the point (`water.py`), so the line's nearest point is the
 * point less it, and one of that cell's corners is a channel sample.
 */
export function lineCell(fx: number, fy: number, eastM: number, northM: number, sampleM: number): [number, number] {
  return [Math.floor(fx - eastM / sampleM), Math.floor(fy - northM / sampleM)];
}

/** A river's level: the lowest of the four heights round the nearest point of its line. */
export function riverLevelM(cell: readonly [number, number, number, number]): number {
  return Math.min(...cell);
}

/** How much over its level water may be drawn, metres, where a pixel spans `pxM` metres of height. */
export function levelToleranceM(pxM: number): number {
  return Math.max(LEVEL_TOLERANCE_M, LEVEL_TOLERANCE_PX * pxM);
}

/**
 * The ground drawn at a vertex `distanceM` from a river's line whose level is
 * `levelM`, inside a ribbon `halfM` wide each side, where the data stands at
 * `elevationM` and the lower bank at the ribbon's edge at `bankM`: the
 * channel's (`BED_BANK`) where that is lower, let back to the data over
 * `BED_BAND_SAMPLES` beyond the edge. It crosses the level at the edge,
 * wherever the vertices fall.
 */
export function bedHeightM(
  elevationM: number,
  levelM: number,
  distanceM: number,
  halfM: number,
  sampleM: number,
  bankM: number,
): number {
  const band = BED_BAND_SAMPLES * sampleM;
  if (halfM <= 0 || distanceM >= halfM + band) return elevationM;
  const depth = BED_BANK * Math.max(bankM - levelM, 0);
  const carved = Math.min(elevationM, levelM - depth * Math.max(1 - distanceM / halfM, 0));
  const t = Math.min(1, Math.max(0, (distanceM - halfM) / band));
  return carved + (elevationM - carved) * t * t * (3 - 2 * t);
}

/**
 * Samples from a hero area's rim within which the country's bed is not
 * lowered, and beyond which it is wholly (F126). The area's edge was cut to
 * meet the country's ground as the data has it, and a bed lowered beside it
 * stood the area's skirts up out of the water as cliffs. The first is two
 * samples so every triangle the rim cuts, at the three finest levels, has
 * its corners on the data; the curtain along the rim (`rimCurtain.ts`)
 * reads the same rule, so it hangs from the ground drawn.
 */
export const RIM_CLEAR_SAMPLES: readonly [number, number] = [2, 4];

/** How much of the bed is lowered at a distance from the nearest drawn rim, in samples. */
export function rimTaper(distanceSamples: number): number {
  const [from, to] = RIM_CLEAR_SAMPLES;
  const t = Math.min(1, Math.max(0, (distanceSamples - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/** What the bed needs to read of one tile: its water within it, its heights a step past it. */
export interface BedReads {
  readonly samples: number;
  readonly sampleM: number;
  readonly stepM: number;
  readonly offsetZero: number;
  readonly reachM: number;
  /** The widest a ribbon is drawn before the pixel floor (`ribbonHalfWidthM`'s cap). */
  readonly capM: number;
  water(i: number, j: number): WaterSample;
  /** A height, from the resident neighbour past an edge as `spline.tileFetch` reads it. */
  height(i: number, j: number): number;
}

/**
 * The shader's bed on the CPU (`waterBedGlsl`): the height the ground is drawn
 * at, a vertex `(x, y)` texels into a tile whose height there is `elevationM`.
 */
export function waterBedM(reads: BedReads, x: number, y: number, elevationM: number): number {
  const { samples, sampleM, stepM, offsetZero } = reads;
  const last = samples - 1;
  const tx = Math.min(last, Math.max(0, x));
  const ty = Math.min(last, Math.max(0, y));
  const i0 = Math.min(Math.floor(tx), last - 1);
  const j0 = Math.min(Math.floor(ty), last - 1);
  const corners = [reads.water(i0, j0), reads.water(i0 + 1, j0), reads.water(i0, j0 + 1), reads.water(i0 + 1, j0 + 1)] as const;
  const near = riverAt(corners, tx - i0, ty - j0, sampleM, stepM, offsetZero);
  if (near.river === NO_RIVER) return elevationM;
  const wide = Math.min(ribbonHalfWidthM(near.river, reads.capM), reads.reachM - HALF_DIAGONAL * sampleM);
  if (near.distanceM >= wide + BED_BAND_SAMPLES * sampleM) return elevationM;
  const [ci, cj] = lineCell(tx, ty, near.eastM, near.northM, sampleM);
  const level = riverLevelM([reads.height(ci, cj), reads.height(ci + 1, cj), reads.height(ci, cj + 1), reads.height(ci + 1, cj + 1)]);
  // Across the river: the offset changes only across it, so the difference
  // of two corners' offsets lies along the line's normal, either way.
  const offset = (w: WaterSample): [number, number] => [(w.east - offsetZero) * stepM, (w.north - offsetZero) * stepM];
  const [a, b, c] = corners.map(offset) as [[number, number], [number, number], [number, number]];
  const dx = [b[0] - a[0], b[1] - a[1]];
  const dy = [c[0] - a[0], c[1] - a[1]];
  const across = Math.hypot(dx[0]!, dx[1]!) > Math.hypot(dy[0]!, dy[1]!) ? dx : dy;
  const length = Math.hypot(across[0]!, across[1]!);
  let bank = level;
  if (length > 1) {
    const px = tx - near.eastM / sampleM;
    const py = ty - near.northM / sampleM;
    const sx = (across[0]! / length) * (wide / sampleM);
    const sy = (across[1]! / length) * (wide / sampleM);
    bank = Math.min(heightBilinear(reads, px + sx, py + sy), heightBilinear(reads, px - sx, py - sy));
  }
  return bedHeightM(elevationM, level, near.distanceM, wide, sampleM, bank);
}

/** The heights read bilinearly at a point in texels, as the shader's `waterHeightBilinear`. */
function heightBilinear(reads: BedReads, x: number, y: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const top = reads.height(i, j) * (1 - fx) + reads.height(i + 1, j) * fx;
  const bottom = reads.height(i, j + 1) * (1 - fx) + reads.height(i + 1, j + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * How far a breeze tilts the water's facets (F127): the variance of their
 * slopes, which Cox and Munk measured as 0.003 + 0.00512 a metre a second of
 * wind; a river's air between its banks, about 0.2 m/s. The sun's glitter is
 * as wide as this: at 3 m/s the whole of a gorge's river looking towards an
 * evening sun was one sheet of it.
 */
export const GLINT_SLOPE_VARIANCE = 0.004;
/** The glitter at its heart, in the sun's light on white ground: what the glint was before (design v2). */
export const GLINT_PEAK = 2;

/** Colours, sRGB 0-1, picked by eye like the ramp's stops. */
export const SEA_SRGB: readonly [number, number, number] = [0.15, 0.27, 0.38];
export const LAKE_SRGB: readonly [number, number, number] = [0.2, 0.4, 0.5];
export const RIVER_SRGB: readonly [number, number, number] = [0.32, 0.42, 0.42];

/** Half the diagonal of a sample, in samples. */
const HALF_DIAGONAL = Math.SQRT1_2;

/** One sample of the layer, as it comes off the texture. */
export interface WaterSample {
  east: number;
  north: number;
  river: number;
  still: number;
}

export function waterSample(bytes: ArrayLike<number>, samples: number, i: number, j: number): WaterSample {
  const k = (j * samples + i) * WATER_CHANNELS;
  return { east: bytes[k]!, north: bytes[k + 1]!, river: bytes[k + 2]!, still: bytes[k + 3]! };
}

export interface RiverReading {
  /** Metres from the fragment to the nearest river's centreline. */
  distanceM: number;
  /** That river's byte, or `NO_RIVER` where a corner is past the reach. */
  river: number;
  /** Metres east and north from the line's nearest point to the fragment. */
  eastM: number;
  northM: number;
}

/**
 * The feet of two samples are joined (F127) when they are this close, in
 * samples: a straight reach puts a cell's four feet at most its diagonal
 * apart, 1.41.
 */
export const CHORD_MAX_SAMPLES = 1.5;
/**
 * ...and when the chord between them runs along the river: at either end, the
 * cosine between it and the offset there (which is square to the line) under
 * this. One from a river to the next runs along the offsets, at a cosine of 1.
 */
export const CHORD_ACROSS = 0.7;
/** An offset shorter than this, metres, is a foot on the sample itself or two units of rounding: it says nothing of the line's direction. */
export const CHORD_ALONG_MIN_M = 48;
/**
 * Metres the bilinear and the chords' distances part by before the chords'
 * begins to be taken, and by which it is wholly: past the bytes' rounding
 * (16 m each way, twice), so a straight reach is read bilinearly and has no
 * steps, and short of the 144-190 m a turn misses by.
 */
export const CHORD_BLEND_M: readonly [number, number] = [60, 120];

/**
 * The shader's river arithmetic on the CPU, for tests: four samples at
 * (i, j), (i+1, j), (i, j+1), (i+1, j+1) and a position (fx, fy) between them.
 * `offsetZero` is the byte meaning no offset, `stepM` metres a unit of it.
 */
export function riverAt(
  corners: readonly [WaterSample, WaterSample, WaterSample, WaterSample],
  fx: number,
  fy: number,
  sampleM: number,
  stepM: number,
  offsetZero = 128,
): RiverReading {
  // In samples from the first corner: each corner's offset, and its foot on the line.
  const places = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const;
  const offsets = corners.map((c) => [((c.east - offsetZero) * stepM) / sampleM, ((c.north - offsetZero) * stepM) / sampleM] as const);
  const feet = offsets.map(([e, n], k) => [places[k]![0] - e, places[k]![1] - n] as const);
  const lengths = offsets.map(([e, n]) => Math.hypot(e, n) * sampleM);
  let nearest = 0;
  for (let k = 1; k < 4; k++) if (lengths[k]! < lengths[nearest]!) nearest = k;

  // The nearest point to the fragment of the feet and the chords between them.
  let qx = feet[0]![0];
  let qy = feet[0]![1];
  let best = Infinity;
  for (const [x, y] of feet) {
    const d = Math.hypot(fx - x, fy - y);
    if (d < best) [best, qx, qy] = [d, x, y];
  }
  const along = (cx: number, cy: number, k: number): boolean => {
    const [ox, oy] = offsets[k]!;
    return lengths[k]! < CHORD_ALONG_MIN_M || Math.abs(cx * ox + cy * oy) < CHORD_ACROSS * Math.hypot(cx, cy) * Math.hypot(ox, oy);
  };
  for (let k = 0; k < 4; k++) {
    for (let m = k + 1; m < 4; m++) {
      const [ax, ay] = feet[k]!;
      const [bx, by] = feet[m]!;
      const cx = bx - ax;
      const cy = by - ay;
      const length = Math.hypot(cx, cy);
      if (length < 1e-4 || length > CHORD_MAX_SAMPLES || corners[k]!.river !== corners[m]!.river) continue;
      if (!along(cx, cy, k) || !along(cx, cy, m)) continue;
      const t = Math.min(1, Math.max(0, ((fx - ax) * cx + (fy - ay) * cy) / (length * length)));
      const x = ax + t * cx;
      const y = ay + t * cy;
      const d = Math.hypot(fx - x, fy - y);
      if (d < best) [best, qx, qy] = [d, x, y];
    }
  }
  // And the offsets read bilinearly; each held to the nearest sample's bound.
  const lerp = (k: 0 | 1): number => {
    const top = offsets[0]![k]! * (1 - fx) + offsets[1]![k]! * fx;
    const bottom = offsets[2]![k]! * (1 - fx) + offsets[3]![k]! * fx;
    return (top * (1 - fy) + bottom * fy) * sampleM;
  };
  const hold = lengths[nearest]! - HALF_DIAGONAL * sampleM;
  const bilinear = [lerp(0), lerp(1)] as const;
  const bilinearM = Math.max(Math.hypot(bilinear[0], bilinear[1]), hold);
  const chordsM = Math.max(best * sampleM, hold);
  const w = smoothstep(CHORD_BLEND_M[0], CHORD_BLEND_M[1], Math.abs(bilinearM - chordsM));
  const eastM = bilinear[0] + ((fx - qx) * sampleM - bilinear[0]) * w;
  const northM = bilinear[1] + ((fy - qy) * sampleM - bilinear[1]) * w;
  const reach = corners.every((c) => c.river !== NO_RIVER);
  return { distanceM: bilinearM + (chordsM - bilinearM) * w, river: reach ? corners[nearest]!.river : NO_RIVER, eastM, northM };
}

function smoothstep(from: number, to: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/**
 * Which colour standing water takes between four samples: a lake's where any
 * corner is lake, a river's where any is a river's surface, else the sea's.
 */
export function stillClassAt(
  corners: readonly [WaterSample, WaterSample, WaterSample, WaterSample],
): number {
  if (corners.some((c) => c.still === WATER_LAKE)) return WATER_LAKE;
  if (corners.some((c) => c.still === WATER_RIVER)) return WATER_RIVER;
  return WATER_SEA;
}

/** The shader's standing-water coverage on the CPU: 0 dry, 1 water. */
export function stillAt(
  corners: readonly [WaterSample, WaterSample, WaterSample, WaterSample],
  fx: number,
  fy: number,
): number {
  const w = corners.map((c) => (c.still !== WATER_LAND ? 1 : 0));
  const top = w[0]! * (1 - fx) + w[1]! * fx;
  const bottom = w[2]! * (1 - fx) + w[3]! * fx;
  return top * (1 - fy) + bottom * fy;
}

function glslFloats(values: readonly number[]): string {
  return values.map((v) => (Number.isInteger(v) ? `${v}.0` : `${v}`)).join(", ");
}

function glslVec3(c: readonly [number, number, number]): string {
  return `vec3(${glslFloats(c)})`;
}

/**
 * What both halves share (F126): the layer's uniforms, the width table, and
 * the reads a river's level needs. Heights are read across a tile's edge
 * from its neighbour where the neighbour is resident (tiles share their edge
 * row), so a tile and its neighbour agree on a level along the edge; the
 * caller declares `uHeights`. Samples a side come from the texture, so the
 * vertex half needs no count of its own.
 */
function waterSharedGlsl(): string {
  const halfWidths = Array.from({ length: RIVER_CLASSES }, (_, k) => riverHalfWidthM(k));
  return /* glsl */ `
uniform highp usampler2DArray uWater;
uniform float uWaterSampleM;
uniform float uWaterStepM;
uniform float uWaterReachM;
uniform float uWaterZero;
uniform float uWaterRibbonMaxM;

const float RIVER_HALF_WIDTH_M[${RIVER_CLASSES}] = float[](${glslFloats(halfWidths)});
const float LEVEL_TOLERANCE_M = ${glslFloats([LEVEL_TOLERANCE_M])};
const float LEVEL_TOLERANCE_PX = ${glslFloats([LEVEL_TOLERANCE_PX])};
const float BED_BANK = ${glslFloats([BED_BANK])};
const float BED_BAND_SAMPLES = ${glslFloats([BED_BAND_SAMPLES])};
const vec2 RIM_CLEAR_SAMPLES = vec2(${glslFloats(RIM_CLEAR_SAMPLES)});
const float CHORD_MAX_SAMPLES = ${glslFloats([CHORD_MAX_SAMPLES])};
const float CHORD_ACROSS = ${glslFloats([CHORD_ACROSS])};
const float CHORD_ALONG_MIN_M = ${glslFloats([CHORD_ALONG_MIN_M])};
const vec2 CHORD_BLEND_M = vec2(${glslFloats(CHORD_BLEND_M)});

vec2 waterOffset(uvec4 t) {
  return (vec2(t.rg) - uWaterZero) * uWaterStepM;
}

// A ribbon's half-width before the pixel floor: the table's, held to the cap.
float ribbonHalf(int k) {
  return min(min(RIVER_HALF_WIDTH_M[k], uWaterRibbonMaxM), uWaterReachM - ${HALF_DIAGONAL} * uWaterSampleM);
}

// The height at texel t, read as \`spline.tileFetch\` reads it: past an edge
// from the neighbour there (west, east, south, north) when it is resident,
// else held to the edge; past a corner, across the east-west edge.
float waterHeightAt(ivec2 t, float layer, vec4 neighbours) {
  int last = textureSize(uHeights, 0).x - 1;
  float l = layer;
  if ((t.x < 0 || t.x > last) && (t.y < 0 || t.y > last)) t.y = clamp(t.y, 0, last);
  if (t.x < 0) { if (neighbours.x >= 0.0) { l = neighbours.x; t.x += last; } else t.x = 0; }
  else if (t.x > last) { if (neighbours.y >= 0.0) { l = neighbours.y; t.x -= last; } else t.x = last; }
  else if (t.y < 0) { if (neighbours.z >= 0.0) { l = neighbours.z; t.y += last; } else t.y = 0; }
  else if (t.y > last) { if (neighbours.w >= 0.0) { l = neighbours.w; t.y -= last; } else t.y = last; }
  return float(texelFetch(uHeights, ivec3(t, int(l + 0.5)), 0).r);
}

// The heights read bilinearly at a point q in texels.
float waterHeightBilinear(vec2 q, float layer, vec4 neighbours) {
  ivec2 c = ivec2(floor(q));
  vec2 f = q - vec2(c);
  return mix(
    mix(waterHeightAt(c, layer, neighbours), waterHeightAt(c + ivec2(1, 0), layer, neighbours), f.x),
    mix(waterHeightAt(c + ivec2(0, 1), layer, neighbours), waterHeightAt(c + ivec2(1, 1), layer, neighbours), f.x),
    f.y
  );
}

// A river's level at a point whose offset reads o: the lowest of the four
// samples round the nearest point of its line, which is the point less the
// offset (the offset runs from the line); one of the four is a channel's.
float riverLevel(vec2 texel, vec2 o, float layer, vec4 neighbours) {
  ivec2 c = ivec2(floor(texel - o / uWaterSampleM));
  return min(
    min(waterHeightAt(c, layer, neighbours), waterHeightAt(c + ivec2(1, 0), layer, neighbours)),
    min(waterHeightAt(c + ivec2(0, 1), layer, neighbours), waterHeightAt(c + ivec2(1, 1), layer, neighbours))
  );
}

// Whether a chord runs along the river at a foot whose sample's offset is o,
// metres: square to it, or the offset too short to say (F127).
bool chordAlong(vec2 chord, vec2 o) {
  float lo = length(o);
  return lo < CHORD_ALONG_MIN_M || abs(dot(chord, o)) < CHORD_ACROSS * length(chord) * lo;
}

// The chord from foot p to foot q, if it is one (F127): the point of it
// nearest f, when nearer than best, in q_ and best.
void chordNearest(vec2 f, vec2 p, vec2 op, uint rp, vec2 q, vec2 oq, uint rq, inout vec2 q_, inout float best) {
  vec2 chord = q - p;
  float l = length(chord);
  if (l < 1e-4 || l > CHORD_MAX_SAMPLES || rp != rq || !chordAlong(chord, op) || !chordAlong(chord, oq)) return;
  vec2 at = p + chord * clamp(dot(f - p, chord) / (l * l), 0.0, 1.0);
  float d = length(f - at);
  if (d < best) {
    best = d;
    q_ = at;
  }
}

// The distance to the nearest river from four samples read round a point f
// into their cell, and that river's byte; the byte is 0 past the reach. o is
// the offset from the line's nearest point to f, metres: read bilinearly, or
// where that misses the line, from the line through the samples' feet (F127).
vec2 riverNear(uvec4 a, uvec4 b, uvec4 c, uvec4 d, vec2 f, out vec2 o) {
  vec2 oa = waterOffset(a), ob = waterOffset(b), oc = waterOffset(c), od = waterOffset(d);
  float s = uWaterSampleM;
  vec2 pa = -oa / s, pb = vec2(1.0, 0.0) - ob / s, pc = vec2(0.0, 1.0) - oc / s, pd = vec2(1.0) - od / s;
  vec2 q = pa;
  float closest = length(f - pa);
  if (length(f - pb) < closest) { closest = length(f - pb); q = pb; }
  if (length(f - pc) < closest) { closest = length(f - pc); q = pc; }
  if (length(f - pd) < closest) { closest = length(f - pd); q = pd; }
  chordNearest(f, pa, oa, a.b, pb, ob, b.b, q, closest);
  chordNearest(f, pa, oa, a.b, pc, oc, c.b, q, closest);
  chordNearest(f, pa, oa, a.b, pd, od, d.b, q, closest);
  chordNearest(f, pb, ob, b.b, pc, oc, c.b, q, closest);
  chordNearest(f, pb, ob, b.b, pd, od, d.b, q, closest);
  chordNearest(f, pc, oc, c.b, pd, od, d.b, q, closest);
  // And the offsets read bilinearly, exact along a straight reach and
  // continuous from cell to cell; each held to the nearest sample's bound.
  vec2 bilinear = mix(mix(oa, ob, f.x), mix(oc, od, f.x), f.y);
  float la = length(oa), lb = length(ob), lc = length(oc), ld = length(od);
  float hold = min(min(la, lb), min(lc, ld)) - ${HALF_DIAGONAL} * uWaterSampleM;
  float bilinearM = max(length(bilinear), hold);
  float chordsM = max(closest * s, hold);
  float w = smoothstep(CHORD_BLEND_M.x, CHORD_BLEND_M.y, abs(bilinearM - chordsM));
  o = mix(bilinear, (f - q) * s, w);
  float dist = mix(bilinearM, chordsM, w);
  uint river = a.b;
  float best = la;
  if (lb < best) { best = lb; river = b.b; }
  if (lc < best) { best = lc; river = c.b; }
  if (ld < best) { best = ld; river = d.b; }
  bool reach = a.b > 0u && b.b > 0u && c.b > 0u && d.b > 0u;
  return vec2(dist, reach ? float(min(river, ${RIVER_CLASSES - 1}u)) : 0.0);
}
`;
}

/**
 * The vertex half (F126): a channel carved under the river's level, so a
 * grid too coarse to hold the river's floor still has ground under the water
 * where the ribbon says the water is. `bedHeightM` says how, and `waterBedM`
 * is the same on the CPU. The depth pass runs
 * it too, so the ground that casts the sun's shadow is the ground drawn.
 * Needs `iLayer`, `iNeighbours`, `iWater`, `uHeights` and `uTileWorldSize`
 * declared before it, and `cuts`, the cut rectangles' declaration when the
 * lattice has holes cut in it: near a drawn rim the bed is let back up to
 * the data (`rimTaper`).
 */
export function waterBedGlsl(cuts = ""): string {
  return /* glsl */ `
${waterSharedGlsl()}
flat out vec4 vNeighbours;
// How far under the data the channel was carved here, metres.
out float vCarved;
// How steep a river's lower bank stands over its water here, as the world
// draws it: its rise over the ribbon's half-width; 0 away from a river.
out float vWallTan;
float waterWallTan = 0.0;
${cuts}
${
  cuts === ""
    ? ""
    : `
// How much of the bed is lowered here: none within RIM_CLEAR_SAMPLES.x of a
// drawn hero area, where its edge meets the ground as the data has it.
float rimTaper(vec2 xz) {
  float d = 1e9;
  for (int i = 0; i < uCutCount; i++) {
    vec4 r = uCutRects[i];
    d = min(d, length(max(max(r.xy - xz, xz - r.zw), 0.0)));
  }
  float perSample = uTileWorldSize / float(textureSize(uHeights, 0).x - 1);
  return smoothstep(RIM_CLEAR_SAMPLES.x, RIM_CLEAR_SAMPLES.y, d / perSample);
}`
}

float waterBed(vec2 texel, float elevationM) {
  if (iWater < 0.5) return elevationM;
  int last = textureSize(uWater, 0).x - 1;
  vec2 t = clamp(texel, vec2(0.0), vec2(float(last)));
  ivec2 i0 = min(ivec2(floor(t)), ivec2(last - 1));
  int layer = int(iLayer + 0.5);
  uvec4 a = texelFetch(uWater, ivec3(i0, layer), 0);
  uvec4 b = texelFetch(uWater, ivec3(i0 + ivec2(1, 0), layer), 0);
  uvec4 c = texelFetch(uWater, ivec3(i0 + ivec2(0, 1), layer), 0);
  vec2 o;
  vec2 near = riverNear(a, b, c, texelFetch(uWater, ivec3(i0 + ivec2(1, 1), layer), 0), t - vec2(i0), o);
  if (near.y < 0.5) return elevationM;
  float wide = ribbonHalf(int(near.y));
  float band = BED_BAND_SAMPLES * uWaterSampleM;
  if (wide <= 0.0 || near.x >= wide + band) return elevationM;
  float level = riverLevel(t, o, iLayer, iNeighbours);

  // The lower bank at the ribbon's edge. Across the river: the offset changes
  // only across it, so the difference of two corners' offsets lies along the
  // line's normal, either way.
  vec2 dx = waterOffset(b) - waterOffset(a);
  vec2 dy = waterOffset(c) - waterOffset(a);
  vec2 across = length(dx) > length(dy) ? dx : dy;
  float bank = level;
  if (length(across) > 1.0) {
    vec2 p = t - o / uWaterSampleM;
    vec2 s = normalize(across) * (wide / uWaterSampleM);
    bank = min(waterHeightBilinear(p + s, iLayer, iNeighbours), waterHeightBilinear(p - s, iLayer, iNeighbours));
  }
  float perMetre = uTileWorldSize / (uWaterSampleM * float(textureSize(uWater, 0).x - 1));
  waterWallTan = max(bank - level, 0.0) * uVerticalExaggeration / max(wide * perMetre, 1e-4);
  float depth = BED_BANK * max(bank - level, 0.0);
  float carved = min(elevationM, level - depth * max(1.0 - near.x / wide, 0.0));
  return mix(carved, elevationM, smoothstep(wide, wide + band, near.x));
}
`;
}

/**
 * The fragment half, generated from the tables above so the shader and the
 * tests read one set of numbers. Needs `COLOR_SPACE_GLSL`, `GROUND_LIGHT_GLSL`,
 * `SKY_GLSL`, `NOISE_GLSL`, `SHADOW_GLSL` and `TIME_GLSL` before it, and the
 * uniforms and inputs it names. The colours are the scene's palette (design v2).
 *
 * Water with light in it (design v2, "Water with light in it"): a flat
 * surface with a little wind on it, reflecting the sky by Fresnel - so a
 * lake seen at a low angle is the sky and seen from above is its own colour,
 * which reads as depth - and glinting where the sun's reflection lands, in
 * the sun's own colour and brighter than white, so the bloom finds it.
 *
 * Only open water sees the sky low down. A river runs in a valley, and what
 * it mirrors at a low angle is the valley's far wall: so a river's
 * reflection is the ground's own colour, in shade, until the reflected ray
 * climbs clear of the walls, and a lake's is that a little. Mirroring the
 * open sky had drawn the Jinsha at the First Bend and the Yangtze in the
 * gorges as sheets of pale sky-blue lying in the rock, the brightest thing
 * in the frame and the least like water (28 September 2026).
 *
 * Water keeps its level (F126): drawn only where the ground is at it, and
 * over a bed lowered under it, shaded where the sight line meets the level.
 */
export interface WaterColours {
  readonly seaSrgb: readonly [number, number, number];
  readonly lakeSrgb: readonly [number, number, number];
  readonly riverSrgb: readonly [number, number, number];
}

/** The defaults above, as one palette. */
export const DEFAULT_WATER_COLOURS: WaterColours = { seaSrgb: SEA_SRGB, lakeSrgb: LAKE_SRGB, riverSrgb: RIVER_SRGB };

export function waterGlsl(samples: number, colours: WaterColours = DEFAULT_WATER_COLOURS, photographed = false): string {
  const minPx = Array.from({ length: RIVER_CLASSES }, (_, k) => riverMinPx(k));
  return /* glsl */ `
uniform highp isampler2DArray uHeights;
uniform float uVerticalExaggeration;
flat in vec4 vNeighbours;
in float vCarved;
in float vWallTan;
${waterSharedGlsl()}
const float RIVER_MIN_PX[${RIVER_CLASSES}] = float[](${glslFloats(minPx)});
const float GLINT_SLOPE_VARIANCE = ${glslFloats([GLINT_SLOPE_VARIANCE])};
const float GLINT_PEAK = ${glslFloats([GLINT_PEAK])};

// cover - x: standing water's, y: a ribbon's, z: whether the standing water
// is a lake, w: whether it is a river's own surface. level: the water's own
// there, metres. inner: 1 where all four samples round it are standing water.
// across: the unit direction across the nearest river, east and north.
struct WaterHere {
  vec4 cover;
  float level;
  float inner;
  vec2 across;
};

// groundM: the height of the ground drawn, bed and all; pxM: the metres of
// height a pixel spans there.
WaterHere waterCover(vec2 texel, int layer, float groundM, float pxM) {
  vec2 t = clamp(texel, vec2(0.0), vec2(${samples - 1}.0));
  ivec2 i0 = min(ivec2(floor(t)), ivec2(${samples - 2}));
  vec2 f = t - vec2(i0);
  uvec4 a = texelFetch(uWater, ivec3(i0, layer), 0);
  uvec4 b = texelFetch(uWater, ivec3(i0 + ivec2(1, 0), layer), 0);
  uvec4 c = texelFetch(uWater, ivec3(i0 + ivec2(0, 1), layer), 0);
  uvec4 d = texelFetch(uWater, ivec3(i0 + ivec2(1, 1), layer), 0);

  vec2 o;
  vec2 near = riverNear(a, b, c, d, f, o);
  float dist = near.x;
  bool reach = near.y > 0.5;

  vec4 wet = vec4(a.a > 0u, b.a > 0u, c.a > 0u, d.a > 0u);
  float still = mix(mix(wet.x, wet.y, f.x), mix(wet.z, wet.w, f.x), f.y);
  vec4 lake = vec4(a.a == ${WATER_LAKE}u, b.a == ${WATER_LAKE}u, c.a == ${WATER_LAKE}u, d.a == ${WATER_LAKE}u);
  vec4 surface = vec4(a.a == ${WATER_RIVER}u, b.a == ${WATER_RIVER}u, c.a == ${WATER_RIVER}u, d.a == ${WATER_RIVER}u);

  // Derivatives before anything branches on a per-fragment value.
  float px = max(fwidth(dist), 1e-3);
  float stillPx = max(fwidth(still), 1e-4);
  float groundPx = fwidth(groundM);
  float tolerance = max(LEVEL_TOLERANCE_M, LEVEL_TOLERANCE_PX * pxM);

  int k = int(near.y);
  float wide = ribbonHalf(k);
  float floorHalf = 0.5 * RIVER_MIN_PX[k] * px;
  float half_ = min(max(wide, floorHalf), uWaterReachM - ${HALF_DIAGONAL} * uWaterSampleM);
  float riverCover = 1.0 - smoothstep(half_ - 0.5 * px, half_ + 0.5 * px, dist);
  // Under a pixel wide it fades rather than flickers.
  riverCover *= clamp(2.0 * half_ / px, 0.0, 1.0);
  riverCover *= reach ? 1.0 : 0.0;

  // A river is drawn where the ground is at its level, and nowhere it stands
  // over it, but for the pixel floor's own width; and wherever the channel
  // carved the ground under it, past the ribbon's edge too, or a lower bank
  // would be a dry ditch below the water. A hollow the data has under the
  // river's level beside it is not the river's, and stays as it was.
  float riverLevel_ = 0.0;
  if (reach && (riverCover > 0.0 || vCarved > 0.0)) {
    riverLevel_ = riverLevel(t, o, float(layer), vNeighbours);
    float over = groundM - riverLevel_;
    float atLevel = 1.0 - smoothstep(tolerance - 0.5 * groundPx, tolerance + 0.5 * groundPx, over);
    float floorOnly = 1.0 - smoothstep(floorHalf - 0.5 * px, floorHalf + 0.5 * px, dist);
    riverCover *= max(atLevel, floorOnly);
    float carved = clamp(vCarved, 0.0, 1.0);
    riverCover = max(riverCover, carved * (1.0 - smoothstep(-0.5 * groundPx - 0.5, 0.5 * groundPx - 0.5, over)));
  }

  // Across the river: the offset changes only across it, so the difference
  // of two corners' offsets lies along the line's normal, either way.
  vec2 dxo = waterOffset(b) - waterOffset(a);
  vec2 dyo = waterOffset(c) - waterOffset(a);
  vec2 acr = length(dxo) > length(dyo) ? dxo : dyo;
  vec2 across = length(acr) > 1.0 ? normalize(acr) : vec2(0.0);

  // Standing water: its wet samples' level, which GLO-30 flattened to one value.
  float stillCover = smoothstep(0.5 - 0.5 * stillPx, 0.5 + 0.5 * stillPx, still);
  float stillLevel = 0.0;
  if (still > 0.0) {
    float h = 1e9;
    if (a.a > 0u) h = min(h, float(texelFetch(uHeights, ivec3(i0, layer), 0).r));
    if (b.a > 0u) h = min(h, float(texelFetch(uHeights, ivec3(i0 + ivec2(1, 0), layer), 0).r));
    if (c.a > 0u) h = min(h, float(texelFetch(uHeights, ivec3(i0 + ivec2(0, 1), layer), 0).r));
    if (d.a > 0u) h = min(h, float(texelFetch(uHeights, ivec3(i0 + ivec2(1, 1), layer), 0).r));
    stillLevel = h;
    stillCover *= 1.0 - smoothstep(tolerance - 0.5 * groundPx, tolerance + 0.5 * groundPx, groundM - stillLevel);
  }

  return WaterHere(
    vec4(
      stillCover,
      riverCover,
      max(max(lake.x, lake.y), max(lake.z, lake.w)),
      max(max(surface.x, surface.y), max(surface.z, surface.w))
    ),
    riverCover > stillCover ? riverLevel_ : stillLevel,
    smoothstep(0.7, 1.0, still),
    across
  );
}

// \`view\` is the unit vector from the eye to the fragment, \`pxM\` the metres of
// height a pixel spans there; \`photo\` the photograph there, graded, and 1
// where there is one; \`seen\` becomes where the water's surface is seen, for
// the air in front of it.
vec3 withWater(vec3 lit, vec3 sun, vec3 sunColor, float shadow, vec2 texel, float layer, vec3 view, vec3 world, float pxM, vec4 photo, inout vec3 seen) {
  WaterHere here = waterCover(texel, int(layer + 0.5), world.y / uVerticalExaggeration, pxM);
  vec4 cover = here.cover;
  float wet = max(cover.x, cover.y);
  if (wet <= 0.001) return lit;

  // The surface is level: over a bed lowered under it, the sight line meets
  // the surface before the ground, and the water is lit and shadowed there.
  vec3 at = world;
  float surfaceY = here.level * uVerticalExaggeration;
  if (world.y < surfaceY && uCameraWorld.y > surfaceY) {
    at = uCameraWorld + (world - uCameraWorld) * ((uCameraWorld.y - surfaceY) / (uCameraWorld.y - world.y));
    shadow = sunShadow(at, vec3(0.0, 1.0, 0.0), sun);
  }
  seen = mix(seen, at, wet);

  // A little wind: noise at two sizes tilts the surface by a degree or two,
  // drifting slowly, so the mirror and the glitter move over it. The facets
  // the glitter is made of are the glint's own (below), far under a pixel.
  vec2 p = at.xz * 0.05 + vec2(uTime * 0.03, uTime * 0.02);
  vec2 tilt = vec2(vnoise(p) - 0.5, vnoise(p * 1.7 + 31.0) - 0.5) * 0.05;
  vec2 p2 = at.xz * 0.23 - vec2(uTime * 0.05, uTime * 0.04);
  tilt += vec2(vnoise(p2) - 0.5, vnoise(p2 * 1.3 + 7.0) - 0.5) * 0.03;
  vec3 n = normalize(vec3(tilt.x, 1.0, tilt.y));

  // A river's colour is its photograph's, graded as the ground's is (F127).
  vec3 river = srgbToLinear(${glslVec3(colours.riverSrgb)});
${photographed ? "  if (photo.a > 0.5) river = imageryGrade(river);" : ""}
  vec3 body = mix(srgbToLinear(${glslVec3(colours.seaSrgb)}), river, cover.w);
  body = mix(body, srgbToLinear(${glslVec3(colours.lakeSrgb)}), cover.z);
  // A river's line runs on across the lake it feeds and out to sea, but its
  // water is the lake's there, and the sea's (F127): a silt-coloured river
  // was a stripe across the Roof's blue lakes.
  float ribbon = cover.y * (1.0 - cover.x * max(cover.z, 1.0 - cover.w));
  body = mix(body, river, ribbon);

  // Silt and depth, drifting: never one flat colour from above.
  float silt = 0.6 * vnoise(at.xz * 0.012 + vec2(uTime * 0.006, 0.0)) + 0.4 * vnoise(at.xz * 0.05 - vec2(0.0, uTime * 0.012));
  body *= 0.8 + 0.4 * silt;
  // Inside a river's own surface, where every sample round is water, the
  // photograph is of the water itself, and is drawn as it is (F127).
  body = mix(body, photo.rgb, photo.a * cover.w * (1.0 - cover.z) * here.inner);
  vec3 own = body * groundLight(vec3(0.0, 1.0, 0.0), sun, sunColor, shadow);
  vec3 r = reflect(view, n);
  r.y = abs(r.y);
  vec3 reflected = skyReflect(r);
  // The valley's walls, low in the mirror: a river's all the way, a lake's a
  // little, the sea's not at all.
  float walled = max(max(cover.w, ribbon) * 0.9, cover.z * 0.45);
  vec3 walls = lit * 0.6 + uAmbientZenith * 0.04;
  reflected = mix(reflected, walls, walled * (1.0 - smoothstep(0.04, 0.32, r.y)));
  // And a ribbon's banks where they stand higher (F127): as steep in the
  // mirror as the lower bank rises over the water at the ribbon's edge, seen
  // along the reflected ray's heading across the river. A gorge's walls at
  // six times relief stand at 70 degrees and more, and its river had
  // mirrored the open sky, and the glow round an evening sun.
  float rl = max(length(r.xz), 1e-4);
  float wallTan = vWallTan * abs(dot(r.xz / rl, here.across));
  float banked = 1.0 - smoothstep(0.8 * wallTan, 1.25 * wallTan, r.y / rl);
  reflected = mix(reflected, walls, ribbon * 0.9 * banked * step(1e-3, wallTan));
  float facing = max(dot(-view, n), 0.0);
  float fresnel = 0.03 + 0.97 * pow(1.0 - facing, 5.0);
  vec3 water = mix(own, reflected, min(fresnel, 0.7));
  // The sun's glitter: the share of a breeze-roughened surface's facets
  // tilted to throw the sun at the eye, their slopes spread about the
  // surface's own as Cox and Munk found them (GLINT_SLOPE_VARIANCE). A path
  // towards the sun as wide as that, in its colour and twice as bright as
  // white at its heart, so the bloom finds it (F127). A glint on the
  // surface's own tilt alone was a lobe a few degrees wide on ripples 160 m
  // long, and drew the path as white cloud lying on the water.
  vec3 h = normalize(sun - view);
  float c = max(dot(h, n), 1e-3);
  float glint = GLINT_PEAK * exp(-(1.0 - c * c) / (c * c * GLINT_SLOPE_VARIANCE));
  water += sunColor * glint * shadow * step(0.0, sun.y);
  return mix(lit, water, wet);
}
`;
}
