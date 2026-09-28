/**
 * A painted figure (D94): the cast drawn as pictures instead of made in
 * code. The code-made figures read as toys over photographed ground; a
 * painting, drawn from a brief in `content/paintings/` and kept with
 * `nineskies.paintings keep`, is the figure as a film's concept art would
 * have it.
 *
 * The picture is a card, upright and turned to the camera, so it is seen
 * face on from wherever the figure's motion takes it; where the card stands
 * and how large it is are the layer's, as for any figure. It is mirrored
 * when the figure moves the other way across the picture from the way it
 * faces in the painting, so it never flies backwards, and swings round
 * through edge on to do it rather than jumping. The world is laid out
 * left-handed and the grade turns the picture round at the end (F100), so
 * a painting laid in it reads the right way only mirrored once more.
 *
 * The scene's haze is over it as over the ground. Its light is the
 * painting's own, soft by its brief, and the scene's light is laid over
 * that as a tint: whole at the film's noon, warmer and darker as the sun
 * goes down, so an evening figure is not lit by a morning that is not
 * there.
 *
 * A figure with a painting registers it from its own file under
 * `paintings/`, a view for each variant it has been painted in. A cue
 * whose variant has none is drawn by the figure made in code, which stays
 * registered for that and for a film without the paintings.
 */
import { Color, CustomBlending, DoubleSide, Group, Mesh, MeshBasicMaterial, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry, Quaternion, SRGBColorSpace, TextureLoader, Vector3, type Texture } from "three";
import type { CastLight } from "./cast.js";
import { madeBuilder, registerPainted, type BuildContext, type CastFrame, type Figure } from "./figure.js";

export interface PaintingView {
  /** The cue variant it is drawn for, or `default` for any variant without a view of its own. */
  readonly name: string;
  /** The picture, relative to the page: a WebP with alpha cut to the figure. */
  readonly url: string;
  /** Which way the figure faces, or moves, in the picture. */
  readonly faces: "left" | "right";
  /** The picture's width over its height, as kept. */
  readonly aspect: number;
  /**
   * Where the figure's origin is, a share of the picture's height from its
   * foot: the feet of one that stands or walks, the body's middle for one
   * that flies. The card turns about it.
   */
  readonly feet: number;
  /**
   * What a cue's size measures, as its figure made in code did: feet to
   * crown for one that stands (shares of the height, so plumes and the
   * cloud under it are over and above), or its length across the picture
   * for one that walks or flies (a share of the width, nose to tail or
   * wingtip to wingtip).
   */
  readonly size: { readonly crown: number } | { readonly across: number };
}

export interface Painting {
  readonly views: readonly PaintingView[];
}

/**
 * How far a figure's heading must lie across the picture, as a share of
 * its whole, before the card mirrors to it: a figure coming straight at the
 * camera keeps the side it had rather than flickering between the two.
 */
export const MIRROR_AT = 0.25;

/** Seconds the card takes to swing round when the figure turns the other way: edge on halfway, never a jump. */
export const TURN_S = 0.4;

/**
 * The most of the picture a painting may fill, radians of the view: about
 * 45 per cent of its height and 70 of its width. A painted figure is staged
 * for a quarter of the frame where its author put it (D94); a motion that
 * brings it past the lens would otherwise fill the picture with its knees.
 */
export const MOST_TALL_RAD = 0.5;
export const MOST_WIDE_RAD = 1.1;

/** How much a card is shrunk so it fills no more of the view than that, at `distance`: 1 when it already does not. */
export function heldTo(heightWorld: number, widthWorld: number, distance: number): number {
  return Math.min(1, (MOST_TALL_RAD * distance) / heightWorld, (MOST_WIDE_RAD * distance) / widthWorld);
}

/**
 * The scene's light on a painting: the sun's colour and the sky's, in the
 * shares a matte surface facing the camera takes them, over what they sum
 * to at the film's noon, channel by channel (First Bend, 12:00 in June,
 * measured 28 September 2026), so noon is the painting as painted. Only
 * `PAINTED_BY` of the way there, since the painting has its own soft light
 * and a dusk that took all of it would leave a silhouette; held to a
 * little over whole.
 */
export const PAINTED_SUN = 0.55;
export const PAINTED_SKY = 1;
export const NOON_LIGHT: readonly [number, number, number] = [0.875, 0.92, 1.014];
export const PAINTED_BY = 0.8;
const MOST = 1.1;

const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);

/** The view a cue is drawn from: the one its variant names, else the default, else none. */
export function viewFor(painting: Painting, variant: string | null): PaintingView | null {
  return painting.views.find((v) => v.name === variant) ?? painting.views.find((v) => v.name === "default") ?? null;
}

/** A view's size in its own units, picture heights: what the layer divides a cue's size by. */
export function viewSize(view: PaintingView): number {
  return "crown" in view.size ? view.size.crown - view.feet : view.size.across * view.aspect;
}

/**
 * Whether the card is mirrored: given how far the figure heads to the
 * picture's right (the sine of its heading across the view, -1 to 1), which
 * way it faces in the painting, and whether it was mirrored last frame.
 */
export function mirrored(acrossRight: number, faces: PaintingView["faces"], was: boolean): boolean {
  if (Math.abs(acrossRight) < MIRROR_AT) return was;
  return acrossRight > 0 !== (faces === "right");
}

