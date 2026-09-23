/**
 * The engine's half of stage 11's codec (F67, F69).
 *
 * `tileCodec.fixture.bin` and `fieldCodec.fixture.bin` were written by
 * `pipeline/nineskies/package.py`, and `pipeline/tests/test_package.py`
 * decodes them to the same tile and field this file builds. Between them the
 * pipeline's encoder is held to the engine's decoder without either suite
 * running the other's language.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TILE_SAMPLES } from "../../engine/src/terrain/tileArray.js";
import {
  decodeField,
  decodeTile,
  deltaPlanes,
  undelta,
  unplanes,
} from "../../engine/src/terrain/tileCodec.js";

const N = TILE_SAMPLES;

/** The tile in the fixture; `known_tile()` in the Python test builds it too. */
function knownTile(): Int16Array {
  const t = new Int16Array(N * N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) t[r * N + c] = ((r * 131 + c * 71 + r * c * 3) % 9000) - 200;
  }
  t[0] = -32768;
  t[N * N - 1] = 32767;
  t[32 * N] = 32767;
  t[33 * N] = -32768;
  return t;
}

/** The field in the second fixture; `known_field()` in the Python test builds it too. */
const FIELD_W = 9;
const FIELD_H = 4;
function knownField(): Int16Array {
  const t = new Int16Array(FIELD_W * FIELD_H);
  for (let r = 0; r < FIELD_H; r++) {
    for (let c = 0; c < FIELD_W; c++) t[r * FIELD_W + c] = ((r * 131 + c * 71 + r * c * 3) % 9000) - 200;
  }
  t[0] = -32768;
  t[FIELD_W * FIELD_H - 1] = 32767;
  t[FIELD_W] = 32767;
  return t;
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe("the tile codec", () => {
  it("decodes the file the pipeline wrote to the tile the pipeline encoded", async () => {
    const fixture = new Uint8Array(
      readFileSync(new URL("./tileCodec.fixture.bin", import.meta.url)),
    );
    expect([fixture[0], fixture[1]]).toEqual([0x1f, 0x8b]);
    expect(await decodeTile(fixture, N)).toEqual(knownTile());
  });

  it("round-trips every Int16, wrapping where a delta would overflow", async () => {
    const tiles = [knownTile(), new Int16Array(N * N).fill(-32768), new Int16Array(N * N).fill(32767)];
    const noisy = new Int16Array(N * N);
    let seed = 12345;
    for (let i = 0; i < noisy.length; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      noisy[i] = (seed >>> 8) & 0xffff;
    }
    tiles.push(noisy);
    for (const tile of tiles) {
      expect(undelta(unplanes(deltaPlanes(tile, N)), N)).toEqual(tile);
      expect(await decodeTile(await gzip(deltaPlanes(tile, N)), N)).toEqual(tile);
    }
  });

  it("puts every low byte before every high one", () => {
    const tile = new Int16Array(N * N);
    tile[0] = 0x1234;
    const planes = deltaPlanes(tile, N);
    expect(planes.length).toBe(2 * N * N);
    expect([planes[0], planes[N * N]]).toEqual([0x34, 0x12]);
  });

  it("reads a tile a host has already un-gzipped", async () => {
    // A host that labels the file Content-Encoding: gzip hands the browser the
    // planes rather than the file (the codec's doc says why this is sniffed).
    expect(await decodeTile(deltaPlanes(knownTile(), N), N)).toEqual(knownTile());
  });

  it("reads planes whose first bytes happen to spell gzip's magic", async () => {
    const tile = new Int16Array(N * N);
    tile[0] = 0x1f;
    tile[1] = 0x1f + 0x8b; // so the second delta's low byte is 0x8b
    const planes = deltaPlanes(tile, N);
    expect([planes[0], planes[1]]).toEqual([0x1f, 0x8b]);
    expect(await decodeTile(planes, N)).toEqual(tile);
  });

  it("decodes the field the pipeline wrote, wider than it is tall, the right way up", async () => {
    const fixture = new Uint8Array(
      readFileSync(new URL("./fieldCodec.fixture.bin", import.meta.url)),
    );
    expect(await decodeField(fixture, FIELD_W, FIELD_H)).toEqual(knownField());
    // Read as if it were four wide and nine tall, it is not the same field.
    await expect(decodeField(fixture, FIELD_H, FIELD_W)).resolves.not.toEqual(knownField());
  });

  it("round-trips a field the size of the horizon field", async () => {
    const [w, h] = [841, 553];
    const field = new Int16Array(w * h);
    for (let i = 0; i < field.length; i++) field[i] = ((i * 2654435761) >>> 16) & 0xffff;
    expect(undelta(unplanes(deltaPlanes(field, w, h)), w, h)).toEqual(field);
    expect(await decodeField(await gzip(deltaPlanes(field, w, h)), w, h)).toEqual(field);
  });

  it("refuses a file that is not a tile rather than drawing it", async () => {
    await expect(decodeTile(new Uint8Array(100), N)).rejects.toThrow(/not a 65-sample tile/);
    await expect(decodeTile(await gzip(new Uint8Array(100)), N)).rejects.toThrow(/not a 65-sample tile/);
    await expect(decodeField(new Uint8Array(100), 841, 553)).rejects.toThrow(/not a 841 x 553 field/);
  });
});
