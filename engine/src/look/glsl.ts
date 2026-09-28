/**
 * The look's shader chunks, shared by everything that draws the world: the
 * terrain, the horizon impostor, the water, the clouds and the sky itself.
 *
 * One rule runs through them (design v2, "A sky per scene"): the haze and
 * the sky are one colour, so ground fading into the distance lands on the
 * sky behind it without a seam. Here that colour is `skyHorizonAt(dir)`: the
 * sky at the horizon in the direction looked, which carries the sun's glow,
 * so a ridge towards the sun fades into warm air and one away from it into
 * cool. Every surface asks the same function and the sky dome draws it.
 *
 * Plain GLSL strings with no imports, so `terrainMaterial.ts` can include
 * them without depending on the classes that drive them.
 */

/** The sky's uniforms and the two functions everyone shares. */
export const SKY_GLSL = /* glsl */ `
uniform vec3 uSkyHorizon;
uniform vec3 uSkyZenith;
uniform vec3 uSunDirection;
uniform vec3 uSunGlow;
uniform float uGlowPower;
uniform vec3 uSunDisc;
uniform float uSunDiscCos;
uniform float uAirBlue;

// The sun's light scattered forward through the air: a broad warm lobe and
// a tight bright one. Zero away from the sun, so the shade side of the sky
// is the haze colour alone.
vec3 sunGlow(vec3 dir) {
  float s = max(dot(dir, normalize(uSunDirection)), 0.0);
  return uSunGlow * (0.5 * pow(s, uGlowPower) + pow(s, 80.0));
}

// The air at the horizon in a direction: what distant ground fades into.
vec3 skyHorizonAt(vec3 dir) {
  return uSkyHorizon + sunGlow(dir);
}

// The haze's share per channel, from its share of grey: clean air takes the
// blue out of a far view first and the red last (Rayleigh's law, softened),
// so ridge behind ridge steps back into blue before it goes to the white of
// the horizon. Dust scatters all colours alike, and a dusty sky asks for
// none of it (\`SkyPreset.blue\`). The same function for the ground and the
// horizon ring, so where one hands over to the other is still one colour.
vec3 airFog(float fog) {
  vec3 k = mix(vec3(1.0), vec3(0.72, 0.96, 1.34), uAirBlue);
  return 1.0 - pow(vec3(1.0 - clamp(fog, 0.0, 1.0)), k);
}

// The sky without its disc: what water reflects, since a mirror of a disc
// twenty-five times white is a hole in the picture.
vec3 skyReflect(vec3 dir) {
  float up = clamp(dir.y, 0.0, 1.0);
  float t = 1.0 - pow(1.0 - up, 3.0);
  vec3 sky = mix(uSkyHorizon, uSkyZenith, t) + sunGlow(dir) * (1.0 - 0.7 * t);
  // Below the horizon the air darkens a little; ground draws over it anyway.
  float below = clamp(-dir.y * 6.0, 0.0, 1.0);
  return mix(sky, uSkyHorizon * 0.85 + sunGlow(dir) * 0.5, below);
}

// The whole sky, for the dome.
vec3 skyAt(vec3 dir) {
  float disc = smoothstep(uSunDiscCos, uSunDiscCos + 0.0004, dot(dir, normalize(uSunDirection)));
  return skyReflect(dir) + uSunDisc * disc;
}
`;

/**
 * Mist: a slab of thicker air from the ground up to a level, the low cloud
 * that fills a basin or the river mist on the Li (design v2, "Clouds"). The
 * sight line's length inside the slab has a closed form, so it costs one
 * exponential; two octaves of noise at the far end make it lie in banks
 * rather than as one white sheet. Density zero switches it off. Needs
 * `NOISE_GLSL` before it.
 */
