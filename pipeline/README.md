# Terrain pipeline

Offline. Turns public elevation, land cover, climate and population data into
the tiles the game streams. Nothing here runs at game time.

**Status: scaffolded.** The golden-probe harness is written and tested; the
GDAL stages are not yet implemented, and no elevation data has been acquired.
The prototype currently flies over stand-in terrain
(`engine/src/terrain/syntheticTiles.ts`), which is shaped like China's three
steps but is fiction.

## Prerequisites

```bash
brew install gdal            # or: conda install -c conda-forge gdal
python3 -m venv .venv && source .venv/bin/activate
pip install rasterio numpy shapely fiona brotli
```

## Acquiring the source data

Roughly 70 GB for elevation, downloaded once and cached outside the repo.
Copernicus GLO-30 is on AWS Open Data with no egress charge.

```bash
aws s3 sync --no-sign-request \
  s3://copernicus-dem-30m/ data/source/cop30/ \
  --exclude "*" --include "Copernicus_DSM_COG_10_N[1-5][0-9]_00_E[01][0-9][0-9]_00_DEM*"
```

That glob is deliberately wide; the mosaic stage clips to the China bounding
box (lon 73-135 E, lat 18-54 N, 2,232 one-degree tiles).

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
   parallels 25 N / 47 N, 1 km. Output grid 5,200 x 5,500.
3. **Hydro-condition** — burn HydroSHEDS centrelines, enforce monotonic
   downstream elevation, flatten named lakes to their real surface heights.
4. **Tile** — 64 km tiles, 65 x 65 Int16 metres, shared edge row and column.
5. **Horizon field** — one 8 km country raster, 657 x 433 Int16 (556 kB),
   reduced from the 1 km grid with the silhouette bias (mean + 0.6 x
   (max - mean)). Feeds the horizon impostor and the map overlay, so the
   constant lives in `engine/src/terrain/horizonField.ts` and the pipeline
   must match it — `test/terrain/horizon.test.ts` holds the reduction to
   keeping the Himalayan crest within 10 %.
6. **Hero areas** — 90 m tiles over Guilin, Zhangjiajie, Three Gorges, Everest
   and Tiger Leaping Gorge.
7. **Land cover** — aggregate to 2 km class fractions, packed RGBA.
8. **Atlases** — climate at 10 km, wind at 25 km, country-wide, loaded once.
9. **City baker** — GHSL to per-tile block instances.
10. **Map textures** — hypsometric, elevation steps with colour-blind hatching,
   climate zones, density, the Heihe-Tengchong line.
11. **Package** — Brotli, content hash, manifest.

## Golden probes

Six checks that stand between "the pipeline ran" and "the world is right".

```bash
python3 -m unittest discover -s pipeline/tests
```

The harness (`nineskies/probes.py`) takes any `(lat, lon) -> metres` sampler,
so it tests the probe logic today and the real grid later.

**Only two run on a corridor build.** Lhasa and the Yangtze profile lie inside
the Shanghai-Lhasa strip; Everest, Turpan, Qinghai Lake and the area ratio need
the full-country grid and first run in phase 2. Phase 0's exit gate is those
two, and `probes_for("corridor")` is what enforces it.

The area probe is the one worth understanding: if the Heihe-Tengchong split is
not 57/43 within a point, the projection is not equal-area, and the GDD's
"honest scale" pillar is a claim the player cannot see through but that is
nonetheless false.
