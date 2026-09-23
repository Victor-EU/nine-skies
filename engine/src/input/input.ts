import { mergeAxes, NO_AXES, type AxisValues } from "./axes.js";
import type { Action } from "./bindings.js";
import { GamepadSource, type PadSnapshot } from "./gamepad.js";
import { KeyboardSource } from "./keyboard.js";

export type Device = "keyboard" | "gamepad" | "touch";

export interface Intent extends AxisValues {
  /** Discrete presses since the last poll, keyboard first, then pad, then touch. */
  actions: Action[];
}

/**
 * The on-screen controls: a drag for direction and two held buttons for
 * speed. The shell owns the pointer events and writes what they mean here;
 * this class only remembers it until the frame asks.
 */
export class TouchSource {
  private axes: AxisValues = { ...NO_AXES };
  private pending: Action[] = [];

  set(axes: Partial<AxisValues>): void {
    this.axes = { ...this.axes, ...axes };
  }

  press(action: Action): void {
    this.pending.push(action);
  }

  read(): { axes: AxisValues; actions: Action[]; active: boolean } {
    const actions = this.pending;
    this.pending = [];
    return {
      axes: { ...this.axes },
      actions,
      active: this.axes.speed !== 0 || this.axes.heading !== 0 || actions.length > 0,
    };
  }
}

/**
 * One thing the frame loop asks each frame: what does the viewer want?
 *
 * Every device is always live. Nothing is selected, nothing is switched: a
 * viewer who picks up a pad mid-film is simply heard. `lastDevice` records
 * which one spoke most recently, so the on-screen hint can name its keys.
 */
export class Input {
  readonly keyboard = new KeyboardSource();
  readonly gamepad = new GamepadSource();
  readonly touch = new TouchSource();
  lastDevice: Device = "keyboard";

  poll(pad: PadSnapshot | null): Intent {
    const kb = this.keyboard.axes();
    const kbActions = this.keyboard.drain();
    const gp = this.gamepad.read(pad);
    const tp = this.touch.read();
    if (tp.active) this.lastDevice = "touch";
    else if (gp.active) this.lastDevice = "gamepad";
    else if (this.keyboard.active() || kbActions.length > 0) this.lastDevice = "keyboard";
    return {
      ...mergeAxes(mergeAxes(kb, gp.axes), tp.axes),
      actions: [...kbActions, ...gp.actions, ...tp.actions],
    };
  }
}
