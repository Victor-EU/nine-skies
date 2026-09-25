import { Color, DataTexture, ShaderMaterial, GLSL3, Vector2, Vector3, Vector4 } from "three";
import {
  AERIAL_HAZE_GLSL,
  COLOR_SPACE_GLSL,
  DEFAULT_PALETTE,
  GROUND_LIGHT_GLSL,
  elevationRampGlsl,
  paletteConstantsGlsl,
  type ScenePalette,
} from "./palette.js";
import { MIST_GLSL, NOISE_GLSL, SHADOW_GLSL, SKY_GLSL, TIME_GLSL } from "../look/glsl.js";
import { lookUniformDefaults } from "../look/uniforms.js";
import { NO_RIBBON_CAP_M, waterGlsl } from "./water.js";
import { COLOUR_SAMPLES } from "./colour.js";
import type { RockFace } from "./rock.js";
import { SPLINE_GLSL } from "./spline.js";

/**
 * Terrain shader (build plan D3 and D12; design v2, "The look").
 *
 * Two things earn their place here:
 *
 * 1. The mesh is displaced by a vertex texture fetch, so the CPU never builds
 *    terrain geometry. One grid, many tiles, one integer texture array.
 *
 * 2. Normals are the ground's own, not the triangles': each vertex takes a
 *    central difference of the heights around its texel, read at the finest
 *    spacing whatever the LOD, and the fragment lights the interpolated
 *    normal. Version 1 lit each triangle flat from the derivatives of the
 *    world position, a low-poly look its art direction asked for; over 1 km
 *    samples that drew the country as facets a kilometre wide, which viewers
 *    of the film read as a game built of bricks (stage 7, F86). The shadow
 *    reads the same normal: on the flat one, a triangle turned from the sun
 *    skipped the shadow test and shone out of a mountain's cast shadow as a
 *    lit facet. Along a tile's edge the difference reads the neighbour's row
 *    (`iNeighbours`), since tiles share their edge samples; a one-sided
 *    difference stands in where the neighbour is not resident, so the only
 *    seam is at the edge of what is loaded. The rim's curtain takes the
 *    ground's at the top of each column (F97). Where the mesh is finer
 *    than the heights, the normal is the spline's between samples.
 *
 * Colour is the scene's palette: an elevation ramp, rock on the steep, snow
 * above a line, baked in as constants and regenerated at scene start
 * (`setTerrainPalette`). Light is the sun with its shadow, the sky and the
 * ground's bounce (`GROUND_LIGHT_GLSL`); the air is mist in the valleys and
 * haze to the sky's own colour in the direction looked (`look/glsl.ts`).
 * The output is linear: the post pass (`look/post.ts`) grades it.
 */

/** Where in its tile a fragment is, for the water and the colour, which read layers of their own. */
const TEXEL_VERTEX_INPUTS = /* glsl */ `
out vec2 vTexel;
flat out float vLayer;`;

const TEXEL_VERTEX_BODY = /* glsl */ `
  vTexel = aTexel;
  vLayer = iLayer;`;

const TEXEL_FRAGMENT_INPUTS = /* glsl */ `
in vec2 vTexel;
flat in float vLayer;`;

/** What the water layer adds to each stage, when there is one (F72). */
const WATER_VERTEX_INPUTS = /* glsl */ `
in float iWater;
flat out float vWater;`;

const WATER_VERTEX_BODY = /* glsl */ `
  vWater = iWater;`;

const WATER_FRAGMENT_INPUTS = /* glsl */ `
flat in float vWater;`;

/** Until a scene's rock face is loaded. */
const ROCK_PLACEHOLDER = new DataTexture(new Uint8Array([128, 128, 255, 128]), 1, 1);
ROCK_PLACEHOLDER.needsUpdate = true;

/**
 * The walls (F92). The film draws relief six times steeper than the
 * ground's (F14), so a wall carries about six times the surface its
 * photograph from above covers, and the photograph's texels ran down it as
 * streaks. On a wall the photograph is read blurred by as much as it is
 * stretched, for its tone, and a scanned rock face (`rock.ts`) is laid over
 * it, mapped on the wall itself from the two sides a wall can face, in tile
 * coordinates, so it meets the next tile's and stays put when the world
 * rebases.
 *
 * `uWall`: the blur per doubling of the stretch; the face's relief where it
 * is rock and where it is plants; 1 while a face is held. `uRockAcross`:
 * world units a face spans, fitted to a whole number a tile.
 */
const WALL_GLSL = /* glsl */ `
uniform float uTileWorldSize;
uniform vec4 uWall;
uniform sampler2D uRockAlbedo;
uniform sampler2D uRockNormal;
uniform vec3 uRockMean;
uniform float uRockAcross;

// Rock where the wall's bareness (its slope's rock band, less its green) passes this.
const float WALL_BARE_FROM = 0.35;
// How much a green photograph keeps a wall clothed.
const float WALL_GREEN = 0.5;
// Plants seen from the side show their shaded interior: this much greyer, and darker.
const vec2 WALL_SIDE = vec2(0.3, 0.2);

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}`;

/** What the ground's colour adds (F87), its fine layer where there is one (F91), its relief (F93, F94) and its near colour (F95). */
const colourVertexInputs = (fine: boolean, relief: boolean, near: boolean, nearColour: boolean): string => /* glsl */ `
in float iColour;
flat out float vColour;
${fine ? "in float iFine;\nflat out float vFine;" : ""}
${relief ? "in float iRelief;\nflat out float vRelief;" : ""}
${near ? "in vec4 iNear;\nflat out vec4 vNear;" : ""}
${nearColour ? "in vec4 iNearColour;\nflat out vec4 vNearColour;" : ""}`;

