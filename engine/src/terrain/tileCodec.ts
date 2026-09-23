/**
 * One tile off the wire, as stage 11 codes it (`pipeline/nineskies/package.py`),
 * and the horizon field, which is coded the same way at its own size (F69).
 *
 * Left delta, then byte planes, then gzip - measured against Brotli on the
 * country's 4,665 land tiles and chosen because it needs nothing from the host
 * that serves it: 18.41 MB where Brotli is 18.78 and planar Brotli 15.90, and
 * the last is only readable when a host labels it `Content-Encoding: br`
 * (F67, D68). The two sides are held to each other by
 * `test/terrain/tileCodec.test.ts`, which decodes two files the pipeline wrote:
 * a tile, and a field wider than it is tall.
 */

/** The string the index carries. A package coded any other way is not flown. */
export const TILE_CODEC = "delta-planes-gzip";

/** The first two bytes of every gzip member. */
const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

/**
 * Low bytes, then high bytes, back into Int16 deltas.
 *
 * Written a byte at a time rather than through a DataView so the result is
 * the same on a big-endian machine, which nothing here targets but which
 * costs nothing to be right about.
 */
export function unplanes(bytes: Uint8Array): Int16Array {
  if (bytes.length % 2 !== 0) throw new Error(`a tile of planes is ${bytes.length} bytes, which is odd`);
  const n = bytes.length / 2;
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = bytes[i]! | (bytes[n + i]! << 8);
  return out;
}

/**
 * Deltas back into heights: each row from its first sample, the first column
 * from the sample south of it. `Int16Array` wraps on assignment, which is the
 * same modular arithmetic the pipeline encoded in, so every Int16 survives.
 * A tile is `samples` rows of `samples`; the horizon field is `height` rows
 * of `width`.
 */
export function undelta(d: Int16Array, width: number, height = width): Int16Array {
  if (d.length !== width * height) {
    throw new Error(`${d.length} deltas for a ${width} x ${height} field`);
  }
  const out = new Int16Array(d.length);
  let first = 0;
  for (let r = 0; r < height; r++) {
    const row = r * width;
    first += d[row]!;
    out[row] = first;
    for (let c = 1; c < width; c++) out[row + c] = out[row + c - 1]! + d[row + c]!;
  }
  return out;
}

/** The encoder's first two steps, for tests and for nothing else. */
export function deltaPlanes(field: Int16Array, width: number, height = width): Uint8Array {
  const d = new Int16Array(field.length);
  for (let r = 0; r < height; r++) {
    const row = r * width;
    d[row] = r === 0 ? field[0]! : field[row]! - field[row - width]!;
    for (let c = 1; c < width; c++) d[row + c] = field[row + c]! - field[row + c - 1]!;
  }
  const n = d.length;
  const out = new Uint8Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[i] = d[i]! & 0xff;
    out[n + i] = (d[i]! >> 8) & 0xff;
  }
  return out;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  // A copy into a plain ArrayBuffer, which is what `Blob` takes: a view onto a
  // shared buffer is not one, and the copy is 4 kB for a tile.
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * A tile's file, whatever the host did to it on the way.
 *
 * A host that sees a gzip file may also label it `Content-Encoding: gzip`, and
 * then the browser has already undone the gzip before this runs. So the bytes
 * are sniffed rather than trusted: gzip's magic is tried as gzip first, and a
 * body that is exactly a tile's planes is taken as the host having done it.
 * The order matters only for planes whose first two low bytes happen to spell
 * the magic, and gzip's own CRC refuses those.
 */
export async function decodeTile(bytes: Uint8Array, samples: number): Promise<Int16Array> {
  return decode(bytes, samples, samples, `${samples}-sample tile`);
}

/** A field of any size in the same codec: the horizon field is 841 x 553. */
export async function decodeField(bytes: Uint8Array, width: number, height: number): Promise<Int16Array> {
  return decode(bytes, width, height, `${width} x ${height} field`);
}

async function decode(bytes: Uint8Array, width: number, height: number, what: string): Promise<Int16Array> {
  const planesBytes = width * height * 2;
  if (bytes.length >= 2 && bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1) {
    let planes: Uint8Array | null = null;
    try {
      planes = await gunzip(bytes);
    } catch {
      planes = null;
    }
    if (planes && planes.length === planesBytes) return undelta(unplanes(planes), width, height);
  }
  if (bytes.length === planesBytes) return undelta(unplanes(bytes), width, height);
  throw new Error(`a ${bytes.length}-byte file is not a ${what} in ${TILE_CODEC}`);
}
