"""Siting — where a hero area goes, measured off the source rather than recalled.

**Why this module exists.** A hero area is sited on places from `places.py`,
and `hero.cut` refuses to write one that does not contain them, so an area can
only be as right as its coordinate. Twice now a coordinate written from memory
has been wrong in a way nothing caught: `tiger-leaping-gorge` sat 71 km from
the gorge and had reached five files (F49), and its replacement stood 1,260 m
up the wall above the river (F50). Both were fixed by measuring, and neither
measurement was kept. This is the third time, so it is kept.

**What it can check and what it cannot.** There is no gazetteer in this
repository and there is not going to be one, so nothing here can tell you that
a coordinate is *called* what you think. What it can do is hold a coordinate to
the claim its landform makes about the ground:

  `drama`   what the source reads in a box: relief, and the share of its own
            30 m cells past 45 deg and 60 deg. A `gorge` whose surroundings are
            as steep as the county next door is either the wrong coordinate or
            the wrong name, and this is the column that says so.
  `pools`   level water surfaces, by area. A reservoir or a lake is the one
            landform the source states outright -- it is flat to the metre over
            hundreds of square kilometres -- so a river place inside one can be
            put on the water instead of near it, which is what F50 needed.
  `walls`   how far the ground stands above that water within a short radius.
            A gorge is a *narrow* trench, so the radius is the measurement: at
            4 km a gorge and the basin below it read the same, and at 1 km they
            do not.

**Everything above the GDAL line is arithmetic**, on the same rule as `grid.py`
and `hero.py`: the part worth a test is the part a bare interpreter can run,
and the 13.9 GB is only needed to fetch the numbers to run it on.
"""

from __future__ import annotations

import argparse
import math
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from . import places
from .acquire import data_root, tile_name

SOURCE_ARCSEC = 3600

#: Sample (0, 0) of a GLO-30 tile is centred on its north-west corner -- the
#: same convention `hero.transform_for` uses, and the reason `mosaic.vrt_xml`
#: offsets its mosaic by half a pixel. Getting this wrong moves a coordinate
#: 15 m, which matters to nothing here and would matter to a seam.
CENTRE_ON_CORNER = True


def cell_metres(lat: float) -> tuple[float, float]:
    """(north-south, east-west) metres per 1 arcsecond cell at this latitude."""
    ns = 111_320.0 / SOURCE_ARCSEC
    return ns, ns * math.cos(math.radians(lat))


# ---------------------------------------------------------------- arithmetic


def slope_degrees(heights, ns_m: float, ew_m: float):
    """Steepest of the two axis neighbours, per cell, in degrees.

    The steepest rather than the gradient magnitude, deliberately: what is
    being counted is faces, and a cliff that falls along one axis is a cliff.
    The last row and column have no neighbour and are dropped, so the result
    is one smaller in each direction.
    """
    import numpy as np

    dv = np.abs(np.diff(heights, axis=0)) / ns_m
    dh = np.abs(np.diff(heights, axis=1)) / ew_m
    return np.degrees(np.arctan(np.maximum(dv[:, :-1], dh[:-1, :])))


def _sweep(a, k: int, fn):
    """Separable (2k+1)-square reduction by `fn`, wrapping at the edges.

    Wrapping is why every caller here masks a margin off before reading a
    maximum out: a window that straddles the edge of the box has walked round
    to the other side of it, and the honest fix is to ask for a bigger box
    rather than to invent ground.
    """
    import numpy as np

    rows = a
    out = a.copy()
    for d in range(1, k + 1):
        out = fn(out, np.roll(rows, d, 0))
        out = fn(out, np.roll(rows, -d, 0))
    cols = out
    final = out.copy()
    for d in range(1, k + 1):
        final = fn(final, np.roll(cols, d, 1))
        final = fn(final, np.roll(cols, -d, 1))
    return final


def box_max(a, k: int):
    import numpy as np

    return _sweep(a, k, np.fmax)


def box_min(a, k: int):
    import numpy as np

    return _sweep(a, k, np.fmin)


