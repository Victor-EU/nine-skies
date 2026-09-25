"""Stage 12 — the ground's colour, from a cloud-free satellite mosaic (F87).

The film coloured its ground by elevation bands alone, and read as a relief
model. This stage gives every tile the film can see a colour image cut from
EOX's Sentinel-2 cloudless mosaic of 2016, reprojected onto the tile's own
Albers grid.

**The source, and why this year.** EOX publishes a mosaic a year. Its tile
service describes each layer's licence (read 24 September 2026, in
`WMTSCapabilities.xml`): 2016 and 2017 are CC BY 4.0; 2018 onwards are
CC BY-NC-SA 4.0, which would bind the repository and the film to
non-commercial share-alike terms. The 2017 layer is empty over China (it
answers a one-band black tile), so 2016 is the only year that can colour
this film. The service asks for attribution and nothing else, charges no
fee, and rate-limits heavy use, so the fetch below is slow on purpose and
never asks for a tile twice.

**What a tile holds.** `COLOUR_CELLS` cells a side and one more sample, the
same shared-edge rule as the heights: sample 0 lies on the tile's west (or
north) edge and the last on its east (or south) one, so neighbours agree
along the seam. Rows run north to south, as images do; the shader flips.
Country tiles are 64 km, so a sample is 250 m; a 90 m hero tile is 11.52 km
(45 m) and a 30 m one 3.84 km (15 m, near the mosaic's own 10 m). Every
hero tile is cut a second time at 10 m (`FINE_CELLS`, F91), which the
engine draws over the tiles nearest the camera (`fine_tile`).

**Along the rails (F95).** A country tile's 250 m is dozens of pixels wide
under the camera, where the ground's relief is now 31 m (F94). The same
16 km sub-tiles the near relief is cut in are cut again at 10 m, from each
country tile's own source: the mosaic at `FINE_ZOOM` in the north, and in
the south a 10 m median of the archive over just those sub-tiles
(`composite.py`). Each is laid onto its country tile's colour the way a
fine hero tile is laid onto its colour tile (`fine_tile`), so the two
differ only in detail (`cut_near`).

**Clouds.** The 2016 mosaic was built from one satellite's first year, and
over the humid south it keeps flecks of cloud, each with a pale ring where
the mosaic stitched round it and often a shadow beside it. They are found
by what they are among, not what they are: a bright grey patch in forest or
farmland is cloud, where one among rock, snow, sand or salt is ground. The
mask is filled from the ground around it (`fill`).

**The south.** Where the mosaic is most cloud - Tiger Leaping Gorge, Guilin,
the Three Gorges and Huangshan - a hero area is coloured instead from a
median of the Sentinel-2 archive (`composite.py`, F89), mapped onto the
mosaic's tones by one line fitted over all four, and its broad tone
leaning onto the country's over its last `FEATHER_M`, where the country
tiles take over. The country tiles of those four scenes are the archive's
too, at 250 m (F90); the rest of the country keeps the mosaic.
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import math
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import grid
from .acquire import SSL_CONTEXT, data_root

LAYER = "s2cloudless_3857"
YEAR = 2016
TILE_URL = "https://tiles.maps.eox.at/wmts/1.0.0/{layer}/default/g/{z}/{y}/{x}.jpg"
ATTRIBUTION = (
    "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH "
    f"(Contains modified Copernicus Sentinel data {YEAR})"
)
LICENCE = "CC BY 4.0"
LICENCE_URL = "https://creativecommons.org/licenses/by/4.0/"
USER_AGENT = "nine-skies-pipeline/1 (a research film; fetches each tile once and caches it)"

#: Cells a side of every colour tile, whatever its lattice; samples are one more.
COLOUR_CELLS = 256
COLOUR_SAMPLES = COLOUR_CELLS + 1
#: WebP quality. Chosen against the stills, not the byte count (F87).
WEBP_QUALITY = 82
#: A fine tile's (F91): at 82 WebP smooths away a fifth of the 10 m detail
#: in dark forest, which is the detail the tile is for.
FINE_WEBP_QUALITY = 90
CODEC = "webp"
INDEX_VERSION = 1

#: Web Mercator.
EARTH_RADIUS_M = 6378137.0
HALF_WORLD_M = math.pi * EARTH_RADIUS_M
SOURCE_TILE_PX = 256

#: The mosaic's zoom for each lattice: its pixel finer than half a colour
#: sample at China's latitudes, so the reprojection averages rather than
#: invents. Zoom 12 is 33 m at 30 N; 13 is 16.5 m; 14 is 8.3 m.
#:
#: The country's was zoom 10 (132 m) until F96. EOX's zooms 10 and 11 are
#: not where its 12 to 14 are, nor where the ground is: up to 120 m off,
#: by different amounts from place to place, and their content is not
#: zoom 14's averaged. Zooms 12 to 14 agree with each other to half a level
#: and with GLO-30's hillshade where they lie, so zoom 12 is the coarsest
#: the ground can be cut from.
ZOOM_FOR_TILE_M = {64_000: 12, 11_520: 13, 3_840: 14}

#: A hero tile's finest colour, cells a side (F91): 10 m, Sentinel-2's own,
#: drawn over the tiles nearest the camera. Its broad tone is the colour
#: tile's (`fine_tile`), so the two differ only in what the finer one adds.
#: And a country tile's near sub-tiles along the rails (F95), 16 km at 10 m.
FINE_CELLS = {"hero": 1_152, "hero-30m": 384, "near": 1_600}
#: The mosaic's zoom for it: 8.3 m at 30 N, about the mosaic's own 10 m.
FINE_ZOOM = 14


def resampling_for(area: Area):
    """How an area's source is taken onto its grid. Averaged, where the
    source is finer than a sample; but a fine tile is read at about its
    source's own pixel, across a turn from one projection to the other,
    where averaging blurs a third of the detail away and Lanczos keeps
    most of it (F91)."""
    from rasterio.warp import Resampling

    return Resampling.lanczos if area.is_fine else Resampling.average

#: Requests a second across all workers. EOX rate-limits heavy use.
REQUESTS_PER_S = 6.0


# --- where things are ------------------------------------------------------


def source_dir(root: Path | None = None) -> Path:
    return (root or data_root()) / "source" / f"eox-{LAYER}"


def cached_path(z: int, x: int, y: int, root: Path | None = None) -> Path:
    return source_dir(root) / str(z) / str(x) / f"{y}.jpg"


# --- Web Mercator ------------------------------------------------------------


def mercator_resolution(z: int) -> float:
    """Metres (of Web Mercator) per source pixel at zoom `z`."""
    return 2 * HALF_WORLD_M / (SOURCE_TILE_PX * 2**z)


def lonlat_to_mercator(lons: np.ndarray, lats: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    x = np.radians(lons) * EARTH_RADIUS_M
    y = np.log(np.tan(math.pi / 4 + np.radians(lats) / 2)) * EARTH_RADIUS_M
    return x, y


def mercator_pixels(lons: np.ndarray, lats: np.ndarray, z: int) -> tuple[np.ndarray, np.ndarray]:
    """Global pixel coordinates at zoom `z`: x east from 180 W, y south from the top."""
    x, y = lonlat_to_mercator(lons, lats)
    res = mercator_resolution(z)
    return (x + HALF_WORLD_M) / res, (HALF_WORLD_M - y) / res


def mercator_transform(z: int, x0: int, y0: int):
    """The affine of a mosaic whose top-left pixel is tile (x0, y0)'s."""
    from affine import Affine

    res = mercator_resolution(z)
    return Affine(res, 0.0, -HALF_WORLD_M + x0 * SOURCE_TILE_PX * res, 0.0, -res, HALF_WORLD_M - y0 * SOURCE_TILE_PX * res)


