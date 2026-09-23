/**
 * The water the terrain draws: the sea, the lakes, and the rivers stage 3
 * carved, read from the layer `pipeline/nineskies/water.py` cuts beside the
 * heights (F72).
 *
 * A tile's water is four bytes a sample in an RGBA8UI array whose layers are
 * the heights' own. Standing water is a class per sample, read bilinearly as
 * a coverage and drawn where it crosses a half, which puts a smooth shore half
 * a sample out from the last dry one. A river is the offset from each sample
 * to the nearest point of its centreline. That offset is linear in position
 * along a straight reach, so read bilinearly between four samples it is the
 * offset from the fragment itself, and a ribbon of any width has a clean edge.
 * A distance read the same way would be off by up to half a sample exactly
 * where the river is, which at 1 km is a river that beads.
 *
 * Between two rivers the offsets point opposite ways, and read bilinearly they
 * pass through zero on the line halfway between: a river that is not there.
 * The nearest of the four samples says how far the nearest river can be, less
 * a sample's half-diagonal, so the distance is held to at least that. On a real
 * river the nearest sample is always within the half-diagonal and nothing
 * changes.
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

/** The river bytes held to a width in pixels at any distance: the GDD's two. */
export const GREAT_RIVER_MAX_BYTE = 4;
/** How many pixels wide a great river is drawn at the least. */
export const MIN_PX_GREAT = 2;

/** The minimum drawn width in pixels, by river byte. Zero lets it thin away. */
export function riverMinPx(river: number): number {
  return river > NO_RIVER && river <= GREAT_RIVER_MAX_BYTE ? MIN_PX_GREAT : 0;
}

/** Colours, sRGB 0-1, picked by eye like the ramp's stops. */
export const SEA_SRGB: readonly [number, number, number] = [0.15, 0.27, 0.38];
export const LAKE_SRGB: readonly [number, number, number] = [0.2, 0.4, 0.5];
export const RIVER_SRGB: readonly [number, number, number] = [0.42, 0.66, 0.84];

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
}

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
  const offsets = corners.map((c) => [(c.east - offsetZero) * stepM, (c.north - offsetZero) * stepM]);
  const lerp = (k: 0 | 1): number => {
    const top = offsets[0]![k]! * (1 - fx) + offsets[1]![k]! * fx;
    const bottom = offsets[2]![k]! * (1 - fx) + offsets[3]![k]! * fx;
    return top * (1 - fy) + bottom * fy;
  };
  const lengths = offsets.map(([e, n]) => Math.hypot(e!, n!));
  let nearest = 0;
  for (let k = 1; k < 4; k++) if (lengths[k]! < lengths[nearest]!) nearest = k;
  const distanceM = Math.max(Math.hypot(lerp(0), lerp(1)), lengths[nearest]! - HALF_DIAGONAL * sampleM);
  const reach = corners.every((c) => c.river !== NO_RIVER);
  return { distanceM, river: reach ? corners[nearest]!.river : NO_RIVER };
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
 * The fragment half, generated from the tables above so the shader and the
 * tests read one set of numbers. Needs `COLOR_SPACE_GLSL` and
 * `GROUND_LIGHT_GLSL` before it, and the uniforms and inputs it names.
 */
export function waterGlsl(samples: number): string {
  const halfWidths = Array.from({ length: RIVER_CLASSES }, (_, k) => riverHalfWidthM(k));
  const minPx = Array.from({ length: RIVER_CLASSES }, (_, k) => riverMinPx(k));
  return /* glsl */ `
uniform highp usampler2DArray uWater;
uniform float uWaterSampleM;
uniform float uWaterStepM;
uniform float uWaterReachM;
uniform float uWaterZero;

const float RIVER_HALF_WIDTH_M[${RIVER_CLASSES}] = float[](${glslFloats(halfWidths)});
const float RIVER_MIN_PX[${RIVER_CLASSES}] = float[](${glslFloats(minPx)});

vec2 waterOffset(uvec4 t) {
  return (vec2(t.rg) - uWaterZero) * uWaterStepM;
}

// x: standing water's cover, y: a river's, z: how much of the standing water is lake.
vec3 waterCover(vec2 texel, int layer) {
  vec2 t = clamp(texel, vec2(0.0), vec2(${samples - 1}.0));
  ivec2 i0 = min(ivec2(floor(t)), ivec2(${samples - 2}));
  vec2 f = t - vec2(i0);
  uvec4 a = texelFetch(uWater, ivec3(i0, layer), 0);
  uvec4 b = texelFetch(uWater, ivec3(i0 + ivec2(1, 0), layer), 0);
  uvec4 c = texelFetch(uWater, ivec3(i0 + ivec2(0, 1), layer), 0);
  uvec4 d = texelFetch(uWater, ivec3(i0 + ivec2(1, 1), layer), 0);

  vec2 oa = waterOffset(a), ob = waterOffset(b), oc = waterOffset(c), od = waterOffset(d);
  vec2 o = mix(mix(oa, ob, f.x), mix(oc, od, f.x), f.y);
  float la = length(oa), lb = length(ob), lc = length(oc), ld = length(od);
  float nearest = min(min(la, lb), min(lc, ld));
  float dist = max(length(o), nearest - ${HALF_DIAGONAL} * uWaterSampleM);
  uint river = a.b;
  float best = la;
  if (lb < best) { best = lb; river = b.b; }
  if (lc < best) { best = lc; river = c.b; }
  if (ld < best) { best = ld; river = d.b; }
  bool reach = a.b > 0u && b.b > 0u && c.b > 0u && d.b > 0u;

  vec4 wet = vec4(a.a > 0u, b.a > 0u, c.a > 0u, d.a > 0u);
  float still = mix(mix(wet.x, wet.y, f.x), mix(wet.z, wet.w, f.x), f.y);
  vec4 lake = vec4(a.a == 2u, b.a == 2u, c.a == 2u, d.a == 2u);

  // Derivatives before anything branches on a per-fragment value.
  float px = max(fwidth(dist), 1e-3);
  float stillPx = max(fwidth(still), 1e-4);

  int k = int(min(river, ${RIVER_CLASSES - 1}u));
  float half_ = max(RIVER_HALF_WIDTH_M[k], 0.5 * RIVER_MIN_PX[k] * px);
  half_ = min(half_, uWaterReachM - ${HALF_DIAGONAL} * uWaterSampleM);
  float riverCover = 1.0 - smoothstep(half_ - 0.5 * px, half_ + 0.5 * px, dist);
  // Under a pixel wide it fades rather than flickers.
  riverCover *= clamp(2.0 * half_ / px, 0.0, 1.0);
  riverCover *= reach ? 1.0 : 0.0;

  float stillCover = smoothstep(0.5 - 0.5 * stillPx, 0.5 + 0.5 * stillPx, still);
  return vec3(stillCover, riverCover, max(max(lake.x, lake.y), max(lake.z, lake.w)));
}

vec3 withWater(vec3 lit, vec3 sunDirection, vec3 sunColor, vec2 texel, float layer) {
  vec3 cover = waterCover(texel, int(layer + 0.5));
  vec3 flatLight = groundLight(vec3(0.0, 1.0, 0.0), sunDirection, sunColor);
  vec3 still = mix(srgbToLinear(${glslVec3(SEA_SRGB)}), srgbToLinear(${glslVec3(LAKE_SRGB)}), cover.z);
  lit = mix(lit, still * flatLight, cover.x);
  return mix(lit, srgbToLinear(${glslVec3(RIVER_SRGB)}) * flatLight, cover.y);
}
`;
}
