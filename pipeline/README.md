# Terrain pipeline

Offline. Turns public elevation, land cover, climate and population data into
the tiles the game streams. Nothing here runs at game time.

**Status: the Shanghai-Lhasa corridor builds.** Stages 1, 2, 4 and 5 are
implemented and the two corridor golden probes run against real elevation.
Stages 3 and 6-11 are not written yet. Outside the corridor the prototype still
flies stand-in terrain (`engine/src/terrain/syntheticTiles.ts`), which is shaped
like China's three steps but is fiction — the HUD says which one is on screen.

## Prerequisites

No GDAL install and no AWS account. `rasterio`'s wheels carry libgdal, and the
Copernicus bucket serves anonymous HTTPS, so the whole pipeline is two pip
packages:

```bash
make world            # creates pipeline/.venv on first run
```

or by hand:

```bash
python3 -m venv pipeline/.venv
pipeline/.venv/bin/python -m pip install -r pipeline/requirements.txt
```

Stage 3 reads its shapefiles with `shapefile.py` rather than `fiona` (F60), and
needs nothing but numpy for the carve. Stage 11 needs no `brotli` either: it
packs tiles with the standard library's gzip, which is measured and chosen
rather than settled for (D68, F67).

## Acquiring the source data

```bash
make acquire                      # the phase 0 corridor: 331 files, 13.9 GB
make acquire CORRIDOR=china       # the full country: 1,969 files, ~70 GB
```

Downloads are resumable and idempotent — a tile whose local size matches the
server's `Content-Length` is left alone, so re-running after an interruption
costs one HEAD per tile. Source rasters land in `data/source/` and intermediates
in `data/work/`, both gitignored; set `NINESKIES_DATA` to put them on another
disk.

The China box is lon 73-135 E, lat 18-54 N: 2,232 one-degree cells, of which
**1,969 exist** as files. The other 263 are open ocean and are simply absent
from the bucket, which is why the acquire stage reads `tileList.txt` rather than
guessing names.

The corridor is wider than the Shanghai-Lhasa line — lat 25-35 N, lon 89-123 E —
because the Yangtze golden probe reaches from Tiger Leaping Gorge to the Tuotuo
He headwaters, and reprojection reads outside the cells it writes.

Other layers, all small by comparison:

| Layer | Source | Licence, as read (F62) |
| --- | --- | --- |
| Land cover | ESA WorldCover 2021 v200 | CC BY 4.0, with a prescribed credit line |
| Climate | CHELSA V2.1 monthly tas / pr | CC0 1.0 — public domain; a citation is requested |
| Wind | ERA5 monthly means, 10 m u/v | CC BY 4.0 since 2 July 2025; the download needs a Climate Data Store account and the licence accepted in its holder's name |
| Rivers | Natural Earth 10 m rivers and lakes, fetched (F60); carved by stage 3 (F61) | Public domain |
| Coasts, lakes, cities | Natural Earth 10 m | Public domain |
| Population | GHSL R2023A GHS-POP, GHS-BUILT-S, GHS-BUILT-H | CC BY 4.0; GHS-BUILT-H is derived from JAXA's AW3D30, whose own terms ask for credit and notice of commercial use |

Build plan D8 and D9 pick these deliberately: CHELSA over WorldClim and Natural
Earth over OSM, because both alternatives carry share-alike terms that would
attach to shipped assets. Every row was read from its publisher on 22
September 2026 (F62); until then this table had CHELSA as CC BY 4.0, which it
is not, and WorldCover's licence had never been read at all.

This table said "Attribution" for HydroSHEDS until somebody read its terms
(F59). They are a bespoke agreement, and downloading the data accepts it, so
the rivers row is a decision rather than a source:

```bash
make vectors                                         # the price list, and one request per source to check it
make vectors FETCH=ne-lakes ACCEPT=public-domain     # a download names the licence it is made under
make rivers                                          # what the fetched rivers decide of the closed basins
```

Each candidate is pinned to the digest its own publisher serves, so the bytes
that arrive are the bytes that were priced, and a fetch whose `ACCEPT` is not
that source's licence is refused before any request is made (D60). Natural
Earth is fetched; HydroRIVERS is ruled out, because its agreement cannot be
met by an MIT-licensed open-source project (F60). The files are shapefiles,
read by `shapefile.py` with the standard library and numpy rather than a
vector driver. What the data itself asks of anyone who redistributes it is in
`NOTICE.md`.

