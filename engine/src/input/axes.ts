/**
 * The two continuous inputs the film has (design v2, controls).
 *
 * `speed` is faster (+1) or slower (-1), and `heading` is right (+1) or left
 * (-1). There is no pitch: altitude is the controller's, never the viewer's.
 */
export interface AxisValues {
  /** -1 (slower) .. +1 (faster). */
  speed: number;
  /** -1 (left) .. +1 (right). */
  heading: number;
}

export const NO_AXES: Readonly<AxisValues> = Object.freeze({ speed: 0, heading: 0 });

export function clampAxis(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

/**
 * Two devices saying something at once add up and saturate. Summing rather
 * than picking a winner means a stick nudge on top of a held key is heard,
 * and a key on top of a full stick is not a second full stick.
 */
export function mergeAxes(a: AxisValues, b: AxisValues): AxisValues {
  return { speed: clampAxis(a.speed + b.speed), heading: clampAxis(a.heading + b.heading) };
}
