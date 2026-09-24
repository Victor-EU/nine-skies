"""Stage 12b — the south's colour, composited from the Sentinel-2 archive (F89).

The 2016 mosaic (`imagery.py`) is one satellite's first year, and over the
humid south it is a third cloud: at Tiger Leaping Gorge, Guilin and the
Three Gorges the cut fills that third from the ground around it, which
leaves soft grey-green smudges where the camera flies lowest. This stage
colours those hero areas from the archive instead: every pass over the area
from 2018 to 2025, each pixel masked by the scene classification that ships
with the image, and the median of what is left.

**The source.** Sentinel-2 Level-2A, Collection 1 (ESA's archive
reprocessed to one baseline), as Element 84 publishes it on AWS and indexes
it in the earth-search STAC. A pass's `visual` asset is ESA's true-colour
image (10 m, from surface reflectance) and its `scl` the per-pixel scene
classification (20 m). The Copernicus Sentinel data terms allow
reproduction, distribution and adaptation, with the notice "Contains
modified Copernicus Sentinel data [year]"; NOTICE.md carries it.

**Which passes.** Each image is one MGRS tile of one pass. Every item over
the area is probed for how much of the area it sees clear (a coarse read of
its classification). Only passes with the sun at least `MIN_SUN_DEG` high
are read: the satellite passes mid-morning, its sun always in the
south-east, and the south's clearest passes are winter's, whose low sun
bakes long shadows into every south-east-facing gorge. Under the Three
Gorges' evening sun from the west those shadows would light the relief
inside out; under a high sun a slope's shading is a fraction of winter's.
Of those, each tile's clearest are read, a month at a time from spring to
early autumn. Each is read only where it covers the area: from the 20 m
overview for the 90 m lattice (colour 45 m), at the full 10 m for the 30 m
one (15 m). Reads are cached under `data/source/`, never made twice.

**The median.** On the area's UTM grid - every MGRS tile of a zone shares
it, so the passes stack without resampling - a pixel's colour is the
median, channel by channel, of its clear views: vegetation, bare ground,
water or snow, and not within `CLOUD_MARGIN_M` of cloud, cirrus or cloud
shadow. What the classifier misses is outvoted. The result, with the count
of views behind each pixel, is written under `data/work/composite/`, and
`imagery.cut_area` reads it for these areas in place of the mosaic.

**The country round them** (F90). The country tiles the four southern
scenes' packs hold, 689 of them, are the archive's too, at their own 250 m:
the distant ground in those scenes, which the mosaic leaves a fifth cloud.
There each pass is read whole, from the 160 m overviews of its true colour
and its classification, since a Sentinel-2 tile is a few country tiles
wide; each tile's passes are the catalogue's least cloudy under a high
sun, a month at a time, and the median is taken on the tile's own grid.
The rest of the country keeps the mosaic.

**No light is taken off.** Under a high sun what is left on the slopes is
what grows on them: steep forested slopes turned toward the satellite's sun
are darker, not lighter, than those turned away (the gorge walls keep their
forest and the gentler ground is farmed), so a correction fitted to the sun
would erase the ground's own pattern (F89).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import grid, imagery
from .acquire import SSL_CONTEXT, data_root

STAC_SEARCH = "https://earth-search.aws.element84.com/v1/search"
COLLECTION = "sentinel-2-c1-l2a"
FIRST_YEAR, LAST_YEAR = 2018, 2025
NOTICE = f"Contains modified Copernicus Sentinel data {FIRST_YEAR}-{LAST_YEAR}"
#: Items the catalogue says are mostly cloud are not probed.
MAX_ITEM_CLOUD = 70

#: The hero areas composited: the ones the 2016 mosaic leaves most cloud in.
SOUTH = ("tiger-leaping-gorge", "three-gorges", "guilin", "huangshan")
#: Metres a pixel the source is read at, by lattice: finer than half a colour sample.
READ_M = {"hero": 20, "hero-30m": 10}
#: Passes read per MGRS tile, by read resolution: a 10 m read is four times the bytes.
PER_TILE = {20: 80, 10: 50}
#: A pass that sees less of the area than this clear is not read.
MIN_CLEAR = 0.3
#: Nor one with the sun lower than this: its shadows are baked in.
MIN_SUN_DEG = 55

#: Scene classes that are ground seen clear: vegetation, bare, water, snow.
CLEAR = (4, 5, 6, 11)
#: Cloud shadow, cloud (medium and high probability), thin cirrus: grown by
#: `CLOUD_MARGIN_M`, as a cloud's edge is wider than the classifier's.
CLOUDY = (3, 8, 9, 10)
CLOUD_MARGIN_M = 100
#: Fewer views than this and a pixel is filled from its neighbours.
MIN_VIEWS = 3

GDAL_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
    "GDAL_HTTP_MAX_RETRY": "5",
    "GDAL_HTTP_RETRY_DELAY": "3",
    "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
}


# --- where things are ------------------------------------------------------


def source_dir(area: str, root: Path | None = None) -> Path:
    return (root or data_root()) / "source" / COLLECTION / area


def composite_path(area: str, root: Path | None = None) -> Path:
    return (root or data_root()) / "work" / "composite" / f"{area}.tif"


def tone_path(root: Path | None = None) -> Path:
    return (root or data_root()) / "work" / "composite" / "tone.json"


# --- the grid ----------------------------------------------------------------


@dataclass(frozen=True)
class UtmGrid:
    """A north-up grid in one UTM zone, its edges on multiples of `res`.

    MGRS tiles' origins are on multiples of 20 m in their zone, so every
    pass's pixels fall on this grid whole, at 10 m or 20 m.
    """

    epsg: int
    res: int
    west: int
    north: int
    width: int
    height: int

    def transform(self):
        from affine import Affine

        return Affine(self.res, 0.0, self.west, 0.0, -self.res, self.north)

    @property
    def east(self) -> int:
        return self.west + self.width * self.res

    @property
    def south(self) -> int:
        return self.north - self.height * self.res


def utm_grid(area: imagery.Area, epsg: int, res: int) -> UtmGrid:
    """The grid that holds the area, a colour sample's width beyond its edge."""
    from rasterio.crs import CRS
    from rasterio.warp import transform_bounds

    w, s, e, n = area.bounds_m()
    pad = area.cell_m
    w, s, e, n = transform_bounds(
        CRS.from_proj4(grid.ALBERS_PROJ4), CRS.from_epsg(epsg), w - pad, s - pad, e + pad, n + pad, densify_pts=64
    )
    west, east = int(np.floor(w / res)) * res, int(np.ceil(e / res)) * res
    south, north = int(np.floor(s / res)) * res, int(np.ceil(n / res)) * res
    return UtmGrid(epsg, res, west, north, (east - west) // res, (north - south) // res)


def source_window(g: UtmGrid, source_transform, source_shape: tuple[int, int]) -> tuple[int, int, int, int] | None:
    """The grid's part of a source raster, in the source's pixels: (col, row,
    width, height), or None if they do not meet. Offsets and sizes are whole
    multiples of the grid's pixel in the source's."""
    step = int(round(g.res / source_transform.a))
    c0 = int(round((g.west - source_transform.c) / source_transform.a))
    r0 = int(round((source_transform.f - g.north) / -source_transform.e))
    if c0 % step or r0 % step:
        raise ValueError(f"a source whose pixels are not on the {g.res} m grid")
    rows, cols = source_shape
    lo_c, lo_r = max(c0, 0), max(r0, 0)
    hi_c = min(c0 + g.width * step, cols - cols % step)
    hi_r = min(r0 + g.height * step, rows - rows % step)
    if hi_c <= lo_c or hi_r <= lo_r:
        return None
    return lo_c, lo_r, hi_c - lo_c, hi_r - lo_r


# --- the catalogue -----------------------------------------------------------


def post_json(url: str, body: dict) -> dict:
    request = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=120, context=SSL_CONTEXT) as response:
                return json.load(response)
        except OSError:
            if attempt == 4:
                raise
            time.sleep(5 * (attempt + 1))
    raise AssertionError


