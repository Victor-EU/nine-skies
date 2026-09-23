import { ACTION_BINDINGS, AXIS_BINDINGS, boundKeys, type Action } from "./bindings.js";
import type { AxisValues } from "./axes.js";

/**
 * Keys are digital: a held key is the whole axis. The ramp is the rail's
 * (`film/rail.ts` integrates speed and heading over time), so there is no
 * second ramp here.
 */
export function axesFromHeld(held: ReadonlySet<string>): AxisValues {
  const out: AxisValues = { speed: 0, heading: 0 };
  for (const b of AXIS_BINDINGS) {
    const plus = b.plus.some((k) => held.has(k)) ? 1 : 0;
    const minus = b.minus.some((k) => held.has(k)) ? 1 : 0;
    out[b.axis] = plus - minus;
  }
  return out;
}

const ACTION_BY_KEY: ReadonlyMap<string, Action> = new Map(
  ACTION_BINDINGS.flatMap((b) => b.keys.map((k) => [k, b.action] as const)),
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
