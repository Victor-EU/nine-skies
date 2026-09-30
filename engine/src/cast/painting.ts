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
 * faces in the painting, so it never flies backwards, and turns round to
 * do it rather than jumping: it narrows to a third of its width, as a
 * figure coming round toward the eye does, gives way there to its mirror,
 * which widens again. It is never a picture seen edge on. The world is laid out
 * left-handed and the grade turns the picture round at the end (F100), so
 * a painting laid in it reads the right way only mirrored once more.
 *
 * The scene's haze is over it as over the ground. Its light is the
 * painting's own, soft by its brief, and the scene's light is laid over
 * that as a tint: whole at the film's noon, warmer and darker as the sun
 * goes down, so an evening figure is not lit by a morning that is not
 * there.
 *
 * A view may name lives (D96, `life.ts`): then the card is a fine mesh
 * over the picture rather than two triangles, and the lives bend it every
 * frame, told how hard the figure works (its pace, from the layer) and how
 * steeply it climbs (its own pitch, from its motion). A view without any
 * stays a still picture.
 *
 * A figure with a painting registers it from its own file under
 * `paintings/`, a view for each variant it has been painted in. A cue
 * whose variant has none is drawn by the figure made in code, which stays
 * registered for that and for a film without the paintings.
 */
import { BufferGeometry, Color, CustomBlending, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry, Quaternion, SRGBColorSpace, Texture, TextureLoader, Vector3, type BufferAttribute, type WebGLRenderer } from "three";
import type { CastLight } from "./cast.js";
import { madeBuilder, registerPainted, type BuildContext, type CastFrame, type Figure } from "./figure.js";
import { layerShare, lifeModule, type Body, type Layer, type LayerSpan, type Life, type LifeRig } from "./life.js";
import "./life/index.js";
import { hashSeed } from "./random.js";

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
   * wingtip to wingtip). A pose of a figure drawn in several (F139) is
   * measured as its first is, so each is drawn the same size: a crouch's
   * crown is where it would be standing, over the top of the picture, and
   * a party halted close together is longer than its picture is wide.
   */
  readonly size: { readonly crown: number } | { readonly across: number };
  /** The picture's size as kept, pixels: what its lives' rigs are traced in. Needed with `life`. */
  readonly pixels?: readonly [number, number];
  /** What moves in it (D96), in the order they move it; none leaves it a still picture. */
  readonly life?: readonly LifeRig[];
  /** Cells across the mesh it is bent on, if not `MESH_CELLS`: finer for a part too slight to draw apart at a cell's width. */
  readonly cells?: number;
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

/** Seconds the card takes to turn round when the figure turns the other way. */
export const TURN_S = 0.7;
/**
 * How narrow a card grows as it turns, a share of its width: a figure seen
 * coming round toward the eye. Narrower, it reads as a picture edge on.
 */
export const TURNED_WIDTH = 0.3;
/**
 * The share of a turn, either side of its middle, over which the one side
 * gives way to the other. The two overlap, each still more than three
 * quarters drawn at the middle, so the figure is never seen through.
 */
export const CROSS = 0.15;
const OVERLAP = 0.4;

/** Cells across the mesh a living painting is bent on: a cell is about 24 pixels of a 1536-pixel picture. */
export const MESH_CELLS = 64;
/** The finest mesh a view may ask for: each cell more costs every frame. */
export const MOST_CELLS = 160;

/**
 * How hard a figure works (D96), from its pace: one keeping pace with the
 * flight works at 1 however still it holds in the picture, one standing in
 * the world at `IDLE`, and either harder by `HURRY` for each body length a
 * second it goes by its own motion.
 */
export const IDLE = 0.35;
export const HURRY = 1;
/** The hardest it works: a companion darting across the picture at several of its lengths a second is not frantic. */
export const MOST_EFFORT = 2;
/** Seconds its effort takes to follow its pace. */
export const EFFORT_LAG_S = 0.5;

export function effortOf(pace: CastFrame["pace"]): number {
  if (!pace) return IDLE;
  return Math.min(MOST_EFFORT, (pace.withFlight ? 1 : IDLE) + HURRY * pace.bodiesPerS);
}

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

