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

Later stages will add `shapely`, `fiona` and `brotli`.

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

| Layer | Source | Licence |
| --- | --- | --- |
| Land cover | ESA WorldCover 2021 v200 | CC BY 4.0 |
| Climate | CHELSA V2.1 monthly tas / pr | CC BY 4.0 |
| Wind | ERA5 monthly means, 10 m u/v | Copernicus licence |
| Rivers | HydroSHEDS v1 river network | Attribution |
| Coasts, lakes, cities | Natural Earth 10 m | Public domain |
| Population | GHSL GHS-POP R2023A | CC BY 4.0 |

Build plan D8 and D9 pick these deliberately: CHELSA over WorldClim and Natural
Earth over OSM, because both alternatives carry share-alike terms that would
attach to shipped assets.

## Stages

1. **Acquire** — sync the source rasters into `data/source/`.
2. **Mosaic and reproject** — Albers Equal Area Conic, CM 105 E, standard
   parallels 25 N / 47 N, 1 km. Output grid 6,721 x 4,417 samples: 105 x 69
   tiles of 64 km, plus the shared edge sample. The mosaic is a hand-written
   GDAL VRT, so 331 files look like one continuous raster and the warp kernel
   never straddles a file boundary. Reduction is mean plus 0.25 of (max - mean)
   — see finding F12 for why not cubic, and `grid.py` for why the constants are
   frozen rather than computed.
3. **Hydro-condition** — burn HydroSHEDS centrelines, enforce monotonic
   downstream elevation, flatten named lakes to their real surface heights.
   **Not built, and the probe that guards it does not fail without it** (F48).
   The Yangtze golden probe is seven hand-placed waypoints 500 km apart, 175
   cells of the corridor's 4.7 million; it passes at every channel search
   radius including a bare point sample, and it cannot be walked more finely
   because the polyline is a chord across country rather than a centreline.
   The centreline is what stage 3 brings, and nobody has downloaded
   HydroSHEDS yet. Until then the probe report prints what its pass covers.
4. **Tile** — 64 km tiles, 65 x 65 Int16 metres, shared edge row and column.
5. **Horizon field** — one 8 km country raster, 841 x 553 Int16 (930 kB),
   reduced from the 1 km grid with the silhouette bias (mean + 0.6 x
   (max - mean)). Feeds the horizon impostor and the map overlay, so the
   constant lives in `engine/src/terrain/horizonField.ts` and the pipeline
   must match it — `test/terrain/horizon.test.ts` holds the reduction to
   keeping the Himalayan crest within 10 %.
6. **Hero areas** — 90 m tiles, 129 x 129 over 11.52 km, in the country
   tiler's own layout. **Built** (`make hero`, F50), and it is what a golden
   probe was waiting on: at 1 km the Jinsha climbs 221 m in the 41 km
   downstream from Shigu to Tiger Leaping Gorge, where the source runs it
   down 41. On this grid the probe passes — −80 m on the channel, −11 m as a
   bare point sample.
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
     (71 m mean, 333 m worst for the gorge).
   - An area is sited on `places.py` entries and refuses to cut if it does not
     contain them. Two of the five are sited; Guilin, Zhangjiajie and the
     Three Gorges are in `hero.UNSITED` because no coordinate for them in this
     repository has ever been checked against the ground, and writing three
     from memory is what F49 and F50 cost. Everest is sited and refuses to
     cut: three of its four source cells are not on disk.
7. **Land cover** — aggregate to 2 km class fractions, packed RGBA.
8. **Atlases** — climate at 10 km, wind at 25 km, country-wide, loaded once.
9. **City baker** — GHSL to per-tile block instances.
10. **Map textures** — hypsometric, elevation steps with colour-blind hatching,
   climate zones, density, the Heihe-Tengchong line.
11. **Package** — Brotli, content hash, manifest.

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

```bash
make test-py      # or: python3 -m unittest discover -s pipeline/tests
make hero         # stage 6 — the 90 m areas the seventh probe needs
make probes       # the real thing, against both built grids
```

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
nonetheless false.
