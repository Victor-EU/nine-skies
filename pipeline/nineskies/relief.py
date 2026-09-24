"""Stage 12d — the ground's relief below its grid, from GLO-30 (F93).

The country grid is 1 km, and four of the film's nine scenes fly over it
alone for most of their two minutes: the Loess, Below the Sea, the Roof,
the Wall. Nothing below that spacing is drawn, so the country reads smooth
as clay. The Loess's line promises ground "gullied everywhere", and at
1 km there is not one gully on screen. The source, Copernicus GLO-30, holds
them: it is 30 m, and the grid is its average.

This stage hands the lighting what the grid leaves out. Every country tile
the film's camera flies near, and every tile of the 90 m hero areas, is cut
from the source a second time, finer than its grid (`CELLS`: 125 m on the
country's 64 km tiles, 30 m on the hero's 11.52 km ones), as the ground's
normal at each sample. The engine lights the tiles nearest the camera by it
(`engine/src/terrain/relief.ts`). The ground's shape is the grid's as
before: the relief changes where the light falls, not where the ground is.

**What a tile holds.** `CELLS` cells a side and one more sample, the
shared-edge rule the heights and the colour keep, rows north to south. Red
and green are the east and north parts of the ground's normal, as the
source stands, not as the film exaggerates it: the engine exaggerates it
by the world's own factor, so the relief stays true to whatever scale the
world is drawn at. Each is stored as the square root of its size, signed
(`encode`), about 127 so that flat is stored flat, which spends the bytes
near flat, where a step in the light shows most. Blue is unused. The slope at each sample is a central
difference across it, read from a grid one sample wider than the tile, so
two tiles agree on the samples they share.

**Lossless.** Lossy WebP stores colour at half resolution, and the two
parts of a normal would be smeared into each other's; so the tiles are
lossless WebP (`encode`).

**Where.** The country tiles the scene packs list as the camera's
neighbourhood (`relief` in `app/public/packs/index.json`, written by
`make scenes` from `engine/src/film/reach.ts`), and the 90 m hero areas
whole. The 30 m hero areas are cut at the source's own spacing already.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np

from . import grid
from .acquire import data_root, tile_name
from .imagery import Area, country_area

#: Cells a side of a relief tile, by lattice: 125 m on the country's 64 km
#: tiles, 30 m (the source's own) on the 90 m hero lattice's 11.52 km ones.
CELLS = {"country": 512, "hero": 384}
CODEC = "webp"
ENCODING = "normal-east-north-sqrt"
INDEX_VERSION = 1
SOURCE = "Copernicus DEM GLO-30"

REPO = Path(__file__).resolve().parents[2]


def relief_area(area: Area) -> Area:
    """The same rectangle of tiles at the relief's spacing."""
    return Area(
        key=area.key,
        lattice=area.lattice,
        tile_m=area.tile_m,
        tx0=area.tx0,
        ty0=area.ty0,
        tiles_x=area.tiles_x,
        tiles_y=area.tiles_y,
        cells=CELLS[area.lattice],
    )


def country_tiles(packs_index: Path) -> list[tuple[int, int]]:
    """Every country tile a scene pack lists as near its camera."""
    index = json.loads(packs_index.read_text())
    keys: set[tuple[int, int]] = set()
    for scene in index["scenes"]:
        t = scene.get("relief", [])
        keys.update((t[k], t[k + 1]) for k in range(0, len(t), 2))
    return sorted(keys, key=lambda k: (k[1], k[0]))


def hero_areas(world: Path) -> list[Area]:
    """The 90 m hero areas, whole."""
    path = world / "hero" / "index.json"
    if not path.exists():
        return []
    index = json.loads(path.read_text())
    out = []
    for entry in index["areas"]:
        w = entry["window"]
        out.append(
            Area(
                key=entry["id"],
                lattice="hero",
                tile_m=int(index["tileM"]),
                tx0=w["hx0"],
                ty0=w["hy0"],
                tiles_x=w["hx1"] - w["hx0"],
                tiles_y=w["hy1"] - w["hy0"],
                cells=CELLS["hero"],
            )
        )
    return out


def plan(world: Path, packs_index: Path) -> list[Area]:
    country = [relief_area(country_area(tx, ty)) for tx, ty in country_tiles(packs_index)]
    return country + hero_areas(world)


