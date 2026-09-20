import { ACTION_BINDINGS, AXIS_BINDINGS, boundKeys, type Action } from "./bindings.js";
import type { AxisValues } from "./axes.js";

/**
 * Keys are digital: a held key is the whole axis. There is deliberately no
 * ramp on top of that. The flight model already lags every command by its own
 * time constant - four seconds on pitch, one and a half on bank, both longer
 * over the plateau - so a ramp of any length a hand would tolerate is
 * invisible underneath it (F33). What a stick adds is not smoothness but
 * partial deflection, and that is the gamepad's job.
 */
export function axesFromHeld(held: ReadonlySet<string>): AxisValues {
  const out: AxisValues = { pitch: 0, roll: 0 };
  for (const b of AXIS_BINDINGS) {
    out[b.axis] = (held.has(b.plus) ? 1 : 0) - (held.has(b.minus) ? 1 : 0);
  }
  return out;
}

const ACTION_BY_KEY: ReadonlyMap<string, Action> = new Map(
  ACTION_BINDINGS.map((b) => [b.key, b.action]),
);

const BOUND = boundKeys();

export class KeyboardSource {
  private readonly held = new Set<string>();
  private pending: Action[] = [];

  /**
   * Feed a `keydown`. Returns whether the key is one of ours, which is the
   * answer to whether the browser should also get it. Keys arrive as
   * `KeyboardEvent.key`, lower-cased by the caller so Shift does not make
   * `W` a different key.
   */
  keyDown(key: string): boolean {
    if (!BOUND.has(key)) return false;
    // Auto-repeat re-fires keydown while a key is held. The axes do not care;
    // an action must not fire again for it, so only the first press counts.
    if (!this.held.has(key)) {
      this.held.add(key);
      const action = ACTION_BY_KEY.get(key);
      if (action) this.pending.push(action);
    }
    return true;
  }

  keyUp(key: string): void {
    this.held.delete(key);
  }

  /** The window lost focus: every key is released, or it stays held forever. */
  releaseAll(): void {
    this.held.clear();
  }

  axes(): AxisValues {
    return axesFromHeld(this.held);
  }

  /** Actions pressed since the last drain, in order. */
  drain(): Action[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  /** Whether the keyboard is saying anything at all right now. */
  active(): boolean {
    return this.held.size > 0;
  }
}
