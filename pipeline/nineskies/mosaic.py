"""Stage 2b — mosaic the source tiles and reproject to the Albers grid.

The mosaic is a GDAL VRT written by hand rather than by `gdalbuildvrt`, so this
stage needs no GDAL command line — only the libgdal that arrives inside the
rasterio wheel. The VRT matters for a second reason: it makes 331 files look
like one continuous raster, so the warp kernel never straddles a file boundary
and there are no seams between source tiles.

**The resampling is the interesting decision.** 30 m to 1 km is a 30x
reduction, and the three obvious choices each break a different promise:

- `average` is faithful to volume and shaves every ridge; Everest reads
  thousands of metres low.
- `cubic` (what the build plan asked for) samples a 4x4 kernel at the cell
  centre and ignores the other ~900 source pixels, so it aliases: the value is
  whichever crag happened to sit under the centre.
- `max` keeps every summit and lifts every valley floor, filling in the river
  channels the game is supposed to fly down.

So this stage computes mean *and* max and combines them with the same
silhouette bias the horizon field uses — one idea governing both reductions
instead of two. At 1 km the bias is small (see `DEFAULT_BIAS`); the horizon
field's 0.6 is right for a silhouette 8 km across and wrong for terrain you
fly through.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from xml.sax.saxutils import escape

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.vrt import WarpedVRT
from rasterio.warp import reproject, transform as transform_points

from . import coverage, grid, sources
from .acquire import data_root, load_tile_list, tile_name
from .grid import CORRIDORS

SOURCE_ARCSEC = 3600  # the mosaic's samples per degree, both ways
SOURCE_CELLS = 3600  # ...and per tile side north to south, at every latitude

#: GLO-30's columns per one-degree tile, by the tile's distance from the
#: equator in whole degrees: its product specification thins the longitude
#: spacing to keep a sample near 30 m wide as the meridians close. 1" to 50°,
#: then 1.5", 2", 3", 5" and 10". Every row is 3,600 samples wherever the tile is.
#:
#: The mosaic wrote 3,600 for every tile until F71, which is right for the
#: corridor and for 32 of the country's 36 rows of tiles. The four rows from
#: 50 to 54 N are 2,400 wide, and a 2,400-column tile declared 3,600 wide is
#: read into the western two-thirds of its degree with the eastern third left
#: at 0 m: the country north of 50 N was squeezed a third narrower in each
#: degree and striped with sea-level trenches between. Such a tile is now
#: stretched onto the mosaic's grid once, into `STRETCHED` (`one_grid`).
SOURCE_COLUMNS: tuple[tuple[int, int], ...] = (
    (50, 3600),
    (60, 2400),
    (70, 1800),
    (80, 1200),
    (85, 720),
    (90, 360),
)


#: Where a thinned tile's copy on the 1" grid is kept, under the work directory.
STRETCHED = "cop30-1arcsec"


def source_columns(lat: int) -> int:
    """How many columns GLO-30's tile whose south edge is at `lat` has."""
    edge = lat + 1 if lat < 0 else lat
    for below, columns in SOURCE_COLUMNS:
        if abs(edge) < below:
            return columns
    raise ValueError(f"no GLO-30 tile starts at latitude {lat}")

#: Silhouette bias at 1 km. Ridges in this world are a few cells wide, so a
#: little max is the difference between a crest and a mound; much more than
#: this and valley floors start climbing, which stage 3 then has to carve back
#: out. Measured against the corridor probes — see finding F12.
DEFAULT_BIAS = 0.25


