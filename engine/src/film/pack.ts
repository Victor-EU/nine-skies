/**
 * A scene pack (plan v2, stage 4; D79): one file holding every country tile
 * and water file the scene's camera can ask for, and the scene's hero area,
 * so the film is fetched nine times rather than a few thousand.
 *
 * The layout is four bytes of tag, the header's length as a little-endian
 * u32, the header as UTF-8 JSON, then the files end to end. The files are
 * the package's own bytes, still coded: a pack only carries them.
 */

export const PACK_TAG = "NSP1";

export interface PackEntry {
  readonly name: string;
  readonly offset: number;
  readonly bytes: number;
}

export interface PackHero {
  /** The lattice directory the area is published under: `hero` or `hero-30m`. */
  readonly dir: string;
  readonly area: string;
  /** Its heights coded like a tile, one field a tile wide and every tile tall. */
  readonly heights: PackEntry;
  /** Its water as `hero.py` wrote it, or null for an area without. */
  readonly water: PackEntry | null;
}

export interface PackHeader {
  readonly version: 1;
  readonly scene: string;
  /** The `heights.bin` the tiles were cut from: a pack for another world is refused. */
  readonly heightsSha256: string;
  /** Country tiles and water files, by their name in `tiles/`. */
  readonly files: readonly PackEntry[];
  readonly hero: PackHero | null;
}

export interface Pack {
  readonly header: PackHeader;
  /** A file's bytes, a view into the pack. */
  file(entry: PackEntry): Uint8Array;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Lay out a pack. `files` are the country tiles and water; the hero, if
 * any, is appended after them. Offsets are into the body, after the header.
 */
export function writePack(
  scene: string,
  heightsSha256: string,
  files: ReadonlyArray<{ name: string; bytes: Uint8Array }>,
  hero: { dir: string; area: string; heights: Uint8Array; water: Uint8Array | null } | null,
): Uint8Array {
  const entries: PackEntry[] = [];
  const bodies: Uint8Array[] = [];
  let offset = 0;
  const add = (name: string, bytes: Uint8Array): PackEntry => {
    const entry = { name, offset, bytes: bytes.length };
    bodies.push(bytes);
    offset += bytes.length;
    return entry;
  };
  for (const f of files) entries.push(add(f.name, f.bytes));
  const packHero: PackHero | null = hero && {
    dir: hero.dir,
    area: hero.area,
    heights: add(`${hero.area}.heights`, hero.heights),
    water: hero.water ? add(`${hero.area}.water`, hero.water) : null,
  };
  const header: PackHeader = { version: 1, scene, heightsSha256, files: entries, hero: packHero };
  const json = encoder.encode(JSON.stringify(header));
  const out = new Uint8Array(8 + json.length + offset);
  out.set(encoder.encode(PACK_TAG), 0);
  new DataView(out.buffer).setUint32(4, json.length, true);
  out.set(json, 8);
  let at = 8 + json.length;
  for (const b of bodies) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}

/** Read a pack, or throw saying why it is not one. */
export function readPack(bytes: Uint8Array): Pack {
  if (bytes.length < 8 || decoder.decode(bytes.subarray(0, 4)) !== PACK_TAG) {
    throw new Error(`not a scene pack: it does not start ${PACK_TAG}`);
  }
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
  if (8 + length > bytes.length) throw new Error(`a pack header of ${length} bytes in a pack of ${bytes.length}`);
  const header = JSON.parse(decoder.decode(bytes.subarray(8, 8 + length))) as PackHeader;
  if (header.version !== 1) throw new Error(`a version ${String(header.version)} pack; this reads version 1`);
  const body = 8 + length;
  const last = [...header.files, ...(header.hero ? [header.hero.heights, ...(header.hero.water ? [header.hero.water] : [])] : [])];
  for (const e of last) {
    if (body + e.offset + e.bytes > bytes.length) throw new Error(`${e.name} runs past the end of the pack`);
  }
  return { header, file: (e) => bytes.subarray(body + e.offset, body + e.offset + e.bytes) };
}