const colourVertexBody = (fine: boolean, relief: boolean, near: boolean, nearColour: boolean): string => /* glsl */ `
  vColour = iColour;
${fine ? "  vFine = iFine;" : ""}
${relief ? "  vRelief = iRelief;" : ""}
${near ? "  vNear = iNear;" : ""}
${nearColour ? "  vNearColour = iNearColour;" : ""}`;

/** Where in a colour image a tile-local position is: `samples` a side, rows north to south. */
const colourSt = (uv: string, samples: number): string =>
  `vec2(${uv}.x, 1.0 - ${uv}.y) * (${(samples - 1).toFixed(1)} / ${samples.toFixed(1)}) + 0.5 / ${samples.toFixed(1)}`;

/** How far `colourSt` moves for a step of the tile-local position: the gradient a read is given across the whole tile. */
const colourStep = (samples: number): string => `vec2(1.0, -1.0) * ${((samples - 1) / samples).toFixed(6)}`;

/**
 * A country tile's four by four sub-tiles (F94, F95): which one a
 * tile-local position `q`, four a tile, is in, and the layer + 1 its pool
 * holds for it, from the instance's rows (`terrain.ts`), one a component
 * south to north, six bits apiece from the west.
 */
const NEAR_GLSL = /* glsl */ `
vec2 nearSub(vec2 q) {
  return min(floor(q), 3.0);
}

uint nearLayer(vec4 rows, vec2 sub) {
  float row = sub.y < 0.5 ? rows.x : sub.y < 1.5 ? rows.y : sub.y < 2.5 ? rows.z : rows.w;
  return (uint(row) >> (6u * uint(sub.x))) & 63u;
}`;

/**
 * The mosaic at a fragment. Colour tiles are `COLOUR_SAMPLES` a side with
 * sample 0 on the tile's west and north edges, so a tile-local position
 * maps to the middle of the edge texels, and rows run north to south, so
 * the tile's v is flipped. Graded: the mosaic's colours are a map's, and the
 * film's light is its own (`uImagery`: gain, saturation; `uImageryTint`,
 * a white balance, since the mosaic's greens lean to blue).
 *
 * Near the camera a hero tile may hold a fine layer too (F91), 10 m where
 * the colour layer is 15 or 45 m: drawn whole within `uFineFade.x` world
 * units of the camera, across the ground, and faded out by `uFineFade.y`.
 * The two share their broad tone, so the fade changes only the detail.
 * `vFine` is flat per instance, so the branch is the same across a triangle
 * and the texture read's derivatives hold.
 *
 * A country tile's sub-tiles along the rails may hold the near colour
 * (F95), 10 m where the tile's is 250 m: whole within `uColourNearFade.x`
 * and the colour layer by `uColourNearFade.y`. `vNearColour` holds their
 * layers as `vNear` holds the near relief's, and the read is given the
 * gradient across the whole tile for the same reason, as blurred on steep
 * ground as the colour layer's read is (`blur`, in mips).
 */
const colourFragmentInputs = (fineSamples: number, reliefSamples: number, nearSamples: number, nearColourSamples: number): string => /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray uColour;
uniform float uTileTexels;
uniform vec4 uImagery;
uniform vec3 uImageryTint;
flat in float vColour;
${
  fineSamples > 0
    ? `uniform sampler2DArray uColourFine;
uniform vec2 uFineFade;
flat in float vFine;`
    : ""
}
${
  nearColourSamples > 0
    ? `uniform sampler2DArray uColourNear;
uniform vec2 uColourNearFade;
flat in vec4 vNearColour;`
    : ""
}
${nearSamples > 0 || nearColourSamples > 0 ? NEAR_GLSL : ""}

vec3 imageryAt(vec2 texel, float layer, float across, float blur) {
  vec2 uv = texel / uTileTexels;
  vec3 c = texture(uColour, vec3(${colourSt("uv", COLOUR_SAMPLES)}, layer), blur).rgb;
${
  fineSamples > 0
    ? `  if (vFine > 0.5) {
    vec3 f = texture(uColourFine, vec3(${colourSt("uv", fineSamples)}, vFine - 1.0), blur).rgb;
    c = mix(f, c, smoothstep(uFineFade.x, uFineFade.y, across));
  }`
    : ""
}
${
  nearColourSamples > 0
    ? `  vec2 q = uv * 4.0;
  vec2 dq = ${colourStep(nearColourSamples)} * exp2(blur);
  vec2 qx = dFdx(q) * dq;
  vec2 qy = dFdy(q) * dq;
  vec2 sub = nearSub(q);
  uint held = nearLayer(vNearColour, sub);
  if (held > 0u) {
    vec3 f = textureGrad(uColourNear, vec3(${colourSt("(q - sub)", nearColourSamples)}, float(held - 1u)), qx, qy).rgb;
    c = mix(f, c, smoothstep(uColourNearFade.x, uColourNearFade.y, across));
  }`
    : ""
}
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return max(mix(vec3(l), c, uImagery.y), 0.0) * uImagery.x * uImageryTint;
}
${reliefSamples > 0 ? reliefGlsl(reliefSamples, nearSamples) : ""}
${WALL_GLSL}`;

/**
 * The ground's relief below its grid (F93), where the tile holds a layer of
 * it: the source's normal at the fragment, as steep as the world draws the
 * ground (`uReliefGain`, the world's vertical over its horizontal scale),
 * whole within `uReliefFade.x` world units of the camera across the ground
 * and the grid's own normal by `uReliefFade.y`. Each part is stored as the
 * signed square root of its size, 127 either side of the byte 127
 * (`relief.py`). The light only: the shadow
 * and what reads the slope (rock, snow, the walls) keep the grid's normal,
 * so the relief never moves the rock or the snow, and a surface lit by it
 * is still shadowed where the ground drawn is.
 *
 * Nearer still, a country tile's sub-tiles may hold the near relief (F94),
 * at the source's spacing: whole within `uReliefNearFade.x` and the 125 m
 * relief by `uReliefNearFade.y`. `vNear` holds the layer + 1 of each of the
 * tile's four by four (`NEAR_GLSL`). Which sub-tile a fragment is in
 * changes across a triangle, so the read is given the gradient of the
 * position across the tile, which does not jump where the sub-tile does.
 */
const reliefGlsl = (samples: number, nearSamples: number): string => /* glsl */ `
uniform sampler2DArray uRelief;
uniform vec2 uReliefFade;
uniform float uReliefGain;
flat in float vRelief;
${
  nearSamples > 0
    ? `uniform sampler2DArray uReliefNear;
uniform vec2 uReliefNearFade;
flat in vec4 vNear;`
    : ""
}