def vrt_xml(tiles: list[tuple[int, int, Path]], box: grid.LonLatBox) -> str:
    """A VRT mosaic over one-degree GLO-30 tiles on a shared 1 arc-second grid.

    Every file named here has to be 3,600 x 3,600 already: a thinned tile's
    stretched copy rather than the tile (`one_grid`, F71). Asking the VRT to
    do the stretch was measured and is not an option: a ComplexSource whose
    source and destination rectangles differ reads 590 times slower through
    the warp, 473 s for three tiles by three against 0.8.
    """
    pixel = 1.0 / SOURCE_ARCSEC
    half = pixel / 2
    width = int(round((box.east - box.west) * SOURCE_ARCSEC))
    height = int(round((box.north - box.south) * SOURCE_ARCSEC))
    origin_x = box.west - half
    origin_y = box.north + half

    parts = [
        f'<VRTDataset rasterXSize="{width}" rasterYSize="{height}">',
        "  <SRS>EPSG:4326</SRS>",
        f"  <GeoTransform>{origin_x!r}, {pixel!r}, 0.0, "
        f"{origin_y!r}, 0.0, {-pixel!r}</GeoTransform>",
        '  <VRTRasterBand dataType="Float32" band="1">',
        "    <NoDataValue>-32767</NoDataValue>",
    ]
    for lat, lon, path in tiles:
        x_off = int(round((lon - box.west) * SOURCE_ARCSEC))
        y_off = int(round((box.north - (lat + 1)) * SOURCE_ARCSEC))
        parts += [
            "    <ComplexSource>",
            f'      <SourceFilename relativeToVRT="0">{escape(str(path))}</SourceFilename>',
            "      <SourceBand>1</SourceBand>",
            f'      <SourceProperties RasterXSize="{SOURCE_CELLS}" '
            f'RasterYSize="{SOURCE_CELLS}" DataType="Float32" '
            f'BlockXSize="1024" BlockYSize="1024"/>',
            f'      <SrcRect xOff="0" yOff="0" xSize="{SOURCE_CELLS}" ySize="{SOURCE_CELLS}"/>',
            f'      <DstRect xOff="{x_off}" yOff="{y_off}" '
            f'xSize="{SOURCE_CELLS}" ySize="{SOURCE_CELLS}"/>',
            "    </ComplexSource>",
        ]
    parts += ["  </VRTRasterBand>", "</VRTDataset>", ""]
    return "\n".join(parts)


def columns_problems(tiles: list[tuple[int, int, Path]]) -> list[str]:
    """Each tile whose own header disagrees with `source_columns`, by name.

    The rule is the product's, and the header is the file's: a mosaic that
    trusted either alone is how 248 tiles came to be read a third short.
    """
    problems = []
    for lat, lon, path in tiles:
        with rasterio.open(path) as dataset:
            shape = (dataset.height, dataset.width)
        wanted = (SOURCE_CELLS, source_columns(lat))
        if shape != wanted:
            problems.append(f"{path.name} is {shape[1]} x {shape[0]}, GLO-30 at {lat} N is {wanted[1]} x {wanted[0]}")
    return problems


def stretch_columns(tile: np.ndarray) -> np.ndarray:
    """A tile's columns onto the mosaic's 3,600, each taking the source column
    nearest it: nearest, so every value is one the source holds. At 1.5" a
    column's edge lands a quarter of an arc-second, 5 m at 50 N, from where
    the tile puts it, which a 1 km grid does not see."""
    columns = tile.shape[1]
    if columns == SOURCE_CELLS:
        return tile
    nearest = np.floor((np.arange(SOURCE_CELLS) + 0.5) * columns / SOURCE_CELLS).astype(int)
    return tile[:, nearest]


def stretched_path(work: Path, source: Path) -> Path:
    return work / STRETCHED / source.name


def one_grid(
    tiles: list[tuple[int, int, Path]], work: Path, digests: dict, workers: int = 4
) -> tuple[list[tuple[int, int, Path]], int]:
    """Every tile as a file on the 1" grid, and how many copies were made.

    A tile below 50 N is its own file. A thinned one is its stretched copy,
    made once and kept beside a note of the source digest it was made from,
    so a copy of a tile since re-fetched is made again rather than read. The
    digests are the committed ones `sources.verify` has just held the files
    to, so a copy is known to be of these bytes without hashing them again.
    """
    from concurrent.futures import ThreadPoolExecutor

    out: list[tuple[int, int, Path]] = []
    todo: list[tuple[int, int, Path, Path, str]] = []
    for lat, lon, path in tiles:
        if source_columns(lat) == SOURCE_CELLS:
            out.append((lat, lon, path))
            continue
        copy = stretched_path(work, path)
        wanted = digests[path.stem]["sha256"]
        note = copy.with_suffix(".json")
        made_from = json.loads(note.read_text()).get("sha256") if note.exists() and copy.exists() else None
        if made_from != wanted:
            todo.append((lat, lon, path, copy, wanted))
        out.append((lat, lon, copy))
    if todo:
        (work / STRETCHED).mkdir(parents=True, exist_ok=True)
        with ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(lambda job: _stretch_file(*job), todo))
    return out, len(todo)


