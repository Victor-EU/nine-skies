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

from . import grid, sources
from .acquire import data_root, tile_name
from .grid import CORRIDORS

SOURCE_ARCSEC = 3600  # GLO-30 cells per degree below 50 N
SOURCE_CELLS = 3600  # ...and samples per tile side

#: Silhouette bias at 1 km. Ridges in this world are a few cells wide, so a
#: little max is the difference between a crest and a mound; much more than
#: this and valley floors start climbing, which stage 3 then has to carve back
#: out. Measured against the corridor probes — see finding F12.
DEFAULT_BIAS = 0.25


def vrt_xml(tiles: list[tuple[int, int, Path]], box: grid.LonLatBox) -> str:
    """A VRT mosaic over one-degree GLO-30 tiles on a shared 1 arc-second grid."""
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

    vrt_path = work / f"{corridor}.vrt"
    vrt_path.write_text(vrt_xml(tiles, box))

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
            },
            indent=2,
        )
        + "\n"
    )

    window = corridor_window(box)
    print(
        f"window {window} · {window.count} tiles · "
        f"{window.width_samples} x {window.height_samples} samples"
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
