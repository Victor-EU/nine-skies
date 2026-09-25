/**
 * `make scenes`: a pack per scene (plan v2, stage 4; D79).
 *
 * Each pack holds every country tile and water file the scene's camera can
 * ask for (`engine/src/film/reach.ts`: the rail to where the fastest viewer
 * gets, the widest drift off it, the terrain's view disc around every place
 * the camera can stand) and the scene's own hero area, its heights coded
 * like a tile, with its colour and its fine colour (F87, F91), and the
 * ground's relief (F93) for the country tiles the camera comes near and the
 * hero area whole, and for the country's ground along the rail itself its
 * relief at the source's spacing (F94) and its colour at 10 m (F95); the
 * pack index lists those country tiles and sub-tiles, which is what `make
 * relief` and `make colour` cut. Beside the packs it copies the few small files the film reads
 * before any pack - the world's manifest, its tile index, the horizon field,
 * the hero manifests and the walls' rock faces (F92) - so `dist-film/` is
 * everything a static host needs.
 *
 * The index of what each pack holds is committed (`app/public/packs/index.json`):
 * the app reads it to know which pack a tile is in, and `test/film/packs.test.ts`
 * flies every rail against it with no world to hand.
 *
 *   npm run content:scenes            # dist-film/, app/public/packs/index.json
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { writePack } from "../engine/src/film/pack.js";
import { DEFAULT_REACH, nearTiles, reachKm, sceneTiles, tileOfKey } from "../engine/src/film/reach.js";
import { buildRail } from "../engine/src/film/scene.js";
import { HERO_DIRS, decodeHeroArea, type HeroIndex, type HeroManifest } from "../engine/src/terrain/heroSource.js";
import { TILE_KM } from "../engine/src/terrain/syntheticTiles.js";
import { VIEW_RADIUS_TILES } from "../engine/src/terrain/terrain.js";
import { deltaPlanes } from "../engine/src/terrain/tileCodec.js";
import type { TileIndex } from "../engine/src/terrain/tileStream.js";
import type { WorldManifest } from "../engine/src/terrain/tileSource.js";
import { colourProblem, type ColourIndex } from "../engine/src/terrain/colour.js";
import { colourFile } from "../engine/src/film/pack.js";
import { rockProblem, type RockIndex } from "../engine/src/terrain/rock.js";
import { NEAR_TILE_M } from "../engine/src/terrain/near.js";
import { RELIEF_REACH, reliefProblem, type ReliefIndex } from "../engine/src/terrain/relief.js";
import { formatProblems, loadFilm } from "./film.ts";

/**
 * The whole film, packs and the files read before them, on the wire (plan
 * v2, stage 4). 30 MB until the ground took its colour from the satellite
 * mosaic; raised to 300 MB for it (D87), and to 2 GB for finer ground (D89).
 */
export const FILM_BUDGET_BYTES = 2_000_000_000;
const WORLD = "china";
const WORLD_DIR = `dist-world/${WORLD}`;
const OUT = "dist-film";
const INDEX_OUT = "app/public/packs/index.json";

if (!existsSync(`${WORLD_DIR}/manifest.json`) || !existsSync(`${WORLD_DIR}/tiles/index.json`)) {
  console.error(`no packaged world under ${WORLD_DIR}/; \`make world CORRIDOR=china\` builds one`);
  process.exit(1);
}
const { film, problems } = loadFilm();
if (problems.length > 0) {
  console.error(`film problems:\n${formatProblems(problems)}`);
  process.exit(1);
}

const json = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const manifest = json<WorldManifest>(`${WORLD_DIR}/manifest.json`);
const index = json<TileIndex>(`${WORLD_DIR}/tiles/index.json`);
const w = index.window;
if (index.heightsSha256 !== manifest.heights.sha256) {
  console.error(`${WORLD_DIR}/tiles was cut from other heights than the manifest names: re-run \`make package\``);
  process.exit(1);
}

// Every hero area the world publishes, by id: its lattice directory and manifest.
const heroes = new Map<string, { dir: string; manifest: HeroManifest }>();
for (const dir of HERO_DIRS) {
  const path = `${WORLD_DIR}/${dir}/index.json`;
  if (!existsSync(path)) continue;
  for (const entry of json<HeroIndex>(path).areas) {
    heroes.set(entry.id, { dir, manifest: json<HeroManifest>(`${WORLD_DIR}/${dir}/${entry.file}`) });
  }
}

