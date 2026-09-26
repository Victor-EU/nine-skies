/**
 * Lungta (D91), the wind horse: the prayer flag of the Tibetan sky, a
 * horse carrying the flaming jewel printed on cloth in the five colours
 * of the elements, blue, white, red, green and yellow, strung on a line
 * and left to the wind, which carries the prayer as fast as a horse runs.
 * It is a thing of a living faith, so the film draws what that faith
 * itself makes and hangs, and no deity: a line of fourteen flags between
 * two clouds, each block-printed in code with the horse and rows of
 * text, fluttering. In place as `still`, or drifting. No part of it is
 * skin (`LIVING_FAITHS`).
 *
 * Native length 24 units, the line's span.
 */
import { CatmullRomCurve3, DataTexture, Group, Mesh, PlaneGeometry, RepeatWrapping, SRGBColorSpace, TubeGeometry, Vector3, type Material } from "three";
import { registerFigure, type BuildContext, type CastFrame, type Figure } from "../figure.js";
import { Wardrobe, breathe, cloudBank } from "../parts.js";
import type { Skin } from "../skin.js";

/** The five colours, in the order they are hung: sky, air, fire, water, earth. */
const COLOURS = [0x2a5db0, 0xf4f4f0, 0xd83a2a, 0x2f8f5a, 0xf1c24c];
const INK = 0x2c2c34;
const ROPE = 0x3a3020;
const CLOUD = 0xffffff;

/** The block: a horse facing left with the flaming jewel on its back, 32 by 20. */
const HORSE = [
  "..............###...............",
  ".............#####..............",
  "..............###...............",
  "...............#................",
  "...####.........................",
  "..######......################..",
  "..#######....##################.",
  "...#####....####################",
  "....####...#####################",
  ".....####.######################",
  "......##########################",
  ".......#########################",
  "........########################",
  ".........#####.........#####..##",
  "..........####..........####..#.",
  "..........###...........###...#.",
  "..........###...........###.....",
  ".........####..........####.....",
  ".........####..........####.....",
  "................................",
];

const prints = new Map<number, DataTexture>();
/** A flag's print, made once per colour: the field, the horse in ink, rows of text above and below. */
export function flagPrint(colour: number, size = 64): DataTexture {
  const had = prints.get(colour);
  if (had) return had;
  const H = Math.round(size * 0.75);
  const data = new Uint8Array(size * H * 4);
  const field = [(colour >> 16) & 255, (colour >> 8) & 255, colour & 255];
  const ink = [(INK >> 16) & 255, (INK >> 8) & 255, INK & 255];
  let seed = colour;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const put = (x: number, y: number, c: number[]) => {
    const i = (y * size + x) * 4;
    data[i] = c[0]!;
    data[i + 1] = c[1]!;
    data[i + 2] = c[2]!;
    data[i + 3] = 255;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < size; x++) put(x, y, field);
  const x0 = (size - 32) >> 1;
  const y0 = (H - 20) >> 1;
  for (let r = 0; r < 20; r++) for (let c = 0; c < 32; c++) if (HORSE[r]![c] === "#") put(x0 + c, y0 + r, ink);
  // rows of text, as dashes of uneven length
  for (const y of [3, 6, H - 7, H - 4]) {
    let x = 4;
    while (x < size - 4) {
      const len = 2 + Math.floor(rand() * 5);
      for (let k = 0; k < len && x + k < size - 4; k++) put(x + k, y, ink);
      x += len + 2;
    }
  }
  const t = new DataTexture(data, size, H);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  prints.set(colour, t);
  return t;
}

const FLAGS = 14;
const SPAN = 24;

class Lungta implements Figure {
  readonly group = new Group();
  readonly nativeSize = SPAN;
  readonly triangles: number;
  /** Open, so the cast tests can hold it to the rule: nothing here is skin. */
  readonly wardrobe: Wardrobe;
  private readonly line = new Group();
  private readonly flags: Group[] = [];
  private readonly clouds: Group[] = [];
  private readonly drifts: boolean;

  constructor(ctx: BuildContext) {
    const w = (this.wardrobe = new Wardrobe(ctx.skin));
    this.drifts = ctx.variant !== "still";
    this.group.add(this.line);
    // the rope, sagging between its clouds
    const half = SPAN / 2;
    const rope = new CatmullRomCurve3([new Vector3(-half, 0, 0), new Vector3(-half / 2, -0.9, 0), new Vector3(0, -1.2, 0), new Vector3(half / 2, -0.9, 0), new Vector3(half, 0, 0)]);
    const ropeMesh = w.dress(new Mesh(new TubeGeometry(rope, 40, 0.035, 5, false)), "iron", ROPE);
    this.line.add(ropeMesh);
    for (let i = 0; i < FLAGS; i++) {
      const u = (i + 0.5) / FLAGS;
      const at = rope.getPoint(u);
      const g = new Group();
      g.position.copy(at);
      this.line.add(g);
      const colour = COLOURS[i % COLOURS.length]!;
      const flag = w.part(new PlaneGeometry(1.4, 1.0, 1, 1), "matte", colour, g, 0, -0.52, 0);
      // The print is a texture the skin does not know; a flag keeps its own through a swap.
      const m = (flag.material as Material).clone() as Material & { map?: DataTexture | null };
      m.map = flagPrint(colour);
      flag.material = m;
      this.flags.push(g);
    }
    for (const s of [-1, 1]) {
      this.clouds.push(
        cloudBank(
          w,
          CLOUD,
          [
            [s * half, 0.1, 0, 0.7],
            [s * (half + 0.7), -0.2, 0.2, 0.5],
            [s * (half - 0.6), -0.25, -0.3, 0.45],
          ],
          this.line,
        ),
      );
    }
    this.triangles = w.triangles;
    this.update({ timeS: 0, flightS: 0, eye: new Vector3(), headingRad: 0, group: this.group });
  }

  setSkin(skin: Skin): void {
    this.wardrobe.redress(skin);
  }

  update(f: CastFrame): void {
    const t = f.timeS;
    if (this.drifts) this.line.position.set(Math.sin(t * 0.1) * 3, Math.sin(t * 0.3) * 0.6, Math.cos(t * 0.1) * 3);
    else this.line.position.set(0, Math.sin(t * 0.4) * 0.3, 0);
    this.flags.forEach((g, i) => {
      // each swings on the rope in the wind, a little out of step with its neighbour
      g.rotation.set(0.2 + Math.sin(t * 2.6 + i * 0.9) * 0.35, Math.sin(t * 1.7 + i * 1.3) * 0.15, 0);
    });
    for (const c of this.clouds) breathe(c, t, 0.05);
  }

  dispose(): void {
    this.wardrobe.dispose();
  }
}

registerFigure("lungta", (ctx) => new Lungta(ctx));