def epsg_of(properties: dict) -> int:
    code = properties.get("proj:epsg") or properties.get("proj:code")
    return int(str(code).split(":")[-1])


def relative_orbit(properties: dict) -> int | None:
    """The pass's relative orbit, which fixes where its swath falls: the
    catalogue gives it only inside the product's name (`..._R104_...`)."""
    if properties.get("sat:relative_orbit"):
        return int(properties["sat:relative_orbit"])
    found = re.search(r"_R(\d{3})_", properties.get("s2:product_uri", ""))
    return int(found.group(1)) if found else None


def search_items(bbox: list[float], query: dict) -> list[dict]:
    """Every item over a lon/lat box in the years composited that the query
    admits, as the catalogue lists them, trimmed to what this stage reads."""
    body: dict = {
        "collections": [COLLECTION],
        "bbox": bbox,
        "datetime": f"{FIRST_YEAR}-01-01T00:00:00Z/{LAST_YEAR}-12-31T23:59:59Z",
        "limit": 250,
        "query": query,
    }
    items = []
    while True:
        page = post_json(STAC_SEARCH, body)
        for f in page["features"]:
            p = f["properties"]
            if "visual" not in f["assets"] or "scl" not in f["assets"]:
                continue  # a few passes were published without their true colour
            items.append(
                {
                    "id": f["id"],
                    "datetime": p["datetime"],
                    "tile": p.get("grid:code") or p.get("s2:mgrs_tile"),
                    "epsg": epsg_of(p),
                    "sun": p.get("view:sun_elevation"),
                    "azimuth": p.get("view:sun_azimuth"),
                    "cloud": p.get("eo:cloud_cover"),
                    "nodata": p.get("s2:nodata_pixel_percentage"),
                    "orbit": relative_orbit(p),
                    "bbox": [round(v, 5) for v in f["bbox"]],
                    "visual": f["assets"]["visual"]["href"],
                    "scl": f["assets"]["scl"]["href"],
                }
            )
        after = [link for link in page.get("links", []) if link.get("rel") == "next"]
        if not after:
            break
        body = after[0].get("body", body)
    return sorted(items, key=lambda i: i["id"])


