import { ACTION_BINDINGS, AXIS_BINDINGS, type Action } from "./bindings.js";
import { clampAxis, type AxisValues } from "./axes.js";

/**
 * The part of a `Gamepad` this reads. Structural, so a real one from
 * `navigator.getGamepads()` is accepted and a test can hand in a literal.
 */
export interface PadSnapshot {
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean }[];
}

/**
 * A stick at rest does not read zero; 0.15 is well outside where any working
 * pad idles and well inside where a thumb can hold one on purpose.
 */
export const DEAD_ZONE = 0.15;

/**
 * Dead zone with rescaling: the live range is stretched back to [-1, 1], so a
 * full deflection is still a full command and the response has no step at
 * the edge of the zone.
 */
export function deadZone(v: number, zone = DEAD_ZONE): number {
  const mag = Math.abs(v);
  if (mag <= zone) return 0;
  return clampAxis((Math.sign(v) * (mag - zone)) / (1 - zone));
}

/**
 * The axes as the table maps them: a stick where the binding names one, and
 * a pair of buttons where it does not. Pure, for the tests; `GamepadSource`
 * wraps it with the button edge-detection that needs memory.
 */
export function axesFromPad(pad: PadSnapshot): AxisValues {
  const out: AxisValues = { speed: 0, heading: 0 };
  for (const b of AXIS_BINDINGS) {
    let v = 0;
    if (b.padAxis !== null) v = deadZone(pad.axes[b.padAxis] ?? 0);
    if (b.padPlus !== null && pad.buttons[b.padPlus]?.pressed) v += 1;
    if (b.padMinus !== null && pad.buttons[b.padMinus]?.pressed) v -= 1;
    out[b.axis] = clampAxis(v);
  }
  return out;
}

export interface PadReading {
  axes: AxisValues;
  /** Buttons that went down since the last read, in table order. */
  actions: Action[];
  /** Whether any axis is off centre or any bound button is down. */
  active: boolean;
}

export class GamepadSource {
  private wasDown = new Set<number>();

  /**
   * Read a pad, or `null` for none connected. The Gamepad API is polled, not
   * evented, so this is called once a frame and does its own edge detection:
   * an action fires on the frame a button goes down, once.
   */
  read(pad: PadSnapshot | null): PadReading {
    if (!pad) {
      this.wasDown.clear();
      return { axes: { speed: 0, heading: 0 }, actions: [], active: false };
    }
    const axes = axesFromPad(pad);
    const actions: Action[] = [];
    const down = new Set<number>();
    for (const b of ACTION_BINDINGS) {
      if (!pad.buttons[b.padButton]?.pressed) continue;
      down.add(b.padButton);
      if (!this.wasDown.has(b.padButton)) actions.push(b.action);
    }
    this.wasDown = down;
    return {
      axes,
      actions,
      active: axes.speed !== 0 || axes.heading !== 0 || down.size > 0,
    };
  }
}
