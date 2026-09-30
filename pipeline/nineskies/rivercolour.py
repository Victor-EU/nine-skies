"""A river's colour along a scene's rail, from the film's own photograph (F138).

F127 gave each scene's rivers one colour, the median of their water in the
10 m colour along the rails. The Loess's river is not one colour: silt off
the Hetao at Hekou, jade in the Wanjiazhai and Longkou reservoirs 70 km on,
grey-green past Fugu, khaki and tan from Jiaxian down. Its median was the
silt, and the film drew the reservoirs as silt too.

This measures the colour at each point of a rail, for a palette's
`riverAlong` (`engine/src/look/presets.ts`): the near colour round the point
(`dist-world/<world>/colour`, 10 m, the photograph the film draws), cropped
`--half-km` a side; the pixels ESA WorldCover 2021 (10 m, CC BY 4.0) calls
permanent water, less every patch under `MIN_WATER_PX` (the ponds, fish
farms and oxbows beside a river: Qiachuan's lotus ponds by Heyang read as a
green Yellow River otherwise); their median. A point whose water is under
`MIN_WATER_SHARE` of the crop is a dry bed or a line off the river, and is
left out. WorldCover is read over the network, a window at a time.

    python -m nineskies.rivercolour content/scenes/05-loess.yaml

prints each point and then the `riverAlong` table to paste.
"""

from __future__ import annotations

import argparse
import math
import re
import sys
from pathlib import Path

import json

import numpy as np

from . import grid

REPO = Path(__file__).resolve().parents[2]
WORLDCOVER = "/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N{lat:02d}E{lon:03d}_Map.tif"
#: WorldCover's class for permanent water bodies.
WATER = 80
#: Water patches smaller than this, in 10 m pixels (15 ha), are not the river.
MIN_WATER_PX = 1500
#: Less water than this share of a crop, and the point is not measured.
MIN_WATER_SHARE = 0.03


def rail_points(scene: Path) -> list[tuple[float, float]]:
    """The rail's points, latitude and longitude, as the scene file lists them."""
    rail = scene.read_text().split("\nrail:")[1].split("\nband:")[0]
    return [(float(a), float(b)) for a, b in re.findall(r"lat: ([\d.-]+), lon: ([\d.-]+)", rail)]


def measure(scene: Path, world: Path, half_m: float) -> list[dict]:
    import certifi
    import rasterio
    from affine import Affine
    from rasterio.crs import CRS
    from rasterio.features import sieve
    from rasterio.warp import Resampling, reproject, transform

    index = json.loads((world / "colour" / "index.json").read_text())
    near = index["near"]
    tile_m = near["tileM"]
    albers = CRS.from_proj4(grid.ALBERS_PROJ4)
    wgs84 = CRS.from_epsg(4326)
    opened: dict[tuple[int, int], rasterio.DatasetReader] = {}
    out = []
    km = 0.0
    points = rail_points(scene)
    env = {"GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif", "CURL_CA_BUNDLE": certifi.where()}
    with rasterio.Env(**env):
        for k, (lat, lon) in enumerate(points):
            if k:
                la0, lo0 = points[k - 1]
                km += math.hypot((lat - la0) * 111.2, (lon - lo0) * 111.2 * math.cos(math.radians((lat + la0) / 2)))
            xs, ys = transform(wgs84, albers, [lon], [lat])
            # Metres from the world grid's south-west corner, as the colour's keys are.
            e, n = xs[0] - grid.ORIGIN_X_M, ys[0] - grid.ORIGIN_Y_M
            i, j = int(e // tile_m), int(n // tile_m)
            name = near["tiles"].get(f"{i}_{j}")
            if not name:
                print(f"{k:3d} {km:5.0f} km  no near colour", file=sys.stderr)
                continue
            with rasterio.open(world / "colour" / "files" / f"{name}.webp") as image:
                rgb = np.moveaxis(image.read([1, 2, 3]), 0, -1)
            size = rgb.shape[0] - 1
            step = tile_m / size
            px, py = (e - i * tile_m) / step, size - (n - j * tile_m) / step
            r = int(half_m / step)
            x0, x1, y0, y1 = max(0, int(px - r)), min(size, int(px + r)), max(0, int(py - r)), min(size, int(py + r))
            crop = rgb[y0:y1, x0:x1]
            # Rows north to south, as the tile's are.
            crop_transform = Affine(step, 0, grid.ORIGIN_X_M + i * tile_m + x0 * step, 0, -step, grid.ORIGIN_Y_M + (j + 1) * tile_m - y0 * step)
            key = (int(math.floor(lat / 3) * 3), int(math.floor(lon / 3) * 3))
            if key not in opened:
                opened[key] = rasterio.open(WORLDCOVER.format(lat=key[0], lon=key[1]))
            cover = np.zeros(crop.shape[:2], np.uint8)
            reproject(rasterio.band(opened[key], 1), cover, dst_transform=crop_transform, dst_crs=albers, resampling=Resampling.nearest)
            water = sieve((cover == WATER).astype(np.uint8), size=MIN_WATER_PX, connectivity=8) == 1
            share = float(water.mean())
            if share < MIN_WATER_SHARE:
                print(f"{k:3d} {km:5.0f} km  {lat:.4f} {lon:.4f}  water {share:5.1%}, left out", file=sys.stderr)
                continue
            median = np.median(crop[water].astype(np.float64) / 255, axis=0)
            srgb = [round(float(v), 3) for v in median]
            out.append({"lat": lat, "lon": lon, "km": round(km), "srgb": srgb, "water": round(share, 3)})
            print(f"{k:3d} {km:5.0f} km  {lat:.4f} {lon:.4f}  water {share:5.1%}  {srgb}", file=sys.stderr)
    for dataset in opened.values():
        dataset.close()
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="nineskies.rivercolour", description=__doc__.splitlines()[0])
    parser.add_argument("scene", type=Path, help="a scene file, content/scenes/<id>.yaml")
    parser.add_argument("--world", default="china")
    parser.add_argument("--half-km", type=float, default=1.5, help="the crop's half-width round each point")
    args = parser.parse_args(argv)
    points = measure(args.scene, REPO / "dist-world" / args.world, args.half_km * 1000)
    if not points:
        print("no point along the rail has its river's water in the photograph", file=sys.stderr)
        return 1
    print("    riverAlong: [")
    for p in points:
        r, g, b = p["srgb"]
        print(f"      {{ lat: {p['lat']}, lon: {p['lon']}, srgb: [{r}, {g}, {b}] }}, // {p['km']} km")
    print("    ],")
    return 0


if __name__ == "__main__":
    sys.exit(main())