// The ground's colour (F87), when it has been cut: a file a tile, packed with the tile.
const colourPath = `${WORLD_DIR}/colour/index.json`;
const colour = existsSync(colourPath) ? json<ColourIndex>(colourPath) : null;
if (colour && colourProblem(colour)) {
  console.error(`${colourPath}: ${colourProblem(colour)}`);
  process.exit(1);
}
if (!colour) console.warn(`no ground colour under ${WORLD_DIR}/colour: the packs carry the palette alone (\`make colour\`)`);
const colourBytes = (name: string) => ({
  name: colourFile(name),
  bytes: new Uint8Array(readFileSync(`${WORLD_DIR}/colour/files/${name}.webp`)),
});

// The ground's relief (F93), when it has been cut: a file a tile near the camera, packed with the scene.
const reliefPath = `${WORLD_DIR}/relief/index.json`;
const relief = existsSync(reliefPath) ? json<ReliefIndex>(reliefPath) : null;
if (relief && reliefProblem(relief)) {
  console.error(`${reliefPath}: ${reliefProblem(relief)}`);
  process.exit(1);
}
if (!relief) console.warn(`no ground relief under ${WORLD_DIR}/relief: the packs light the grid alone (\`make relief\`)`);
const reliefBytes = (name: string) => ({
  name: colourFile(name),
  bytes: new Uint8Array(readFileSync(`${WORLD_DIR}/relief/files/${name}.webp`)),
});

rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/packs`, { recursive: true });

// The files read before any pack. Small, and the same for every scene.
const shared: string[] = ["manifest.json", "tiles/index.json"];
if (index.horizon) shared.push(`tiles/${index.horizon.name}.bin`);
for (const dir of HERO_DIRS) {
  const path = `${WORLD_DIR}/${dir}/index.json`;
  if (!existsSync(path)) continue;
  shared.push(`${dir}/index.json`, ...json<HeroIndex>(path).areas.map((a) => `${dir}/${a.file}`));
}
if (colour) shared.push("colour/index.json");
if (relief) shared.push("relief/index.json");
// The walls' rock (F92): every face, since each scene's palette names one and they are 1 MB each.
const rockIndexPath = `${WORLD_DIR}/rock/index.json`;
const rock = existsSync(rockIndexPath) ? json<RockIndex>(rockIndexPath) : null;
if (rock) {
  const problem = rockProblem(rock);
  if (problem) {
    console.error(`${rockIndexPath}: ${problem}`);
    process.exit(1);
  }
  shared.push("rock/index.json", ...rock.rocks.flatMap((r) => [`rock/${r.albedo}`, `rock/${r.normal}`]));
}
let sharedBytes = 0;
for (const file of shared) {
  const to = join(OUT, "world", WORLD, file);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(join(WORLD_DIR, file), to);
  sharedBytes += statSync(to).size;
}

interface PackRow {
  readonly id: string;
  readonly file: string;
  readonly bytes: number;
  readonly reachKm: number;
  /** Every tile the pack answers for, as flat pairs: tx, ty, tx, ty, ... */
  readonly tiles: number[];
  readonly files: number;
  readonly hero: { dir: string; area: string; bytes: number } | null;
  /** Of `bytes`, the ground's colour (F87). */
  readonly colourBytes: number;
  /** Of `colourBytes`, the sub-tiles' along the rail (F95). */
  readonly colourNearBytes: number;
  /** The country tiles the camera comes near enough to light by their relief (F93), as flat pairs. */
  readonly relief: number[];
  /** Of `bytes`, the ground's relief. */
  readonly reliefBytes: number;
  /** The country's sub-tiles along the rail, as flat pairs: their relief at the source's spacing (F94) and their colour at 10 m (F95). */
  readonly near: number[];
  /** Of `reliefBytes`, theirs. */
  readonly reliefNearBytes: number;
}

const rows: PackRow[] = [];
for (const scene of film.scenes) {
  const rail = buildRail(scene.rail);
  const keys = [...sceneTiles(rail, TILE_KM * 1000, VIEW_RADIUS_TILES)].sort((a, b) => a - b);
  const names = new Set<string>();
  const colours = new Set<string>();
  let uncoloured = 0;
  const tiles: number[] = [];
  for (const key of keys) {
    const [tx, ty] = tileOfKey(key);
    tiles.push(tx, ty);
    // Outside the built window the terrain gets nothing and asks for nothing.
    if (tx < w.tx0 || tx >= w.tx1 || ty < w.ty0 || ty >= w.ty1) continue;
    const i = (ty - w.ty0) * (w.tx1 - w.tx0) + (tx - w.tx0);
    const name = index.names[i];
    if (name) names.add(name);
    const water = index.water?.names[i];
    if (water) names.add(water);
    // Sea tiles have no heights file and are drawn all the same, so their colour is packed too.
    if (colour) {
      const c = colour.country[`${tx}_${ty}`];
      if (c) colours.add(c);
      else uncoloured++;
    }
  }
  if (scene.hero && colour) {
    const area = colour.hero[scene.hero];
    if (area) {
      // The fine images too (F91): the area whole, since the camera's drift
      // off the rail decides which tiles it passes near.
      for (const c of [...area.tiles, ...(area.fine ?? [])]) if (c) colours.add(c);
    } else {
      uncoloured++;
    }
  }
  if (uncoloured > 0) console.warn(`${scene.id}: ${uncoloured} tiles or hero areas without colour; they fly in the palette`);
  // The relief (F93): every country tile within its reach of where the camera can stand, and the hero area whole.
  const near = [...nearTiles(rail, TILE_KM * 1000, RELIEF_REACH.country!.reachM)].sort((a, b) => a - b);
  const reliefTiles: number[] = [];
  const reliefs = new Set<string>();
  let unlit = 0;
  for (const key of near) {
    const [tx, ty] = tileOfKey(key);
    if (tx < w.tx0 || tx >= w.tx1 || ty < w.ty0 || ty >= w.ty1) continue;
    reliefTiles.push(tx, ty);
    if (!relief) continue;
    const r = relief.country[`${tx}_${ty}`];
    if (r) reliefs.add(r);
    else unlit++;
  }
  const reliefHero = scene.hero && relief?.hero[scene.hero];
  if (reliefHero) for (const r of reliefHero.tiles) if (r) reliefs.add(r);
  if (relief && unlit > 0) console.warn(`${scene.id}: ${unlit} country tiles near the camera without relief; \`make relief\` cuts them`);
  // The near relief (F94) and colour (F95): the sub-tiles within their fade
  // of the rail as the film flies it, to the fastest viewer's reach. A viewer
  // who drifts off the rail has the 125 m relief and 250 m colour beyond
  // them. Not those the scene's own hero area covers whole, where the
  // country is cut out.
  const heroBox = scene.hero ? heroes.get(scene.hero)?.manifest : undefined;
  const covered = (i: number, j: number): boolean =>
    !!heroBox &&
    i * NEAR_TILE_M >= heroBox.window.hx0 * heroBox.tileM &&
    (i + 1) * NEAR_TILE_M <= heroBox.window.hx1 * heroBox.tileM &&
    j * NEAR_TILE_M >= heroBox.window.hy0 * heroBox.tileM &&
    (j + 1) * NEAR_TILE_M <= heroBox.window.hy1 * heroBox.tileM;
  const nearKeys = [...nearTiles(rail, NEAR_TILE_M, RELIEF_REACH.near!.goneM, { ...DEFAULT_REACH, maxOffsetM: 0 })].sort((a, b) => a - b);
  const nearTilesOut: number[] = [];
  const nears = new Set<string>();
  const nearColours = new Set<string>();
  let unlitNear = 0;
  let uncolouredNear = 0;
  for (const key of nearKeys) {
    const [i, j] = tileOfKey(key);
    if (covered(i, j)) continue;
    // Within the built window of country tiles, as above.
    const tx = Math.floor(i * NEAR_TILE_M / (TILE_KM * 1000));
    const ty = Math.floor(j * NEAR_TILE_M / (TILE_KM * 1000));
    if (tx < w.tx0 || tx >= w.tx1 || ty < w.ty0 || ty >= w.ty1) continue;
    nearTilesOut.push(i, j);
    if (colour) {
      const c = colour.near?.tiles[`${i}_${j}`];
      if (c) nearColours.add(c);
      else uncolouredNear++;
    }
    if (!relief) continue;
    const r = relief.near?.tiles[`${i}_${j}`];
    if (r) nears.add(r);
    else unlitNear++;
  }
  if (relief && unlitNear > 0) console.warn(`${scene.id}: ${unlitNear} sub-tiles along the rail without near relief; \`make relief\` cuts them`);
  if (colour && uncolouredNear > 0) console.warn(`${scene.id}: ${uncolouredNear} sub-tiles along the rail without near colour; \`make colour\` cuts them`);
  for (const r of nears) reliefs.add(r);
  for (const c of nearColours) colours.add(c);
  const files = [
    ...[...names].sort().map((name) => ({ name, bytes: new Uint8Array(readFileSync(`${WORLD_DIR}/tiles/${name}.bin`)) })),
    ...[...colours].sort().map(colourBytes),
    ...[...reliefs].sort().map(reliefBytes),
  ];
  const reliefTotal = files.filter((f) => f.name.startsWith("relief-")).reduce((n, f) => n + f.bytes.length, 0);
  const nearFiles = new Set([...nears].map(colourFile));
  const nearTotal = files.filter((f) => nearFiles.has(f.name)).reduce((n, f) => n + f.bytes.length, 0);
  const nearColourFiles = new Set([...nearColours].map(colourFile));
  const nearColourTotal = files.filter((f) => nearColourFiles.has(f.name)).reduce((n, f) => n + f.bytes.length, 0);
  const colourTotal = files.filter((f) => f.name.endsWith(".webp")).reduce((n, f) => n + f.bytes.length, 0) - reliefTotal;

  let hero: Parameters<typeof writePack>[3] = null;
  let heroBytes = 0;
  if (scene.hero) {
    const h = heroes.get(scene.hero);
    if (!h) {
      console.error(`${scene.id}: hero ${scene.hero} is not published under ${WORLD_DIR}`);
      process.exit(1);
    }
    const m = h.manifest;
    const raw = readFileSync(`${WORLD_DIR}/${h.dir}/${m.heights.file}`);
    const field = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
    const heights = new Uint8Array(gzipSync(deltaPlanes(field, m.tileSamples, m.tileSamples * m.heights.tiles), { level: 9 }));
    const water = m.water ? new Uint8Array(readFileSync(`${WORLD_DIR}/${h.dir}/${m.water.file}`)) : null;
    // Decoded here the way the browser will, and compared: a pack whose hero
    // comes back different is refused rather than shipped.
    const back = await decodeHeroArea(m, heights, water);
    if (back.heights.length !== field.length || back.heights.some((v, k) => v !== field[k])) {
      console.error(`${scene.id}: ${m.area}'s heights do not survive the codec`);
      process.exit(1);
    }
    hero = { dir: h.dir, area: m.area, heights, water };
    heroBytes = heights.length + (water?.length ?? 0);
  }

  const pack = writePack(scene.id, index.heightsSha256, files, hero);
  const file = `packs/${scene.id}.bin`;
  writeFileSync(join(OUT, file), pack);
  rows.push({
    id: scene.id,
    file,
    bytes: pack.length,
    reachKm: Math.round(reachKm(rail) * 10) / 10,
    tiles,
    files: files.length,
    hero: hero && { dir: hero.dir, area: hero.area, bytes: heroBytes },
    colourBytes: colourTotal,
    colourNearBytes: nearColourTotal,
    relief: reliefTiles,
    reliefBytes: reliefTotal,
    near: nearTilesOut,
    reliefNearBytes: nearTotal,
  });
}