# --- what is cut -------------------------------------------------------------


@dataclass(frozen=True)
class Area:
    """A rectangle of one lattice's tiles, cut as one image and split.

    A country tile is an area of one; a hero area is its whole window, so
    the cloud fill does not stop at its tiles' edges.
    """

    key: str
    lattice: str  # "country", or the hero directory
    tile_m: int
    tx0: int
    ty0: int
    tiles_x: int
    tiles_y: int
    #: The elevation to guard snow with: the grid it was cut from.
    dem: str | None = None
    #: Cells a side of each tile: `COLOUR_CELLS`, or `FINE_CELLS` for a fine tile.
    cells: int = COLOUR_CELLS

    @property
    def is_fine(self) -> bool:
        """A fine tile (F91, F95): read at about its source's own pixel."""
        return self.cells == FINE_CELLS.get(self.lattice)

    @property
    def zoom(self) -> int:
        return FINE_ZOOM if self.is_fine else ZOOM_FOR_TILE_M[self.tile_m]

    @property
    def cell_m(self) -> float:
        return self.tile_m / self.cells

    @property
    def width(self) -> int:
        return self.tiles_x * self.cells + 1

    @property
    def height(self) -> int:
        return self.tiles_y * self.cells + 1

    def bounds_m(self) -> tuple[float, float, float, float]:
        """(west, south, east, north) in Albers metres: sample edges, not pixel edges."""
        west = grid.ORIGIN_X_M + self.tx0 * self.tile_m
        south = grid.ORIGIN_Y_M + self.ty0 * self.tile_m
        return west, south, west + self.tiles_x * self.tile_m, south + self.tiles_y * self.tile_m

    def transform(self):
        """North-up, sample (0, 0) centred on the north-west corner (`grid.transform_for`)."""
        from affine import Affine

        west, _south, _east, north = self.bounds_m()
        half = self.cell_m / 2
        return Affine(self.cell_m, 0.0, west - half, 0.0, -self.cell_m, north + half)

    def tiles(self) -> list[tuple[int, int]]:
        """Its tiles in the hero heights' order: rows south to north, then west to east."""
        return [(self.tx0 + i, self.ty0 + j) for j in range(self.tiles_y) for i in range(self.tiles_x)]

    def split(self, image: np.ndarray, tx: int, ty: int) -> np.ndarray:
        """One tile's samples from the area's image, shared edges included."""
        i, j = tx - self.tx0, ty - self.ty0
        row0 = (self.tiles_y - 1 - j) * self.cells
        col0 = i * self.cells
        return image[..., row0 : row0 + self.cells + 1, col0 : col0 + self.cells + 1]

    def fine(self, tx: int, ty: int) -> Area:
        """One of its tiles, at `FINE_CELLS`: the same area's, and read from the same sources."""
        return Area(
            key=self.key,
            lattice=self.lattice,
            tile_m=self.tile_m,
            tx0=tx,
            ty0=ty,
            tiles_x=1,
            tiles_y=1,
            dem=self.dem,
            cells=FINE_CELLS[self.lattice],
        )


def boundary_lonlat(area: Area, per_edge: int = 16) -> tuple[np.ndarray, np.ndarray]:
    """Points along an area's edge, in degrees, a sample's width outside it."""
    west, south, east, north = area.bounds_m()
    pad = area.cell_m
    west, south, east, north = west - pad, south - pad, east + pad, north + pad
    t = np.linspace(0, 1, per_edge)
    xs = np.concatenate([west + (east - west) * t, np.full_like(t, east), east - (east - west) * t, np.full_like(t, west)])
    ys = np.concatenate([np.full_like(t, south), south + (north - south) * t, np.full_like(t, north), north - (north - south) * t])
    lats, lons = grid.unproject(list(xs), list(ys))
    return np.array(lons), np.array(lats)


def source_tiles(area: Area) -> tuple[int, int, int, int]:
    """The mosaic tiles an area reads: (x0, y0, x1, y1), half-open."""
    lons, lats = boundary_lonlat(area)
    px, py = mercator_pixels(lons, lats, area.zoom)
    margin = 2
    x0 = int(math.floor((px.min() - margin) / SOURCE_TILE_PX))
    y0 = int(math.floor((py.min() - margin) / SOURCE_TILE_PX))
    x1 = int(math.floor((px.max() + margin) / SOURCE_TILE_PX)) + 1
    y1 = int(math.floor((py.max() + margin) / SOURCE_TILE_PX)) + 1
    return x0, y0, x1, y1


def film_country_tiles(packs_index: Path) -> list[tuple[int, int]]:
    """Every country tile a scene pack holds: what the film can see."""
    index = json.loads(packs_index.read_text())
    keys: set[tuple[int, int]] = set()
    for scene in index["scenes"]:
        t = scene["tiles"]
        keys.update((t[k], t[k + 1]) for k in range(0, len(t), 2))
    return sorted(keys, key=lambda k: (k[1], k[0]))


def hero_areas(world: Path) -> list[Area]:
    """Every published hero area, from the lattices' indexes."""
    out = []
    for lattice in ("hero", "hero-30m"):
        path = world / lattice / "index.json"
        if not path.exists():
            continue
        index = json.loads(path.read_text())
        for entry in index["areas"]:
            w = entry["window"]
            out.append(
                Area(
                    key=entry["id"],
                    lattice=lattice,
                    tile_m=int(index["tileM"]),
                    tx0=w["hx0"],
                    ty0=w["hy0"],
                    tiles_x=w["hx1"] - w["hx0"],
                    tiles_y=w["hy1"] - w["hy0"],
                    dem=f"hero-{entry['id']}.tif",
                )
            )
    return out


