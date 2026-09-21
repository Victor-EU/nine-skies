/**
 * What the player can do, and what does it - one table, read by everything.
 *
 * The prototype grew its controls the way prototypes do: a `keydown` handler
 * with a key per `if`, a hand-typed list of the same keys for
 * `preventDefault`, and a help block in the HTML naming them a third time. Three
 * copies of one fact, and the GDD asks for a gamepad from day one, which would
 * have been a fourth. This file is the fact; the keyboard source, the gamepad
 * source and the on-screen help are all derived from it, so a binding cannot
 * be added to one and forgotten in another.
 *
 * Gamepad indices are the W3C "standard" mapping: buttons 0-3 are the face
 * buttons (A B X Y on an Xbox-shaped pad), 4-5 the shoulders, 12-15 the d-pad,
 * axis 0-1 the left stick. Chrome reports every common pad this way.
 */

export type Axis = "pitch" | "roll";

export type Action =
  | "low"
  | "cruise"
  | "boost"
  | "cycleCompression"
  | "cycleDrama"
  | "cyclePacing"
  | "toggleHorizon"
  | "cycleFov"
  | "cycleBankFollow"
  | "cycleTextScale"
  | "cycleUnits"
  | "toggleExpedition"
  | "toggleMap"
  | "toggleChallenge"
  | "retryChallenge"
  | "toggleStopwatch"
  | "toggleOperator"
  | "reset";

export interface AxisBinding {
  axis: Axis;
  /** The key that drives the axis toward +1, and the one toward -1. */
  plus: string;
  minus: string;
  /** Standard-mapping stick axis. */
  padAxis: number;
  /**
   * Whether the stick's sign is the opposite of the axis's. The standard
   * mapping reads a stick pushed forward as negative, and pitch +1 is a climb.
   */
  padInvert: boolean;
  label: string;
}

export interface ActionBinding {
  action: Action;
  key: string;
  /** Standard-mapping button, or null for a keyboard-only operator control. */
  padButton: number | null;
  label: string;
  /**
   * Bindings sharing a group are one line of help - "1/2/3 low / cruise /
   * boost" rather than three lines.
   */
  group?: string;
  /** Shown after the group's line, in the operator's voice. */
  note?: string;
}

/**
 * Pitch is not inverted: pushing the stick forward climbs, because `W` climbs
 * and the G1 cohort has no flight-sim habits to honour. That is a default and
 * not a finding; `invertPitch` on the gamepad source flips it for anyone who
 * does.
 */
export const AXIS_BINDINGS: readonly AxisBinding[] = [
  { axis: "pitch", plus: "w", minus: "s", padAxis: 1, padInvert: true, label: "pitch" },
  { axis: "roll", plus: "d", minus: "a", padAxis: 0, padInvert: false, label: "roll" },
];