## Stages

1. **Acquire** — sync the source rasters into `data/source/`.
2. **Mosaic and reproject** — Albers Equal Area Conic, CM 105 E, standard
   parallels 25 N / 47 N, 1 km. Output grid 6,721 x 4,417 samples: 105 x 69
   tiles of 64 km, plus the shared edge sample. The mosaic is a hand-written
   GDAL VRT, so 331 files look like one continuous raster and the warp kernel
   never straddles a file boundary. Reduction is mean plus 0.25 of (max - mean)
   — see finding F12 for why not cubic, and `grid.py` for why the constants are
   frozen rather than computed.
   - **It also records what the source reached, which is the only reason the
     map can draw water** (D53, F54). GLO-30 writes the ocean as zero and a
     destination nobody warped into is zero, so a blank tile has meant three
     things at once since the first corridor. Copernicus publishes a
     one-degree cell only where there is something to publish, so a cell
     absent from `tileList.txt` is open ocean — nine of this corridor's 340,
     all of them offshore. `coverage.py` turns that into one character per
     tile in the manifest: 783 fully fetched, 45 open ocean, 31 shoreline,
     296 the corners of a rectangle drawn around a curved quadrilateral.
     `tiles.py` refuses to publish a world where the mirror says ocean and
     the warp says land; it is 45 of 45 today with nothing tuned to make it
     so. What this does *not* settle is the ocean inside a fetched raster,
     which is stage 3's business and is why `c` has its own name.
   - **North of 50 N a source tile is 2,400 columns wide** (F71). GLO-30
     thins its longitude spacing to 1.5″ there, and until F71 the VRT read
     those 248 tiles as 3,600 wide: squeezed into two-thirds of their degree,
     with the eastern third left at 0 m. Each is now stretched once, nearest
     column, into a 3,600-column copy under `data/work/cop30-1arcsec/`, kept
     while its source's committed digest is the one it was made from. The VRT
     reads every file one to one, because a VRT source that is stretched on
     the fly reads 590 times slower through the warp. Every tile's header is
     checked against the product's own spacing before anything is written.
3. **Hydro-condition** (`make carve`, `carve.py`, D62–D65, D69, F61, F63) — the
   mapped rivers carved, the mapped lakes kept, every other closed basin
   filled. Each run of a Natural Earth river over ground the source reached
   is followed down the valley it lies in — the way water would take through
   the cells within 5 km of the line — and cut, lower only, until it runs
   downhill; nothing inside a mapped lake is cut below the lake's own floor,
   and a lake still closed afterwards keeps its basin. A basin on
   `carve.SINKS` keeps its level too (D65): the short list of basins that are
   closed in life and that no map this stage reads says so about, each named
   by its `places.py` id and marked at the basin's own floor, found as the
   rule fills with the kept lakes open, and at the floor of each hollow in it
   that the named coordinate lies in, so the ground under a named place is
   never raised (D69, F68). Writes
   `sea-to-sky-1km-conditioned.tif` beside stage 2's grid, which is what the
   tiles, the golden probes and the hero areas' seam check now read, and a
   record naming the vector files by digest, which the manifest and every
   signed section and patch carry (D24). `docs/carve-report.md` prices the
   rule for the other basins three ways, because filling them is the
   largest thing the stage does: 387,919 cells raised, up to 542 m.
   `make hydro` and `make rivers` go on measuring stage 2's grid, the
   before. Needs the two Natural Earth files from `make vectors`, which
   `make world` reads and never fetches (D60). **Stage 6 runs the same stage
   on each hero area as it cuts it** (F63), since an area is cut from the
   source and this one never reaches it; the band is 5 km there too, which is
   56 cells, and where a line leaves a grid the channel is taken to the
   river's own crossing of the edge rather than to the line's.
   - **And drawn** (`make water`, `water.py`, D70, F72). Which samples are
     water, cut beside the tiles as four bytes a sample: the sea where GLO-30
     writes exactly 0 m and Natural Earth's coastline says sea; a lake where a
     sample inside its outline carries, beside a neighbour, the value most of
     the lake's samples carry; and each channel this stage cut, found again by
     its own two functions and refused unless every sample it lowered lies on
     one. A river is stored as the offset from each sample within 4 km to the
     nearest point of its smoothed centreline, which the terrain shader reads
     bilinearly into a ribbon with a clean edge. Where the grid resolves a
     river wider than its channel, it is standing water too (D71, F73): a
     sample at exactly its channel's level, reached from the channel through
     samples that are, on ground this stage did not raise and outside the sea
     and every lake. That is 2,717 samples of the country, mostly reservoirs
     Natural Earth's lakes leave out, and the Three Gorges reservoir at 90 m.
     Writes `water.bin` and `water.json` beside the heights and
     `docs/water-report.md`.