def country_area(tx: int, ty: int) -> Area:
    return Area(key=f"{tx}_{ty}", lattice="country", tile_m=grid.TILE_KM * 1000, tx0=tx, ty0=ty, tiles_x=1, tiles_y=1, dem="china-1km.tif")


def plan(world: Path, packs_index: Path) -> list[Area]:
    return [country_area(tx, ty) for tx, ty in film_country_tiles(packs_index)] + hero_areas(world)


def near_view(tx: int, ty: int) -> Area:
    """A country tile's colour grid seen as its near sub-tiles (F95): its
    `split` is a sub-tile's share of the tile's samples, and its `fine` the
    sub-tile at 10 m. Keyed as the archive's median of its sub-tiles is, in
    the south (`composite.near_areas`)."""
    from .relief import NEAR_SPLIT, NEAR_TILE_M

    return Area(
        key=f"near-{tx}_{ty}",
        lattice="near",
        tile_m=NEAR_TILE_M,
        tx0=tx * NEAR_SPLIT,
        ty0=ty * NEAR_SPLIT,
        tiles_x=NEAR_SPLIT,
        tiles_y=NEAR_SPLIT,
        cells=COLOUR_CELLS // NEAR_SPLIT,
    )


def near_groups(packs_index: Path) -> list[tuple[Area, list[tuple[int, int]]]]:
    """The near sub-tiles the packs list along the rails (F94), by the
    country tile holding them: that tile, and its sub-tiles wanted."""
    from .relief import NEAR_SPLIT, near_tiles

    by_parent: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for i, j in near_tiles(packs_index):
        by_parent.setdefault((i // NEAR_SPLIT, j // NEAR_SPLIT), []).append((i, j))
    return [(country_area(tx, ty), sorted(w)) for (tx, ty), w in sorted(by_parent.items(), key=lambda kv: (kv[0][1], kv[0][0]))]


def archive_region(root: Path | None = None) -> set[tuple[int, int]]:
    """The country tiles coloured from the archive rather than the mosaic (F90)."""
    from .composite import mgrs_index_path

    path = mgrs_index_path(root)
    return {tuple(t) for t in json.loads(path.read_text())["region"]} if path.exists() else set()


def near_from_mosaic(packs_index: Path, root: Path | None = None) -> list[Area]:
    """The near sub-tiles the mosaic colours at 10 m (F95): those of country
    tiles it colours. What `fetch` reads for them, at `FINE_ZOOM`."""
    region = archive_region(root)
    return [
        near_view(parent.tx0, parent.ty0).fine(i, j)
        for parent, wanted in near_groups(packs_index)
        if (parent.tx0, parent.ty0) not in region
        for i, j in wanted
    ]


def fine_from_mosaic(areas: list[Area], root: Path | None = None) -> list[Area]:
    """The fine tiles the mosaic colours: those of hero areas with no
    composite of their own. What `fetch` reads for them, at `FINE_ZOOM`."""
    from .composite import composite_path

    return [
        area.fine(tx, ty)
        for area in areas
        if area.lattice != "country" and not composite_path(area.key, root).exists()
        for tx, ty in area.tiles()
    ]


# --- fetching ------------------------------------------------------------


class RateLimit:
    """At most `per_s` starts a second across threads, and a pause for all
    of them when the service pushes back."""

    def __init__(self, per_s: float):
        self.interval = 1.0 / per_s
        self.lock = threading.Lock()
        self.next_at = 0.0

    def wait(self) -> None:
        with self.lock:
            now = time.monotonic()
            at = max(now, self.next_at)
            self.next_at = at + self.interval
        if at > now:
            time.sleep(at - now)

    def back_off(self, seconds: float) -> None:
        with self.lock:
            self.next_at = max(self.next_at, time.monotonic() + seconds)


def fetch_tile(z: int, x: int, y: int, limit: RateLimit, root: Path | None = None, retries: int = 6) -> str:
    """One mosaic tile into the cache: "cached", "fetched", or "missing"."""
    dest = cached_path(z, x, y, root)
    if dest.exists():
        return "cached"
    url = TILE_URL.format(layer=LAYER, z=z, x=x, y=y)
    wait = 5.0
    for attempt in range(retries):
        limit.wait()
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, context=SSL_CONTEXT, timeout=60) as response:
                kind = response.headers.get("Content-Type", "")
                body = response.read()
            if not kind.startswith("image/"):
                # The rate limiter answers with a redirect to a web page.
                raise urllib.error.URLError(f"{kind or 'no content type'} for {url}")
            dest.parent.mkdir(parents=True, exist_ok=True)
            tmp = dest.with_suffix(".part")
            tmp.write_bytes(body)
            tmp.replace(dest)
            return "fetched"
        except urllib.error.HTTPError as error:
            if error.code == 404:
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(b"")  # known absent: read as no data
                return "missing"
            limit.back_off(wait)
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            limit.back_off(wait)
        wait = min(wait * 2, 300.0)
    raise RuntimeError(f"gave up on {url} after {retries} attempts")


def fetch(areas: list[Area], workers: int = 4, per_s: float = REQUESTS_PER_S, root: Path | None = None) -> dict[str, int]:
    wanted: set[tuple[int, int, int]] = set()
    for area in areas:
        x0, y0, x1, y1 = source_tiles(area)
        wanted.update((area.zoom, x, y) for x in range(x0, x1) for y in range(y0, y1))
    todo = sorted(t for t in wanted if not cached_path(*t, root=root).exists())
    counts = {"wanted": len(wanted), "cached": len(wanted) - len(todo), "fetched": 0, "missing": 0}
    print(f"mosaic tiles: {len(wanted)} wanted, {counts['cached']} cached, {len(todo)} to fetch at {per_s:g}/s", flush=True)
    limit = RateLimit(per_s)
    done = 0
    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for outcome in pool.map(lambda t: fetch_tile(*t, limit=limit, root=root), todo):
            counts[outcome] += 1
            done += 1
            if done % 250 == 0 or done == len(todo):
                rate = done / max(1e-6, time.monotonic() - started)
                print(f"  {done}/{len(todo)}  {rate:.1f}/s", flush=True)
    return counts


# --- the image -------------------------------------------------------------


def read_source_tile(path: Path) -> np.ndarray | None:
    """A cached tile as (3, 256, 256) uint8, or None for no data."""
    if not path.exists() or path.stat().st_size == 0:
        return None
    from rasterio.io import MemoryFile
    import warnings

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # a JPEG is not georeferenced; we know where it is
        with MemoryFile(path.read_bytes()) as memory, memory.open() as ds:
            data = ds.read()
    if data.shape[0] != 3:
        return None  # the service's blank tile, one band of black
    return data


def mosaic(area: Area, root: Path | None = None) -> tuple[np.ndarray, np.ndarray, object]:
    """The source tiles an area reads, stitched: (rgb, valid, transform)."""
    x0, y0, x1, y1 = source_tiles(area)
    w, h = (x1 - x0) * SOURCE_TILE_PX, (y1 - y0) * SOURCE_TILE_PX
    rgb = np.zeros((3, h, w), np.uint8)
    valid = np.zeros((h, w), bool)
    for x in range(x0, x1):
        for y in range(y0, y1):
            tile = read_source_tile(cached_path(area.zoom, x, y, root))
            if tile is None:
                continue
            r, c = (y - y0) * SOURCE_TILE_PX, (x - x0) * SOURCE_TILE_PX
            rgb[:, r : r + SOURCE_TILE_PX, c : c + SOURCE_TILE_PX] = tile
            valid[r : r + SOURCE_TILE_PX, c : c + SOURCE_TILE_PX] = True
    return rgb, valid, mercator_transform(area.zoom, x0, y0)


def reproject_area(area: Area, root: Path | None = None) -> tuple[np.ndarray, np.ndarray]:
    """The area's colour on its own grid: (float32 rgb 0-255, valid)."""
    from rasterio.crs import CRS
    from rasterio.warp import reproject

    rgb, valid, src_transform = mosaic(area, root)
    out = np.zeros((4, area.height, area.width), np.float32)
    source = np.concatenate([rgb.astype(np.float32), valid[None].astype(np.float32) * 255], axis=0)
    reproject(
        source=source,
        destination=out,
        src_transform=src_transform,
        src_crs=CRS.from_epsg(3857),
        dst_transform=area.transform(),
        dst_crs=CRS.from_proj4(grid.ALBERS_PROJ4),
        resampling=resampling_for(area),
        src_nodata=None,
        dst_nodata=None,
    )
    return out[:3], out[3] > 127


def elevation_for(area: Area, root: Path | None = None) -> np.ndarray | None:
    """The area's ground on its colour grid, metres, from the grid it was cut from."""
    if area.dem is None:
        return None
    path = (root or data_root()) / "work" / area.dem
    if not path.exists():
        return None
    import rasterio
    from rasterio.warp import Resampling, reproject

    out = np.zeros((area.height, area.width), np.float32)
    with rasterio.open(path) as ds:
        reproject(
            source=rasterio.band(ds, 1),
            destination=out,
            dst_transform=area.transform(),
            dst_crs=ds.crs,
            resampling=Resampling.bilinear,
        )
    return out


# --- clouds ----------------------------------------------------------------


def box_mean(values: np.ndarray, weight: np.ndarray, radius: int) -> np.ndarray:
    """The weighted mean over a (2r+1)^2 box, by summed-area tables."""

    def box_sum(a: np.ndarray) -> np.ndarray:
        # One more zero before than after: s[i + k] - s[i] is then the box
        # centred on i.
        p = np.pad(a, ((radius + 1, radius), (radius + 1, radius)), mode="constant")
        s = p.cumsum(0).cumsum(1)
        k = 2 * radius + 1
        return s[k:, k:] - s[:-k, k:] - s[k:, :-k] + s[:-k, :-k]

    num = box_sum(values * weight)
    den = box_sum(weight)
    return num / np.maximum(den, 1e-6)


def dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0:
        return mask
    return box_mean(mask.astype(np.float32), np.ones(mask.shape, np.float32), radius) > 1e-6


def resample_samples(image: np.ndarray, height: int, width: int) -> np.ndarray:
    """Bilinear, from one sample grid to another over the same ground: the
    first and last samples of both lie on the same edges (the shared-edge
    rule), so a colour tile's samples land where a fine tile's would."""
    h, w = image.shape[-2:]
    ys = np.linspace(0, h - 1, height)
    xs = np.linspace(0, w - 1, width)
    y0 = np.clip(np.floor(ys).astype(int), 0, max(h - 2, 0))
    x0 = np.clip(np.floor(xs).astype(int), 0, max(w - 2, 0))
    y1 = np.minimum(y0 + 1, h - 1)
    x1 = np.minimum(x0 + 1, w - 1)
    ty = (ys - y0)[:, None]
    tx = (xs - x0)[None, :]
    top = image[..., y0, :][..., x0] * (1 - tx) + image[..., y0, :][..., x1] * tx
    bottom = image[..., y1, :][..., x0] * (1 - tx) + image[..., y1, :][..., x1] * tx
    return top * (1 - ty) + bottom * ty


def upsample(image: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
    """Bilinear, to `shape`, from an image half its size (rounded up)."""
    h, w = shape
    ch, cw = image.shape[-2:]
    ys = np.clip((np.arange(h) + 0.5) / 2 - 0.5, 0, ch - 1)
    xs = np.clip((np.arange(w) + 0.5) / 2 - 0.5, 0, cw - 1)
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    y1 = np.minimum(y0 + 1, ch - 1)
    x1 = np.minimum(x0 + 1, cw - 1)
    ty = (ys - y0)[:, None]
    tx = (xs - x0)[None, :]
    top = image[..., y0, :][..., x0] * (1 - tx) + image[..., y0, :][..., x1] * tx
    bottom = image[..., y1, :][..., x0] * (1 - tx) + image[..., y1, :][..., x1] * tx
    return top * (1 - ty) + bottom * ty


def clean_clouds(rgb: np.ndarray, elevation: np.ndarray | None, cell_m: float) -> tuple[np.ndarray, np.ndarray]:
    """Cloud, the haze round it and its shadow, where the ground round it is green.

    `rgb` is (3, h, w), 0 to 255. Returns the image with thin haze lifted
    and the mask of what is too thick to lift, for `fill`.

    A hazed pixel is the ground's colour mixed toward white; how far is read
    from its darkest channel against the darkest channel of the green ground
    round it. Thin haze - the ring the mosaic stitched round a cloud - is
    unmixed; thick is cloud, and filled. Thresholds set against the Three
    Gorges and Huangshan, where the flecks are (F87).
    """
    r, g, b = rgb
    lo = np.minimum(np.minimum(r, g), b)
    hi = np.maximum(np.maximum(r, g), b)
    radius = max(2, int(round(2000 / cell_m)))
    # Bright and grey: cloud, or snow, salt, sand, rock; which, by the ground
    # round it. A large cloud is not allowed to vote on its own context.
    # Cloud is white to blue-white; silt, soil and dry grass are warm.
    # Past the brightest silt, any hue is cloud: a cloud's core can come out
    # of the mosaic's colour balance a little warm.
    cool = (b >= r - 12) | (lo > 165)
    grey = (lo > 110) & (hi - lo < 45) & cool
    ground = ((g >= r) & (hi < 140) & (hi - lo > 12)).astype(np.float32)
    greenness = box_mean(ground, (~grey).astype(np.float32), radius)
    among_green = greenness > 0.35
    if elevation is not None:
        # Above 3,500 m a pale patch among meadows may be snow.
        among_green &= elevation < 3500
    lo_ground = box_mean(lo, ground, radius)
    whiteness = np.clip((lo - lo_ground) / np.maximum(255 - lo_ground, 1), 0, 1)
    ring = max(1, int(round(90 / cell_m)))
    thick = dilate(among_green & (grey | ((whiteness > 0.35) & cool)), ring)
    # Thin haze is lifted only round a cloud: elsewhere a pale field or a
    # road is paler than the forest because it is paler.
    near = dilate(thick, max(2, int(round(600 / cell_m))))
    thin = near & among_green & cool & (whiteness > 0.08) & ~thick
    a = np.where(thin, whiteness, 0)[None]
    lifted = np.clip(np.where(thin[None], (rgb - 255 * a) / np.maximum(1 - a, 0.2), rgb), 0, 255)
    # The shadow: markedly darker than the ground round it, near a cloud.
    luma = 0.3 * lifted[0] + 0.59 * lifted[1] + 0.11 * lifted[2]
    local = box_mean(luma, (~thick).astype(np.float32), radius)
    shadow = dilate(near, max(2, int(round(600 / cell_m)))) & among_green & (luma < 0.6 * local)
    return lifted, thick | dilate(shadow, ring)


def fill(rgb: np.ndarray, hole: np.ndarray) -> np.ndarray:
    """Fill the holes from the ground around them: push down a pyramid of
    means over what is not a hole, then pull the coarse levels back up,
    bilinearly, wherever the fine ones had nothing."""
    keep = (~hole).astype(np.float32)
    levels = [(rgb * keep, keep)]
    while min(levels[-1][1].shape) > 1:
        v, w = levels[-1]
        h, wd = w.shape
        ph, pw = h + (h & 1), wd + (wd & 1)
        v = np.pad(v, ((0, 0), (0, ph - h), (0, pw - wd)))
        w = np.pad(w, ((0, ph - h), (0, pw - wd)))
        v2 = v.reshape(3, ph // 2, 2, pw // 2, 2).sum((2, 4))
        w2 = w.reshape(ph // 2, 2, pw // 2, 2).sum((1, 3))
        levels.append((v2, w2))
    v, w = levels[-1]
    colour = v / np.maximum(w, 1e-6)
    for v, w in reversed(levels[:-1]):
        up = upsample(colour, w.shape)
        mine = v / np.maximum(w, 1e-6)
        t = np.clip(w, 0, 1)
        colour = mine * t + up * (1 - t)
    return np.where(hole[None], colour, rgb)


# --- the south's composite (F89) -------------------------------------------

#: How far in from the edge of what a Sentinel-2 tile-orbit sees its weight
#: in the country's colour takes to rise (F90).
COUNTRY_FEATHER_M = 5_000

#: How far in from a composited area's edge its tone still leans toward the
#: mosaic's, which colours the country tiles it meets there; and how broad
#: the tone is that leans.
FEATHER_M = 1_500
EDGE_BLUR_M = 1_000


def composite_on(area: Area, root: Path | None = None) -> tuple[np.ndarray, np.ndarray] | None:
    """The area's Sentinel-2 composite on its colour grid, if it has one:
    (float32 rgb 0-255, where enough views stand behind it)."""
    from .composite import MIN_VIEWS, composite_path

    path = composite_path(area.key, root)
    if area.lattice == "country" or not path.exists():
        return None
    import rasterio
    from rasterio.crs import CRS
    from rasterio.warp import reproject, transform_bounds
    from rasterio.windows import Window, from_bounds

    albers = CRS.from_proj4(grid.ALBERS_PROJ4)
    west, south, east, north = area.bounds_m()
    with rasterio.open(path) as ds:
        # Only the part under the area, and a few pixels round it.
        pad = 2 * max(area.cell_m, ds.transform.a)
        box = transform_bounds(albers, ds.crs, west - pad, south - pad, east + pad, north + pad, densify_pts=32)
        w = from_bounds(*box, transform=ds.transform)
        c0, r0 = max(0, math.floor(w.col_off)), max(0, math.floor(w.row_off))
        c1, r1 = min(ds.width, math.ceil(w.col_off + w.width)), min(ds.height, math.ceil(w.row_off + w.height))
        if c1 <= c0 or r1 <= r0:
            return None
        window = Window(c0, r0, c1 - c0, r1 - r0)
        data = ds.read(window=window).astype(np.float32)
        src_transform, src_crs = ds.window_transform(window), ds.crs
    # Averaged premultiplied, so a sample is the mean of its seen pixels
    # only; in place, as a 10 m area is a gigabyte of floats (F91).
    ok = data[3] >= MIN_VIEWS
    data[:3] *= ok
    data[3] = ok
    out = np.zeros((4, area.height, area.width), np.float32)
    reproject(
        source=data,
        destination=out,
        src_transform=src_transform,
        src_crs=src_crs,
        dst_transform=area.transform(),
        dst_crs=albers,
        resampling=resampling_for(area),
        src_nodata=None,
        dst_nodata=None,
    )
    seen = out[3] > 0.5
    return out[:3] / np.maximum(out[3], 1e-6), seen


def country_archive_on(area: Area, root: Path | None = None) -> tuple[np.ndarray, np.ndarray] | None:
    """The southern country's Sentinel-2 composite (F90) on an area's colour
    grid: (float32 rgb 0-255, where enough views stand behind it). None for
    a country tile outside the composited region - the rest of the country
    keeps the mosaic whole, rather than taking the archive wherever a
    Sentinel-2 tile happens to reach - or where no composite lies."""
    from .composite import MIN_VIEWS, mgrs_index_path

    path = mgrs_index_path(root)
    if not path.exists():
        return None
    index = json.loads(path.read_text())
    if area.lattice == "country" and [area.tx0, area.ty0] not in index["region"]:
        return None
    import rasterio
    from rasterio.crs import CRS
    from rasterio.warp import Resampling, reproject

    west, south, east, north = area.bounds_m()
    total = np.zeros((5, area.height, area.width), np.float32)
    for entry in index["tiles"].values():
        w, s, e, n = entry["albers"]
        if e < west or w > east or n < south or s > north:
            continue
        with rasterio.open(path.parent / entry["file"]) as ds:
            data = ds.read().astype(np.float32)
            src_transform, src_crs = ds.transform, ds.crs
        ok = (data[3] >= MIN_VIEWS).astype(np.float32)
        # Each tile-orbit's weight fades to nothing at the edge of what it
        # sees, so where swaths and tiles overlap they blend, not step.
        reach = box_mean(ok, np.ones_like(ok), max(1, int(round(COUNTRY_FEATHER_M / src_transform.a))))
        weight = ok * np.clip(reach * 2 - 1, 0, 1) ** 2
        out = np.zeros_like(total)
        reproject(
            source=np.concatenate([data[:3] * weight, weight[None], ok[None]]),
            destination=out,
            src_transform=src_transform,
            src_crs=src_crs,
            dst_transform=area.transform(),
            dst_crs=CRS.from_proj4(grid.ALBERS_PROJ4),
            resampling=Resampling.average,
            src_nodata=None,
            dst_nodata=None,
        )
        total += out
    if not total[4].any():
        return None
    return total[:3] / np.maximum(total[3], 1e-6), (total[4] > 0.5) & (total[3] > 1e-4)


#: The tone line is fitted over the tenth to the ninetieth percentile.
TONE_PERCENTILES = np.linspace(10, 90, 17)


def fit_tone(archive: list[np.ndarray], mosaic: list[np.ndarray]) -> list[dict]:
    """A line per channel taking the archive's values onto the mosaic's,
    fitted to the bulk of both - their tenth to ninetieth percentiles - over
    the samples given, which are clear ground in both: `archive[c]` and
    `mosaic[c]` hold channel c's. The archive's ninetieth percentile is the
    knee above which `apply_tone` eases into white."""
    tone = []
    for x, y in zip(archive, mosaic):
        xq = np.percentile(x, TONE_PERCENTILES)
        gain, offset = np.polyfit(xq, np.percentile(y, TONE_PERCENTILES), 1)
        tone.append({"gain": round(float(gain), 4), "offset": round(float(offset), 3), "knee": round(float(xq[-1]), 2)})
    return tone


def apply_tone(rgb: np.ndarray, tone: list[dict]) -> np.ndarray:
    """The fitted line up to the knee, and above it a straight run to white.

    A line, not a curve: the mosaic's highlights are where its haze and
    uncaught cloud are, and a curve fitted to them blows out the archive's
    snow and turns its rivers cyan. The shoulder keeps the snow's shading
    where the line would clip it (F89)."""
    out = np.empty_like(rgb)
    for c, t in enumerate(tone):
        knee = min(t["knee"], 254.0)
        top = min(t["gain"] * knee + t["offset"], 254.0)
        shoulder = top + (rgb[c] - knee) * (255 - top) / (255 - knee)
        out[c] = np.where(rgb[c] <= knee, rgb[c] * t["gain"] + t["offset"], shoulder)
    return np.clip(out, 0, 255)


def edge_weight(area: Area, feather_m: float = FEATHER_M) -> np.ndarray:
    """0 on the area's edge, rising smoothly to 1 at `feather_m` inside it."""
    h, w = area.height, area.width
    rows = np.minimum(np.arange(h), np.arange(h)[::-1])[:, None]
    cols = np.minimum(np.arange(w), np.arange(w)[::-1])[None, :]
    t = np.clip(np.minimum(rows, cols) * area.cell_m / feather_m, 0, 1)
    return (t * t * (3 - 2 * t)).astype(np.float32)


def meet_the_mosaic(archive: np.ndarray, mosaic: np.ndarray, trusted: np.ndarray, area: Area) -> np.ndarray:
    """Toward the area's edge, the archive's broad tone shifted onto the
    mosaic's - the colour the country tiles meet it with - and its detail
    kept. Only the tone crosses: blending the mosaic itself in would bring
    its cloud with it."""
    radius = max(2, int(round(EDGE_BLUR_M / area.cell_m)))
    weight = trusted.astype(np.float32)
    shift = np.stack([box_mean(mosaic[c], weight, radius) - box_mean(archive[c], weight, radius) for c in range(3)])
    return np.clip(archive + (1 - edge_weight(area))[None] * shift, 0, 255)


# --- writing -------------------------------------------------------------


def encode(tile: np.ndarray, quality: int = WEBP_QUALITY) -> bytes:
    from rasterio.io import MemoryFile
    import warnings

    data = np.clip(np.round(tile), 0, 255).astype(np.uint8)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with MemoryFile() as memory:
            with memory.open(
                driver="WEBP", width=data.shape[2], height=data.shape[1], count=3, dtype="uint8", QUALITY=quality
            ) as ds:
                ds.write(data)
            return memory.read()


def name_of(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()[:16]


def fine_tile(
    area: Area, tx: int, ty: int, raw: np.ndarray, final: np.ndarray, hole: np.ndarray, source: str, root: Path | None = None
) -> np.ndarray:
    """One of a hero area's tiles at `FINE_CELLS` (F91).

    Its own source read again at 10 m - the composite, toned, or the
    mosaic at `FINE_ZOOM` - carrying what the colour tile did to its source
    (`final - raw`: the tone leaning onto the country at the area's edge,
    the haze lifted), and the colour tile itself wherever that was filled.
    So a fine tile averaged over a colour sample is that sample, and the
    shader's fade from one to the other changes only the detail."""
    fine = area.fine(tx, ty)
    n = fine.cells + 1
    base = area.split(final, tx, ty)
    filled = area.split(hole, tx, ty)
    keep = resample_samples((~filled).astype(np.float32), n, n)
    correction = resample_samples(np.where(filled[None], 0, base - area.split(raw, tx, ty)), n, n)
    if source == "composite":
        from .composite import load_tone

        got = composite_on(fine, root)
        detail, seen = got if got is not None else (np.zeros((3, n, n), np.float32), np.zeros((n, n), bool))
        detail = apply_tone(detail, load_tone(root))
    else:
        detail, seen = reproject_area(fine, root)
    keep = keep * seen
    return np.clip(keep[None] * (detail + correction) + (1 - keep[None]) * resample_samples(base, n, n), 0, 255)


def write_tile(tile: np.ndarray, out_dir: Path, quality: int = WEBP_QUALITY) -> tuple[str, int]:
    body = encode(tile, quality)
    name = name_of(body)
    path = out_dir / "files" / f"{name}.webp"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        # Whole or not at all: the near sub-tiles are cut in several processes (F95).
        part = path.with_suffix(f".{os.getpid()}.part")
        part.write_bytes(body)
        part.replace(path)
    return name, len(body)


@dataclass
class Cut:
    """An area's colour as it is cut: `raw`, its source on its grid before
    anything is done to it; `rgb`, the colour; `hole`, where that was filled
    rather than seen; `valid`, where the source has anything; and which
    source it is."""

    raw: np.ndarray
    rgb: np.ndarray
    hole: np.ndarray
    valid: np.ndarray
    source: str


def colour_of(area: Area, root: Path | None = None) -> Cut | None:
    """The area's colour, or None where the mosaic has nothing under it."""
    rgb, valid = reproject_area(area, root)
    if not valid.any():
        return None
    elevation = elevation_for(area, root)
    raw = rgb
    rgb, cloud = clean_clouds(rgb, elevation, area.cell_m)
    hole = cloud | ~valid
    rgb = fill(rgb, hole)
    source = "mosaic"
    country = country_archive_on(area, root)
    if country is not None:
        from .composite import load_tone

        country = (apply_tone(country[0], load_tone(root)), country[1])
    if area.lattice == "country":
        if country is not None:
            archive, seen = country
            # Where the archive has nothing - past the swaths, over open sea -
            # the mosaic stays, eased into over a sample or two.
            weight = box_mean(seen.astype(np.float32), np.ones(seen.shape, np.float32), 2)[None]
            rgb = rgb * (1 - weight) + fill(archive, ~seen) * weight
            hole, source = hole & ~seen, "composite"
    else:
        composite = composite_on(area, root)
        if composite is not None:
            from .composite import load_tone

            archive, seen = composite
            archive = fill(apply_tone(archive, load_tone(root)), ~seen)
            # The edge meets the country's colour: the archive's own where the
            # country round the area is composited too, else the mosaic's.
            target, target_ok = rgb, ~hole
            if country is not None:
                target = np.where(country[1][None], country[0], rgb)
                target_ok = country[1] | ~hole
            rgb = meet_the_mosaic(archive, target, seen & target_ok, area)
            raw, hole, source = archive, ~seen, "composite"
    return Cut(raw, rgb, hole, valid, source)


def cut_area(area: Area, out_dir: Path, root: Path | None = None, fine: bool = True) -> dict:
    cut = colour_of(area, root)
    if cut is None:
        return {"key": area.key, "tiles": [""] * (area.tiles_x * area.tiles_y), "cloud": 0.0, "bytes": 0, "source": "none"}
    rgb, hole, valid, source = cut.rgb, cut.hole, cut.valid, cut.source
    names = []
    total = 0
    for tx, ty in area.tiles():
        name, size = write_tile(area.split(rgb, tx, ty), out_dir)
        names.append(name)
        total += size
    result = {"key": area.key, "tiles": names, "cloud": float((hole & valid).mean()), "bytes": total, "source": source}
    if fine and area.lattice in FINE_CELLS:
        result["fine"], result["fine_bytes"] = [], 0
        for tx, ty in area.tiles():
            tile = fine_tile(area, tx, ty, cut.raw, rgb, hole | ~valid, source, root)
            name, size = write_tile(tile, out_dir, FINE_WEBP_QUALITY)
            result["fine"].append(name)
            result["fine_bytes"] += size
    return result


def cut_near(parent: Area, wanted: list[tuple[int, int]], out_dir: Path, root: Path | None = None) -> dict:
    """A country tile's near sub-tiles at 10 m (F95), each laid onto the
    tile's colour as a fine hero tile is onto its colour tile (`fine_tile`):
    its detail from the tile's own source read again at 10 m, its broad tone
    the colour tile's, and the colour tile alone wherever that was filled.

    In the north the source is the mosaic, and the colour tile's own read of
    it is what the detail's broad tone is measured against. In the south the
    colour tile is the archive's at 160 m (F90), and the 10 m source is the
    archive's median over just these sub-tiles, measured against itself
    averaged onto the colour tile's grid: from each sub-tile's own zone,
    where the tile lies across the edge of one (`composite.zones`). Without
    a median, nothing is cut. `name` is the colour tile's as this cut makes
    it, to be checked against the one published."""
    out: dict = {"key": parent.key, "tiles": {}, "bytes": 0, "source": "none", "name": ""}
    cut = colour_of(parent, root)
    if cut is None:
        return out
    out["name"] = name_of(encode(parent.split(cut.rgb, parent.tx0, parent.ty0)))
    view = near_view(parent.tx0, parent.ty0)
    medians = []
    if cut.source == "composite":
        from .composite import composite_path

        main = composite_path(view.key, root)
        medians = ([view.key] if main.exists() else []) + sorted(p.stem for p in main.parent.glob(f"{view.key}-*.tif"))
        if not medians:
            return out
    out["source"] = cut.source
    for i, j in wanted:
        raw, hole, source = cut.raw, cut.hole | ~cut.valid, view
        if medians:
            raw = raw.copy()  # its samples are this sub-tile's median's
            source = archive_near(view, medians, i, j, raw, hole, root)
        tile = fine_tile(source, i, j, raw, cut.rgb, hole, cut.source, root)
        name, size = write_tile(tile, out_dir, FINE_WEBP_QUALITY)
        out["tiles"][f"{i}_{j}"] = name
        out["bytes"] += size
    return out


def archive_near(view: Area, medians: list[str], i: int, j: int, raw: np.ndarray, hole: np.ndarray, root: Path | None = None) -> Area:
    """The southern sub-tile (i, j) from the archive's median that sees most
    of it (F95): its samples of `raw` and `hole` are that median's, averaged
    onto the colour tile's grid and toned, and the view returned reads the
    sub-tile's 10 m from the same median."""
    from dataclasses import replace

    from .composite import load_tone

    best, seen_most = None, -1.0
    for key in medians:
        got = composite_on(Area(key=key, lattice=view.lattice, tile_m=view.tile_m, tx0=i, ty0=j, tiles_x=1, tiles_y=1, cells=view.cells), root)
        if got is not None and got[1].mean() > seen_most:
            best, seen_most = (key, got), float(got[1].mean())
    part_raw, part_hole = view.split(raw, i, j), view.split(hole, i, j)
    if best is None:
        part_hole[...] = True  # nothing sees it: the colour tile alone
        return view
    key, (rgb, seen) = best
    part_raw[...] = apply_tone(rgb, load_tone(root))
    part_hole |= ~seen
    return replace(view, key=key)


def composite_source() -> dict:
    """What a composited area's index entry says it is made from."""
    from .composite import COLLECTION, FIRST_YEAR, LAST_YEAR, NOTICE

    return {"collection": COLLECTION, "years": [FIRST_YEAR, LAST_YEAR], "attribution": NOTICE}


def cut(
    areas: list[Area],
    out_dir: Path,
    root: Path | None = None,
    merge: bool = False,
    near: list[tuple[Area, list[tuple[int, int]]]] = (),
    workers: int = 3,
) -> dict:
    """Cut every area, and every country tile's `near` sub-tiles (F95), and
    write the index. A partial cut (`merge`) updates the index it finds; a
    whole one replaces it and clears files no longer named."""
    from .relief import NEAR_TILE_M

    path = out_dir / "index.json"
    index: dict = {
        "version": INDEX_VERSION,
        "codec": CODEC,
        "cells": COLOUR_CELLS,
        "samples": COLOUR_SAMPLES,
        "rows": "north to south",
        "source": {"layer": LAYER, "year": YEAR, "attribution": ATTRIBUTION, "licence": LICENCE, "licenceUrl": LICENCE_URL},
        "country": {},
        "hero": {},
        # The tiles nearest the camera, at 10 m (F91), by lattice; and the
        # country's sub-tiles along the rails (F95).
        "fine": {lattice: {"cells": cells, "samples": cells + 1} for lattice, cells in FINE_CELLS.items()},
        "near": {"tileM": NEAR_TILE_M, "tiles": {}},
    }
    archive_tiles: set[str] = set()
    if merge and path.exists():
        before = json.loads(path.read_text())
        index["country"], index["hero"] = before["country"], before["hero"]
        index["near"]["tiles"] = before.get("near", {}).get("tiles", {})
        archive_tiles.update(before.get("archive", {}).get("country", []))
    started = time.monotonic()
    for n, area in enumerate(areas, 1):
        result = cut_area(area, out_dir, root)
        if area.lattice == "country":
            if result["tiles"][0]:
                index["country"][area.key] = result["tiles"][0]
            if result["source"] == "composite":
                archive_tiles.add(area.key)
        else:
            index["hero"][area.key] = {
                "lattice": area.lattice,
                "window": {"hx0": area.tx0, "hy0": area.ty0, "hx1": area.tx0 + area.tiles_x, "hy1": area.ty0 + area.tiles_y},
                "tiles": result["tiles"],
            }
            if result["source"] == "composite":
                index["hero"][area.key]["source"] = composite_source()
            if "fine" in result:
                index["hero"][area.key]["fine"] = result["fine"]
            print(
                f"  {area.key:22} {len(result['tiles']):4} tiles  {result['bytes'] / 1e6:6.2f} MB  "
                f"from the {result['source']}, filled {result['cloud']:.1%}"
                + (f"; fine {result['fine_bytes'] / 1e6:6.2f} MB" if "fine" in result else ""),
                flush=True,
            )
        if n % 200 == 0:
            print(f"  {n}/{len(areas)}  {time.monotonic() - started:.0f} s", flush=True)
    if near:
        # Under two seconds a sub-tile, most of it the warp at 10 m: in
        # processes, but few, as each holds a gigabyte at its peak.
        started, done, total, left_out = time.monotonic(), 0, 0, []
        with ProcessPoolExecutor(workers) if workers > 1 else contextlib.nullcontext() as pool:
            args = ([p for p, _ in near], [w for _, w in near], [out_dir] * len(near), [root] * len(near))
            for (parent, wanted), result in zip(near, pool.map(cut_near, *args) if pool else map(cut_near, *args)):
                published = index["country"].get(parent.key)
                if result["tiles"] and result["name"] != published:
                    # The sub-tiles are laid onto the colour tile as this cut
                    # makes it; one that differs from the tile the packs carry
                    # would step at the fade.
                    raise RuntimeError(f"country tile {parent.key} cuts as {result['name']}, published as {published}")
                for key in [f"{i}_{j}" for i, j in wanted]:
                    index["near"]["tiles"].pop(key, None)
                index["near"]["tiles"].update(result["tiles"])
                total += result["bytes"]
                if len(result["tiles"]) < len(wanted):
                    left_out.append(f"{parent.key} ({len(wanted) - len(result['tiles'])}, {result['source']})")
                done += len(wanted)
                if done // 100 > (done - len(wanted)) // 100:
                    print(f"  near: {done} sub-tiles, {total / 1e6:.0f} MB, {time.monotonic() - started:.0f} s", flush=True)
        print(f"  near: {sum(len(w) for _, w in near)} sub-tiles along the rails, {total / 1e6:.1f} MB", flush=True)
        if left_out:
            print(f"  near: none cut under {', '.join(left_out)}", flush=True)
    if archive_tiles:
        # Which country tiles are the archive's rather than the mosaic's (F90).
        index["archive"] = {**composite_source(), "country": sorted(archive_tiles)}
    path.write_text(json.dumps(index, indent=1, sort_keys=True) + "\n")
    if archive_tiles:
        print(f"  {len(archive_tiles)} country tiles from the composite", flush=True)
    if not merge:
        named = set(index["country"].values()) | {n for a in index["hero"].values() for n in a["tiles"] + a.get("fine", [])}
        named |= set(index["near"]["tiles"].values())
        for file in (out_dir / "files").glob("*.webp"):
            if file.stem not in named:
                file.unlink()
    return index


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Colour the film's ground from the 2016 Sentinel-2 cloudless mosaic.")
    parser.add_argument("step", choices=["plan", "fetch", "cut"])
    parser.add_argument("--world", type=Path, default=Path("dist-world/china"))
    parser.add_argument("--packs", type=Path, default=Path("app/public/packs/index.json"))
    parser.add_argument("--only", default=None, help="comma-separated area keys (hero ids or tx_ty), or `near`")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--rate", type=float, default=REQUESTS_PER_S)
    args = parser.parse_args(argv)

    areas = plan(args.world, args.packs)
    near = near_groups(args.packs)
    near_mosaic = near_from_mosaic(args.packs)
    if args.only:
        wanted = set(args.only.split(","))
        areas = [a for a in areas if a.key in wanted]
        if "near" not in wanted:
            near, near_mosaic = [], []
    if args.step == "plan":
        tiles: set[tuple[int, int, int]] = set()
        for area in areas + fine_from_mosaic(areas) + near_mosaic:
            x0, y0, x1, y1 = source_tiles(area)
            tiles.update((area.zoom, x, y) for x in range(x0, x1) for y in range(y0, y1))
        by_zoom: dict[int, int] = {}
        for z, _x, _y in tiles:
            by_zoom[z] = by_zoom.get(z, 0) + 1
        country = sum(1 for a in areas if a.lattice == "country")
        subs = sum(len(w) for _, w in near)
        print(
            f"{country} country tiles, {len(areas) - country} hero areas, {subs} near sub-tiles "
            f"({len(near_mosaic)} from the mosaic); mosaic tiles by zoom: {dict(sorted(by_zoom.items()))}"
        )
        return 0
    if args.step == "fetch":
        print(fetch(areas + fine_from_mosaic(areas) + near_mosaic, args.workers, args.rate))
        return 0
    out = args.world / "colour"
    index = cut(areas, out, merge=args.only is not None, near=near)
    print(
        f"{len(index['country'])} country tiles, {len(index['hero'])} hero areas and "
        f"{len(index['near']['tiles'])} near sub-tiles coloured into {out}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
