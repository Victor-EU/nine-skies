"""Stages 4 and 5 — cut the grid into tiles, and reduce it to the horizon field.

Both outputs are Int16 metres, which spans Ayding Lake at -154 m to Everest at
8,849 m exactly and needs no decode step in the browser: the bytes off the wire
are the bytes the GPU reads.

Layouts here are not free choices — they match what the engine already does, so
that switching from the stand-in world to real data changes a data source and
nothing else:

- a tile is 65 x 65 samples, `j * 65 + i`, i running east and **j running
  north**, sharing its edge row and column with its neighbours;
- the horizon field is `j * width + i` at 8 km, sample (i, j) sitting *at*
  (i * 8 km, j * 8 km) from the country grid's south-west corner, which is how
  `HorizonField.sampleM` reads it.

A corridor build writes a country-sized horizon field with real values only
inside the corridor and zero — open sea — outside it. That keeps the artefact's
shape identical to the full build's, so the engine never learns which one it got.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
import rasterio

from . import grid
from . import places
from .acquire import data_root
from .grid import CORRIDORS
from .mosaic import corridor_window

#: Named places along the Sea to Sky route, as the GDD lists it. The pipeline
#: is the only thing here that owns a projection, so it publishes these in the
#: country grid's own metres and the engine never learns what Albers is.
#:
#: Derived from `places.py` rather than written here, because this table used
#: to be one of three copies of the same coordinates and one of the three was
#: 71 km from the place it named (F49).
ANCHORS: dict[str, tuple[float, float]] = places.anchors()

HORIZON_SAMPLE_KM = 8
#: Inherited from `engine/src/terrain/horizonField.ts`. If these two ever
#: disagree, the wall you fly at and the wall on the map disagree.
SILHOUETTE_BIAS = 0.6

INT16_MIN, INT16_MAX = -32768, 32767


def field_shape() -> tuple[int, int]:
    """Country-wide horizon field, in samples. Matches the engine's formula."""
    east_km = grid.WIDTH_CELLS * grid.RESOLUTION_M / 1000
    north_km = grid.HEIGHT_CELLS * grid.RESOLUTION_M / 1000
    width = int(np.ceil(east_km / HORIZON_SAMPLE_KM)) + 1
    height = int(np.ceil(north_km / HORIZON_SAMPLE_KM)) + 1
    return width, height


def cut_tiles(array: np.ndarray, window: grid.TileWindow) -> np.ndarray:
    """(tiles, 65, 65) Int16, tile-row-major with j running north."""
    n = window.count
    out = np.zeros((n, grid.TILE_SAMPLES, grid.TILE_SAMPLES), dtype="int16")
    rounded = np.clip(np.rint(array), INT16_MIN, INT16_MAX).astype("int16")
    t = 0
    for ty in range(window.ty0, window.ty1):
        for tx in range(window.tx0, window.tx1):
            # Sample (i, j=0) is the tile's south edge, so slice from the
            # bottom row upward and flip.
            row_north, col_west = grid.sample_index(window, tx, ty, 0, grid.TILE_CELLS)
            patch = rounded[
                row_north : row_north + grid.TILE_SAMPLES,
                col_west : col_west + grid.TILE_SAMPLES,
            ]
            out[t] = patch[::-1, :]
            t += 1
    return out


def reduce_to_field(array: np.ndarray, window: grid.TileWindow) -> np.ndarray:
    """Silhouette-biased reduction of the 1 km grid to the 8 km country field."""
    width, height = field_shape()
    field = np.zeros((height, width), dtype="int16")

    step = HORIZON_SAMPLE_KM * 1000 // grid.RESOLUTION_M  # 8 cells
    half = step // 2
    # Field sample (i, j) sits at (i * 8 km, j * 8 km) from the country origin;
    # the corridor window starts at tile (tx0, ty0).
    i0 = window.tx0 * grid.TILE_KM // HORIZON_SAMPLE_KM
    j0 = window.ty0 * grid.TILE_KM // HORIZON_SAMPLE_KM
    i1 = window.tx1 * grid.TILE_KM // HORIZON_SAMPLE_KM
    j1 = window.ty1 * grid.TILE_KM // HORIZON_SAMPLE_KM
    rows, cols = array.shape

    for j in range(j0, min(j1 + 1, height)):
        # Local cell row of this field sample, counted from the window's south.
        cell_from_south = (j - j0) * step
        centre_row = (rows - 1) - cell_from_south
        r0, r1 = max(0, centre_row - half), min(rows, centre_row + half + 1)
        if r0 >= r1:
            continue
        for i in range(i0, min(i1 + 1, width)):
            centre_col = (i - i0) * step
            c0, c1 = max(0, centre_col - half), min(cols, centre_col + half + 1)
            if c0 >= c1:
                continue
            block = array[r0:r1, c0:c1]
            mean = float(block.mean())
            reduced = mean + SILHOUETTE_BIAS * (float(block.max()) - mean)
            field[j, i] = int(np.clip(round(reduced), INT16_MIN, INT16_MAX))
    return field