# --- the source ------------------------------------------------------------


def padded_transform(area: Area):
    """The area's sample grid, one sample wider on every side."""
    from affine import Affine

    west, _south, _east, north = area.bounds_m()
    c = area.cell_m
    return Affine(c, 0.0, west - c - c / 2, 0.0, -c, north + c + c / 2)


def source_cells(area: Area) -> list[tuple[int, int, Path]]:
    """The one-degree GLO-30 cells under the area and its margin that are on disk.

    A cell that is not in the mirror is open ocean, and reads as 0 m. Cells
    north of 50 N are thinned in longitude, and the mosaic stretches them
    before reading (`mosaic.one_grid`); no scene flies near one, so they are
    refused here rather than read squeezed.
    """
    from .imagery import boundary_lonlat
    from .mosaic import SOURCE_CELLS, source_columns

    lons, lats = boundary_lonlat(area)
    south, north = int(np.floor(lats.min())), int(np.floor(lats.max())) + 1
    west, east = int(np.floor(lons.min())), int(np.floor(lons.max())) + 1
    root = data_root() / "source" / "cop30"
    found = []
    for lat in range(south, north):
        for lon in range(west, east):
            path = root / f"{tile_name(lat, lon)}.tif"
            if not path.exists():
                continue
            if source_columns(lat) != SOURCE_CELLS:
                raise SystemExit(f"{area.key}: {path.name} is thinned in longitude; relief does not stretch it")
            found.append((lat, lon, path))
    return found


def heights(area: Area) -> np.ndarray:
    """The area's ground on its relief grid and one sample round it, metres, averaged from the source."""
    import rasterio
    from rasterio.crs import CRS
    from rasterio.warp import Resampling, reproject

    from .imagery import boundary_lonlat
    from .mosaic import WARP_CHUNK_MB, vrt_xml

    cells = source_cells(area)
    out = np.zeros((area.height + 2, area.width + 2), np.float32)
    if not cells:
        return out
    lons, lats = boundary_lonlat(area)
    box = grid.LonLatBox(
        south=int(np.floor(lats.min())),
        north=int(np.floor(lats.max())) + 1,
        west=int(np.floor(lons.min())),
        east=int(np.floor(lons.max())) + 1,
    )
    work = data_root() / "work" / "relief"
    work.mkdir(parents=True, exist_ok=True)
    vrt = work / f"{area.lattice}-{area.key}.vrt"
    vrt.write_text(vrt_xml(cells, box))
    with rasterio.Env(GDAL_MAX_DATASET_POOL_SIZE=64, GDAL_CACHEMAX=256):
        with rasterio.open(vrt) as src:
            reproject(
                source=rasterio.band(src, 1),
                destination=out,
                src_crs=src.crs,
                src_nodata=-32767,
                dst_crs=CRS.from_proj4(grid.ALBERS_PROJ4),
                dst_transform=padded_transform(area),
                dst_nodata=None,
                init_dest_nodata=False,
                resampling=Resampling.average,
                num_threads=4,
                warp_mem_limit=WARP_CHUNK_MB,
            )
    vrt.unlink()
    return out


# --- the normal ------------------------------------------------------------


def normals(padded: np.ndarray, cell_m: float) -> np.ndarray:
    """(2, rows, cols): the east and north parts of the unit normal at each
    sample of the unpadded grid, by central differences. Rows run north to
    south."""
    east = (padded[1:-1, 2:] - padded[1:-1, :-2]) / (2 * cell_m)
    north = (padded[:-2, 1:-1] - padded[2:, 1:-1]) / (2 * cell_m)
    length = np.sqrt(east * east + north * north + 1.0)
    return np.stack([-east / length, -north / length])


#: The byte a part of 0 is stored as: 127 steps either side of it, so flat
#: ground is stored flat, and 255 is not used.
ZERO = 127


def encode(normal: np.ndarray) -> np.ndarray:
    """(3, rows, cols) bytes: each part as the signed square root of its
    size, `ZERO` plus or minus 127; blue unused."""
    c = np.sign(normal) * np.sqrt(np.abs(normal))
    rg = np.clip(np.round(ZERO + c * ZERO), 0, 2 * ZERO).astype(np.uint8)
    return np.concatenate([rg, np.full((1,) + rg.shape[1:], ZERO, np.uint8)])