/** The tint the scene's light lays over a painting, into `out`. */
export function paintedLight(light: Pick<CastLight, "sunColor" | "ambientZenith">, out: Color): Color {
  const s = light.sunColor;
  const k = light.ambientZenith;
  const channel = (sun: number, sky: number, noon: number) => Math.min(MOST, 1 - PAINTED_BY * (1 - (PAINTED_SUN * sun + PAINTED_SKY * sky) / noon));
  return out.setRGB(channel(s.r, k.r, NOON_LIGHT[0]), channel(s.g, k.g, NOON_LIGHT[1]), channel(s.b, k.b, NOON_LIGHT[2]));
}

class PaintedFigure implements Figure {
  readonly group = new Group();
  readonly nativeSize: number;
  readonly triangles = 2;
  private readonly card: Mesh;
  private readonly material: MeshBasicMaterial;
  private texture: Texture | null = null;
  private isMirrored = false;
  /** -1 as painted to 1 mirrored, through nought as the card swings round. */
  private turn = -1;
  private lastS: number | null = null;
  private disposed = false;
  private readonly want = new Quaternion();
  private readonly heading = new Vector3();

  constructor(private readonly view: PaintingView) {
    this.nativeSize = viewSize(view);
    // It writes its depth, as the code-made figures do, so the cloud sea drawn after it is hidden where the figure is in front.
    // The picture is premultiplied as it is uploaded (below), so the blend
    // takes its colour as it comes: the material's own premultiplying would
    // multiply by alpha twice, and every soft edge - a cloud's wisps, a
    // plume - came out ringed in dark (28 September 2026).
    this.material = new MeshBasicMaterial({
      transparent: true,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      alphaTest: 0.05,
      side: DoubleSide,
    });
    // A picture a unit high, its origin at the figure's, so it turns about that.
    this.card = new Mesh(new PlaneGeometry(1, 1).translate(0, 0.5 - view.feet, 0), this.material);
    this.card.name = `painting:${view.url}`;
    this.card.scale.set(view.aspect * this.turn, 1, 1);
    this.card.visible = false;
    this.group.add(this.card);
    void new TextureLoader().loadAsync(view.url).then(
      (t) => {
        if (this.disposed) {
          t.dispose();
          return;
        }
        t.colorSpace = SRGBColorSpace;
        // Filtered with its alpha, or the edges fringe with whatever colour the clear pixels hold.
        t.premultiplyAlpha = true;
        t.anisotropy = 4;
        this.texture = t;
        this.material.map = t;
        this.material.needsUpdate = true;
        this.card.visible = true;
      },
      (e: unknown) => {
        // A picture that will not load leaves the figure unseen, not the film stopped.
        console.warn(`the painting ${view.url} did not load`, e);
      },
    );
  }

  update(f: CastFrame): void {
    const g = f.group;
    if (f.light) paintedLight(f.light, this.material.color);
    // Upright and turned to the eye, whatever the layer turned the figure to.
    this.want.setFromAxisAngle(UP, Math.atan2(f.eye.x - g.position.x, f.eye.z - g.position.z));
    this.card.quaternion.copy(g.quaternion).invert().multiply(this.want);
    // The way the figure heads, across the picture: the camera's right is (cos h, 0, -sin h).
    this.heading.copy(FORWARD).applyQuaternion(g.quaternion);
    const across = this.heading.x * Math.cos(f.headingRad) - this.heading.z * Math.sin(f.headingRad);
    this.isMirrored = mirrored(across / Math.max(1e-6, Math.hypot(this.heading.x, this.heading.z)), this.view.faces, this.isMirrored);
    // Negative is the painting as painted, in this world (F100).
    const dt = this.lastS === null ? Infinity : Math.max(0, f.timeS - this.lastS);
    this.lastS = f.timeS;
    const side = this.isMirrored ? 1 : -1;
    const step = (2 * dt) / TURN_S;
    this.turn = Math.abs(side - this.turn) <= step ? side : this.turn + Math.sign(side - this.turn) * step;
    const k = heldTo(g.scale.y, g.scale.x * this.view.aspect, f.eye.distanceTo(g.position));
    this.card.scale.set(this.view.aspect * this.turn * k, k, 1);
  }

  setSkin(): void {
    // A painting is its own substance.
  }

  dispose(): void {
    this.disposed = true;
    this.card.geometry.dispose();
    this.material.dispose();
    this.texture?.dispose();
  }
}

const paintings = new Map<string, Painting>();

/** The paintings registered, by figure kind, for the checks that hold them to their files. */
export function registeredPaintings(): ReadonlyMap<string, Painting> {
  return paintings;
}

function check(kind: string, v: PaintingView): void {
  const where = `the painting of "${kind}", ${v.name}`;
  if (!(v.aspect > 0)) throw new Error(`${where}: its aspect must be a width over a height`);
  if (!(v.feet >= 0 && v.feet < 1)) throw new Error(`${where}: its feet must be inside the picture`);
  if ("crown" in v.size ? !(v.size.crown > v.feet && v.size.crown <= 1) : !(v.size.across > 0 && v.size.across <= 1)) {
    throw new Error(`${where}: its size must be a crown above its feet, or a share of its width`);
  }
}

/** A figure kind drawn from its painting from now on, in the variants it has views for. */
export function registerPainting(kind: string, painting: Painting): void {
  if (painting.views.length === 0) throw new Error(`the painting of "${kind}" has no views`);
  for (const v of painting.views) check(kind, v);
  registerPainted(kind, (ctx: BuildContext) => {
    const view = viewFor(painting, ctx.variant);
    if (view) return new PaintedFigure(view);
    const made = madeBuilder(kind);
    if (!made) throw new Error(`"${kind}" has no view for ${ctx.variant ?? "its default"} and no figure made in code`);
    return made(ctx);
  });
  paintings.set(kind, painting);
}