const packBytes = rows.reduce((n, r) => n + r.bytes, 0);
const totalBytes = packBytes + sharedBytes;
const out = {
  version: 1,
  world: WORLD,
  heightsSha256: index.heightsSha256,
  viewRadiusTiles: VIEW_RADIUS_TILES,
  tileM: TILE_KM * 1000,
  speedMax: DEFAULT_REACH.speedMax,
  maxOffsetM: DEFAULT_REACH.maxOffsetM,
  flightS: DEFAULT_REACH.flightS,
  budgetBytes: FILM_BUDGET_BYTES,
  sharedBytes,
  totalBytes,
  scenes: rows,
};
mkdirSync(dirname(INDEX_OUT), { recursive: true });
writeFileSync(INDEX_OUT, JSON.stringify(out) + "\n");

const mb = (n: number) => `${(n / 1e6).toFixed(2)} MB`;
console.log(`${OUT}/: ${rows.length} packs, ${mb(packBytes)}; read before them ${mb(sharedBytes)}; ${mb(totalBytes)} of ${mb(FILM_BUDGET_BYTES)}`);
for (const r of rows) {
  console.log(
    `  ${r.id.padEnd(26)} ${mb(r.bytes).padStart(9)}  ${String(r.tiles.length / 2).padStart(4)} tiles  ${String(r.files).padStart(4)} files  ` +
      `reach ${r.reachKm} km${r.hero ? `  hero ${r.hero.area} ${mb(r.hero.bytes)}` : ""}` +
      (r.colourBytes > 0 ? `  colour ${mb(r.colourBytes)}` : "") +
      (r.colourNearBytes > 0 ? ` (near ${mb(r.colourNearBytes)})` : "") +
      (r.reliefBytes > 0 ? `  relief ${mb(r.reliefBytes)}` : "") +
      (r.reliefNearBytes > 0 ? ` (near ${mb(r.reliefNearBytes)})` : ""),
  );
}
if (totalBytes > FILM_BUDGET_BYTES) {
  console.error(`over the film's budget by ${mb(totalBytes - FILM_BUDGET_BYTES)}`);
  process.exit(1);
}