def anchor_positions() -> dict[str, dict[str, float]]:
    """Each anchor in east/north metres from the country grid's south-west corner."""
    names = list(ANCHORS)
    lats = [ANCHORS[n][0] for n in names]
    lons = [ANCHORS[n][1] for n in names]
    xs, ys = grid.project(lats, lons)
    out: dict[str, dict[str, float]] = {}
    for name, lat, lon, x, y in zip(names, lats, lons, xs, ys):
        out[name] = {
            "lat": lat,
            "lon": lon,
            "eastM": round(x - grid.ORIGIN_X_M, 1),
            "northM": round(y - grid.ORIGIN_Y_M, 1),
        }
    return out


def digest(path: Path) -> str:
    sha = hashlib.sha256()
    with open(path, "rb") as handle:
        while chunk := handle.read(1 << 20):
            sha.update(chunk)
    return sha.hexdigest()


def build(corridor: str = "sea-to-sky", out_dir: Path | None = None) -> Path:
    root = data_root()
    grid_path = root / "work" / f"{corridor}-1km.tif"
    if not grid_path.exists():
        raise SystemExit(f"{grid_path} missing; run nineskies.mosaic first")

    with rasterio.open(grid_path) as ds:
        array = ds.read(1)
        tags = ds.tags()

    window = corridor_window(CORRIDORS[corridor])
    expected = (window.height_samples, window.width_samples)
    if array.shape != expected:
        raise SystemExit(f"grid is {array.shape}, window wants {expected}")

    out_dir = out_dir or Path(__file__).resolve().parents[2] / "dist-world" / corridor
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"cutting {window.count} tiles ...", flush=True)
    tiles = cut_tiles(array, window)
    heights_path = out_dir / "heights.bin"
    heights_path.write_bytes(tiles.astype("<i2").tobytes())

    print("reducing the horizon field ...", flush=True)
    field = reduce_to_field(array, window)
    horizon_path = out_dir / "horizon.bin"
    horizon_path.write_bytes(field.astype("<i2").tobytes())

    width, height = field_shape()
    land = tiles.max(axis=(1, 2)) > 0
    anchors = anchor_positions()
    # Heading is compass-style: 0 is north, pi/2 is east, matching flight.ts.
    heading = math.atan2(
        anchors["lhasa"]["eastM"] - anchors["shanghai"]["eastM"],
        anchors["lhasa"]["northM"] - anchors["shanghai"]["northM"],
    )
    # What mosaic actually consumed, written beside the grid it produced. An
    # older grid has no sidecar; the manifest says so rather than leaving the
    # key out, because an absent field reads as "not applicable" and this one
    # means "this world predates D24 and its provenance is unrecorded".
    sidecar = root / "work" / f"{corridor}-sources.json"
    source = json.loads(sidecar.read_text()) if sidecar.exists() else {"unrecorded": True}

    manifest = {
        "version": 1,
        "corridor": corridor,
        "crs": grid.ALBERS_PROJ4,
        "resolutionM": grid.RESOLUTION_M,
        "tileKm": grid.TILE_KM,
        "tileSamples": grid.TILE_SAMPLES,
        "bias": float(tags.get("bias", 0.0)),
        "country": {
            "tilesX": grid.TILES_X,
            "tilesY": grid.TILES_Y,
            "originXM": grid.ORIGIN_X_M,
            "originYM": grid.ORIGIN_Y_M,
        },
        "window": {
            "tx0": window.tx0,
            "ty0": window.ty0,
            "tx1": window.tx1,
            "ty1": window.ty1,
        },
        "heights": {
            "file": heights_path.name,
            "dtype": "int16",
            "order": "tile-row-major, ty ascending, then tx ascending",
            "tiles": int(window.count),
            "tilesWithLand": int(land.sum()),
            "bytes": heights_path.stat().st_size,
            "sha256": digest(heights_path),
        },
        "horizon": {
            "file": horizon_path.name,
            "dtype": "int16",
            "width": width,
            "height": height,
            "sampleKm": HORIZON_SAMPLE_KM,
            "silhouetteBias": SILHOUETTE_BIAS,
            "bytes": horizon_path.stat().st_size,
            "sha256": digest(horizon_path),
        },
        "source": source,
        "anchors": anchors,
        "start": {
            "eastM": anchors["shanghai"]["eastM"],
            "northM": anchors["shanghai"]["northM"],
            "altitudeM": 1200,
            "headingRad": round(heading, 6),
        },
        "elevationM": {"min": int(tiles.min()), "max": int(tiles.max())},
    }
    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    print(
        f"wrote {heights_path.stat().st_size / 1e6:.2f} MB of tiles "
        f"({window.count} tiles, {int(land.sum())} with land) and "
        f"{horizon_path.stat().st_size / 1e6:.2f} MB of horizon field "
        f"({width} x {height})"
    )
    print(f"elevation {tiles.min()}..{tiles.max()} m · manifest {manifest_path}")
    return out_dir


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Cut tiles and the horizon field.")
    parser.add_argument("--corridor", default="sea-to-sky", choices=sorted(CORRIDORS))
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args(argv)
    build(args.corridor, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
