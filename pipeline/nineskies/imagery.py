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
(45 m) and a 30 m one 3.84 km (15 m, near the mosaic's own 10 m).

**Clouds.** The 2016 mosaic was built from one satellite's first year, and
over the humid south it keeps flecks of cloud, each with a pale ring where
the mosaic stitched round it and often a shadow beside it. They are found
by what they are among, not what they are: a bright grey patch in forest or
farmland is cloud, where one among rock, snow, sand or salt is ground. The
mask is filled from the ground around it (`fill`).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
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
CODEC = "webp"
INDEX_VERSION = 1

#: Web Mercator.
EARTH_RADIUS_M = 6378137.0
HALF_WORLD_M = math.pi * EARTH_RADIUS_M
SOURCE_TILE_PX = 256

#: The mosaic's zoom for each lattice: its pixel a little finer than half a
#: colour sample at China's latitudes, so the reprojection averages rather
#: than invents. Zoom 10 is 132 m at 30 N; 13 is 16.5 m; 14 is 8.3 m.
ZOOM_FOR_TILE_M = {64_000: 10, 11_520: 13, 3_840: 14}

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

    @property
    def zoom(self) -> int:
        return ZOOM_FOR_TILE_M[self.tile_m]

    @property
    def cell_m(self) -> float:
        return self.tile_m / COLOUR_CELLS

    @property
    def width(self) -> int:
        return self.tiles_x * COLOUR_CELLS + 1

    @property
    def height(self) -> int:
        return self.tiles_y * COLOUR_CELLS + 1

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
        row0 = (self.tiles_y - 1 - j) * COLOUR_CELLS
        col0 = i * COLOUR_CELLS
        return image[:, row0 : row0 + COLOUR_SAMPLES, col0 : col0 + COLOUR_SAMPLES]


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
    from rasterio.warp import Resampling, reproject

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
        resampling=Resampling.average,
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


# --- writing -------------------------------------------------------------


def encode(tile: np.ndarray) -> bytes:
    from rasterio.io import MemoryFile
    import warnings

    data = np.clip(np.round(tile), 0, 255).astype(np.uint8)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with MemoryFile() as memory:
            with memory.open(
                driver="WEBP", width=data.shape[2], height=data.shape[1], count=3, dtype="uint8", QUALITY=WEBP_QUALITY
            ) as ds:
                ds.write(data)
            return memory.read()


def name_of(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()[:16]


def cut_area(area: Area, out_dir: Path, root: Path | None = None) -> dict:
    rgb, valid = reproject_area(area, root)
    if not valid.any():
        return {"key": area.key, "tiles": [""] * (area.tiles_x * area.tiles_y), "cloud": 0.0, "bytes": 0}
    elevation = elevation_for(area, root)
    rgb, cloud = clean_clouds(rgb, elevation, area.cell_m)
    hole = cloud | ~valid
    rgb = fill(rgb, hole)
    names = []
    total = 0
    for tx, ty in area.tiles():
        body = encode(area.split(rgb, tx, ty))
        name = name_of(body)
        path = out_dir / "files" / f"{name}.webp"
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(body)
        names.append(name)
        total += len(body)
    return {"key": area.key, "tiles": names, "cloud": float((hole & valid).mean()), "bytes": total}


def cut(areas: list[Area], out_dir: Path, root: Path | None = None, merge: bool = False) -> dict:
    """Cut every area and write the index. A partial cut (`merge`) updates
    the index it finds; a whole one replaces it and clears files no longer
    named."""
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
    }
    if merge and path.exists():
        before = json.loads(path.read_text())
        index["country"], index["hero"] = before["country"], before["hero"]
    started = time.monotonic()
    for n, area in enumerate(areas, 1):
        result = cut_area(area, out_dir, root)
        if area.lattice == "country":
            if result["tiles"][0]:
                index["country"][area.key] = result["tiles"][0]
        else:
            index["hero"][area.key] = {
                "lattice": area.lattice,
                "window": {"hx0": area.tx0, "hy0": area.ty0, "hx1": area.tx0 + area.tiles_x, "hy1": area.ty0 + area.tiles_y},
                "tiles": result["tiles"],
            }
            print(f"  {area.key:22} {len(result['tiles']):4} tiles  {result['bytes'] / 1e6:6.2f} MB  cloud filled {result['cloud']:.1%}", flush=True)
        if n % 200 == 0:
            print(f"  {n}/{len(areas)}  {time.monotonic() - started:.0f} s", flush=True)
    path.write_text(json.dumps(index, indent=1, sort_keys=True) + "\n")
    if not merge:
        named = set(index["country"].values()) | {n for a in index["hero"].values() for n in a["tiles"]}
        for file in (out_dir / "files").glob("*.webp"):
            if file.stem not in named:
                file.unlink()
    return index


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Colour the film's ground from the 2016 Sentinel-2 cloudless mosaic.")
    parser.add_argument("step", choices=["plan", "fetch", "cut"])
    parser.add_argument("--world", type=Path, default=Path("dist-world/china"))
    parser.add_argument("--packs", type=Path, default=Path("app/public/packs/index.json"))
    parser.add_argument("--only", default=None, help="comma-separated area keys (hero ids or tx_ty)")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--rate", type=float, default=REQUESTS_PER_S)
    args = parser.parse_args(argv)

    areas = plan(args.world, args.packs)
    if args.only:
        wanted = set(args.only.split(","))
        areas = [a for a in areas if a.key in wanted]
    if args.step == "plan":
        tiles: set[tuple[int, int, int]] = set()
        for area in areas:
            x0, y0, x1, y1 = source_tiles(area)
            tiles.update((area.zoom, x, y) for x in range(x0, x1) for y in range(y0, y1))
        by_zoom: dict[int, int] = {}
        for z, _x, _y in tiles:
            by_zoom[z] = by_zoom.get(z, 0) + 1
        country = sum(1 for a in areas if a.lattice == "country")
        print(f"{country} country tiles, {len(areas) - country} hero areas; mosaic tiles by zoom: {dict(sorted(by_zoom.items()))}")
        return 0
    if args.step == "fetch":
        print(fetch(areas, args.workers, args.rate))
        return 0
    out = args.world / "colour"
    index = cut(areas, out, merge=args.only is not None)
    print(f"{len(index['country'])} country tiles and {len(index['hero'])} hero areas coloured into {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