export const MIST_GLSL = /* glsl */ `
uniform float uMistTop;
uniform float uMistTail;
uniform float uMistDensity;
uniform vec3 uMistColor;
uniform float uMistBankScale;

float mistAlong(vec3 eye, vec3 target) {
  if (uMistDensity <= 0.0) return 0.0;
  float y0 = min(eye.y, target.y);
  float y1 = max(eye.y, target.y);
  float span = max(y1 - y0, 1e-3);
  // The share of the sight line in the mist: all of what lies below the
  // top, and above it, where the slab has a tail, the mean of a density
  // thinning as exp(-height / tail), integrated exactly. A hard top (no
  // tail) is the slab it always was.
  float inside = clamp((uMistTop - y0) / span, 0.0, 1.0);
  if (uMistTail > 0.0 && y1 > uMistTop) {
    float a = max(y0, uMistTop) - uMistTop;
    float b = y1 - uMistTop;
    inside += uMistTail * (exp(-a / uMistTail) - exp(-b / uMistTail)) / span;
  }
  vec2 p = target.xz / uMistBankScale;
  float bank = 0.35 + 1.3 * (0.65 * vnoise(p) + 0.35 * vnoise(p * 2.7 + 17.0));
  return 1.0 - exp(-uMistDensity * bank * distance(eye, target) * inside);
}

// Where ground meets a cloud deck seen from above (\`CloudLayerPreset.contactM\`):
// the ground just over the deck is seen through its thinning top, and all
// under it through its body, which no one sees the forest through; so a
// peak rises out of the cloud rather than standing on a white floor, and a
// thin place in the deck is thin cloud, not a window. By the ground's own
// height, not along the sight line, so a range forty kilometres off is not
// whitened.
uniform float uDeckTop;
uniform float uDeckBand;
uniform vec3 uDeckColor;

float deckContact(float y) {
  if (uDeckBand <= 0.0) return 0.0;
  return 1.0 - smoothstep(uDeckTop, uDeckTop + uDeckBand, y);
}
`;

/**
 * The sun's shadow on the ground, read from the depth the terrain drew from
 * the sun's point of view (`look/shadows.ts`). Nine compared taps, which the
 * hardware filters, so the edge is soft; a fade at the map's border, so the
 * ground beyond it - lit by the sun and the sky alone - joins without a
 * line; and a slope-scaled bias with a normal offset, because a triangle
 * edge-on to the sun shadows itself otherwise. The normal is the one the
 * ground is lit by (F86): a test skipped by one normal and lit by another
 * shines out of a cast shadow.
 */
export const SHADOW_GLSL = /* glsl */ `
uniform highp sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowTexel;
uniform float uShadowNormalOffset;
uniform float uShadowBias;
uniform float uShadowStrength;
uniform float uShadowOn;

float sunShadow(vec3 world, vec3 n, vec3 sunDirection) {
  if (uShadowOn < 0.5) return 1.0;
  float ndl = dot(n, sunDirection);
  if (ndl <= 0.0) return 1.0;
  vec4 p = uShadowMatrix * vec4(world + n * uShadowNormalOffset, 1.0);
  vec3 s = p.xyz / p.w;
  vec2 d = abs(s.xy - 0.5) * 2.0;
  float inside = 1.0 - smoothstep(0.85, 1.0, max(d.x, d.y));
  if (inside <= 0.0 || s.z >= 1.0 || s.z <= 0.0) return 1.0;
  float ref = s.z - uShadowBias * (1.0 + 3.0 * (1.0 - ndl));
  float lit = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      lit += texture(uShadowMap, vec3(s.xy + vec2(float(i), float(j)) * uShadowTexel, ref));
    }
  }
  return mix(1.0, lit / 9.0, inside * uShadowStrength);
}
`;

/** Value noise and its octaves, for cloud and water. Cheap and good enough. */
export const NOISE_GLSL = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = r * p * 2.03;
    a *= 0.5;
  }
  return v;
}
`;

/** Time, for the water's sparkle and the clouds' drift. */
export const TIME_GLSL = /* glsl */ `
uniform float uTime;
`;
