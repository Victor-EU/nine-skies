import { mergeAxes, type AxisValues } from "./axes.js";
import type { Action } from "./bindings.js";
import { GamepadSource, type PadSnapshot } from "./gamepad.js";
import { KeyboardSource } from "./keyboard.js";

export type Device = "keyboard" | "gamepad";

export interface Intent extends AxisValues {
  /** Discrete presses since the last poll, keyboard first, then pad. */
  actions: Action[];
}

/**
 * One thing the frame loop asks each frame: what does the player want?
 *
 * Both devices are always live. Nothing is selected, nothing is switched -
 * a participant who picks up the pad mid-session is simply heard, and the
 * operator's keys still work over the top. `lastDevice` records which one
 * spoke most recently, for the HUD, so a session note can say what the
 * player was holding.
 */
export class Input {
  readonly keyboard = new KeyboardSource();
  readonly gamepad = new GamepadSource();
  lastDevice: Device = "keyboard";

  poll(pad: PadSnapshot | null): Intent {
    const kb = this.keyboard.axes();
    const kbActions = this.keyboard.drain();
    const gp = this.gamepad.read(pad);
    if (gp.active) this.lastDevice = "gamepad";
    else if (this.keyboard.active() || kbActions.length > 0) this.lastDevice = "keyboard";
    return { ...mergeAxes(kb, gp.axes), actions: [...kbActions, ...gp.actions] };
  }
}