def _stretch_file(lat: int, lon: int, source: Path, copy: Path, sha256: str) -> None:
    with rasterio.open(source) as dataset:
        tile = dataset.read(1)
        profile = dataset.profile
    # Sample (0, 0) centred on the degree's north-west corner, as a 1" tile's is.
    pixel = 1.0 / SOURCE_CELLS
    lat_top = lat + 1
    profile.update(
        width=SOURCE_CELLS,
        transform=rasterio.Affine(pixel, 0.0, lon - pixel / 2, 0.0, -pixel, lat_top + pixel / 2),
        tiled=True,
        blockxsize=1024,
        blockysize=1024,
        compress="deflate",
        predictor=3,
    )
    partial = copy.with_suffix(".partial.tif")
    with rasterio.open(partial, "w", **profile) as out:
        out.write(stretch_columns(tile), 1)
    partial.replace(copy)
    copy.with_suffix(".json").write_text(
        json.dumps({"source": source.name, "sha256": sha256, "rule": "nearest column"}) + "\n"
    )


def available_tiles(box: grid.LonLatBox, source: Path) -> list[tuple[int, int, Path]]:
    found = []
    for lat in range(int(box.south), int(box.north)):
        for lon in range(int(box.west), int(box.east)):
            path = source / f"{tile_name(lat, lon)}.tif"
            if path.exists():
                found.append((lat, lon, path))
    return found


#: Megabytes GDAL may hold per warp chunk.
#:
#: This is not a performance knob, it is a correctness-of-behaviour one. GDAL
#: subdivides the destination until each chunk's *source* window fits in this
#: budget, and at a 30x reduction a source window is enormous: at 2048 MB the
#: warper asks for half a billion source pixels at a time, which on a machine
#: with less free memory than that turns into 700 MB/s of swap traffic and a
#: warp that never finishes. Small chunks cost a little redundant edge reading
#: and nothing else.
WARP_CHUNK_MB = 128


def warp_window(
    vrt_path: Path, window: grid.TileWindow, resampling: Resampling
) -> np.ndarray:
    """Reproject the mosaic into a tile window, one resampling method."""
    dst = np.zeros((window.height_samples, window.width_samples), dtype="float32")
    # 331 COGs scanned repeatedly: keep the pool big enough not to reopen them,
    # and the block cache small enough to leave the machine some memory.
    with rasterio.Env(GDAL_MAX_DATASET_POOL_SIZE=400, GDAL_CACHEMAX=256):
        with rasterio.open(vrt_path) as src:
            reproject(
                source=rasterio.band(src, 1),
                destination=dst,
                src_crs=src.crs,
                src_nodata=-32767,
                dst_crs=CRS.from_proj4(grid.ALBERS_PROJ4),
                dst_transform=grid.transform_for(window),
                # No destination nodata, deliberately. 0 m is sea level, which
                # is a real elevation over most of the east of this corridor;
                # declaring it "no data" makes GDAL nudge every genuine zero to
                # a denormal to keep it distinguishable. The destination is
                # already zeroed, so anywhere the warp does not reach is sea.
                dst_nodata=None,
                init_dest_nodata=False,
                resampling=resampling,
                num_threads=4,
                warp_mem_limit=WARP_CHUNK_MB,
            )
    return dst