vec3 reliefDecode(vec2 stored) {
  vec2 c = stored * (255.0 / 127.0) - 1.0;
  vec2 p = sign(c) * c * c;
  float up = sqrt(max(1.0 - dot(p, p), 1e-4));
  return normalize(vec3(p.x * uReliefGain, up, p.y * uReliefGain));
}

vec3 reliefNormal(vec2 texel, vec3 n, float across) {
  vec2 uv = texel / uTileTexels;
  vec3 normal = n;
  if (vRelief > 0.5) {
    vec3 fine = reliefDecode(texture(uRelief, vec3(${colourSt("uv", samples)}, vRelief - 1.0)).rg);
    normal = normalize(mix(fine, n, smoothstep(uReliefFade.x, uReliefFade.y, across)));
  }
${
  nearSamples > 0
    ? `  vec2 q = uv * 4.0;
  vec2 qx = dFdx(q) * ${colourStep(nearSamples)};
  vec2 qy = dFdy(q) * ${colourStep(nearSamples)};
  vec2 sub = nearSub(q);
  uint layer = nearLayer(vNear, sub);
  if (layer > 0u) {
    vec3 source = reliefDecode(textureGrad(uReliefNear, vec3(${colourSt("(q - sub)", nearSamples)}, float(layer - 1u)), qx, qy).rg);
    normal = normalize(mix(source, normal, smoothstep(uReliefNearFade.x, uReliefNearFade.y, across)));
  }`
    : ""
}
  return normal;
}`;

// A tile whose water has landed. Flat per instance, so every fragment of a
// triangle takes the same branch and the derivatives inside it hold.
const WATER_FRAGMENT_BODY = /* glsl */ `
  if (vWater > 0.5) lit = withWater(lit, sun, uSunColor, shadow, vTexel, vLayer, dir, vWorld);`;

/** The ground's normal at a vertex, for the lit pass (not the depth pass). */
const NORMAL_VERTEX_INPUTS = /* glsl */ `
out vec3 vNormal;

// The normal of a slope in metres a texel, east and north, as the ground
// drawn: the spline's, between samples (F97).
vec3 slopeNormal(vec2 slope) {
  float k = uVerticalExaggeration * float(textureSize(uHeights, 0).x - 1) / uTileWorldSize;
  return normalize(vec3(-slope.x * k, 1.0, -slope.y * k));
}

// The height one texel from t along d, which is on the neighbouring tile when
// the step leaves this one: tiles share their edge row, so the neighbour's
// texel one in from its own edge. False where that neighbour is not resident.
bool heightNear(ivec2 t, ivec2 d, int last, out float h) {
  ivec2 p = t + d;
  float layer = iLayer;
  if (p.x < 0) { layer = iNeighbours.x; p.x += last; }
  else if (p.x > last) { layer = iNeighbours.y; p.x -= last; }
  else if (p.y < 0) { layer = iNeighbours.z; p.y += last; }
  else if (p.y > last) { layer = iNeighbours.w; p.y -= last; }
  if (layer < 0.0) return false;
  h = float(texelFetch(uHeights, ivec3(p, int(layer)), 0).r);
  return true;
}

// A central difference where both sides are there, one-sided where one is not.
float slopeAcross(float before, bool hasBefore, float here, float after, bool hasAfter) {
  if (hasBefore && hasAfter) return (after - before) * 0.5;
  if (hasAfter) return after - here;
  if (hasBefore) return here - before;
  return 0.0;
}

vec3 groundNormal(ivec2 t, float here) {
  int last = textureSize(uHeights, 0).x - 1;
  float w, e, s, n;
  bool hw = heightNear(t, ivec2(-1, 0), last, w);
  bool he = heightNear(t, ivec2(1, 0), last, e);
  bool hs = heightNear(t, ivec2(0, -1), last, s);
  bool hn = heightNear(t, ivec2(0, 1), last, n);
  // Metres of rise per texel, to world units of rise per world unit across.
  float k = uVerticalExaggeration * float(last) / uTileWorldSize;
  float dx = slopeAcross(w, hw, here, e, he) * k;
  float dz = slopeAcross(s, hs, here, n, hn) * k;
  return normalize(vec3(-dx, 1.0, -dz));
}`;

const vertexShader = (water: boolean, normals: boolean, colour: boolean, fine = false, relief = false, near = false, nearColour = false): string => /* glsl */ `
precision highp float;
precision highp int;
precision highp isampler2DArray;