/** How high a view's picture stands over its feet, of a cue's size: the pictures are cut to the figure, so its top (F130). */
export function viewHeight(view: PaintingView): number {
  return (1 - view.feet) / viewSize(view);
}

/** How high the painting a kind is drawn from, in a variant, stands over its feet, of a cue's size; null for a figure made in code. */
export function paintedHeight(kind: string, variant: string | null): number | null {
  const painting = paintings.get(kind);
  const view = painting ? viewFor(painting, variant) : null;
  return view ? viewHeight(view) : null;
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

/**
 * One side of a card that is turning round, given how far round it is
 * (`turn`, -1 as painted to 1 mirrored): the side as painted is -1, the
 * mirror 1. Its width is a share of the card's, narrowing to
 * `TURNED_WIDTH` as the turn comes to its middle, and `show` how much of
 * it is drawn, the one side giving way to the other about the middle and
 * the two overlapping there.
 */
export function sideOfTurn(turn: number, side: -1 | 1): { readonly width: number; readonly show: number } {
  const t = Math.max(-1, Math.min(1, turn * side));
  const e = t > 0 ? t * t * (3 - 2 * t) : 0;
  const s = Math.max(0, Math.min(1, (t + CROSS) / ((1 + OVERLAP) * CROSS)));
  return { width: TURNED_WIDTH + (1 - TURNED_WIDTH) * e, show: s * s * (3 - 2 * s) };
}

/** The tint the scene's light lays over a painting, into `out`. */
export function paintedLight(light: Pick<CastLight, "sunColor" | "ambientZenith">, out: Color): Color {
  const s = light.sunColor;
  const k = light.ambientZenith;
  const channel = (sun: number, sky: number, noon: number) => Math.min(MOST, 1 - PAINTED_BY * (1 - (PAINTED_SUN * sun + PAINTED_SKY * sky) / noon));
  return out.setRGB(channel(s.r, k.r, NOON_LIGHT[0]), channel(s.g, k.g, NOON_LIGHT[1]), channel(s.b, k.b, NOON_LIGHT[2]));
}

/**
 * A living painting's mesh (D96): a grid of `MESH_CELLS` across over the
 * picture, its vertices at rest in the picture's pixels as its lives read
 * them, and how far they have moved this frame. A life that moves a part
 * on its own (a wing) has the grid again for that part, the part's share
 * of the picture in each vertex's alpha and the rest of the picture giving
 * it up, drawn behind or in front of the rest; a cell no layer shows is
 * not drawn.
 */
class Puppet {
  readonly body: { -readonly [K in keyof Body]: Body[K] };
  readonly geometry = new BufferGeometry();
  readonly moved: Float32Array;
  readonly lives: Life[];
  readonly layered: boolean;
  /** Whether any of its layers is a copy, drawn with the fourth material. */
  readonly copied: boolean;
  readonly triangles: number;
  /** The vertex of the grid each of the card's is. */
  private readonly drawn: Int32Array;
  /** Each of the card's vertices' share of its layer, before any fade. */
  private alpha: Float32Array | null = null;
  /** The copies' layers, the card's vertices of each, and how faded it was last drawn. */
  private readonly copies: Array<{ readonly layer: number; readonly lo: number; readonly hi: number; readonly shade: number; shown: number }> = [];
  private readonly cellsX: number;
  private readonly cellsY: number;

  constructor(
    private readonly view: PaintingView,
    seed: number,
  ) {
    const [width, height] = view.pixels!;
    this.cellsX = view.cells ?? MESH_CELLS;
    this.cellsY = Math.max(1, Math.round(this.cellsX / view.aspect));
    const across = this.cellsX + 1;
    const grid = across * (this.cellsY + 1);
    const rigs = view.life ?? [];
    const parts: Layer[] = rigs.flatMap((rig) => lifeModule(rig.kind)!.layers?.(rig) ?? []);
    const count = grid * (1 + parts.length);
    const rest = new Float32Array(2 * count);
    const uv = new Float32Array(2 * count);
    const alpha = new Float32Array(count).fill(1);
    for (let l = 0; l <= parts.length; l++) {
      for (let j = 0; j <= this.cellsY; j++) {
        for (let i = 0; i < across; i++) {
          const v = l * grid + j * across + i;
          rest[2 * v] = (i / this.cellsX) * width;
          rest[2 * v + 1] = (j / this.cellsY) * height;
          uv[2 * v] = i / this.cellsX;
          uv[2 * v + 1] = 1 - j / this.cellsY;
        }
      }
    }
    // Of two layers laid one over the other, the lower is whole across their seam and only the upper feathered: a front
    // part feathers over the picture, the picture over a part behind. And wherever a cell of the lower is cut away at a
    // corner, the upper is whole at all four, or the sky shows through the cell between them.
    parts.forEach((part, k) => {
      const share = new Float32Array(grid);
      for (let v = 0; v < grid; v++) share[v] = layerShare(rest[2 * v]!, rest[2 * v + 1]!, part);
      const near = (v: number, test: (s: number) => boolean) => {
        const i = v % across;
        const j = (v - i) / across;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii >= 0 && jj >= 0 && ii < across && jj <= this.cellsY && test(share[jj * across + ii]!)) return true;
          }
        }
        return false;
      };
      const own = (k + 1) * grid;
      for (let v = 0; v < grid; v++) {
        // A copy lies apart from the picture, which keeps what it shows: only its own soft edge.
        if (part.copy) {
          alpha[own + v] = share[v]!;
        } else if (part.behind) {
          alpha[own + v] = near(v, (s) => s > 1e-3) ? 1 : 0;
          alpha[v] = Math.min(alpha[v]!, 1 - share[v]!);
        } else {
          alpha[own + v] = near(v, (s) => s > 0.999) ? 1 : share[v]!;
          if (share[v]! > 0.999) alpha[v] = 0;
        }
      }
    });
    const layers: LayerSpan[] = [{ name: "picture", start: 0, count: grid }, ...parts.map((part, k) => ({ name: part.name, start: (k + 1) * grid, count: grid }))];
    // Drawn far parts first, then the picture, then near parts, a cell at a time where anything of it shows; each of the
    // three its own draw, so the near parts can be held in front of the picture in the depth buffer and the far behind it.
    // Copies go before all, a draw of their own that holds no depth: in one draw with a far part they fought it for its
    // pixels where they passed behind it (F123).
    const which = (k: number) => (parts[k]!.copy ? "copy" : parts[k]!.behind ? "behind" : "front");
    const layersOf = (kind: string) => parts.flatMap((_, k) => (which(k) === kind ? [k + 1] : []));
    const order = [...layersOf("copy"), ...layersOf("behind"), 0, ...layersOf("front")];
    const index: number[] = [];
    const depthOf = (l: number) => (l === 0 ? 1 : { behind: 0, front: 2, copy: 3 }[which(l - 1)]);
    let from = 0;
    for (const [n, l] of order.entries()) {
      if (n > 0 && depthOf(l) !== depthOf(order[n - 1]!)) {
        this.geometry.addGroup(from, index.length - from, depthOf(order[n - 1]!));
        from = index.length;
      }
      for (let j = 0; j < this.cellsY; j++) {
        for (let i = 0; i < this.cellsX; i++) {
          const a = l * grid + j * across + i;
          const b = a + 1;
          const c = a + across;
          const d = c + 1;
          if (Math.max(alpha[a]!, alpha[b]!, alpha[c]!, alpha[d]!) < 1e-3) continue;
          index.push(a, c, b, b, c, d);
        }
      }
    }
    this.geometry.addGroup(from, index.length - from, depthOf(order[order.length - 1]!));
    this.triangles = index.length / 3;
    this.layered = parts.length > 0;
    this.copied = parts.some((part) => part.copy);
    // The card holds only the vertices a drawn cell uses, since it is sent whole each frame: most of a wing's or a leg's
    // grid is sky. Its lives move the whole grid; `drawn` says which vertex of it each of the card's is.
    const at = new Int32Array(count).fill(-1);
    const drawn: number[] = [];
    for (const v of index) if (at[v]! < 0) at[v] = 1;
    for (let v = 0; v < count; v++) if (at[v]! > 0) at[v] = drawn.push(v) - 1;
    this.drawn = Int32Array.from(drawn);
    this.geometry.userData.grid = this.drawn;
    this.geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(3 * drawn.length), 3));
    this.geometry.setAttribute("uv", new Float32BufferAttribute(Float32Array.from({ length: 2 * drawn.length }, (_, k) => uv[2 * drawn[k >> 1]! + (k & 1)]!), 2));
    if (this.layered) {
      // Premultiplied, as the picture is: a vertex's share of a layer thins its colour as its alpha.
      // A copy in shadow darkens its colour and keeps its alpha.
      const shade = [1, ...parts.map((part) => (part.copy ? (part.shade ?? 1) : 1))];
      const colour = new Float32Array(4 * drawn.length);
      drawn.forEach((v, k) => {
        colour.fill(alpha[v]! * shade[Math.floor(v / grid)]!, 4 * k, 4 * k + 3);
        colour[4 * k + 3] = alpha[v]!;
      });
      this.geometry.setAttribute("color", new Float32BufferAttribute(colour, 4));
      // A copy's vertices, which its life fades frame by frame: the card holds each layer's together, in order.
      this.alpha = Float32Array.from(drawn, (v) => alpha[v]!);
      parts.forEach((part, k) => {
        if (!part.copy) return;
        const from = (k + 1) * grid;
        let lo = drawn.length;
        let hi = 0;
        drawn.forEach((v, i) => {
          if (v >= from && v < from + grid) {
            lo = Math.min(lo, i);
            hi = i + 1;
          }
        });
        if (hi > lo) this.copies.push({ layer: k + 1, lo, hi, shade: part.shade ?? 1, shown: 1 });
      });
    }
    this.geometry.setIndex(index.map((v) => at[v]!));
    this.body = { width, height, rest, across, layers, origin: [width / 2, height * (1 - view.feet)], faces: view.faces, colour: null, fade: new Float32Array(layers.length).fill(1) };
    this.moved = new Float32Array(2 * count);
    this.lives = rigs.map((rig, k) => lifeModule(rig.kind)!.build(this.body, rig, hashSeed(seed, k)));
    this.place();
    // Its lives move it a few hundredths of its size, a wing more: the bounds allow for that.
    this.geometry.computeBoundingSphere();
    this.geometry.boundingSphere!.radius *= this.layered ? 1.5 : 1.15;
  }

  /** The picture is loaded: what it shows about each vertex, for the lives that go by it. Its rows bottom up if `flipped`. */
  see(image: CanvasImageSource, flipped = false): void {
    if (typeof document === "undefined") return;
    const canvas = document.createElement("canvas");
    canvas.width = this.cellsX;
    canvas.height = this.cellsY;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    if (flipped) ctx.setTransform(1, 0, 0, -1, 0, this.cellsY);
    ctx.drawImage(image, 0, 0, this.cellsX, this.cellsY);
    const cells = ctx.getImageData(0, 0, this.cellsX, this.cellsY).data;
    const across = this.cellsX + 1;
    const grid = across * (this.cellsY + 1);
    const colour = new Float32Array(4 * this.body.rest.length / 2);
    // Each vertex takes the cells about its corner, as its triangles show them; every layer's grid alike.
    for (let j = 0; j <= this.cellsY; j++) {
      for (let i = 0; i < across; i++) {
        let n = 0;
        const v = 4 * (j * across + i);
        for (const [ci, cj] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]] as const) {
          if (ci < 0 || cj < 0 || ci >= this.cellsX || cj >= this.cellsY) continue;
          const c = 4 * (cj * this.cellsX + ci);
          for (let k = 0; k < 4; k++) colour[v + k]! += cells[c + k]! / 255;
          n++;
        }
        for (let k = 0; k < 4; k++) colour[v + k]! /= n;
      }
    }
    for (let l = 1; l < this.body.layers.length; l++) colour.copyWithin(4 * l * grid, 0, 4 * grid);
    this.body.colour = colour;
    for (const life of this.lives) life.see?.(this.body);
  }

  /** Bend the mesh for this frame. */
  move(timeS: number, dt: number, effort: number, climb: number): void {
    this.moved.fill(0);
    const stride = { timeS, dt, effort, climb };
    for (const life of this.lives) life.move(stride, this.moved);
    this.place();
  }

  /** The mesh where its vertices are now: a picture a unit high, its origin at the figure's. */
  private place(): void {
    const { width, height, rest } = this.body;
    const position = this.geometry.getAttribute("position") as BufferAttribute;
    const p = position.array as Float32Array;
    const feet = this.view.feet;
    const drawn = this.drawn;
    for (let k = 0; k < drawn.length; k++) {
      const v = drawn[k]!;
      p[3 * k] = (rest[2 * v]! + this.moved[2 * v]!) / width - 0.5;
      p[3 * k + 1] = 1 - feet - (rest[2 * v + 1]! + this.moved[2 * v + 1]!) / height;
    }
    position.needsUpdate = true;
    if (this.copies.length === 0) return;
    const colour = this.geometry.getAttribute("color") as BufferAttribute;
    const c = colour.array as Float32Array;
    for (const copy of this.copies) {
      const f = this.body.fade[copy.layer]!;
      if (f === copy.shown) continue;
      copy.shown = f;
      for (let k = copy.lo; k < copy.hi; k++) {
        const a = this.alpha![k]! * f;
        c.fill(a * copy.shade, 4 * k, 4 * k + 3);
        c[4 * k + 3] = a;
      }
      colour.addUpdateRange(4 * copy.lo, 4 * (copy.hi - copy.lo));
      colour.needsUpdate = true;
    }
  }
}

