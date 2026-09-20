export interface AxisValues {
  /** -1 (descend) .. +1 (climb). */
  pitch: number;
  /** -1 (left) .. +1 (right). */
  roll: number;
}

export const NO_AXES: Readonly<AxisValues> = Object.freeze({ pitch: 0, roll: 0 });

export function clampAxis(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

/**
 * Two devices saying something at once add up and saturate. Summing rather
 * than picking a winner means a stick nudge on top of a held key is heard,
 * and a key on top of a full stick is not a second full stick.
 */
export function mergeAxes(a: AxisValues, b: AxisValues): AxisValues {
  return { pitch: clampAxis(a.pitch + b.pitch), roll: clampAxis(a.roll + b.roll) };
}
