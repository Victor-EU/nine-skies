/**
 * A figure of the cast (D91): what the layer asks of one, and the registry
 * a scene's `figure:` name is looked up in.
 *
 * A figure is built once for its cue at its native size, in its own units,
 * and the layer scales its group to the cue's real metres. Each frame it is
 * handed the time and where the camera is, and it moves itself; where its
 * group stands is the layer's business, not the figure's. It draws nothing
 * of its own: every material comes from the skin it was built with.
 *
 * Builders register themselves by importing `figures/index.ts`, which the
 * shell does only when the viewer switches the cast on, so a film with the
 * cast off carries none of this.
 */
import type { Group, Object3D, Vector3 } from "three";
import type { WorldScale } from "../sim/scale.js";
import { isFigureKind, type FigureKind } from "./kinds.js";
import type { Skin } from "./skin.js";

export interface CastFrame {
  /** Seconds, any origin. */
  readonly timeS: number;
  /** Seconds into the flight. */
  readonly flightS: number;
  /** The camera, world units, and the way it faces. */
  readonly eye: Vector3;
  readonly headingRad: number;
  /** The figure's group, so it may be placed. */
  readonly group: Group;
}

export interface Figure {
  readonly group: Group;
  /** The longest extent of the figure in its own units, for the layer's scaling. */
  readonly nativeSize: number;
  /** Triangles drawn, for the budget it is held to. */
  readonly triangles: number;
  update(f: CastFrame): void;
  /** Dress every part again from a skin, for a swap. */
  setSkin(skin: Skin): void;
  dispose(): void;
}

export interface BuildContext {
  readonly skin: Skin;
  readonly variant: string | null;
  readonly scale: WorldScale;
}

export type FigureBuilder = (ctx: BuildContext) => Figure;

const builders = new Map<FigureKind, FigureBuilder>();

/** A builder for a kind the list knows; registering a kind it does not is a programming error. */
export function registerFigure(kind: string, builder: FigureBuilder): void {
  if (!isFigureKind(kind)) throw new Error(`"${kind}" is not in FIGURE_KINDS; add it there first`);
  builders.set(kind, builder);
}

export function figureBuilder(kind: string): FigureBuilder | null {
  return isFigureKind(kind) ? (builders.get(kind) ?? null) : null;
}

export function registeredFigures(): readonly FigureKind[] {
  return [...builders.keys()];
}

/** Free a figure's geometry; materials belong to the skin. */
export function disposeObject(o: Object3D): void {
  o.traverse((c) => {
    const mesh = c as { geometry?: { dispose(): void } };
    mesh.geometry?.dispose();
  });
}