let built = 0;

class PaintedFigure implements Figure {
  readonly group = new Group();
  readonly nativeSize: number;
  readonly triangles: number;
  /**
   * The card as painted and mirrored, one geometry between them: only one is
   * drawn but while it turns round, when the one gives way to the other.
   * As painted is mirrored in this world (F100).
   */
  private readonly cards: readonly [Mesh, Mesh];
  private readonly puppet: Puppet | null;
  private effort: number | null = null;
  /** Each card's materials: a layered painting's far parts', its picture's and its near parts'; or the picture's alone. */
  private readonly materials: readonly (readonly MeshBasicMaterial[])[];
  private readonly tint = new Color(1, 1, 1);
  private texture: Texture | null = null;
  /** Its picture has been handed to the GPU. */
  private warmed = false;
  private isMirrored = false;
  /** How much of it the figure it is a pose of draws, while it gives way to another (F139). */
  private readonly presented = { width: 1, show: 1, leads: true };
  /** -1 as painted to 1 mirrored, through nought as the card turns round. */
  private turn = -1;
  private lastS: number | null = null;
  private disposed = false;
  private readonly want = new Quaternion();
  private readonly heading = new Vector3();

  constructor(private readonly view: PaintingView) {
    this.nativeSize = viewSize(view);
    // A picture a unit high, its origin at the figure's, so it turns about that.
    const living = (view.life?.length ?? 0) > 0 && !!view.pixels;
    this.puppet = living ? new Puppet(view, hashSeed(view.url, built++)) : null;
    const geometry = this.puppet?.geometry ?? new PlaneGeometry(1, 1).translate(0, 0.5 - view.feet, 0);
    this.triangles = this.puppet?.triangles ?? 2;
    const layered = !!this.puppet?.layered;
    const materials = (): MeshBasicMaterial[] => {
      // It writes its depth, as the code-made figures do, so the cloud sea drawn after it is hidden where the figure is in front.
      // The picture is premultiplied as it is uploaded (below), so the blend
      // takes its colour as it comes: the material's own premultiplying would
      // multiply by alpha twice, and every soft edge - a cloud's wisps, a
      // plume - came out ringed in dark (28 September 2026).
      const m = new MeshBasicMaterial({
        transparent: true,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
        alphaTest: 0.05,
        side: DoubleSide,
        vertexColors: layered,
      });
      if (!layered) return [m];
      // Its parts lie in the picture's plane: held a hair behind it or in front of it in the depth buffer, or the picture
      // and a part over it fight pixel by pixel for who is nearer.
      const held = (by: number) => {
        const h = m.clone();
        h.polygonOffset = true;
        h.polygonOffsetFactor = by;
        h.polygonOffsetUnits = 2 * by;
        return h;
      };
      if (!this.puppet!.copied) return [held(1), m, held(-1)];
      // Its copies, behind all and holding no depth, so they never hide what they pass behind.
      const copies = held(2);
      copies.depthWrite = false;
      copies.userData.copies = true;
      return [held(1), m, held(-1), copies];
    };
    this.materials = [materials(), materials()];
    this.cards = [0, 1].map((n) => {
      const set = this.materials[n]!;
      const card = new Mesh(geometry, set.length > 1 ? [...set] : set[0]);
      card.name = `painting:${view.url}`;
      card.visible = false;
      this.group.add(card);
      return card;
    }) as unknown as readonly [Mesh, Mesh];
    void loadPicture(view.url).then(
      ({ texture: t, flipped }) => {
        if (this.disposed) {
          dropPicture(t);
          return;
        }
        t.colorSpace = SRGBColorSpace;
        t.anisotropy = 4;
        this.texture = t;
        if (this.puppet && t.image) this.puppet.see(t.image as CanvasImageSource, flipped);
        for (const set of this.materials) {
          for (const m of set) {
            m.map = t;
            m.needsUpdate = true;
          }
        }
      },
      (e: unknown) => {
        // A picture that will not load leaves the figure unseen, not the film stopped.
        console.warn(`the painting ${view.url} did not load`, e);
      },
    );
  }

