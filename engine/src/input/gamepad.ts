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
 * The axes as the table maps them. Pure, for the tests; `GamepadSource`
 * wraps it with the button edge-detection that needs memory.
 */
export function axesFromPad(pad: PadSnapshot, invertPitch = false): AxisValues {
  const out: AxisValues = { pitch: 0, roll: 0 };
  for (const b of AXIS_BINDINGS) {
    const raw = pad.axes[b.padAxis] ?? 0;
    let v = deadZone(b.padInvert ? -raw : raw);
    if (b.axis === "pitch" && invertPitch) v = -v;
    out[b.axis] = v;
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
  /** Forward-stick climbs by default; see the note on `AXIS_BINDINGS`. */
  invertPitch = false;

  /**
   * Read a pad, or `null` for none connected. The Gamepad API is polled, not
   * evented, so this is called once a frame and does its own edge detection:
   * an action fires on the frame a button goes down, once.
   */
  read(pad: PadSnapshot | null): PadReading {
    if (!pad) {
      this.wasDown.clear();
      return { axes: { pitch: 0, roll: 0 }, actions: [], active: false };
    }
    const axes = axesFromPad(pad, this.invertPitch);
    const actions: Action[] = [];
    const down = new Set<number>();
    for (const b of ACTION_BINDINGS) {
      if (b.padButton === null) continue;
      if (!pad.buttons[b.padButton]?.pressed) continue;
      down.add(b.padButton);
      if (!this.wasDown.has(b.padButton)) actions.push(b.action);
    }
    this.wasDown = down;
    return {
      axes,
      actions,
      active: axes.pitch !== 0 || axes.roll !== 0 || down.size > 0,
    };
  }
}