in vec2 aTexel;
in float aSkirt;
in vec2 iOrigin;
in float iLayer;
in vec4 iNeighbours;
${water || colour ? TEXEL_VERTEX_INPUTS : ""}
${water ? WATER_VERTEX_INPUTS : ""}
${colour ? colourVertexInputs(fine, relief, near, nearColour) : ""}

uniform isampler2DArray uHeights;
uniform float uTileWorldSize;
uniform float uVerticalExaggeration;
uniform float uSkirtDepth;

out vec3 vWorld;
out float vElevation;
${SPLINE_GLSL}
${normals ? NORMAL_VERTEX_INPUTS : ""}

void main() {
  // A vertex on a sample reads it. One between samples, which only the
  // country's finest level has, takes the spline through the samples round
  // it, and its slope (F97).
  bool between = any(notEqual(fract(aTexel), vec2(0.0)));
  vec3 spline = between ? splineAt(aTexel) : vec3(0.0);
  float elevationM = between
    ? spline.x
    : float(texelFetch(uHeights, ivec3(int(aTexel.x), int(aTexel.y), int(iLayer)), 0).r);

  // Skirt vertices duplicate the edge sample and drop straight down, which
  // hides the crack where a coarser neighbour tile disagrees about the height.
  float y = elevationM * uVerticalExaggeration - aSkirt * uSkirtDepth;

  vec3 world = vec3(
    iOrigin.x + position.x * uTileWorldSize,
    y,
    iOrigin.y + position.z * uTileWorldSize
  );

  vWorld = world;
  vElevation = elevationM;
${normals ? "  vNormal = between ? slopeNormal(spline.yz) : groundNormal(ivec2(aTexel), elevationM);" : ""}
${water || colour ? TEXEL_VERTEX_BODY : ""}
${water ? WATER_VERTEX_BODY : ""}
${colour ? colourVertexBody(fine, relief, near, nearColour) : ""}
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
`;

/**
 * How many hero areas one terrain material can cut holes for.
 *
 * The build plan names five (gorge, karst towers, sandstone pillars, three
 * gorges, Everest) and the last of those may want to be three areas, so eight
 * is the next comfortable size up. A material asked for more is refused
 * rather than quietly dropping the ninth.
 */
export const MAX_CUT_RECTS = 8;

/**
 * How the mosaic is graded into the film's light (F87): gain, saturation,
 * then the share of the palette's rock laid on steep ground, while no rock
 * face is (F92), and of its snow above the line. Set against the nine stills.
 */
export const DEFAULT_IMAGERY: readonly [number, number, number, number] = [1.4, 1.05, 0.5, 0.0];

/**
 * The walls (F92): the photograph blurred by its whole stretch, so a texel
 * on a wall is as tall as it is wide; the face's relief at full strength on
 * rock and half on plants; and no face until one is held.
 */
export const DEFAULT_WALL: readonly [number, number, number, number] = [1, 1, 0.5, 0];

/** The mosaic's white balance in the film's light: its greens lean to blue (F87). */
export const DEFAULT_IMAGERY_TINT: readonly [number, number, number] = [1.1, 1.0, 0.78];

const cutUniforms = (maxCuts: number): string =>
  maxCuts === 0
    ? ""
    : /* glsl */ `
uniform vec4 uCutRects[${maxCuts}];
uniform int uCutCount;
`;

/**
 * The overlap rule, in one `discard` (F51).
 *
 * Where a hero area exists, the country grid under it is not a coarser
 * version of the same ground - it is different ground. Through Tiger Leaping
 * Gorge the 1 km surface stands up to 764 m above the 90 m one and 390 m
 * below its ridges, so neither can be drawn over the other: the country
 * surface would fill the gorge in from above, and the hero ridges would
 * spear through it from below. The country grid is removed inside the
 * rectangle instead.
 *
 * Per-fragment rather than per-vertex because a country tile's vertices are
 * 1 km apart at the finest LOD and 8 km apart at the coarsest, and the rim of
 * a hero area is a straight line at neither spacing. The gap it leaves is a
 * step, and which way it steps changes along the rim. Where the hero edge
 * stands higher, the hero tiles' own skirts fill it. Where the country ground
 * does, which is three-quarters of both rims, the country hangs a curtain of
 * its own from the surface it draws there (F74, `rimCurtain.ts`). Both drop
 * 900 m, against a disagreement the cutter measures and refuses to publish
 * above that.
 *
 * This is also why the block is generated rather than always present: a
 * shader containing `discard` gives up early-Z on most hardware whether the
 * branch is taken or not, so the material that has no holes to cut is
 * compiled without one.
 */
const cutBody = (maxCuts: number): string =>
  maxCuts === 0
    ? ""
    : /* glsl */ `
  for (int i = 0; i < uCutCount; i++) {
    vec4 r = uCutRects[i];
    if (vWorld.x >= r.x && vWorld.x < r.z && vWorld.z >= r.y && vWorld.z < r.w) {
      discard;
    }
  }
`;

// The mosaic in place of the palette where the tile has its colour. It
// photographed the rock and the snow, so the palette's snow is not laid over
// it at all (`uImagery.w`). Where the relief is steeper than a photograph
// from above can show, the scene's rock face is (`WALL_GLSL`); without one,
// the palette's rock is laid over half of it as a veil (`uImagery.z`), as it
// was before the faces. Flat per instance, so the derivatives hold.
const COLOUR_FRAGMENT_BODY = /* glsl */ `
  if (vColour > 0.5) {
    float stretch = 1.0 / max(n.y, 0.02);
    base = imageryAt(vTexel, vLayer, length(vWorld.xz - uCameraWorld.xz), log2(stretch) * uWall.x);
    // Where the face's coordinates are, and how they change across the pixel, while every
    // fragment of the triangle is here: the branch below is not the same across it.
    vec2 local = vTexel / uTileTexels * uTileWorldSize;
    float k = max(floor(uTileWorldSize / uRockAcross + 0.5), 1.0) / uTileWorldSize;
    float sx = n.x < 0.0 ? -1.0 : 1.0;
    float sz = n.z < 0.0 ? -1.0 : 1.0;
    vec2 uvX = vec2(-sx * local.y, -vWorld.y) * k;
    vec2 uvZ = vec2(sz * local.x, -vWorld.y) * k;
    vec4 dX = vec4(dFdx(uvX), dFdy(uvX));
    vec4 dZ = vec4(dFdx(uvZ), dFdy(uvZ));
    float lod = log2(max(max(length(dX.xy), length(dX.zw)), 1e-6) * float(textureSize(uRockAlbedo, 0).x));
    if (uWall.w > 0.5 && rock > 0.0) {
      // How bare the wall is: its band of slope, less how green its photograph is, and
      // none where the photograph is far brighter than the rock, which saw snow or pale ground.
      float green = clamp((base.g / max(max(base.r, base.b), 1e-4) - 1.0) / 1.5, 0.0, 1.0);
      float pale = luma(base) / max(luma(srgbToLinear(ROCK_SRGB)), 1e-4);
      float bare = rock - WALL_GREEN * green - smoothstep(1.5, 3.0, pale);
      // The face from the side the wall looks to, x or z, with a narrow blend between.
      float wx = pow(abs(n.x), 4.0);
      float wz = pow(abs(n.z), 4.0);
      float ws = max(wx + wz, 1e-4);
      wx /= ws;
      wz /= ws;
      vec4 a = wx * textureGrad(uRockAlbedo, uvX, dX.xy, dX.zw) + wz * textureGrad(uRockAlbedo, uvZ, dZ.xy, dZ.zw);
      float broad = wx * textureGrad(uRockAlbedo, uvX, dX.xy * 6.0, dX.zw * 6.0).a
        + wz * textureGrad(uRockAlbedo, uvZ, dZ.xy * 6.0, dZ.zw * 6.0).a;
      float wide = wx * textureGrad(uRockAlbedo, uvX * 0.31 + 0.37, dX.xy * 0.31, dX.zw * 0.31).g
        + wz * textureGrad(uRockAlbedo, uvZ * 0.31 + 0.61, dZ.xy * 0.31, dZ.zw * 0.31).g;
      vec3 tX = textureGrad(uRockNormal, uvX, dX.xy, dX.zw).xyz * 2.0 - 1.0;
      vec3 tZ = textureGrad(uRockNormal, uvZ, dZ.xy, dZ.zw).xyz * 2.0 - 1.0;
      // Rock where the wall is barest, edged by the face's relief (a few mips up, for whole
      // faces, and its own), with plants in its cracks. Seen from far off, the share alone.
      float edge = 0.18 * (broad - 0.5) + 0.12 * (a.a - 0.5);
      float face = mix(
        smoothstep(WALL_BARE_FROM - 0.03, WALL_BARE_FROM + 0.03, bare + edge) * smoothstep(0.06, 0.18, a.a),
        clamp((bare - WALL_BARE_FROM) / 0.3 + 0.5, 0.0, 1.0) * 0.88,
        smoothstep(4.0, 6.0, lod));
      // The face's colour about its mean, with half its hue, and its brightness read again at
      // a third of the scale, so a wall taller than a face does not show it repeating; tinted
      // to the scene's rock.
      vec3 ratio = a.rgb / uRockMean;
      ratio = mix(vec3(luma(ratio)), ratio, 0.5) * mix(1.0, wide / uRockMean.g, 0.45);
      vec3 plants = mix(base, vec3(luma(base)), WALL_SIDE.x * rock) * (1.0 - WALL_SIDE.y * rock);
      base = mix(plants * mix(1.0, luma(ratio), 0.35), srgbToLinear(ROCK_SRGB) * ratio, face);
      // Its relief, from its normals: across the wall and up it.
      vec3 bend = wx * (tX.x * vec3(0.0, 0.0, -sx) + tX.y * vec3(0.0, 1.0, 0.0))
        + wz * (tZ.x * vec3(sz, 0.0, 0.0) + tZ.y * vec3(0.0, 1.0, 0.0));
      nLit = normalize(nLit + bend * mix(uWall.z, uWall.y, face) * smoothstep(0.0, 0.6, rock));
      rock = 0.0;
    } else {
      rock *= uImagery.z;
    }
    snow *= uImagery.w;
  }`;

// The relief lights the tiles that hold it (F93, F94). Flat per instance, so the derivatives hold.
const reliefFragmentBody = (near: boolean): string => /* glsl */ `
  if (vRelief > 0.5${near ? " || any(greaterThan(vNear, vec4(0.5)))" : ""}) nLit = reliefNormal(vTexel, n, length(vWorld.xz - uCameraWorld.xz));`;

const fragmentShader = (
  maxCuts: number,
  waterSamples: number,
  palette: ScenePalette,
  colour: boolean,
  fineSamples = 0,
  reliefSamples = 0,
  nearSamples = 0,
  nearColourSamples = 0,
): string => /* glsl */ `
precision highp float;
precision highp int;
precision highp usampler2DArray;

in vec3 vWorld;
in float vElevation;
in vec3 vNormal;
${waterSamples > 0 || colour ? TEXEL_FRAGMENT_INPUTS : ""}
${waterSamples > 0 ? WATER_FRAGMENT_INPUTS : ""}
uniform vec3 uCameraWorld;
${colour ? colourFragmentInputs(fineSamples, reliefSamples, nearSamples, nearColourSamples) : ""}

uniform vec3 uSunColor;
uniform float uHazeDensity;
uniform float uHazeHeightFalloff;

out vec4 fragColor;

${COLOR_SPACE_GLSL}
${elevationRampGlsl(palette.stops)}
${paletteConstantsGlsl(palette)}
${AERIAL_HAZE_GLSL}
${GROUND_LIGHT_GLSL}
${SKY_GLSL}
${NOISE_GLSL}
${MIST_GLSL}
${SHADOW_GLSL}
${TIME_GLSL}
${cutUniforms(maxCuts)}
${waterSamples > 0 ? waterGlsl(waterSamples, palette) : ""}

void main() {
${cutBody(maxCuts)}
  // The ground's normal, interpolated from its vertices (header); on the
  // curtain, the ground's at the top of each column.
  vec3 n = normalize(vNormal);
  vec3 sun = normalize(uSunDirection);

  vec3 base = elevationColor(vElevation);
  vec3 nLit = n;
${reliefSamples > 0 ? reliefFragmentBody(nearSamples > 0) : ""}

  // Steep ground reads as rock wherever it is; snow lies where the ground
  // can hold it, above the scene's line.
  float slope = 1.0 - clamp(n.y, 0.0, 1.0);
  float rock = smoothstep(ROCK_FROM, ROCK_TO, slope);
  float snow = smoothstep(SNOW_LINE_M - 400.0, SNOW_LINE_M + 300.0, vElevation) * (1.0 - smoothstep(0.55, 0.85, slope));
${colour ? COLOUR_FRAGMENT_BODY : ""}
  base = mix(base, srgbToLinear(ROCK_SRGB), rock);
  base = mix(base, srgbToLinear(SNOW_SRGB), snow);

  float shadow = sunShadow(vWorld, n, sun);
  vec3 lit = base * groundLight(nLit, sun, uSunColor, shadow);

  vec3 toFrag = vWorld - uCameraWorld;
  vec3 dir = toFrag / max(length(toFrag), 1e-3);
${waterSamples > 0 ? WATER_FRAGMENT_BODY : ""}

  // Mist first, then the analytic haze integrated along the sight line: the
  // valley fills with white and the whole fades to the sky in the direction
  // looked, which is what makes the plateau horizon read as hard and clean
  // while the Sichuan Basin reads as milk.
  lit = mix(lit, uMistColor, mistAlong(uCameraWorld, vWorld));
  float fog = aerialFog(uCameraWorld, vWorld, uHazeDensity, uHazeHeightFalloff);
  fragColor = vec4(mix(lit, skyHorizonAt(dir), fog), 1.0);
}
`;

/** What a material remembers so its shader can be regenerated for a palette. */
interface Recipe {
  readonly kind: "terrain" | "rim";
  readonly maxCuts: number;
  readonly waterSamples: number;
  readonly colour: boolean;
  /** Samples a side of the fine colour (F91); 0 for none. */
  readonly fineSamples: number;
  /** Samples a side of the relief (F93); 0 for none. */
  readonly reliefSamples: number;
  /** Samples a side of the near relief (F94); 0 for none. */
  readonly nearSamples: number;
  /** Samples a side of the near colour (F95); 0 for none. */
  readonly nearColourSamples: number;
}

export interface TerrainUniformValues {
  tileWorldSize: number;
  /**
   * Rectangles of the world this material must not draw, because a finer grid
   * draws them instead. Zero - the default - compiles a shader with no
   * `discard` in it at all.
   */
  maxCuts?: number;
  verticalExaggeration: number;
  skirtDepth: number;
  hazeDensity: number;
  hazeHeightFalloff: number;
  /** The scene's colours; the default until a scene names its own. */
  palette?: ScenePalette;
  /**
   * The ground's colour layers (F87), one beside each height layer. Absent
   * compiles a shader with the palette alone.
   */
  colour?: import("three").DataArrayTexture;
  /**
   * The fine colour near the camera (F91): its pool's array (or the stand-in
   * the pool lends while it holds none), its images' size, and the real
   * metres over which it fades to the colour layer.
   */
  fine?: {
    texture: import("three").DataArrayTexture;
    samples: number;
    fadeM: readonly [number, number];
    horizontalCompression: number;
  };
  /** The country's near colour (F95), the same way: its pool's array, its images' size, and the real metres over which it fades to the colour layer. */
  nearColour?: {
    texture: import("three").DataArrayTexture;
    samples: number;
    fadeM: readonly [number, number];
    horizontalCompression: number;
  };
  /**
   * The relief near the camera (F93): its pool's array, its images' size,
   * the real metres over which it fades to the grid's own normal, and the
   * world's slope over the ground's (`reliefGain`). And the country's near
   * relief (F94): its pool's array, its images' size, and the real metres
   * over which it fades into the relief.
   */
  relief?: {
    texture: import("three").DataArrayTexture;
    samples: number;
    fadeM: readonly [number, number];
    horizontalCompression: number;
    gain: number;
    near?: {
      texture: import("three").DataArrayTexture;
      samples: number;
      fadeM: readonly [number, number];
    };
  };
  /**
   * The water layer (F72): the array beside the heights, and what its bytes
   * mean. Absent compiles a shader with no water in it.
   */
  water?: {
    texture: import("three").DataArrayTexture;
    samples: number;
    sampleM: number;
    offsetStepM: number;
    offsetZero: number;
    reachM: number;
    /**
     * The widest a ribbon is drawn before the pixel floor, on a grid that
     * resolves its valleys: the hero grid's half a sample (F73). Absent, the
     * width table alone.
     */
    ribbonMaxM?: number;
  };
}

export function createTerrainMaterial(
  heights: import("three").DataArrayTexture,
  values: TerrainUniformValues,
): ShaderMaterial {
  const maxCuts = values.maxCuts ?? 0;
  if (maxCuts > MAX_CUT_RECTS) {
    throw new Error(`${maxCuts} cut rectangles asked for, ${MAX_CUT_RECTS} available`);
  }
  const cuts =
    maxCuts === 0
      ? {}
      : {
          uCutRects: {
            value: Array.from({ length: maxCuts }, () => new Vector4()),
          },
          uCutCount: { value: 0 },
        };
  const water = values.water;
  const waterUniforms = water
    ? {
        uWater: { value: water.texture },
        uWaterSampleM: { value: water.sampleM },
        uWaterStepM: { value: water.offsetStepM },
        uWaterReachM: { value: water.reachM },
        uWaterZero: { value: water.offsetZero },
        uWaterRibbonMaxM: { value: water.ribbonMaxM ?? NO_RIBBON_CAP_M },
      }
    : {};
  const fine = values.colour ? values.fine : undefined;
  const nearColour = values.colour ? values.nearColour : undefined;
  const relief = values.colour ? values.relief : undefined;
  const recipe: Recipe = {
    kind: "terrain",
    maxCuts,
    waterSamples: water?.samples ?? 0,
    colour: values.colour !== undefined,
    fineSamples: fine?.samples ?? 0,
    reliefSamples: relief?.samples ?? 0,
    nearSamples: relief?.near?.samples ?? 0,
    nearColourSamples: nearColour?.samples ?? 0,
  };
  const colourUniforms = values.colour
    ? {
        uColour: { value: values.colour },
        uTileTexels: { value: heights.image.width - 1 },
        uImagery: { value: new Vector4(...DEFAULT_IMAGERY) },
        uImageryTint: { value: new Vector3(...DEFAULT_IMAGERY_TINT) },
        uWall: { value: new Vector4(...DEFAULT_WALL) },
        uRockAlbedo: { value: ROCK_PLACEHOLDER },
        uRockNormal: { value: ROCK_PLACEHOLDER },
        uRockMean: { value: new Vector3(0.5, 0.5, 0.5) },
        uRockAcross: { value: 64 },
        ...(fine && {
          uColourFine: { value: fine.texture },
          uFineFade: {
            value: new Vector2(fine.fadeM[0] / fine.horizontalCompression, fine.fadeM[1] / fine.horizontalCompression),
          },
        }),
        ...(nearColour && {
          uColourNear: { value: nearColour.texture },
          uColourNearFade: {
            value: new Vector2(nearColour.fadeM[0] / nearColour.horizontalCompression, nearColour.fadeM[1] / nearColour.horizontalCompression),
          },
        }),
        ...(relief && {
          uRelief: { value: relief.texture },
          uReliefFade: {
            value: new Vector2(relief.fadeM[0] / relief.horizontalCompression, relief.fadeM[1] / relief.horizontalCompression),
          },
          uReliefGain: { value: relief.gain },
          ...(relief.near && {
            uReliefNear: { value: relief.near.texture },
            uReliefNearFade: {
              value: new Vector2(relief.near.fadeM[0] / relief.horizontalCompression, relief.near.fadeM[1] / relief.horizontalCompression),
            },
          }),
        }),
      }
    : {};
  const material = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: vertexShader(
      water !== undefined,
      true,
      recipe.colour,
      recipe.fineSamples > 0,
      recipe.reliefSamples > 0,
      recipe.nearSamples > 0,
      recipe.nearColourSamples > 0,
    ),
    fragmentShader: fragmentShader(
      maxCuts,
      recipe.waterSamples,
      values.palette ?? DEFAULT_PALETTE,
      recipe.colour,
      recipe.fineSamples,
      recipe.reliefSamples,
      recipe.nearSamples,
      recipe.nearColourSamples,
    ),
    uniforms: {
      ...lookUniformDefaults(),
      ...cuts,
      ...waterUniforms,
      ...colourUniforms,
      uHeights: { value: heights },
      uTileWorldSize: { value: values.tileWorldSize },
      uVerticalExaggeration: { value: values.verticalExaggeration },
      uSkirtDepth: { value: values.skirtDepth },
      uHazeDensity: { value: values.hazeDensity },
      uHazeHeightFalloff: { value: values.hazeHeightFalloff },
      uCameraWorld: { value: new Vector3() },
    },
  });
  material.userData.recipe = recipe;
  return material;
}

/**
 * Regenerate a material's fragment shader for a scene's palette. The stops
 * and the rock, snow and water colours are constants in the shader, so a
 * palette is a recompile: once a scene, during its lead-in.
 */
export function setTerrainPalette(material: ShaderMaterial, palette: ScenePalette): void {
  const recipe = material.userData.recipe as Recipe | undefined;
  if (!recipe) throw new Error("not a terrain material");
  const terrain = recipe.kind === "terrain";
  material.fragmentShader = fragmentShader(
    terrain ? recipe.maxCuts : 0,
    recipe.waterSamples,
    palette,
    recipe.colour,
    recipe.fineSamples,
    recipe.reliefSamples,
    recipe.nearSamples,
    recipe.nearColourSamples,
  );
  material.needsUpdate = true;
}

/**
 * Lay a rock face on a material's walls, or take it off (F92). A material
 * with no colour has no walls to lay it on.
 */
export function setRockFace(material: ShaderMaterial, face: RockFace | null): void {
  const u = material.uniforms;
  if (!u.uRockAlbedo) return;
  u.uRockAlbedo.value = face?.albedo ?? ROCK_PLACEHOLDER;
  u.uRockNormal!.value = face?.normal ?? ROCK_PLACEHOLDER;
  if (face) (u.uRockMean!.value as Vector3).set(...face.entry.meanLinear);
  (u.uWall!.value as Vector4).w = face ? 1 : 0;
}

/**
 * The curtain the country grid hangs along a hero rim (F74): see
 * `rimCurtain.ts`. Its x and z arrive in world units and its y in real
 * metres, so exaggeration and depth are the lattice's own uniforms.
 */
const rimVertexShader = /* glsl */ `
precision highp float;

in float aSkirt;
// The ground at the top of this point's column: its slope in metres a world
// unit, east and north, and its height (F97).
in vec3 aGround;

uniform float uVerticalExaggeration;
uniform float uSkirtDepth;

out vec3 vWorld;
out float vElevation;
out vec3 vNormal;

void main() {
  vec3 world = vec3(position.x, position.y * uVerticalExaggeration - aSkirt * uSkirtDepth, position.z);
  vWorld = world;
  vElevation = aGround.z;
  vNormal = normalize(vec3(-aGround.x * uVerticalExaggeration, 1.0, -aGround.y * uVerticalExaggeration));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
`;

/** The uniforms the rim and the depth pass borrow from the country material. */
const SHARED_WITH_RIM = [
  "uVerticalExaggeration",
  "uSkirtDepth",
  "uHazeDensity",
  "uHazeHeightFalloff",
  "uCameraWorld",
] as const;

/**
 * The country material's shading on the curtain's geometry.
 *
 * The uniforms the curtain shares with the country are the country's own
 * objects, not copies, so a scale change and the camera reach it without
 * anyone writing to it; the look's uniforms are its own, because the rig
 * writes every material it draws with. No cut, since the curtain stands
 * exactly on the rectangle's edge and a `discard` would take it or leave it
 * by rounding, and no water, since it is a wall. Its normal and height are
 * the ground's at the top of each column (F97), so it is lit and snowed as
 * the ground it hangs from; its own, a wall's, painted it rock in shadow.
 */
export function createRimMaterial(country: ShaderMaterial, palette: ScenePalette = DEFAULT_PALETTE): ShaderMaterial {
  const u = country.uniforms;
  const material = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: rimVertexShader,
    fragmentShader: fragmentShader(0, 0, palette, false),
    uniforms: {
      ...lookUniformDefaults(),
      ...Object.fromEntries(SHARED_WITH_RIM.map((name) => [name, u[name]!])),
    },
  });
  material.userData.recipe = { kind: "rim", maxCuts: 0, waterSamples: 0, colour: false, fineSamples: 0, reliefSamples: 0, nearSamples: 0, nearColourSamples: 0 } satisfies Recipe;
  return material;
}

const depthFragmentShader = (maxCuts: number): string => /* glsl */ `
precision highp float;

in vec3 vWorld;
in float vElevation;
${cutUniforms(maxCuts)}
out vec4 fragColor;

void main() {
${cutBody(maxCuts)}
  fragColor = vec4(1.0);
}
`;

/**
 * The same geometry from the sun's point of view (`look/shadows.ts`): the
 * terrain's own vertex shader, so the depth the shadow reads is the depth
 * the picture drew, and the same cut, so the country ground under a hero
 * area does not shadow the hero ground that replaces it. Every uniform it
 * needs is the source material's own object.
 */
export function createDepthMaterial(source: ShaderMaterial): ShaderMaterial {
  const recipe = source.userData.recipe as Recipe | undefined;
  if (!recipe) throw new Error("not a terrain material");
  const u = source.uniforms;
  if (recipe.kind === "rim") {
    return new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: rimVertexShader,
      fragmentShader: depthFragmentShader(0),
      uniforms: { uVerticalExaggeration: u.uVerticalExaggeration!, uSkirtDepth: u.uSkirtDepth! },
    });
  }
  const names = ["uHeights", "uTileWorldSize", "uVerticalExaggeration", "uSkirtDepth"];
  if (recipe.maxCuts > 0) names.push("uCutRects", "uCutCount");
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: vertexShader(false, false, false),
    fragmentShader: depthFragmentShader(recipe.maxCuts),
    uniforms: Object.fromEntries(names.map((name) => [name, u[name]!])),
  });
}

export { Color };