  update(f: CastFrame): void {
    const g = f.group;
    if (f.light) paintedLight(f.light, this.tint);
    // Upright and turned to the eye, whatever the layer turned the figure to.
    this.want.setFromAxisAngle(UP, Math.atan2(f.eye.x - g.position.x, f.eye.z - g.position.z));
    // The way the figure heads, across the picture: the camera's right is (cos h, 0, -sin h).
    this.heading.copy(FORWARD).applyQuaternion(g.quaternion);
    const across = this.heading.x * Math.cos(f.headingRad) - this.heading.z * Math.sin(f.headingRad);
    this.isMirrored = mirrored(across / Math.max(1e-6, Math.hypot(this.heading.x, this.heading.z)), this.view.faces, this.isMirrored);
    const dt = this.lastS === null ? Infinity : Math.max(0, f.timeS - this.lastS);
    this.lastS = f.timeS;
    const side = this.isMirrored ? 1 : -1;
    const step = (2 * dt) / TURN_S;
    this.turn = Math.abs(side - this.turn) <= step ? side : this.turn + Math.sign(side - this.turn) * step;
    // Its own group is scaled where it is one pose of several, drawn to the first's size (F139); alone, it is the group
    // the layer scaled, counted once.
    const own = this.group === g ? 1 : this.group.scale.y;
    const k = heldTo(g.scale.y * own, g.scale.x * own * this.view.aspect, f.eye.distanceTo(g.position));
    const p = this.presented;
    this.cards.forEach((card, n) => {
      const s = n === 0 ? -1 : 1;
      const turned = sideOfTurn(this.turn, s);
      const width = turned.width * p.width;
      const show = turned.show * p.show;
      card.visible = this.texture !== null && show > 1e-3;
      if (!card.visible) return;
      card.quaternion.copy(g.quaternion).invert().multiply(this.want);
      card.scale.set(this.view.aspect * s * width * k, k, 1);
      // Premultiplied, so the side giving way thins its colour with its alpha; only the side the turn is past the middle
      // toward holds its depth, or the one would hide the other where the two lie in one plane.
      const leads = p.leads && (this.turn * s > 0 || (this.turn === 0 && s > 0));
      for (const m of this.materials[n]!) {
        m.color.copy(this.tint).multiplyScalar(show);
        m.opacity = show;
        if (!m.userData.copies) m.depthWrite = leads;
      }
    });
    if (this.puppet) {
      const step = Number.isFinite(dt) ? Math.min(0.1, dt) : 0;
      const want = effortOf(f.pace);
      this.effort = this.effort === null ? want : this.effort + (want - this.effort) * (1 - Math.exp(-step / EFFORT_LAG_S));
      // Its path's climb is the pitch its motion gave the group, which the card, turned to the eye, does not show.
      const climb = Math.asin(Math.max(-1, Math.min(1, this.heading.y / Math.max(1e-6, this.heading.length()))));
      this.puppet.move(f.timeS, step, this.effort, climb);
    }
  }