def decode(pixels: np.ndarray) -> np.ndarray:
    """`encode`'s inverse, as the shader reads it: (2, rows, cols) of normal."""
    c = (pixels[:2].astype(np.float64) - ZERO) / ZERO
    return np.sign(c) * c * c


def webp(pixels: np.ndarray) -> bytes:
    import warnings

    from rasterio.io import MemoryFile

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with MemoryFile() as memory:
            with memory.open(
                driver="WEBP", width=pixels.shape[2], height=pixels.shape[1], count=3, dtype="uint8", LOSSLESS=True
            ) as ds:
                ds.write(pixels)
            return memory.read()


def name_of(body: bytes) -> str:
    return "relief-" + hashlib.sha256(body).hexdigest()[:16]


def write(body: bytes, out_dir: Path) -> str:
    name = name_of(body)
    path = out_dir / "files" / f"{name}.webp"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
    return name


def cut_area(area: Area, out_dir: Path) -> dict:
    """An area's tiles, as {"names": [...], "bytes": n}, in the hero heights' order."""
    padded = heights(area)
    parts = normals(padded, area.cell_m)
    names: list[str] = []
    total = 0
    for tx, ty in area.tiles():
        body = webp(encode(area.split(parts, tx, ty)))
        names.append(write(body, out_dir))
        total += len(body)
    return {"names": names, "bytes": total}


def cut(areas: list[Area], out_dir: Path) -> dict:
    import time

    out_dir.mkdir(parents=True, exist_ok=True)
    country: dict[str, str] = {}
    hero: dict[str, dict] = {}
    total = 0
    started = time.monotonic()
    for k, area in enumerate(areas):
        got = cut_area(area, out_dir)
        total += got["bytes"]
        if area.lattice == "country":
            for (tx, ty), name in zip(area.tiles(), got["names"]):
                country[f"{tx}_{ty}"] = name
        else:
            hero[area.key] = {
                "lattice": area.lattice,
                "window": {"hx0": area.tx0, "hy0": area.ty0, "hx1": area.tx0 + area.tiles_x, "hy1": area.ty0 + area.tiles_y},
                "tiles": got["names"],
            }
        if (k + 1) % 20 == 0 or k + 1 == len(areas):
            print(f"  {k + 1}/{len(areas)} areas, {total / 1e6:.1f} MB, {time.monotonic() - started:.0f} s", flush=True)
    index = {
        "version": INDEX_VERSION,
        "codec": CODEC,
        "encoding": ENCODING,
        "rows": "north to south",
        "source": SOURCE,
        "grids": {lattice: {"cells": cells, "samples": cells + 1} for lattice, cells in CELLS.items()},
        "country": country,
        "hero": hero,
    }
    (out_dir / "index.json").write_text(json.dumps(index, indent=1) + "\n")
    # Files no tile names any more: a re-cut leaves no orphans to be packed or shipped.
    kept = set(country.values()) | {n for h in hero.values() for n in h["tiles"]}
    for path in (out_dir / "files").glob("relief-*.webp"):
        if path.stem not in kept:
            path.unlink()
    return {"areas": len(areas), "tiles": len(kept), "bytes": total}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="nineskies.relief", description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=["cut", "plan"])
    parser.add_argument("--world", default="china")
    parser.add_argument("--packs", default=str(REPO / "app" / "public" / "packs" / "index.json"))
    parser.add_argument("--only", help="comma-separated area keys (tx_ty or a hero id), for a trial")
    args = parser.parse_args(argv)
    world = REPO / "dist-world" / args.world
    areas = plan(world, Path(args.packs))
    if args.only:
        wanted = set(args.only.split(","))
        areas = [a for a in areas if a.key in wanted] or [relief_area(country_area(*map(int, k.split("_")))) for k in wanted if "_" in k]
    if args.command == "plan":
        hero_tiles = sum(a.tiles_x * a.tiles_y for a in areas if a.lattice != "country")
        print(f"{sum(a.lattice == 'country' for a in areas)} country tiles, {hero_tiles} hero tiles")
        return 0
    if not areas:
        print("nothing to cut: `make scenes` lists the country tiles near each camera first", file=sys.stderr)
        return 1
    done = cut(areas, world / "relief")
    print(f"relief: {done['tiles']} tiles, {done['bytes'] / 1e6:.1f} MB, in {world / 'relief'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
