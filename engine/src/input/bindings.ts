/**
 * What the viewer can do, and what does it: one table, read by everything.
 *
 * Four inputs and no others (design v2, D74): faster, slower, direction and
 * auto. The keyboard source, the gamepad source and any on-screen help are
 * derived from this table, so a binding cannot be added to one and forgotten
 * in another. Version 1 had twenty actions here; the film has one.
 *
 * Gamepad indices are the W3C "standard" mapping: button 0 is the bottom
 * face button (A on an Xbox-shaped pad), 6 and 7 the triggers, axis 0 the
 * left stick's horizontal. Chrome reports every common pad this way.
 */

export type Axis = "speed" | "heading";

export type Action = "auto";

export interface AxisBinding {
  readonly axis: Axis;
  /** Keys that drive the axis toward +1, and toward -1, as `KeyboardEvent.key` lower-cased. */
  readonly plus: readonly string[];
  readonly minus: readonly string[];
  /** Standard-mapping stick axis, or null when the pad drives it with buttons. */
  readonly padAxis: number | null;
  /** Buttons that drive it toward +1 and -1 (the triggers, for speed). */
  readonly padPlus: number | null;
  readonly padMinus: number | null;
  readonly label: string;
}

export interface ActionBinding {
  readonly action: Action;
  readonly keys: readonly string[];
  /** Standard-mapping button. */
  readonly padButton: number;
  readonly label: string;
}

export const AXIS_BINDINGS: readonly AxisBinding[] = [
  {
    axis: "speed",
    plus: ["w", "arrowup"],
    minus: ["s", "arrowdown"],
    padAxis: null,
    padPlus: 7,
    padMinus: 6,
    label: "faster / slower",
  },
  {
    axis: "heading",
    plus: ["d", "arrowright"],
    minus: ["a", "arrowleft"],
    padAxis: 0,
    padPlus: null,
    padMinus: null,
    label: "direction",
  },
];

export const ACTION_BINDINGS: readonly ActionBinding[] = [
  { action: "auto", keys: [" "], padButton: 0, label: "auto" },
];

/** Every key the film claims, so the browser does not also get them. */
export function boundKeys(): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const b of AXIS_BINDINGS) {
    for (const k of b.plus) keys.add(k);
    for (const k of b.minus) keys.add(k);
  }
  for (const b of ACTION_BINDINGS) for (const k of b.keys) keys.add(k);
  return keys;
}

/** Names for the standard-mapping buttons, for help text. */
const PAD_BUTTON_NAMES: Record<number, string> = {
  0: "A",
  1: "B",
  2: "X",
  3: "Y",
  4: "LB",
  5: "RB",
  6: "LT",
  7: "RT",
};

export function padButtonName(index: number): string {
  return PAD_BUTTON_NAMES[index] ?? `button ${index}`;
}

const keyName = (k: string): string => (k === " " ? "Space" : k.length === 1 ? k.toUpperCase() : k.replace(/^arrow/, "") + " arrow");

export interface HelpLine {
  readonly keys: string;
  readonly pad: string;
  readonly label: string;
}

const CAPS: Record<string, string> = { " ": "Space", arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→" };

/** A key as it is printed on the key. */
export const keyCap = (k: string): string => CAPS[k] ?? k.toUpperCase();

export interface HelpCaps {
  /** Alternatives, each a pair (or one key) in reading order: left before right, faster before slower. */
  readonly caps: readonly (readonly string[])[];
  readonly label: string;
}

/** The same help as keycaps, for the film's hint: one entry per axis, then per action. */
export function helpCaps(): HelpCaps[] {
  const out: HelpCaps[] = AXIS_BINDINGS.map((b) => {
    const [first, second] = b.axis === "heading" ? [b.minus, b.plus] : [b.plus, b.minus];
    return { caps: first.map((k, i) => [keyCap(k), keyCap(second[i] ?? k)]), label: b.label };
  });
  for (const b of ACTION_BINDINGS) out.push({ caps: b.keys.map((k) => [keyCap(k)]), label: b.label });
  return out;
}

/** The help, derived: one line per axis, then one per action, in table order. */
export function helpLines(): HelpLine[] {
  const lines: HelpLine[] = AXIS_BINDINGS.map((b) => ({
    keys: `${b.plus.map(keyName).join("/")} · ${b.minus.map(keyName).join("/")}`,
    pad:
      b.padAxis !== null
        ? "stick ↔"
        : `${padButtonName(b.padPlus!)} · ${padButtonName(b.padMinus!)}`,
    label: b.label,
  }));
  for (const b of ACTION_BINDINGS)
    lines.push({ keys: b.keys.map(keyName).join("/"), pad: padButtonName(b.padButton), label: b.label });
  return lines;
}
