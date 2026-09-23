/**
 * Read a corridor's 90 m hero cover from disk (pipeline stage 6).
 *
 * The engine's own loader fetches over HTTP, which is right for the browser
 * and useless to a test or a content check. This is the same validation over
 * `node:fs` - and it lives in `tools/` for the reason `corridor.ts` does: it
 * reaches for the filesystem, which the browser bundle must never see.
 *
 * Returns null when nothing is published, which is the normal state of a
 * fresh checkout and of every corridor built before stage 6 ran.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  HeroCover,
  type HeroAreaData,
  type HeroIndex,
  type HeroManifest,
} from "../engine/src/terrain/heroSource.js";

export function loadHeroCoverFrom(corridorDir: string): HeroCover | null {
  const dir = join(corridorDir, "hero");
  const indexPath = join(dir, "index.json");
  if (!existsSync(indexPath)) return null;
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as HeroIndex;
  if (index.areas.length === 0) return null;

  const areas: HeroAreaData[] = index.areas.map((entry) => {
    const manifest = JSON.parse(
      readFileSync(join(dir, entry.file), "utf8"),
    ) as HeroManifest;
    const bytes = readFileSync(join(dir, manifest.heights.file));
    if (bytes.byteLength !== manifest.heights.bytes) {
      throw new Error(
        `${manifest.heights.file} is ${bytes.byteLength} bytes, ` +
          `its manifest says ${manifest.heights.bytes}`,
      );
    }
    // Buffer may be a view into a larger pool, so the offset matters.
    const area: HeroAreaData = {
      manifest,
      heights: new Int16Array(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      ),
    };
    // Its water, when it was cut with one (F73). `HeroCover` checks it
    // against the heights and flies the area dry if it does not fit.
    const water = manifest.water;
    const waterPath = water ? join(dir, water.file) : null;
    if (waterPath && existsSync(waterPath)) area.water = new Uint8Array(gunzipSync(readFileSync(waterPath)));
    return area;
  });
  return new HeroCover(index, areas);
}
