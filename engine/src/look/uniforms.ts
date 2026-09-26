/**
 * The look's uniforms, as every material that draws the world declares them
 * (`look/glsl.ts`, `GROUND_LIGHT_GLSL`), and the one writer that fills them.
 *
 * Each material owns its uniform objects and the rig copies values into all
 * of them once a frame: two dozen copies into five materials, which is
 * nothing, and no material has to know which others exist. A name a
 * material does not declare is skipped; a name it declares and the rig
 * never wrote would be the bug, and the defaults here make that a picture
 * that is merely dull rather than black.
 */
import { Color, Matrix4, Vector3, type ShaderMaterial, type Texture } from "three";

export function lookUniformDefaults(): Record<string, { value: unknown }> {
  return {
    uSkyHorizon: { value: new Color(0.72, 0.79, 0.86) },
    uSkyZenith: { value: new Color(0.2, 0.4, 0.78) },
    uSunDirection: { value: new Vector3(0.45, 0.72, 0.53).normalize() },
    uSunGlow: { value: new Color(0, 0, 0) },
    uGlowPower: { value: 8 },
    uSunDisc: { value: new Color(0, 0, 0) },
    uSunDiscCos: { value: 1 },
    uSunColor: { value: new Color(1, 0.97, 0.92) },
    uAmbientZenith: { value: new Color(0.45, 0.5, 0.6) },
    uAmbientGround: { value: new Color(0.2, 0.2, 0.2) },
    uMistTop: { value: 0 },
    uMistTail: { value: 0 },
    uMistDensity: { value: 0 },
    uMistColor: { value: new Color(1, 1, 1) },
    uMistBankScale: { value: 1000 },
    uShadowMap: { value: null },
    uShadowMatrix: { value: new Matrix4() },
    uShadowTexel: { value: 0 },
    uShadowNormalOffset: { value: 0 },
    uShadowBias: { value: 0 },
    uShadowStrength: { value: 0 },
    uShadowOn: { value: 0 },
    uTime: { value: 0 },
  };
}

/** What the rig computes each frame, in the shader's units and spaces. */
export interface LookValues {
  readonly skyHorizon: Color;
  readonly skyZenith: Color;
  readonly sunDirection: Vector3;
  readonly sunGlow: Color;
  glowPower: number;
  readonly sunDisc: Color;
  sunDiscCos: number;
  readonly sunColor: Color;
  readonly ambientZenith: Color;
  readonly ambientGround: Color;
  /** World units. */
  mistTop: number;
  /** World units the mist thins over above its top; 0 is a hard top. */
  mistTail: number;
  /** Per world unit. */
  mistDensity: number;
  readonly mistColor: Color;
  /** World units: the size of a bank of mist. */
  mistBankScale: number;
  shadowMap: Texture | null;
  readonly shadowMatrix: Matrix4;
  shadowTexel: number;
  shadowNormalOffset: number;
  shadowBias: number;
  shadowStrength: number;
  shadowOn: number;
  time: number;
}

export function createLookValues(): LookValues {
  return {
    skyHorizon: new Color(0.72, 0.79, 0.86),
    skyZenith: new Color(0.2, 0.4, 0.78),
    sunDirection: new Vector3(0.45, 0.72, 0.53).normalize(),
    sunGlow: new Color(0, 0, 0),
    glowPower: 8,
    sunDisc: new Color(0, 0, 0),
    sunDiscCos: 1,
    sunColor: new Color(1, 0.97, 0.92),
    ambientZenith: new Color(0.45, 0.5, 0.6),
    ambientGround: new Color(0.2, 0.2, 0.2),
    mistTop: 0,
    mistTail: 0,
    mistDensity: 0,
    mistColor: new Color(1, 1, 1),
    mistBankScale: 1000,
    shadowMap: null,
    shadowMatrix: new Matrix4(),
    shadowTexel: 0,
    shadowNormalOffset: 0,
    shadowBias: 0,
    shadowStrength: 0,
    shadowOn: 0,
    time: 0,
  };
}

const NAMES: readonly (keyof LookValues)[] = [
  "skyHorizon",
  "skyZenith",
  "sunDirection",
  "sunGlow",
  "glowPower",
  "sunDisc",
  "sunDiscCos",
  "sunColor",
  "ambientZenith",
  "ambientGround",
  "mistTop",
  "mistTail",
  "mistDensity",
  "mistColor",
  "mistBankScale",
  "shadowMap",
  "shadowMatrix",
  "shadowTexel",
  "shadowNormalOffset",
  "shadowBias",
  "shadowStrength",
  "shadowOn",
  "time",
];

const uniformName = (k: keyof LookValues): string => `u${k[0]!.toUpperCase()}${k.slice(1)}`;

/** Copy the values into a material's uniforms, skipping any it does not declare. */
export function writeLookUniforms(material: ShaderMaterial, v: LookValues): void {
  const u = material.uniforms;
  for (const k of NAMES) {
    const slot = u[uniformName(k)];
    if (!slot) continue;
    const value = v[k];
    if (value instanceof Color || value instanceof Vector3 || value instanceof Matrix4) {
      (slot.value as { copy(o: unknown): unknown }).copy(value);
    } else {
      slot.value = value;
    }
  }
}