def box_share(hot, k: int):
    """The share of True in every (2k+1) square, as a fraction.

    A cumulative-sum box filter rather than a sweep, because the sweep above is
    O(k) passes and this is two. Float64 on purpose: a float32 running sum over
    a hundred million cells loses the last cells entirely.
    """
    import numpy as np

    def one(x):
        n = x.shape[0]
        c = np.zeros((n + 1, x.shape[1]), "float64")
        np.cumsum(x, axis=0, out=c[1:])
        lo = np.clip(np.arange(n) - k, 0, n)
        hi = np.clip(np.arange(n) + k + 1, 0, n)
        return c[hi] - c[lo]

    summed = np.ascontiguousarray(one(np.ascontiguousarray(one(hot).T)).T)
    return summed / float((2 * k + 1) ** 2)


def block_reduce(a, block: int):
    """(lowest, highest, mean) over `block` x `block` squares.

    The lowest is what finds a river: a mean over a 240 m square containing a
    100 m channel is mostly not channel, which is the same fault `probe.py`
    scales its channel tolerance for.
    """
    import numpy as np

    rows = a.shape[0] // block * block
    cols = a.shape[1] // block * block
    b = a[:rows, :cols].reshape(rows // block, block, cols // block, block)
    return (
        np.nanmin(b, axis=(1, 3)),
        np.nanmax(b, axis=(1, 3)),
        np.nanmean(b, axis=(1, 3)),
    )


@dataclass(frozen=True)
class Drama:
    """What the source says about the ground in a box, at its own resolution."""

    samples: int
    lowest_m: float
    highest_m: float
    relief_m: float
    sd_m: float
    slope_p50: float
    slope_p99: float
    share_45: float
    share_60: float

    def line(self, label: str) -> str:
        return (
            f"| {label} | {self.lowest_m:,.0f} m | {self.highest_m:,.0f} m | "
            f"{self.relief_m:,.0f} m | {self.slope_p50:.1f}° | "
            f"{self.slope_p99:.1f}° | {self.share_45:.1f} % | {self.share_60:.2f} % |"
        )


DRAMA_HEADER = (
    "| Box | Lowest | Highest | Relief | Slope p50 | Slope p99 | "
    "Past 45° | Past 60° |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
)


def drama(heights, lat: float) -> Drama:
    """The numbers a landform claim is held to."""
    import numpy as np

    ns, ew = cell_metres(lat)
    slope = slope_degrees(heights, ns, ew)
    return Drama(
        samples=int(np.isfinite(heights).sum()),
        lowest_m=float(np.nanmin(heights)),
        highest_m=float(np.nanmax(heights)),
        relief_m=float(np.nanmax(heights) - np.nanmin(heights)),
        sd_m=float(np.nanstd(heights)),
        slope_p50=float(np.nanpercentile(slope, 50)),
        slope_p99=float(np.nanpercentile(slope, 99)),
        share_45=float(100 * np.nanmean(slope > 45)),
        share_60=float(100 * np.nanmean(slope > 60)),
    )


# ---------------------------------------------------------------------- GDAL


def sample_lonlat(row: int, col: int, north: float, west: float) -> tuple[float, float]:
    """The lat/lon a sample of `read_box` is centred on."""
    return north - row / SOURCE_ARCSEC, west + col / SOURCE_ARCSEC


def sample_index(lat: float, lon: float, north: float, west: float) -> tuple[int, int]:
    """The `read_box` sample nearest a lat/lon. The inverse of `sample_lonlat`."""
    return (
        int(round((north - lat) * SOURCE_ARCSEC)),
        int(round((lon - west) * SOURCE_ARCSEC)),
    )


def on_arcseconds(tile, lat: int):
    """A GLO-30 tile on the 1" grid `read_box` indexes, whatever its spacing.

    Above 50 N a tile is 2,400 columns wide (`mosaic.SOURCE_COLUMNS`), and
    each 1" sample takes the source column nearest it -- the reading stage 2's
    mosaic makes of the same file (F71), so a coordinate sited here is sited
    on the ground the grid was cut from. Refused rather than read any other
    shape, which until F71 was a broadcasting error on the first tile north
    of Heihe.
    """
    from .mosaic import source_columns, stretch_columns

    columns = source_columns(lat)
    if tile.shape != (SOURCE_ARCSEC, columns):
        raise ValueError(
            f"a GLO-30 tile at {lat} N is {columns} x {SOURCE_ARCSEC}; this one is "
            f"{tile.shape[1]} x {tile.shape[0]}"
        )
    return stretch_columns(tile)


def read_box(south: int, north: int, west: int, east: int, source: Path | None = None):
    """The source over a whole-degree box, row 0 at `north`, col 0 at `west`.

    Voids come back as NaN rather than as -32767, so that a mean is a mean of
    ground. A cell that is not on disk stays NaN too, which is what makes a
    half-fetched box read as a hole instead of as sea level.
    """
    import numpy as np
    import rasterio

    source = source or data_root() / "source" / "cop30"
    a = SOURCE_ARCSEC
    out = np.full(((north - south) * a, (east - west) * a), np.nan, "float32")
    for lat in range(south, north):
        for lon in range(west, east):
            path = source / f"{tile_name(lat, lon)}.tif"
            if not path.exists():
                continue
            with rasterio.open(path) as src:
                tile = on_arcseconds(src.read(1).astype("float32"), lat)
            out[
                (north - 1 - lat) * a : (north - lat) * a,
                (lon - west) * a : (lon - west + 1) * a,
            ] = np.where(tile < -1000, np.nan, tile)
    return out


def read_around(lat: float, lon: float, radius_km: float, source: Path | None = None):
    """A square of source centred on a coordinate, stitched across tile edges."""
    import numpy as np

    dlat = radius_km / 111.32
    dlon = radius_km / (111.32 * math.cos(math.radians(lat)))
    south, north = math.floor(lat - dlat), math.ceil(lat + dlat)
    west, east = math.floor(lon - dlon), math.ceil(lon + dlon)
    box = read_box(south, north, west, east, source)
    r0, c0 = sample_index(lat + dlat, lon - dlon, north, west)
    r1, c1 = sample_index(lat - dlat, lon + dlon, north, west)
    return box[max(r0, 0) : r1 + 1, max(c0, 0) : c1 + 1]


# ------------------------------------------------------------------- reports


@dataclass(frozen=True)
class Spot:
    lat: float
    lon: float
    value: float
    ground_m: float


def steepest(
    south: int,
    north: int,
    west: int,
    east: int,
    window_km: float = 10.0,
    degrees: float = 60.0,
    apart_km: float = 12.0,
    top: int = 8,
    source: Path | None = None,
) -> list[Spot]:
    """Where in a box the ground is most nearly vertical, in windows.

    The answer a claim like *pillars* or *gorge* is checked against: if the
    coordinate you were given is not one of these and is not near one, the
    ground does not agree with the name. If they move when the window or the
    threshold moves, the search is doing the placing rather than the ground --
    which is the fault F50 named, and the one thing this report can catch
    about itself.
    """
    import numpy as np

    heights = read_box(south, north, west, east, source)
    mid = (south + north) / 2
    ns, ew = cell_metres(mid)
    hot = np.nan_to_num(slope_degrees(heights, ns, ew) > degrees).astype("float32")
    k = int(round(window_km * 1000 / ((ns + ew) / 2) / 2))
    share = box_share(hot, k) * 100
    margin = k + 1
    inner = np.full(share.shape, -1.0)
    inner[margin:-margin, margin:-margin] = share[margin:-margin, margin:-margin]
    return _pick(inner, heights, north, west, apart_km, top)


def _pick(score, heights, north, west, apart_km, top) -> list[Spot]:
    import numpy as np

    picked: list[Spot] = []
    for idx in np.argsort(score.ravel())[::-1]:
        row, col = divmod(int(idx), score.shape[1])
        if score[row, col] < 0:
            break
        lat, lon = sample_lonlat(row, col, north, west)
        if any(
            math.hypot(
                (lat - p.lat) * 111.32,
                (lon - p.lon) * 111.32 * math.cos(math.radians(lat)),
            )
            < apart_km
            for p in picked
        ):
            continue
        picked.append(
            Spot(lat, lon, float(score[row, col]), float(heights[row, col]))
        )
        if len(picked) >= top:
            break
    return picked


@dataclass(frozen=True)
class Pool:
    """A level water surface: the one landform the source states outright."""

    level_m: float
    area_km2: float
    west: float
    east: float
    south: float
    north: float


def pools(
    south: int,
    north: int,
    west: int,
    east: int,
    block: int = 8,
    flat_m: float = 1.0,
    top: int = 8,
    source: Path | None = None,
) -> list[Pool]:
    """Level surfaces in a box, biggest first, grouped by metre of elevation.

    Grouped rather than flood-filled on purpose. A reservoir is one level over
    its whole length, so a histogram of the elevation of still blocks finds it
    in one pass and cannot be split in two by a narrows the way a fill can.
    What it cannot do is tell two lakes at the same height apart, which is what
    the extent columns are for.
    """
    import numpy as np

    heights = read_box(south, north, west, east, source)
    lo, hi, _ = block_reduce(heights, block)
    still = np.isfinite(lo) & ((hi - lo) <= flat_m)
    ns, ew = cell_metres((south + north) / 2)
    km2 = (ns * block / 1000) * (ew * block / 1000)
    out: list[Pool] = []
    levels = np.rint(lo[still]).astype(int)
    for level, count in sorted(
        zip(*np.unique(levels, return_counts=True)), key=lambda t: -t[1]
    )[:top]:
        rows, cols = np.nonzero(still & (np.rint(lo) == level))
        lat_n, _ = sample_lonlat(int(rows.min()) * block, 0, north, west)
        lat_s, _ = sample_lonlat(int(rows.max()) * block, 0, north, west)
        _, lon_w = sample_lonlat(0, int(cols.min()) * block, north, west)
        _, lon_e = sample_lonlat(0, int(cols.max()) * block, north, west)
        out.append(
            Pool(float(level), float(count) * km2, lon_w, lon_e, lat_s, lat_n)
        )
    return out


@dataclass(frozen=True)
class Wall:
    lat: float
    lon: float
    water_m: float
    wall_near_m: float
    wall_far_m: float


def walls(
    south: int,
    north: int,
    west: int,
    east: int,
    level_m: float,
    band_m: float = 3.0,
    block: int = 8,
    near_km: float = 1.0,
    far_km: float = 4.0,
    apart_km: float = 12.0,
    top: int = 8,
    source: Path | None = None,
) -> list[Wall]:
    """The deepest-walled points on a level surface, ranked by the near radius.

    Two radii because one of them cannot tell a gorge from the basin below it:
    over the reservoir through the Three Gorges the far radius reads within a
    couple of hundred metres everywhere along a hundred and thirty kilometres,
    and the near one separates the three narrows from the open water between
    them by a factor of two.
    """
    import numpy as np

    heights = read_box(south, north, west, east, source)
    lo, hi, _ = block_reduce(heights, block)
    ns, ew = cell_metres((south + north) / 2)
    metres = (ns + ew) / 2 * block

    def k_for(km: float) -> int:
        return max(1, int(round(km * 1000 / metres)))

    pool = np.isfinite(lo) & ((hi - lo) <= 1.0) & (np.abs(lo - level_m) <= band_m)
    near = box_max(hi, k_for(near_km)) - lo
    far = box_max(hi, k_for(far_km)) - lo
    margin = k_for(far_km) + 1
    score = np.full(lo.shape, -1.0)
    score[margin:-margin, margin:-margin] = np.where(
        pool, near, -1.0
    )[margin:-margin, margin:-margin]

    out: list[Wall] = []
    for idx in np.argsort(score.ravel())[::-1]:
        row, col = divmod(int(idx), lo.shape[1])
        if score[row, col] < 0:
            break
        lat, lon = sample_lonlat(row * block, col * block, north, west)
        if any(
            math.hypot(
                (lat - w.lat) * 111.32,
                (lon - w.lon) * 111.32 * math.cos(math.radians(lat)),
            )
            < apart_km
            for w in out
        ):
            continue
        out.append(
            Wall(lat, lon, float(lo[row, col]), float(near[row, col]), float(far[row, col]))
        )
        if len(out) >= top:
            break
    return out


def on_water(
    lat: float, lon: float, level_m: float, radius_km: float = 1.0,
    source: Path | None = None,
) -> tuple[float, float, float]:
    """Move a coordinate the last few cells onto the water it is beside.

    `walls` answers on a 240 m block, and a block on a river is mostly not
    river. This is the step F50 had to do by hand: of the source's own 30 m
    cells within `radius_km` that read the pool's level, take the one nearest
    where we already are. Returns (lat, lon, elevation).
    """
    import numpy as np

    dlat = radius_km / 111.32
    dlon = radius_km / (111.32 * math.cos(math.radians(lat)))
    south, north = math.floor(lat - dlat), math.ceil(lat + dlat)
    west, east = math.floor(lon - dlon), math.ceil(lon + dlon)
    box = read_box(south, north, west, east, source)
    r0, c0 = sample_index(lat, lon, north, west)
    span = int(round(radius_km * 1000 / cell_metres(lat)[1]))
    best = None
    for row in range(max(r0 - span, 0), min(r0 + span + 1, box.shape[0])):
        for col in range(max(c0 - span, 0), min(c0 + span + 1, box.shape[1])):
            value = box[row, col]
            if not np.isfinite(value) or abs(value - level_m) > 1.0:
                continue
            d = math.hypot(row - r0, col - c0)
            if best is None or d < best[0]:
                best = (d, row, col, float(value))
    if best is None:
        return lat, lon, float("nan")
    _, row, col, value = best
    found_lat, found_lon = sample_lonlat(row, col, north, west)
    return found_lat, found_lon, value


# ----------------------------------------------------------------------- CLI


def _box(text: str) -> tuple[int, int, int, int]:
    south, north, west, east = (int(p) for p in text.split(","))
    return south, north, west, east


def every_place(radius_km: float = 5.0, source: Path | None = None) -> list[str]:
    """What the source reads around every coordinate this repository ships.

    `probe.py` prints the same question against the *built* world, which is
    1 km ground and cannot tell a gorge from the county it is in. This is the
    question at the source's own 30 m, where it can: a `gorge` reads four to
    twenty percent of its cells past 45 deg, a `city` on the plain reads
    under one, and a coordinate in the wrong valley reads like its
    neighbours rather than like its name.
    """
    import numpy as np

    lines = [
        f"| Place | Claims to be | Lowest | Highest | Relief | Past 45° | Past 60° |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for place in places.PLACES:
        box = read_around(place.lat, place.lon, radius_km, source)
        if not np.isfinite(box).any():
            lines.append(
                f"| {place.name} | {place.landform} | — | — | — | — | "
                f"not on disk |"
            )
            continue
        d = drama(box, place.lat)
        lines.append(
            f"| {place.name} | {place.landform} | {d.lowest_m:,.0f} m | "
            f"{d.highest_m:,.0f} m | {d.relief_m:,.0f} m | {d.share_45:.1f} % | "
            f"{d.share_60:.2f} % |"
        )
    return lines


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Site a hero area against the source rasters."
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    check = sub.add_parser("drama", help="what the source reads around a coordinate")
    check.add_argument("--at", required=True, help="lat,lon")
    check.add_argument("--radius-km", type=float, default=5.0)
    check.add_argument("--against", action="append", default=[],
                       help="lat,lon of a control box, repeatable")

    scan = sub.add_parser("scan", help="the steepest windows in a whole-degree box")
    scan.add_argument("--box", required=True, type=_box, help="south,north,west,east")
    scan.add_argument("--window-km", type=float, default=10.0)
    scan.add_argument("--degrees", type=float, default=60.0)
    scan.add_argument("--top", type=int, default=8)

    water = sub.add_parser("pools", help="level water surfaces in a box")
    water.add_argument("--box", required=True, type=_box)
    water.add_argument("--top", type=int, default=8)

    wall = sub.add_parser("walls", help="the deepest-walled points on a pool")
    wall.add_argument("--box", required=True, type=_box)
    wall.add_argument("--level", required=True, type=float)
    wall.add_argument("--near-km", type=float, default=1.0)
    wall.add_argument("--far-km", type=float, default=4.0)
    wall.add_argument("--top", type=int, default=8)
    wall.add_argument("--snap", action="store_true",
                      help="move each answer onto the water at 30 m")

    table = sub.add_parser("places", help="every shipped coordinate, at 30 m")
    table.add_argument("--radius-km", type=float, default=5.0)
    table.add_argument("--report", type=Path, default=None)

    args = parser.parse_args(argv)

    if args.cmd == "places":
        body = [
            "# Siting report — every coordinate, against the source",
            "",
            f"{date.today().isoformat()} · boxes {args.radius_km * 2:g} km to a "
            f"side at the source's own 30 m · generated by "
            f"`python -m nineskies.siting places`.",
            "",
            "`probe.py` asks this question against the *built* world, which is "
            "1 km ground and cannot tell a gorge from the county it sits in. "
            "This asks it at the resolution the world was cut from, where it "
            "can: a city on the plain reads under a tenth of a percent of its "
            "cells past 45°, a gorge reads five to twenty, and a coordinate in "
            "the wrong valley reads like its neighbours rather than like its "
            "name. It needs the 13.9 GB, so it is a report rather than a gate "
            "(F52).",
            "",
        ]
        body += every_place(args.radius_km)
        body.append("")
        report = "\n".join(body) + "\n"
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(report)
        print(report)
        return 0

    if args.cmd == "drama":
        print(DRAMA_HEADER)
        for text in [args.at, *args.against]:
            lat, lon = (float(p) for p in text.split(","))
            box = read_around(lat, lon, args.radius_km)
            print(drama(box, lat).line(f"{lat:.4f} N {lon:.4f} E"))
        return 0

    if args.cmd == "scan":
        south, north, west, east = args.box
        print(f"| Centre | Past {args.degrees:g}° in {args.window_km:g} km | Ground |")
        print("| --- | ---: | ---: |")
        for spot in steepest(south, north, west, east, args.window_km,
                             args.degrees, top=args.top):
            print(f"| {spot.lat:.4f} N {spot.lon:.4f} E | {spot.value:.2f} % | "
                  f"{spot.ground_m:,.0f} m |")
        return 0

    if args.cmd == "pools":
        south, north, west, east = args.box
        print("| Level | Area | Longitudes | Latitudes |")
        print("| ---: | ---: | --- | --- |")
        for pool in pools(south, north, west, east, top=args.top):
            print(f"| {pool.level_m:,.0f} m | {pool.area_km2:,.0f} km² | "
                  f"{pool.west:.3f} – {pool.east:.3f} E | "
                  f"{pool.south:.3f} – {pool.north:.3f} N |")
        return 0

    if args.cmd == "walls":
        south, north, west, east = args.box
        print(f"| Point | Water | Wall within {args.near_km:g} km | "
              f"Wall within {args.far_km:g} km |")
        print("| --- | ---: | ---: | ---: |")
        for w in walls(south, north, west, east, args.level,
                       near_km=args.near_km, far_km=args.far_km, top=args.top):
            lat, lon, water = w.lat, w.lon, w.water_m
            if args.snap:
                lat, lon, water = on_water(lat, lon, args.level)
            print(f"| {lat:.4f} N {lon:.4f} E | {water:,.0f} m | "
                  f"{w.wall_near_m:,.0f} m | {w.wall_far_m:,.0f} m |")
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