def build(
    corridor: str = "sea-to-sky",
    bias: float = DEFAULT_BIAS,
    out: Path | None = None,
) -> Path:
    root = data_root()
    source = root / "source" / "cop30"
    work = root / "work"
    work.mkdir(parents=True, exist_ok=True)

    box = CORRIDORS[corridor]
    tiles = available_tiles(box, source)
    expected = len(box.cells())
    print(f"{corridor}: {len(tiles)} source tiles on disk of {expected} cells")
    if not tiles:
        raise SystemExit("no source tiles; run nineskies.acquire first")

    # The gate D24 exists for: a world is built from tiles that hash to what
    # was recorded, or it is not built. Checked here rather than at fetch
    # time because a tile can rot on disk long after it arrived, and this is
    # the last moment at which the bytes are still identifiable as tiles --
    # after the warp they are one array and their provenance is gone.
    names = [tile_name(lat, lon) for lat, lon, _ in tiles]
    problems = sources.verify(source, names)
    if problems:
        raise SystemExit(
            "source tiles do not match the committed digests, so nothing was built:\n  "
            + "\n  ".join(problems[:10])
            + (f"\n  … and {len(problems) - 10} more" if len(problems) > 10 else "")
        )
    print(f"  {len(names)} source tiles verified against pipeline/sources/cop30.json")
    shapes = columns_problems(tiles)
    if shapes:
        raise SystemExit("source tiles are not the shape GLO-30 publishes:\n  " + "\n  ".join(shapes[:10]))
    on_grid, made = one_grid(tiles, work, sources.read()["digests"])
    thinned = sum(1 for (_, _, a), (_, _, b) in zip(tiles, on_grid) if a != b)
    if thinned:
        print(f"  {thinned} tiles north of 50 N on the 1\" grid, {made} of them stretched now (F71)")

    vrt_path = work / f"{corridor}.vrt"
    vrt_path.write_text(vrt_xml(on_grid, box))

    window = corridor_window(box)
    print(
        f"window {window} · {window.count} tiles · "
        f"{window.width_samples} x {window.height_samples} samples"
    )

    # Which tiles the source reached, and what the rest of them are (F54).
    # Here rather than in the tiler because this is the last stage that can
    # see a one-degree cell: past the warp there are no cells, only an array
    # of zeros that used to mean three different things.
    mirror = load_tile_list(root / "source" / "tileList.txt")
    fetched = {(lat, lon) for lat, lon, _ in tiles}
    cover = coverage.measure(window, fetched, mirror)
    print(
        "  coverage: "
        + " · ".join(f"{n} {coverage.LEGEND[s].split(',')[0]}" for s, n in cover.counts.items())
    )

    # What this grid was actually made of, beside the grid itself. `tiles.py`
    # folds it into the corridor manifest, so the chain from the mirror's
    # ETag to a signed route section has no gap in it (D24).
    record = sources.read()
    (work / f"{corridor}-sources.json").write_text(
        json.dumps(
            {
                "bucket": record.get("bucket", ""),
                "tiles": len(names),
                "sha256": sources.digest_of(names, record["digests"]),
                "coverage": cover.as_json(),
            },
            indent=2,
        )
        + "\n"
    )

    print("  warping mean ...", flush=True)
    mean = warp_window(vrt_path, window, Resampling.average)
    print("  warping max ...", flush=True)
    peak = warp_window(vrt_path, window, Resampling.max)

    # Outside every source tile both passes read 0, and 0 + b*(0-0) is 0, so
    # open sea needs no special case: the nine ocean cells the bucket does not
    # carry come out at sea level, which is where they are.
    combined = mean + bias * (peak - mean)

    out = out or work / f"{corridor}-1km.tif"
    with rasterio.open(
        out,
        "w",
        driver="GTiff",
        width=window.width_samples,
        height=window.height_samples,
        count=1,
        dtype="float32",
        crs=CRS.from_proj4(grid.ALBERS_PROJ4),
        transform=grid.transform_for(window),
        compress="deflate",
        predictor=3,
        tiled=True,
        blockxsize=512,
        blockysize=512,
    ) as dst:
        dst.write(combined, 1)
        dst.update_tags(
            corridor=corridor,
            bias=str(bias),
            tx0=str(window.tx0),
            ty0=str(window.ty0),
            tx1=str(window.tx1),
            ty1=str(window.ty1),
        )
    print(
        f"wrote {out} · {out.stat().st_size / 1e6:.1f} MB · "
        f"range {combined.min():.0f}..{combined.max():.0f} m"
    )
    return out


def corridor_window(box: grid.LonLatBox) -> grid.TileWindow:
    """Tile window covering a lon/lat box, clipped to the country grid."""
    lons, lats = [], []
    steps = 200
    for lat in (box.south, box.north):
        for i in range(steps + 1):
            lons.append(box.west + (box.east - box.west) * i / steps)
            lats.append(lat)
    for lon in (box.west, box.east):
        for i in range(steps + 1):
            lons.append(lon)
            lats.append(box.south + (box.north - box.south) * i / steps)
    xs, ys = transform_points(CRS.from_epsg(4326), CRS.from_proj4(grid.ALBERS_PROJ4), lons, lats)
    window = grid.window_for_bounds(min(xs), min(ys), max(xs), max(ys))
    return grid.TileWindow(
        max(window.tx0, 0),
        max(window.ty0, 0),
        min(window.tx1, grid.TILES_X),
        min(window.ty1, grid.TILES_Y),
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Mosaic and reproject to Albers 1 km.")
    parser.add_argument("--corridor", default="sea-to-sky", choices=sorted(CORRIDORS))
    parser.add_argument("--bias", type=float, default=DEFAULT_BIAS)
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args(argv)
    build(args.corridor, args.bias, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
