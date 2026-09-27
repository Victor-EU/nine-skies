/**
 * Omens (D93): what the picture does a moment before a figure arrives, so
 * the arrival is felt before it is seen. The cranes break and scatter, and
 * a second later a dragon breaks the cloud; everything on stage turns to
 * look, and then the Bodhisattva's seat comes in. The fifth of the cast's
 * plug axes, after the figure, the skin, the cue and the motion.
 *
 * An omen is a witness's reaction. The witness is another figure on stage
 * when the arrival comes, or one brought on for it. The director plans it
 * when the arriving figure's temperament brings an omen and a witness is at
 * hand, and writes it on the witness's visit. At play, the omen's module
 * wraps the witness's motion: it moves as it would until it reacts, and
 * then as the omen says.
 *
 * This file is what the director and the gate know of each omen, its traits,
 * with no geometry. `omens/` holds one module per omen, which registers its
 * wrap by being imported, as motions do; the cast tests hold this list and
 * the registry to each other.
 */
import type { CastCue } from "../film/scene.js";
import type { Motion, PoseOf, Visit } from "./motion.js";
import type { Rng } from "./random.js";
import type { Temperament } from "./temperament.js";

export interface OmenTraits {
  /** Who reacts: a figure that takes fright, or any that looks about it. */
  readonly witness: "skittish" | "curious";
  /** Seconds before the arrival the witness reacts, least and most. */
  readonly leadS: readonly [number, number];
  /** Seconds the witness stays in the picture once it has reacted; null to stay its visit out. */
  readonly leaveS: number | null;
  /** Whether the director may bring a witness on for it when none is on stage. */
  readonly summons: boolean;
}

export const OMENS = {
  /** The birds break off whatever they were doing and flee, away from where it is coming. */
  scatter: { witness: "skittish", leadS: [1.2, 2.2], leaveS: 2.6, summons: true },
  /** Everyone on stage turns to look where it is coming from, and keeps looking as it comes. */
  look: { witness: "curious", leadS: [1.5, 3], leaveS: null, summons: false },
} as const satisfies Readonly<Record<string, OmenTraits>>;

export type OmenKind = keyof typeof OMENS;

export const OMEN_KINDS = Object.keys(OMENS) as readonly OmenKind[];

export function isOmenKind(name: string): name is OmenKind {
  return Object.hasOwn(OMENS, name);
}

/** Whether a figure of this temperament witnesses an omen of this kind. */
export function witnesses(kind: OmenKind, t: Temperament): boolean {
  return OMENS[kind].witness === "skittish" ? t.skittish : t.curiosity > 0;
}

/** A witness's reaction, as the director writes it on the witness's visit. */
export interface Reaction {
  readonly omen: OmenKind;
  /** The second it reacts. */
  readonly atS: number;
  /** The cue whose figure arrives, and the second it is first seen. */
  readonly arrival: number;
  readonly arrivalS: number;
  /** The second the witness's path was laid to end at, before the omen cut it short. */
  readonly pathUntilS: number;
}

export interface OmenContext {
  readonly reaction: Reaction;
  readonly cue: CastCue;
  readonly visit: Visit;
  readonly temperament: Temperament;
  /** The reaction's own dice. */
  readonly rng: Rng;
  /** The arriving figure's pose, in the frame, at a second; false while it is off stage. */
  readonly threat: PoseOf;
  /** The witness's own motion for a visit: an omen lays it for the whole path, and takes over at the reaction. */
  readonly build: (visit: Visit) => Motion | null;
}

export type OmenWrap = (ctx: OmenContext) => Motion | null;

const wraps = new Map<OmenKind, OmenWrap>();

/** A wrap for an omen the list knows; registering one it does not is a programming error. */
export function registerOmen(kind: string, wrap: OmenWrap): void {
  if (!isOmenKind(kind)) throw new Error(`"${kind}" is not in OMENS; add it there first`);
  wraps.set(kind, wrap);
}

export function omenWrap(kind: string): OmenWrap | null {
  return isOmenKind(kind) ? (wraps.get(kind) ?? null) : null;
}

export function registeredOmens(): readonly OmenKind[] {
  return [...wraps.keys()];
}