4. **Tile** — 64 km tiles, 65 x 65 Int16 metres, shared edge row and column.
5. **Horizon field** — one 8 km country raster, 841 x 553 Int16 (930 kB),
   reduced from the 1 km grid with the silhouette bias (mean + 0.6 x
   (max - mean)). Feeds the horizon impostor and the map overlay, so the
   constant lives in `engine/src/terrain/horizonField.ts` and the pipeline
   must match it — `test/terrain/horizon.test.ts` holds the reduction to
   keeping the Himalayan crest within 10 %.
6. **Hero areas** — 90 m tiles, 129 x 129 over 11.52 km, in the country
   tiler's own layout. **Built, and the engine draws them** (`make hero`, F50,
   F51), and it is what a golden
   probe was waiting on: at 1 km the Jinsha climbs 221 m in the 41 km
   downstream from Shigu to Tiger Leaping Gorge, where the source runs it
   down 41. On this grid the probe passes — −80 m on the channel, −11 m as a
   bare point sample.
   - **Each area is conditioned by stage 3 as it is cut** (D64, F63), because
     it is cut from the source rather than from the conditioned country grid.
     Without it the gorge kept a 1,935 m sill, 119 m over the cell the probe
     reads at Shigu, which is now gone; the Yangtze through the Three Gorges
     needed no cut. `make hero` writes `docs/carve-report-hero.md`, which
     prices the rule for each area's other basins, and each area's manifest
     carries the record stage 3 wrote.
   - **Each area's water is cut with it** (D71, F73), by `water.py`'s rules,
     from the channels stage 3 has just made. It is one gzip file beside the
     heights, `<area>.water.bin`, the country's four bytes a sample on the
     same 129 × 129 tiles. `make hero` also writes `docs/water-report-hero.md`,
     which measures what a ribbon would be drawn on. Within 600 m of the line
     — the Yangtze's ribbon on the country — 48 % and 65 % of the two areas'
     samples are wall more than 20 m over the water, so the engine holds the
     hero ribbon to half a sample and the grid draws the rest as the river's
     own surface: the Three Gorges reservoir, 96.8 km² at 157.5 m.
   - The cell size is measured, not inherited. 100 m is the only resolution
     that nests in the 1 km grid, and it still loses: both probes that read
     this artefact pass across a bias window of 0.25–0.45 at 90 m and at the
     single value 0.35 at 100 m. The bias is **0.40** here, its own number
     rather than stage 2's 0.25.
   - **A hero tile is not addressed against a country tile.** `gcd(90, 64000)`
     is 10, so nothing nests at any tile size; the lattice shares only the
     origin, and `country_tiles_under` answers with a span rather than an
     index. What keeps the seam closed is the 900 m skirt in
     `engine/src/terrain/terrain.ts`, and the cut measures its own boundary
     against the country grid and refuses to write an area that exceeds it
     (71 m mean, 333 m worst for the gorge). Read back from the other side by
     the engine, through the sampling the HUD uses, the same rim is 71.4 m
     mean and 339.4 m worst (F51).
   - **Two grids is a cost as well as a fidelity gain, and it is measured on
     the other side.** The rim is where they are held together; the interior
     is where they are allowed to disagree, and inside these two areas the
     90 m grid stands up to **374 m above** the 1 km grid — more than the
     333 m the only authored expedition clears its worst terrain by. Since
     the cockpit reads the fine grid and every committed section and patch is
     cut from the coarse one, `make ground` writes `docs/ground-report.md` on
     every build and both cutters refuse to write an artefact over a hero
     area (D52, F53).
   - **And what the areas are worth to the challenge they were cut for is
     measured too.** `make gorges` writes `docs/gorge-report.md`: the largest
     terrain-free disc the aeroplane's own position lies inside, at heights
     above the water, which is what a full-bank reversal needs. Tiger Leaping
     Gorge is **0.36 km** wide a hundred metres over the river and the turn
     first fits 725 m above its rim; Wu Gorge reverses at `low` with 164 m of
     wall still above it. Below the rim the 1 km grid reports no room at all,
     because at that height it puts the aeroplane inside the hill it draws
     where the reservoir is (D54, F55).
   - `cut` also writes **`hero/index.json`**, which is the file the engine
     fetches to find out what exists. Beside the areas rather than in the
     corridor manifest: that manifest is hashed into every route section's
     signature (D23), so an area appearing must not change what a section
     verifies against.
   - An area is sited on `places.py` entries and refuses to cut if it does not
     contain them, and the coordinates come from `siting.py` rather than from
     memory (F52). Three of the five are sited and two are built — Tiger
     Leaping Gorge at 24 tiles and the Three Gorges at 36, 2.00 MB of cover.
     Everest is sited and its cells have been on disk since F64, but whether
     it is published is the user's, so it is marked unpublished and `make
     hero` cuts it only when named with `--area` (F73). Guilin and Zhangjiajie are in `hero.UNSITED`, and neither is
     waiting on a coordinate — Guilin wants three one-degree cells below 25 N,
     and Zhangjiajie wants a source that resolves what it is named for.
7. **Land cover** — aggregate to 2 km class fractions, packed RGBA.
8. **Atlases** — climate at 10 km, wind at 25 km, country-wide, loaded once.
9. **City baker** — GHSL to per-tile block instances.
10. **Map textures** — hypsometric, elevation steps with colour-blind hatching,
   climate zones, density, the Heihe-Tengchong line.
11. **Package** — content hash, compression, index. **The heights are built**
   (`make package`, D68, F67): one file per tile under `tiles/`, named by the
   digest of what it holds, coded as left deltas in byte planes under gzip,
   and a `tiles/index.json` that lists each tile's file in `heights.bin` order
   and names that file's digest. The engine streams a world that has one and
   refuses a package cut from any other `heights.bin`, which stays what every
   section is signed against. A tile of zeros has no file and two identical
   tiles share one — which on the country was thirty tiles of the lower Tarim
   at one level, 1,044.5 m, and a finding (F67, F68). **The horizon field is
   coded the same way** (F69): one file the index names beside the digest of
   the `horizon.bin` it came from, 353 kB on the country where the raw field
   is 930, and 75 kB on the corridor. The engine fetches the raw file whenever
   the two disagree. **The water layer is packed beside the heights** (F72):
   a file per tile that has any, gzip over its bytes as they lie, named in
   the index beside the `heights.bin` it was cut against, which has to be
   this package's.

**Not a stage: D14's region raster.** The nine regions the air, the music,
the weather and the journal all read have no position -> region map yet, and
`make regions` writes `docs/regions-report.md` to say how much of one the
country's ground draws by itself. It reads the plateau above a height and
counts Expedition 1's crossings of its edge, and it cuts each lowland's narrow
ways at widening widths to see what the lowland falls into — every cell given
back to the piece it is joined to most directly, so the pieces divide it. The
ground parts the plateau, Xinjiang's basins, the Sichuan Basin, the Pearl
River lowland and Dongbei's plain from what is around them, and holds the
North China Plain and the Yangtze together at every width to 41 km; what
draws the edges it does not is the user's, and three ways of drawing them are
priced (F66). China's outline is burnt in memory to keep the sea from
joining every lowland, and never written (D10).

## Golden probes

Seven checks that stand between "the pipeline ran" and "the world is right" —
one of them weaker than it reads, and one that could not pass at 1 km until
stage 6 built the grid it needed, both of which the report says on every run
rather than only when somebody goes looking (F48, F49, F50).

Every coordinate they use comes from `nineskies/places.py`: a probe names a
place and has no `lat` or `lon` of its own, so a second copy of a coordinate
cannot be written down. The report prints what the world reads at each place
beside the landform it claims to be, because a table of coordinates cannot
tell you that one of them is in the wrong valley — and one of them was, by
71 km. It then prints **how far each place stands above the lowest ground
near it**, because relief could not tell the next one either: the replacement
coordinate was 1,260 m up the gorge wall, and a gorge floor and its cliff
report the same 3,800 m of relief. A place that claims `on_channel` is held
to the water, to a tolerance that scales with the cell — a river falls, and a
cell wider than the water is mostly not water (F50).

And **a probe that reads nothing reports nothing**. The hero grid is not one
raster but a handful of small ones, and every hero probe is run against every
area, so the moment a second area existed the Jinsha probe ran against the
Three Gorges 1,200 km away, read `nan` at both waypoints and reported *pass* —
NaN compares false against every threshold a check can set. A probe whose
subject is off this raster is now listed under *Not on this artefact*, and one
that is half on it fails rather than skipping, because a verdict on the half
it can see is a green light for a raster cut too small (F52).

```bash
make test-py      # or: python3 -m unittest discover -s pipeline/tests
make hero         # stage 6 — the 90 m areas the seventh probe needs
make siting       # where a coordinate goes, measured off the source at 30 m
make probes       # the real thing, against both built grids
```

`make siting` writes `docs/siting-report.md`, which is the same question asked
of the source rather than of the built world: 1 km ground cannot tell a gorge
from the county it sits in, and 30 m can. A city on the plain reads under a
fifth of a percent of its cells past 45°, a gorge reads five to twenty, and a
coordinate in the wrong valley reads like its neighbours. `siting.py` also has
`drama`, `scan`, `pools` and `walls` for placing the next area — the three
Yangtze gorges came out of them rather than out of recall (F52).

The unit suite runs on a bare interpreter; tests that need rasterio or numpy
skip themselves. That is a convenience locally and a trap in CI — a bare
interpreter would go green while asserting almost nothing — so the `pipeline`
CI job installs the pins and preflights the imports before running anything.
`make probes` writes `docs/probe-report.md` and `docs/probe-report-hero.md`,
which is how a result reaches somebody who does not have 14 GB of elevation on
disk. It runs **both** grids: a probe deferred from the 1 km grid to the 90 m
one is only answered on the second, so a gate that ran one of them would make
the seventh probe invisible again — which is how it stayed invisible long
enough for F49 to find it.

The harness (`nineskies/probes.py`) takes any `(lat, lon) -> metres` sampler,
so it tests the probe logic today and the real grid later.

**Only two run on the corridor's 1 km grid.** Lhasa and the Yangtze profile
lie inside the Shanghai-Lhasa strip; Turpan, Qinghai Lake and the area ratio
need the full-country grid and first run in phase 2. Phase 0's exit gate is
those two, and `probes_for("corridor")` is what enforces it.

A third runs on the corridor's *hero* grid: the Jinsha through Tiger Leaping
Gorge, which at 1 km climbs 221 m in the 41 km downstream from Shigu where the
source runs it down 41. `probes_for` answers "has this been built yet";
`runnable_on` answers the narrower question the runner has to ask — "can I
read this from the file in my hand" — and `deferred_on` names what that left
out, so a probe that cannot run prints in the report with its number on it
instead of vanishing from the count.

**Everest needs the 90 m hero grid, not the country grid**, and is measured
against GLO-30's own summit rather than the survey height — at 1 km, grid
alignment alone moves the summit by 153 m, so no tolerance there means
anything (finding F12). `runnable_on(phase, grid)` answers "can I read this
probe from the file in my hand?", and the report lists what it could not
reach, because a probe that quietly does not run is worse than one that
fails.

The area probe is the one worth understanding: if the Heihe-Tengchong split is
not 57/43 within a point, the projection is not equal-area, and the GDD's
"honest scale" pillar is a claim the player cannot see through but that is
nonetheless false. It had never run: `probes_by_type` collected it and the
runner rendered the other three kinds, which a count of passes could not catch
and did not (F64). It needs a boundary, because 57/43 is a claim about *China's*
land and the built grid is a rectangle holding four other countries, and that is
what `nineskies/boundary.py` is — Natural Earth's admin-0 countries burnt to a
mask in memory, never written to a tile, so D10 still holds. Two choices sit
under the number and only one is arithmetic: which polygon is China, which the
file's own `FCLASS_CN` column answers two ways, and which plane the line is
straight in, which moves the answer five times further. The report prints every
reading with the verdict's marked, plus the two absolute-area checks a ratio
cannot make (F65).

The lake probe reads Natural Earth's outline of the lake its coordinate falls
in, and asks for the water's one value rather than for a standard deviation:
Copernicus flattens water bodies in production, so a lake on this grid is a
single float32 value, and what a spread over a disc or an outline measures is
the shore and the islands instead (D67, F56, F65).