export const ACTION_BINDINGS: readonly ActionBinding[] = [
  { action: "low", key: "1", padButton: 2, label: "low", group: "mode" },
  { action: "cruise", key: "2", padButton: 0, label: "cruise", group: "mode" },
  { action: "boost", key: "3", padButton: 3, label: "boost", group: "mode" },
  {
    action: "cycleDrama",
    key: "v",
    padButton: 12,
    label: "drama A 4 / 6 / 9",
    note: "the G1 question",
  },
  {
    action: "cyclePacing",
    key: "p",
    padButton: 13,
    label: "cruise 80 / 130 / 190 km/min",
    note: "free flight only — Expedition 1 is paced per leg, F18",
  },
  {
    action: "cycleCompression",
    key: "c",
    padButton: 15,
    label: "compression 1:5 / 1:8 / 1:12",
    note: "a change of units — it should look identical, F15",
  },
  { action: "toggleHorizon", key: "h", padButton: 14, label: "horizon impostor on/off" },
  {
    action: "cycleFov",
    key: "f",
    padButton: 4,
    label: "field of view 50 / 62 / 75 / 90",
    note: "comfort — how much peripheral flow there is, and free (F35)",
  },
  {
    action: "cycleBankFollow",
    key: "l",
    padButton: 5,
    label: "camera bank locked / eased / with the wing",
    note: "comfort — 0 is the GDD's horizon lock, and what the prototype did (F35)",
  },
  {
    action: "cycleTextScale",
    // Keyboard only, and so is the line below it. The standard mapping has
    // seventeen buttons, this table already claims fifteen, and a setting a
    // player changes once is the wrong thing to spend the last one on. Both
    // are cycles so that a G1 operator can set them without a menu; the
    // shipped build gets the menu.
    key: "z",
    padButton: null,
    label: "text size 100 / 125 / 150 %",
    note: "comfort - it scales the whole HUD from one property (F45)",
  },
  {
    action: "cycleUnits",
    key: "u",
    padButton: null,
    label: "units metric / imperial",
    note:
      "the readings move - altitude, ground, temperature, climb, map " +
      "distances. The operator's own numbers stay in the units the findings " +
      "are written in (F45)",
  },
  {
    action: "toggleExpedition",
    key: "x",
    padButton: 8,
    label: "fly the authored expedition on/off",
    note:
      "off is free flight, which is what G1 flies — on gives the route its own " +
      "leg speeds and holds the pacing at what its clearance was checked at (F38)",
  },
  {
    action: "toggleMap",
    key: "m",
    padButton: 6,
    label: "map overlay on/off",
    note:
      "the GDD's first five minutes end with this opening once by itself, so " +
      "the player learns the key exists (F42)",
  },
  {
    action: "toggleChallenge",
    key: "g",
    padButton: 7,
    label: "fly the authored challenge on/off",
    note:
      "picks up where the aircraft is; the objectives are scored on the track " +
      "flown, and a teleport credits none of them (D37, F43)",
  },
  {
    action: "retryChallenge",
    key: "t",
    padButton: 1,
    label: "retry the challenge from its start",
    note: "the GDD's instant retry — it costs nothing and nothing counts attempts",
  },
  {
    action: "toggleStopwatch",
    key: "y",
    padButton: 11,
    label: "stopwatch on/off",
    note:
      "off by default, as the GDD asks. It is scored against nothing: a " +
      "challenge's own deadline, where it has one, is always shown (F43)",
  },
  {
    action: "toggleOperator",
    // Keyboard only, and the last of the three that are: this one is not a
    // player control at all.
    key: "o",
    padButton: null,
    label: "operator column on/off",
    note:
      "off by default. The debug column and this help block are 92 % of the " +
      "HUD's ink and 46 % of the screen, and none of it is in the GDD's HUD " +
      "paragraph - a cohort reading it is reading the instrument rather than " +
      "the game (F46)",
  },
  { action: "reset", key: "r", padButton: 9, label: "reset to the start" },
];

/** Every key the game claims, so the browser does not also get them. */
export function boundKeys(): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const b of AXIS_BINDINGS) {
    keys.add(b.plus);
    keys.add(b.minus);
  }
  for (const b of ACTION_BINDINGS) keys.add(b.key);
  return keys;
}

/** Names for the standard-mapping buttons, for the help text. */
const PAD_BUTTON_NAMES: Record<number, string> = {
  0: "A",
  1: "B",
  2: "X",
  3: "Y",
  4: "LB",
  5: "RB",
  6: "LT",
  7: "RT",
  8: "Back",
  9: "Start",
  12: "D-up",
  13: "D-down",
  14: "D-left",
  15: "D-right",
};

export function padButtonName(index: number): string {
  return PAD_BUTTON_NAMES[index] ?? `button ${index}`;
}

export interface HelpLine {
  /** "W/S", "1/2/3" */
  keys: string;
  /** "stick ↕", "X/A/Y", or "" when the line has no gamepad binding. */
  pad: string;
  /** "pitch", "low / cruise / boost" */
  label: string;
  note: string;
}

/**
 * The help block, derived. One line per axis, then one per action group, in
 * table order - which is also the order a player needs them in.
 */
export function helpLines(): HelpLine[] {
  const lines: HelpLine[] = AXIS_BINDINGS.map((b) => ({
    keys: `${b.plus.toUpperCase()}/${b.minus.toUpperCase()}`,
    pad: `stick ${b.padAxis === 0 ? "↔" : "↕"}`,
    label: b.label,
    note: "",
  }));
  const groups = new Map<string, ActionBinding[]>();
  for (const b of ACTION_BINDINGS) {
    const key = b.group ?? b.action;
    const list = groups.get(key);
    if (list) list.push(b);
    else groups.set(key, [b]);
  }
  for (const members of groups.values()) {
    const withPad = members.filter((m) => m.padButton !== null);
    lines.push({
      keys: members.map((m) => m.key.toUpperCase()).join("/"),
      pad: withPad.map((m) => padButtonName(m.padButton!)).join("/"),
      label: members.map((m) => m.label).join(" / "),
      note: members.find((m) => m.note)?.note ?? "",
    });
  }
  return lines;
}
