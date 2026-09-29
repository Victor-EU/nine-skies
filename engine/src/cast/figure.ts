/**
 * A figure of the cast (D91): what the layer asks of one, and the registry
 * a scene's `figure:` name is looked up in.
 *
 * A figure is built once for its cue at its native size, in its own units,
 * and the layer scales its group to the cue's real metres. Each frame it is
 * handed the time and where the camera is, and it moves itself; where its
 * group stands is the layer's business, not the figure's. A figure made in
 * code draws nothing of its own: every material comes from the skin it was
 * built with. A painted one (D94) is a picture, and brings it.
 *
 * Builders register themselves by importing `figures/index.ts`, which the
 * shell does only when the viewer switches the cast on, so a film with the
 * cast off carries none of this. A figure with a painting registers it too,
 * from `paintings/index.ts`, and the painting is drawn in its place.
 */
import type { Group, Object3D, Vector3, WebGLRenderer } from "three";
import type { WorldScale } from "../sim/scale.js";
import type { CastLight } from "./cast.js";
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
  /** 0 to 1: how frightened it is, when an omen has scattered it (D93); a flock breaks its formation. */
  readonly alarm?: number;
  /** The scene's light this frame, for a figure that brings its own picture and must be lit by hand (D94). */
  readonly light?: CastLight;
  /**
   * How fast it goes by its own motion (D96), for a painting whose body
   * works with it: body lengths a second through the picture for one in
   * the camera's frame, over the ground for one in the world, and whether
   * it keeps pace with the flight besides.
   */
  readonly pace?: Pace;
}

export interface Pace {
  readonly bodiesPerS: number;
  readonly withFlight: boolean;
}

/**
 * A head the layer may turn toward something (D93): a pivot of the
 * figure's own that its animation never touches, facing +z at rest in its
 * parent, and how far it turns either way. The layer turns it after the
 * figure's `update`, so a head the figure tosses still tosses, and looks.
 */
export interface Head {
  readonly pivot: Object3D;
  readonly maxYawRad: number;
  readonly maxPitchRad: number;
}

export interface Figure {
  readonly group: Group;
  /** The longest extent of the figure in its own units, for the layer's scaling. */
  readonly nativeSize: number;
  /** Triangles drawn, for the budget it is held to. */
  readonly triangles: number;
  update(f: CastFrame): void;
  /** Its heads, for a glance at the lens or at what is coming; absent for a figure with none to turn. */
  readonly heads?: readonly Head[];
  /** Dress every part again from a skin, for a swap. */
  setSkin(skin: Skin): void;
  /**
   * Hand what it has loaded to the GPU before it is first drawn, so the
   * frame it comes on does not wait for it (F123): true if there was
   * anything to hand. Absent for a figure made in code.
   */
  warm?(renderer: WebGLRenderer): boolean;
  dispose(): void;
}

export interface BuildContext {
  readonly skin: Skin;
  readonly variant: string | null;
  readonly scale: WorldScale;
}

export type FigureBuilder = (ctx: BuildContext) => Figure;

const builders = new Map<FigureKind, FigureBuilder>();
const painted = new Map<FigureKind, FigureBuilder>();

/** A builder for a kind the list knows; registering a kind it does not is a programming error. */
export function registerFigure(kind: string, builder: FigureBuilder): void {
  if (!isFigureKind(kind)) throw new Error(`"${kind}" is not in FIGURE_KINDS; add it there first`);
  builders.set(kind, builder);
}

/** A painted figure for a kind (D94), built in place of the code-made one once registered. */
export function registerPainted(kind: string, builder: FigureBuilder): void {
  if (!isFigureKind(kind)) throw new Error(`"${kind}" is not in FIGURE_KINDS; add it there first`);
  painted.set(kind, builder);
}

/** The kind's figure made in code, whether or not it has a painting. */
export function madeBuilder(kind: string): FigureBuilder | null {
  return isFigureKind(kind) ? (builders.get(kind) ?? null) : null;
}

/** The kind's builder: its painting's when one is registered, else the one made in code. */
export function figureBuilder(kind: string): FigureBuilder | null {
  return isFigureKind(kind) ? (painted.get(kind) ?? builders.get(kind) ?? null) : null;
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