  setSkin(): void {
    // A painting is its own substance.
  }

  present(width: number, show: number, leads: boolean): void {
    this.presented.width = width;
    this.presented.show = show;
    this.presented.leads = leads;
  }

  warm(renderer: WebGLRenderer): boolean {
    if (!this.texture || this.warmed) return false;
    this.warmed = true;
    renderer.initTexture(this.texture);
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.cards[0].geometry.dispose();
    for (const set of this.materials) for (const m of set) m.dispose();
    if (this.texture) dropPicture(this.texture);
  }
}

/**
 * A painting's picture as a texture. Where the page can, it is decoded off
 * the page's own thread and flipped and premultiplied as it is, so the
 * frame the figure first comes on only copies it to the GPU: a picture
 * decoded, flipped and premultiplied on that frame held it up 30 to 100 ms
 * (F123). Premultiplied, it is filtered with its alpha, or the edges fringe
 * with whatever colour the clear pixels hold. `flipped` says the picture's
 * rows run bottom up, as the GPU takes them.
 */
async function loadPicture(url: string): Promise<{ texture: Texture; flipped: boolean }> {
  if (typeof createImageBitmap !== "function") {
    const t = await new TextureLoader().loadAsync(url);
    t.premultiplyAlpha = true;
    return { texture: t, flipped: false };
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const bitmap = await createImageBitmap(await r.blob(), { imageOrientation: "flipY", premultiplyAlpha: "premultiply" });
  // A bitmap is flipped and premultiplied when it is made; the upload's own settings do not apply to it.
  const t = new Texture(bitmap);
  t.flipY = false;
  t.needsUpdate = true;
  return { texture: t, flipped: true };
}

function dropPicture(t: Texture): void {
  t.dispose();
  const image = t.image as { close?: () => void } | null;
  image?.close?.();
}

const paintings = new Map<string, Painting>();

/** The paintings registered, by figure kind, for the checks that hold them to their files. */
export function registeredPaintings(): ReadonlyMap<string, Painting> {
  return paintings;
}

/** The most of its picture a view's size may be: a pose more compact than the figure as it is measured (F139), a crouch under half its height, not a slip. */
const MOST_MEASURE = 2;

function check(kind: string, v: PaintingView): void {
  const where = `the painting of "${kind}", ${v.name}`;
  if (!(v.aspect > 0)) throw new Error(`${where}: its aspect must be a width over a height`);
  if (!(v.feet >= 0 && v.feet < 1)) throw new Error(`${where}: its feet must be inside the picture`);
  if ("crown" in v.size ? !(v.size.crown > v.feet && v.size.crown <= MOST_MEASURE) : !(v.size.across > 0 && v.size.across <= MOST_MEASURE)) {
    throw new Error(`${where}: its size must be a crown above its feet, or a share of its width, at most ${MOST_MEASURE} of the picture`);
  }
  if (!v.life?.length) return;
  const px = v.pixels;
  if (!px || !(px[0] > 0 && px[1] > 0) || Math.abs(px[0] / px[1] - v.aspect) > 0.01) throw new Error(`${where}: a living view needs its pixels, width over height its aspect`);
  if (v.cells !== undefined && !(Number.isInteger(v.cells) && v.cells >= 16 && v.cells <= MOST_CELLS)) throw new Error(`${where}: its mesh is 16 to ${MOST_CELLS} cells across`);
  const parts = new Set<string>();
  for (const rig of v.life) {
    const module = lifeModule(rig.kind);
    if (!module) throw new Error(`${where}: "${rig.kind}" is no life`);
    try {
      module.check(rig, px[0], px[1]);
    } catch (e) {
      throw new Error(`${where}: ${(e as Error).message}`);
    }
    // Two lives' parts of one name would be one part moved twice: a picture of several names each one's.
    for (const part of module.layers?.(rig) ?? []) {
      if (parts.has(part.name)) throw new Error(`${where}: two parts are named "${part.name}"; say whose each is`);
      parts.add(part.name);
    }
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