def search(area: imagery.Area) -> list[dict]:
    """Every item over a hero area that the catalogue says is not mostly cloud."""
    lons, lats = imagery.boundary_lonlat(area)
    bbox = [float(lons.min()), float(lats.min()), float(lons.max()), float(lats.max())]
    return search_items(bbox, {"eo:cloud_cover": {"lt": MAX_ITEM_CLOUD}})


def probe_item(area: imagery.Area, item: dict) -> dict:
    """How much of the area an item covers, and how much of that it sees
    clear: its classification read at a sixteenth of its resolution."""
    import rasterio
    from rasterio.crs import CRS
    from rasterio.warp import transform_bounds
    from rasterio.windows import from_bounds

    with rasterio.open("/vsicurl/" + item["scl"]) as ds:
        bounds = transform_bounds(CRS.from_proj4(grid.ALBERS_PROJ4), ds.crs, *area.bounds_m(), densify_pts=21)
        window = from_bounds(*bounds, ds.transform).round_offsets().round_lengths()
        shape = (max(1, int(window.height // 16)), max(1, int(window.width // 16)))
        scl = ds.read(1, window=window, out_shape=shape, boundless=True, fill_value=0)
    seen = scl > 0
    clear = np.isin(scl, CLEAR)
    return {
        "id": item["id"],
        "cover": round(float(seen.mean()), 4),
        "clear": round(float(clear.sum() / max(1, seen.sum())), 4),
    }


def catalogue(area: imagery.Area, workers: int = 16, root: Path | None = None) -> list[dict]:
    """The area's items with their probes, from the cache or the network."""
    from rasterio.env import Env

    here = source_dir(area.key, root)
    items_path, probe_path = here / "items.json", here / "probe.json"
    if items_path.exists():
        items = json.loads(items_path.read_text())
    else:
        items = search(area)
        here.mkdir(parents=True, exist_ok=True)
        items_path.write_text(json.dumps(items, indent=0) + "\n")
    probes = json.loads(probe_path.read_text()) if probe_path.exists() else {}
    todo = [i for i in items if i["id"] not in probes]
    if todo:
        print(f"  {area.key}: probing {len(todo)} of {len(items)} items", flush=True)
        with Env(**GDAL_ENV), ThreadPoolExecutor(workers) as pool:
            for result in pool.map(lambda i: probe_item(area, i), todo):
                probes[result["id"]] = {"cover": result["cover"], "clear": result["clear"]}
        probe_path.write_text(json.dumps(probes, indent=0, sort_keys=True) + "\n")
    return [{**i, **probes[i["id"]]} for i in items]


def select(items: list[dict], per_tile: int, min_clear: float = MIN_CLEAR, min_sun: float = MIN_SUN_DEG) -> list[dict]:
    """Each MGRS tile's clearest passes under a high sun, taken a month at a
    time: each month's clearest, then each month's second, and so on."""
    chosen = []
    by_tile: dict[str, list[dict]] = {}
    for item in items:
        if item["cover"] > 0 and item["clear"] >= min_clear and (item.get("sun") or 0) >= min_sun:
            by_tile.setdefault(item["tile"], []).append(item)
    for tile in sorted(by_tile):
        months: list[list[dict]] = [[] for _ in range(12)]
        for item in by_tile[tile]:
            months[int(item["datetime"][5:7]) - 1].append(item)
        for month in months:
            month.sort(key=lambda i: (-i["clear"], i["id"]))
        taken: list[dict] = []
        depth = 0
        while len(taken) < per_tile and any(len(m) > depth for m in months):
            for month in months:
                if depth < len(month) and len(taken) < per_tile:
                    taken.append(month[depth])
            depth += 1
        chosen.extend(taken)
    return sorted(chosen, key=lambda i: i["id"])


# --- reading ---------------------------------------------------------------


def window_path(area: str, item_id: str, root: Path | None = None) -> Path:
    return source_dir(area, root) / "windows" / f"{item_id}.tif"


def fetch_item(area: imagery.Area, g: UtmGrid, item: dict, root: Path | None = None) -> int:
    """One pass's part of the grid, colour and classification, cached as a
    four-band GeoTIFF on the grid's pixels. Returns the bytes written (0 if
    cached or outside the grid)."""
    import rasterio
    from affine import Affine

    dest = window_path(area.key, item["id"], root)
    if dest.exists():
        return 0
    with rasterio.open("/vsicurl/" + item["visual"]) as ds:
        if ds.crs.to_epsg() != g.epsg:
            return 0
        win = source_window(g, ds.transform, ds.shape)
        if win is None:
            return 0
        c, r, w, h = win
        step = g.res // int(round(ds.transform.a))
        rgb = ds.read(window=((r, r + h), (c, c + w)), out_shape=(3, h // step, w // step))
        west = ds.transform.c + c * ds.transform.a
        north = ds.transform.f + r * ds.transform.e
    with rasterio.open("/vsicurl/" + item["scl"]) as ds:
        # The classification is 20 m: the same ground, at its own pixels.
        sres = int(round(ds.transform.a))
        sc = int(round((west - ds.transform.c) / sres))
        sr = int(round((ds.transform.f - north) / sres))
        span_w, span_h = rgb.shape[2] * g.res // sres, rgb.shape[1] * g.res // sres
        scl = ds.read(1, window=((sr, sr + max(1, span_h)), (sc, sc + max(1, span_w))), boundless=True, fill_value=0)
    if sres > g.res:
        k = sres // g.res
        scl = np.repeat(np.repeat(scl, k, 0), k, 1)
    scl = scl[: rgb.shape[1], : rgb.shape[2]]
    if scl.shape != rgb.shape[1:]:
        scl = np.pad(scl, ((0, rgb.shape[1] - scl.shape[0]), (0, rgb.shape[2] - scl.shape[1])))
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".part")
    profile = {
        "driver": "GTiff",
        "width": rgb.shape[2],
        "height": rgb.shape[1],
        "count": 4,
        "dtype": "uint8",
        "crs": f"EPSG:{g.epsg}",
        "transform": Affine(g.res, 0.0, west, 0.0, -g.res, north),
        "compress": "deflate",
        "predictor": 2,
        "tiled": True,
        "blockxsize": 256,
        "blockysize": 256,
    }
    with rasterio.open(tmp, "w", **profile) as out:
        out.write(rgb, [1, 2, 3])
        out.write(scl, 4)
    tmp.replace(dest)
    return dest.stat().st_size


def area_epsg(items: list[dict]) -> int:
    """The zone most of the area's items are in; the rest are passed over."""
    zones: dict[int, int] = {}
    for item in items:
        zones[item["epsg"]] = zones.get(item["epsg"], 0) + 1
    return max(zones, key=lambda z: (zones[z], -z))


def fetch(area: imagery.Area, workers: int = 8, root: Path | None = None) -> dict:
    from rasterio.env import Env

    items = catalogue(area, root=root)
    res = READ_M[area.lattice]
    chosen = select(items, PER_TILE[res])
    g = utm_grid(area, area_epsg(chosen), res)
    todo = [i for i in chosen if not window_path(area.key, i["id"], root).exists()]
    print(f"  {area.key}: {len(chosen)} passes chosen of {len(items)}, {len(todo)} to read at {res} m", flush=True)
    started, done, written = time.monotonic(), 0, 0

    def one(item: dict) -> int:
        for attempt in range(4):
            try:
                return fetch_item(area, g, item, root)
            except Exception as error:  # noqa: BLE001 - the network, retried
                if attempt == 3:
                    print(f"    gave up on {item['id']}: {error}", flush=True)
                    return 0
                time.sleep(10 * (attempt + 1))
        return 0

    with Env(**GDAL_ENV), ThreadPoolExecutor(workers) as pool:
        for n in pool.map(one, todo):
            done += 1
            written += n
            if done % 10 == 0 or done == len(todo):
                dt = time.monotonic() - started
                print(f"    {done}/{len(todo)}  {written / 1e6:.0f} MB kept  {dt:.0f} s", flush=True)
    return {"area": area.key, "chosen": len(chosen), "read": len(todo), "bytes": written}


# --- the median --------------------------------------------------------------


def clear_mask(scl: np.ndarray, rgb: np.ndarray, res: float, margin_m: float = CLOUD_MARGIN_M) -> np.ndarray:
    """Where a pass sees the ground clear, and not near a cloud."""
    cloudy = imagery.dilate(np.isin(scl, CLOUDY), int(round(margin_m / res)))
    return np.isin(scl, CLEAR) & ~cloudy & (rgb.max(0) > 0)


def median_of(stack: np.ndarray, count: np.ndarray) -> np.ndarray:
    """The median of each pixel's first `count` values along axis 0, the
    rest being 255 (so they sort last): (n, h, w) uint8 to (h, w) float32."""
    ordered = np.sort(stack, axis=0)
    lo = np.clip((count - 1) // 2, 0, stack.shape[0] - 1)
    hi = np.clip(count // 2, 0, stack.shape[0] - 1)
    a = np.take_along_axis(ordered, lo[None].astype(np.intp), 0)[0].astype(np.float32)
    b = np.take_along_axis(ordered, hi[None].astype(np.intp), 0)[0].astype(np.float32)
    return (a + b) / 2


def build(area: imagery.Area, root: Path | None = None, strip: int = 256) -> Path | None:
    """The median of the area's clear views, on its UTM grid, with the
    number of views behind each pixel as a fourth band."""
    import rasterio
    from rasterio.windows import Window, from_bounds

    items = catalogue(area, root=root)
    res = READ_M[area.lattice]
    chosen = select(items, PER_TILE[res])
    if not chosen:
        return None
    g = utm_grid(area, area_epsg(chosen), res)
    files = [p for p in (window_path(area.key, i["id"], root) for i in chosen) if p.exists()]
    sources = [rasterio.open(p) for p in files]
    halo = int(round(CLOUD_MARGIN_M / res)) + 1
    rgb_out = np.zeros((3, g.height, g.width), np.uint8)
    views = np.zeros((g.height, g.width), np.uint16)
    started = time.monotonic()
    try:
        for r0 in range(0, g.height, strip):
            r1 = min(g.height, r0 + strip)
            north = g.north - r0 * res
            south = g.north - r1 * res
            layers: list[tuple[np.ndarray, np.ndarray]] = []
            for ds in sources:
                b = ds.bounds
                if b.bottom >= north or b.top <= south:
                    continue
                win = from_bounds(b.left, max(south - halo * res, b.bottom), b.right, min(north + halo * res, b.top), ds.transform)
                win = Window(0, round(win.row_off), ds.width, round(win.height))
                data = ds.read(window=win)
                mask = clear_mask(data[3], data[:3], res)
                top = ds.transform.f - win.row_off * res  # northing of the read's first row
                # Crop the halo, and place the pass's columns on the grid's.
                skip = int(round((top - north) / res)) if top > north else 0
                rows = min(data.shape[1] - skip, r1 - r0 - max(0, int(round((north - top) / res))))
                dest_r = max(0, int(round((north - top) / res)))
                dest_c = int(round((b.left - g.west) / res))
                layer = np.full((3, r1 - r0, g.width), 255, np.uint8)
                keep = np.zeros((r1 - r0, g.width), bool)
                c0, c1 = max(0, dest_c), min(g.width, dest_c + ds.width)
                if rows <= 0 or c1 <= c0:
                    continue
                src = data[:3, skip : skip + rows, c0 - dest_c : c1 - dest_c]
                m = mask[skip : skip + rows, c0 - dest_c : c1 - dest_c]
                layer[:, dest_r : dest_r + rows, c0:c1] = np.where(m[None], src, 255)
                keep[dest_r : dest_r + rows, c0:c1] = m
                if keep.any():
                    layers.append((layer, keep))
            if not layers:
                continue
            count = np.sum([k for _, k in layers], axis=0)
            for band in range(3):
                stack = np.stack([layer[band] for layer, _ in layers])
                rgb_out[band, r0:r1] = np.clip(np.round(median_of(stack, count)), 0, 255).astype(np.uint8)
            rgb_out[:, r0:r1][:, count == 0] = 0
            views[r0:r1] = count
            if r1 // 2048 != r0 // 2048 or r1 == g.height:
                print(f"    {area.key}: rows {r1}/{g.height}, {len(layers)} passes, {time.monotonic() - started:.0f} s", flush=True)
    finally:
        for ds in sources:
            ds.close()
    out = composite_path(area.key, root)
    out.parent.mkdir(parents=True, exist_ok=True)
    profile = {
        "driver": "GTiff",
        "width": g.width,
        "height": g.height,
        "count": 4,
        "dtype": "uint8",
        "crs": f"EPSG:{g.epsg}",
        "transform": g.transform(),
        "compress": "deflate",
        "predictor": 2,
        "tiled": True,
    }
    with rasterio.open(out, "w", **profile) as ds:
        ds.write(rgb_out, [1, 2, 3])
        ds.write(np.minimum(views, 255).astype(np.uint8), 4)
        ds.update_tags(source=f"{COLLECTION} {FIRST_YEAR}-{LAST_YEAR}", passes=str(len(files)), notice=NOTICE)
    return out


# --- the country round the southern scenes (F90) ---------------------------

#: The scenes whose country tiles are composited too: the south, where the
#: 2016 mosaic's country tiles are a fifth cloud.
SOUTH_SCENES = ("huangshan", "three-gorges", "karst", "first-bend")
#: A country tile's colour is 250 m, so each pass is read whole at 160 m:
#: the true colour's sixteenth overview and the classification's eighth,
#: which are the same grid.
COUNTRY_OVERVIEW = {"visual": 3, "scl": 2}
#: Passes read for each Sentinel-2 tile from each orbit that sees it, and
#: how cloudy the catalogue may call one. A whole tile's cloud is the
#: catalogue's own figure, so nothing is probed. By orbit, because most
#: tiles lie across the edge of two swaths: taken by tile alone, the passes
#: came from the orbit that sees more of it, and the strip only the other
#: sees was left with a view or two, a wedge of nothing (F90).
COUNTRY_PER_ORBIT = 16
COUNTRY_MAX_CLOUD = 30
#: Cloud grows by two 160 m pixels: the overview's average carries a
#: cloud's edge into its neighbours.
COUNTRY_CLOUD_MARGIN_M = 320
#: Country tiles searched at a time: a block this many tiles a side.
SEARCH_BLOCK = 4
COUNTRY = "country"


def mgrs_path(tile: str, root: Path | None = None) -> Path:
    return (root or data_root()) / "work" / "composite" / "mgrs" / f"{tile}.tif"


def mgrs_index_path(root: Path | None = None) -> Path:
    return (root or data_root()) / "work" / "composite" / "mgrs" / "index.json"


def country_region(packs_index: Path) -> set[tuple[int, int]]:
    """Every country tile a southern scene's pack holds."""
    index = json.loads(packs_index.read_text())
    out: set[tuple[int, int]] = set()
    for scene in index["scenes"]:
        if scene["id"] in SOUTH_SCENES:
            t = scene["tiles"]
            out.update((t[k], t[k + 1]) for k in range(0, len(t), 2))
    return out


def albers_tiles_of(bbox: list[float]) -> tuple[int, int, int, int]:
    """The country tiles a lon/lat box touches: (tx0, ty0, tx1, ty1), inclusive."""
    from rasterio.crs import CRS
    from rasterio.warp import transform_bounds

    w, s, e, n = transform_bounds(CRS.from_epsg(4326), CRS.from_proj4(grid.ALBERS_PROJ4), *bbox, densify_pts=21)
    size = grid.TILE_KM * 1000
    return (
        int((w - grid.ORIGIN_X_M) // size),
        int((s - grid.ORIGIN_Y_M) // size),
        int((e - grid.ORIGIN_X_M) // size),
        int((n - grid.ORIGIN_Y_M) // size),
    )


def country_catalogue(region: set[tuple[int, int]], workers: int = 8, root: Path | None = None) -> list[dict]:
    """Every clear, high-sun item over the region, from the cache or the
    network, searched a block of country tiles at a time."""
    here = source_dir(COUNTRY, root)
    path = here / "items.json"
    if path.exists():
        return json.loads(path.read_text())
    blocks: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for tx, ty in region:
        blocks.setdefault((tx // SEARCH_BLOCK, ty // SEARCH_BLOCK), []).append((tx, ty))
    query = {"eo:cloud_cover": {"lt": COUNTRY_MAX_CLOUD}, "view:sun_elevation": {"gte": MIN_SUN_DEG}}

    def one(tiles: list[tuple[int, int]]) -> list[dict]:
        xs, ys = [t[0] for t in tiles], [t[1] for t in tiles]
        area = imagery.Area("block", "country", grid.TILE_KM * 1000, min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1)
        lons, lats = imagery.boundary_lonlat(area)
        return search_items([float(lons.min()), float(lats.min()), float(lons.max()), float(lats.max())], query)

    print(f"  country: searching {len(blocks)} blocks of {len(region)} tiles", flush=True)
    found: dict[str, dict] = {}
    with ThreadPoolExecutor(workers) as pool:
        for items in pool.map(one, [blocks[k] for k in sorted(blocks)]):
            for item in items:
                found[item["id"]] = item
    items = sorted(found.values(), key=lambda i: i["id"])
    here.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(items, indent=0) + "\n")
    return items


def select_country(items: list[dict], region: set[tuple[int, int]], per_orbit: int = COUNTRY_PER_ORBIT) -> list[dict]:
    """Each Sentinel-2 tile over the region, from each orbit that sees it,
    the passes that see most of it clear - least cloud and least outside
    the swath - a month at a time."""
    by_tile: dict[tuple[str, int], list[dict]] = {}
    for item in items:
        tx0, ty0, tx1, ty1 = albers_tiles_of(item["bbox"])
        if any((tx, ty) in region for tx in range(tx0, tx1 + 1) for ty in range(ty0, ty1 + 1)):
            by_tile.setdefault((item["tile"], item.get("orbit") or 0), []).append(item)
    chosen = []
    per_tile = per_orbit
    for tile in sorted(by_tile):
        months: list[list[dict]] = [[] for _ in range(12)]
        for item in by_tile[tile]:
            months[int(item["datetime"][5:7]) - 1].append(item)
        seen = lambda i: (1 - (i.get("nodata") or 0) / 100) * (1 - (i.get("cloud") or 0) / 100)  # noqa: E731
        for month in months:
            month.sort(key=lambda i: (-seen(i), i["id"]))
        taken: list[dict] = []
        depth = 0
        while len(taken) < per_tile and any(len(m) > depth for m in months):
            for month in months:
                if depth < len(month) and len(taken) < per_tile:
                    taken.append(month[depth])
            depth += 1
        chosen.extend(taken)
    return sorted(chosen, key=lambda i: i["id"])


def fetch_country_item(item: dict, root: Path | None = None) -> int:
    """One pass read whole at 160 m, colour and classification on the one
    grid, cached as a four-band GeoTIFF."""
    import rasterio

    dest = source_dir(COUNTRY, root) / "windows" / f"{item['id']}.tif"
    if dest.exists():
        return 0
    with rasterio.open("/vsicurl/" + item["visual"], overview_level=COUNTRY_OVERVIEW["visual"]) as ds:
        rgb = ds.read()
        transform, crs = ds.transform, ds.crs
    with rasterio.open("/vsicurl/" + item["scl"], overview_level=COUNTRY_OVERVIEW["scl"]) as ds:
        scl = ds.read(1)
        if scl.shape != rgb.shape[1:] or not np.allclose(tuple(ds.transform)[:6], tuple(transform)[:6], atol=1e-3):
            raise ValueError(f"{item['id']}: the overviews are not one grid")
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".part")
    profile = {
        "driver": "GTiff", "width": rgb.shape[2], "height": rgb.shape[1], "count": 4, "dtype": "uint8",
        "crs": crs, "transform": transform, "compress": "deflate", "predictor": 2,
    }
    with rasterio.open(tmp, "w", **profile) as out:
        out.write(rgb, [1, 2, 3])
        out.write(scl, 4)
    tmp.replace(dest)
    return dest.stat().st_size


def fetch_country(packs_index: Path, workers: int = 16, root: Path | None = None) -> dict:
    from rasterio.env import Env

    region = country_region(packs_index)
    items = country_catalogue(region, root=root)
    chosen = select_country(items, region)
    todo = [i for i in chosen if not (source_dir(COUNTRY, root) / "windows" / f"{i['id']}.tif").exists()]
    tiles = len({i["tile"] for i in chosen})
    print(f"  country: {len(region)} tiles, {tiles} Sentinel-2 tiles, {len(chosen)} passes chosen of {len(items)}, {len(todo)} to read", flush=True)
    started, done, written = time.monotonic(), 0, 0

    def one(item: dict) -> int:
        for attempt in range(4):
            try:
                return fetch_country_item(item, root)
            except Exception as error:  # noqa: BLE001 - the network, retried
                if attempt == 3:
                    print(f"    gave up on {item['id']}: {error}", flush=True)
                    return 0
                time.sleep(10 * (attempt + 1))
        return 0

    with Env(**GDAL_ENV), ThreadPoolExecutor(workers) as pool:
        for n in pool.map(one, todo):
            done += 1
            written += n
            if done % 200 == 0 or done == len(todo):
                print(f"    {done}/{len(todo)}  {written / 1e6:.0f} MB kept  {time.monotonic() - started:.0f} s", flush=True)
    return {"area": COUNTRY, "tiles": tiles, "chosen": len(chosen), "read": len(todo), "bytes": written}


def build_country(packs_index: Path, root: Path | None = None) -> Path | None:
    """The median of the clear views of each Sentinel-2 tile from each
    orbit, on the tile's own 160 m grid, and an index of where each lies.

    By orbit as well as tile, because the two sides of a swath's edge are
    different days: one median over both steps where the edge crosses the
    tile. Kept apart, each orbit's median covers its own swath, and
    `imagery.country_archive_on` feathers them together across the tens of
    kilometres where swaths overlap."""
    import rasterio
    from rasterio.crs import CRS
    from rasterio.warp import transform_bounds

    region = country_region(packs_index)
    chosen = select_country(country_catalogue(region, root=root), region)
    by_unit: dict[str, list[Path]] = {}
    for item in chosen:
        path = source_dir(COUNTRY, root) / "windows" / f"{item['id']}.tif"
        if path.exists():
            by_unit.setdefault(f"{item['tile']}-R{item.get('orbit') or 0:03d}", []).append(path)
    if not by_unit:
        return None
    albers = CRS.from_proj4(grid.ALBERS_PROJ4)
    index: dict = {"region": sorted([tx, ty] for tx, ty in region), "tiles": {}}
    started = time.monotonic()
    for n, (unit, paths) in enumerate(sorted(by_unit.items()), 1):
        stack, keep = [], []
        for path in paths:
            with rasterio.open(path) as ds:
                data = ds.read()
                profile = ds.profile
                res = ds.transform.a
            stack.append(data[:3])
            keep.append(clear_mask(data[3], data[:3], res, COUNTRY_CLOUD_MARGIN_M))
        count = np.sum(keep, axis=0)
        if not (count >= MIN_VIEWS).any():
            continue  # an orbit that grazes the tile's corner
        rgb = np.zeros((3,) + count.shape, np.uint8)
        for band in range(3):
            layers = np.stack([np.where(k, layer[band], 255) for layer, k in zip(stack, keep)]).astype(np.uint8)
            rgb[band] = np.clip(np.round(median_of(layers, count)), 0, 255).astype(np.uint8)
        rgb[:, count == 0] = 0
        out = mgrs_path(unit, root)
        out.parent.mkdir(parents=True, exist_ok=True)
        profile.update(count=4, compress="deflate", predictor=2)
        with rasterio.open(out, "w", **profile) as ds:
            ds.write(rgb, [1, 2, 3])
            ds.write(np.minimum(count, 255).astype(np.uint8), 4)
            bounds = transform_bounds(ds.crs, albers, *ds.bounds, densify_pts=21)
        index["tiles"][unit] = {"file": out.name, "albers": [round(v) for v in bounds], "passes": len(paths)}
        if n % 100 == 0 or n == len(by_unit):
            print(f"    country: {n}/{len(by_unit)} tile-orbits, {time.monotonic() - started:.0f} s", flush=True)
    for stale in mgrs_path("x", root).parent.glob("*.tif"):
        if stale.stem not in index["tiles"]:
            stale.unlink()
    path = mgrs_index_path(root)
    path.write_text(json.dumps(index, indent=0, sort_keys=True) + "\n")
    return path


# --- the tone ---------------------------------------------------------------

#: Samples a composited area gives the tone fit, whatever its size, so each
#: area counts the same.
TONE_SAMPLES = 400_000


def fit_tones(areas: list[imagery.Area], root: Path | None = None) -> list[dict] | None:
    """One tone line for every composited area, fitted over the clear ground
    of all of them against the mosaic's, and written beside the composites.

    One line, not one an area: each area's mosaic is its own summer of 2016,
    and Guilin's is hazy where Tiger Leaping Gorge's is clear. Fitted an
    area at a time, the archive would take each one's haze back; pooled, it
    takes the mosaic's rendering and a typical sky's, and `meet_the_mosaic`
    settles each area's own at its edge (F89)."""
    rng = np.random.default_rng(0)
    archive: list[list[np.ndarray]] = [[], [], []]
    mosaic: list[list[np.ndarray]] = [[], [], []]
    for area in areas:
        composite = imagery.composite_on(area, root)
        if composite is None:
            continue
        rgb, valid = imagery.reproject_area(area, root)
        cleaned, cloud = imagery.clean_clouds(rgb, imagery.elevation_for(area, root), area.cell_m)
        hole = cloud | ~valid
        filled = imagery.fill(cleaned, hole)
        seen = composite[1] & ~hole
        where = np.flatnonzero(seen.ravel())
        if where.size == 0:
            continue
        pick = rng.choice(where, TONE_SAMPLES, replace=where.size < TONE_SAMPLES)
        for c in range(3):
            archive[c].append(composite[0][c].ravel()[pick])
            mosaic[c].append(filled[c].ravel()[pick])
    if not archive[0]:
        return None
    tone = imagery.fit_tone([np.concatenate(a) for a in archive], [np.concatenate(m) for m in mosaic])
    path = tone_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"channels": ["red", "green", "blue"], "tone": tone}, indent=1) + "\n")
    return tone


def load_tone(root: Path | None = None) -> list[dict]:
    path = tone_path(root)
    if not path.exists():
        raise FileNotFoundError(f"no {path}: `python -m nineskies.composite build` fits it")
    return json.loads(path.read_text())["tone"]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Composite the south's hero areas from the Sentinel-2 archive.")
    parser.add_argument("step", choices=["plan", "fetch", "build"])
    parser.add_argument("--world", type=Path, default=Path("dist-world/china"))
    parser.add_argument("--packs", type=Path, default=Path("app/public/packs/index.json"))
    parser.add_argument("--only", default=None, help="comma-separated hero area ids, or `country`")
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args(argv)

    keys = args.only.split(",") if args.only else [*SOUTH, COUNTRY]
    areas = {a.key: a for a in imagery.hero_areas(args.world)}
    with_country = COUNTRY in keys
    keys = [k for k in keys if k != COUNTRY]
    missing = [k for k in keys if k not in areas]
    if missing:
        print(f"no hero area {', '.join(missing)} in {args.world}", file=sys.stderr)
        return 1
    for key in keys:
        area = areas[key]
        if args.step == "plan":
            items = catalogue(area)
            res = READ_M[area.lattice]
            chosen = select(items, PER_TILE[res])
            months = np.bincount([int(i["datetime"][5:7]) - 1 for i in chosen], minlength=12)
            print(f"{key}: {len(items)} items, {len(chosen)} chosen at {res} m; by month {months.tolist()}")
        elif args.step == "fetch":
            print(fetch(area, args.workers))
        else:
            print(build(area))
    if with_country:
        if args.step == "plan":
            region = country_region(args.packs)
            items = country_catalogue(region)
            chosen = select_country(items, region)
            print(f"country: {len(region)} tiles, {len(items)} items, {len(chosen)} chosen over {len({i['tile'] for i in chosen})} Sentinel-2 tiles")
        elif args.step == "fetch":
            print(fetch_country(args.packs, max(args.workers, 16)))
        else:
            print(build_country(args.packs))
    if args.step == "build" and keys:
        # Over every composited area, not only those just built.
        tone = fit_tones([a for a in areas.values() if a.key in SOUTH])
        print(f"tone: {tone}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
