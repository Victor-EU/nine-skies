"""Sampling the built grid — what the golden probes actually read.

Everything here takes (lat, lon) and returns metres, so `probes.py` never
learns what a projection is.

**Distances here are metres, and the raster says how many cells that is.**
They used to be converted with `grid.RESOLUTION_M`, a frozen 1,000, which is
right for exactly one artefact: on the 1 km country grid a radius in cells and
a radius in kilometres are the same number, so nothing ever showed. Pointed at
stage 6's 100 m hero grid the same call searched **0.28 km for a 2 km radius**
(F50) — the same shape of fault as F46's `inlandKm`, a unit that was correct
by coincidence. The resolution now comes from the file that was opened.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np
import rasterio
from affine import Affine
from rasterio.crs import CRS
from rasterio.warp import transform as transform_points

from . import grid


@dataclass
class GridSampler:
    """Bilinear sampling of a built Albers raster, addressed in lat/lon."""

    path: Path

    def __post_init__(self) -> None:
        with rasterio.open(self.path) as ds:
            self.array: np.ndarray = ds.read(1)
            self.transform = ds.transform
            self.tags = ds.tags()
        self._inverse = ~self.transform
        self._wgs = CRS.from_epsg(4326)
        self._albers = CRS.from_proj4(grid.ALBERS_PROJ4)
        #: Metres per pixel, from the raster rather than from a constant.
        self.resolution_m: float = abs(self.transform.a)

    def _reach(self, radius_m: float) -> int:
        """A radius in metres as a whole number of this raster's cells."""
        return int(math.ceil(radius_m / self.resolution_m))

    def to_pixel(self, lat: float, lon: float) -> tuple[float, float]:
        xs, ys = transform_points(self._wgs, self._albers, [lon], [lat])
        col, row = self._inverse @ (xs[0], ys[0])
        return col - 0.5, row - 0.5  # cell centres, not corners

    def __call__(self, lat: float, lon: float) -> float:
        return self.elevation_m(lat, lon)

    def elevation_m(self, lat: float, lon: float) -> float:
        return self.elevation_at(*self.to_pixel(lat, lon))

    def elevation_at(self, col: float, row: float) -> float:
        """Bilinear, in pixel coordinates. One pixel is `self.resolution_m`."""
        height, width = self.array.shape
        if not (0 <= col <= width - 1 and 0 <= row <= height - 1):
            return float("nan")
        c0, r0 = int(math.floor(col)), int(math.floor(row))
        c1, r1 = min(c0 + 1, width - 1), min(r0 + 1, height - 1)
        fc, fr = col - c0, row - r0
        a = self.array
        top = a[r0, c0] * (1 - fc) + a[r0, c1] * fc
        bottom = a[r1, c0] * (1 - fc) + a[r1, c1] * fc
        return float(top * (1 - fr) + bottom * fr)

    def channel_m(self, lat: float, lon: float, radius_km: float = 2.0) -> float:
        """The lowest cell in a square window — where a river actually is.

        A 1 km cell straddling a gorge reports the wall as readily as the
        water. Until stage 3 burns HydroSHEDS centrelines, this is how a river
        waypoint finds its own channel; it is a measurement aid, not a fix, and
        `probe.py` reports both numbers so the difference stays visible.

        **Square, not round**, so the corners reach `radius_km * sqrt(2)` — a
        "2 km" search reaches 2.83 km diagonally. Named for the radius because
        that is the scale it is reasoned about at, and stated here because a
        search whose reach is 41 % larger than its name is exactly the kind of
        thing that decides a verdict quietly (F50).
        """
        return self.channel_at(*self.to_pixel(lat, lon), radius_km)

    def channel_at(self, col: float, row: float, radius_km: float) -> float:
        """The lowest cell in a square window, in pixel coordinates."""
        window = self._window(col, row, radius_km)
        if window is None:
            return float("nan")
        r0, r1, c0, c1 = window
        return float(self.array[r0:r1, c0:c1].min())

    def _window(
        self, col: float, row: float, radius_km: float
    ) -> tuple[int, int, int, int] | None:
        """(row0, row1, col0, col1) of the square every window read here uses.

        One definition, because the report counts what the searches read and
        a count kept beside the search rather than taken from it is the
        coverage line F58 found printing kilometre cells on a 90 m grid.
        """
        height, width = self.array.shape
        reach = self._reach(radius_km * 1000)
        c0, c1 = max(0, int(col) - reach), min(width, int(col) + reach + 1)
        r0, r1 = max(0, int(row) - reach), min(height, int(row) + reach + 1)
        if c0 >= c1 or r0 >= r1:
            return None
        return r0, r1, c0, c1

    def channel_cell(self, lat: float, lon: float, radius_km: float = 2.0) -> int | None:
        """The flat index of the cell `channel_m` reads, or None where it reads NaN.

        What a monotonic check compares is one cell per waypoint, and the
        cell is what a sill is measured between. Ties go to the first in
        row-major order, which is the one `numpy.argmin` finds.
        """
        window = self._window(*self.to_pixel(lat, lon), radius_km)
        if window is None:
            return None
        r0, r1, c0, c1 = window
        patch = self.array[r0:r1, c0:c1]
        k = int(np.argmin(patch))
        row, col = divmod(k, patch.shape[1])
        if math.isnan(float(patch[row, col])):
            return None
        return (r0 + row) * self.array.shape[1] + (c0 + col)

    def cells_read(self, points: Sequence[tuple[float, float]], radius_km: float) -> int:
        """How many distinct cells the windows around these points read."""
        read = np.zeros(self.array.shape, dtype=bool)
        for lat, lon in points:
            window = self._window(*self.to_pixel(lat, lon), radius_km)
            if window is not None:
                r0, r1, c0, c1 = window
                read[r0:r1, c0:c1] = True
        return int(read.sum())

    def window_m(
        self, lat: float, lon: float, radius_km: float
    ) -> tuple[float, float, float, float] | None:
        """(west, south, east, north) of the ground a window reads, projected."""
        window = self._window(*self.to_pixel(lat, lon), radius_km)
        if window is None:
            return None
        r0, r1, c0, c1 = window
        west, north = self.transform @ (c0, r0)
        east, south = self.transform @ (c1, r1)
        return west, south, east, north

    def cell_latlon(self, index: int) -> tuple[float, float]:
        """(lat, lon) of a cell's centre, from its flat index."""
        row, col = divmod(int(index), self.array.shape[1])
        x, y = self.transform @ (col + 0.5, row + 0.5)
        lons, lats = transform_points(self._albers, self._wgs, [x], [y])
        return float(lats[0]), float(lons[0])

    def disc_stats(self, lat: float, lon: float, radius_km: float) -> tuple[float, float]:
        """(mean, standard deviation) over a disc — for the lake flatness probe."""
        col, row = self.to_pixel(lat, lon)
        reach = self._reach(radius_km * 1000)
        window = self._window(col, row, radius_km)
        if window is None:
            return float("nan"), float("nan")
        r0, r1, c0, c1 = window
        patch = self.array[r0:r1, c0:c1]
        cols = np.arange(c0, c1)[None, :] - col
        rows = np.arange(r0, r1)[:, None] - row
        inside = (cols**2 + rows**2) <= reach**2
        values = patch[inside]
        if values.size == 0:
            return float("nan"), float("nan")
        return float(values.mean()), float(values.std())

    def relief_m(self, lat: float, lon: float, radius_km: float) -> float:
        """Max minus min over a square window — what tells a gorge from a slope."""
        window = self._window(*self.to_pixel(lat, lon), radius_km)
        if window is None:
            return float("nan")
        r0, r1, c0, c1 = window
        patch = self.array[r0:r1, c0:c1]
        return float(patch.max() - patch.min())

    def above_channel_m(self, lat: float, lon: float, radius_km: float = 2.0) -> float:
        """How far this point stands above the lowest ground near it.

        The column that tells a river from the wall above it. Relief cannot:
        a gorge floor and the cliff over it sit in the same 20 km box and
        report the same 3,800 m, which is why F49's landform check passed a
        waypoint standing **1,260 m above the Jinsha** and called it the
        river (F50). Near zero means the coordinate is on the water; a large
        number on a place whose landform is a river means it is not.
        """
        point = self.elevation_m(lat, lon)
        low = self.channel_m(lat, lon, radius_km)
        return point - low

    def walk(
        self,
        waypoints: Sequence[tuple[float, float]],
        stride_km: float,
        radius_km: float = 0.0,
    ) -> list[float]:
        """Sample a polyline at a fixed spacing, in the projected plane.

        The spacing is real kilometres because the projection is equal-area
        and one pixel is one grid cell, so this is the resolution the check
        is actually made at rather than whatever the waypoint list happens to
        be spaced at. `radius_km` of zero reads the cell; anything else reads
        the lowest cell within that radius.

        What it cannot do is follow a river. A polyline through a handful of
        waypoints is a chord across country, so walking it finely measures
        the ground under the chord -- see `probes.MonotonicProbe` for why
        that matters and finding F48 for what it measured.
        """
        read = (
            (lambda c, r: self.elevation_at(c, r))
            if radius_km <= 0
            else (lambda c, r: self.channel_at(c, r, radius_km))
        )
        pixels = [self.to_pixel(lat, lon) for lat, lon in waypoints]
        step_px = max(1e-6, stride_km * 1000 / self.resolution_m)
        out: list[float] = []
        for (c0, r0), (c1, r1) in zip(pixels, pixels[1:]):
            steps = max(1, round(math.hypot(c1 - c0, r1 - r0) / step_px))
            for i in range(steps):
                t = i / steps
                out.append(read(c0 + (c1 - c0) * t, r0 + (r1 - r0) * t))
        if pixels:
            out.append(read(*pixels[-1]))
        return out


class SourceSampler:
    """The 1″ source a hero area was cut from, over that area's ground only.

    The control a hero grid's sill is read against. A sill on the grid is the
    grid's own work only if the source has none at the same place, and
    whether it has is not something a window minimum can say: the lowest
    ground near a sill is the water below it as readily as a way through it,
    which is how F57 put a dam on the grid alone that the source has too
    (F58). The same flood asked of the source is what can.

    Read in the source's own cells and its own geographic grid, not warped
    onto the area's, because a warp is a resampling and a resampling is the
    thing under test. Cells whose centre falls outside the area's projected
    footprint are NaN, which `hydro.sill` treats as walls, so the source is
    flooded over the same ground the grid was and no other.
    """

    #: The source's own spacing, for a report to label its row with.
    LABEL = "the source, 1″"

    def __init__(self, vrt: Path, footprint: GridSampler) -> None:
        height, width = footprint.array.shape
        west, north = footprint.transform @ (0, 0)
        east, south = footprint.transform @ (width, height)
        # The footprint's outline in degrees, walked densely enough that the
        # bounding box of a curved edge does not clip it.
        steps = np.linspace(0.0, 1.0, 64)
        xs = np.concatenate([west + (east - west) * steps, np.full(64, east),
                             east - (east - west) * steps, np.full(64, west)])
        ys = np.concatenate([np.full(64, south), south + (north - south) * steps,
                             np.full(64, north), north - (north - south) * steps])
        wgs, albers = CRS.from_epsg(4326), CRS.from_proj4(grid.ALBERS_PROJ4)
        lons, lats = transform_points(albers, wgs, xs.tolist(), ys.tolist())

        with rasterio.open(vrt) as ds:
            inverse = ~ds.transform
            c0, r0 = inverse @ (min(lons), max(lats))
            c1, r1 = inverse @ (max(lons), min(lats))
            c0, r0 = max(0, math.floor(c0)), max(0, math.floor(r0))
            c1, r1 = min(ds.width, math.ceil(c1)), min(ds.height, math.ceil(r1))
            window = rasterio.windows.Window(c0, r0, c1 - c0, r1 - r0)
            array = ds.read(1, window=window).astype("float64")
            self.transform = ds.transform @ Affine.translation(c0, r0)
            if ds.nodata is not None:
                array[array == ds.nodata] = np.nan

        rows, cols = array.shape
        centre_lon = self.transform.c + (np.arange(cols) + 0.5) * self.transform.a
        centre_lat = self.transform.f + (np.arange(rows) + 0.5) * self.transform.e
        lon_grid = np.broadcast_to(centre_lon[None, :], array.shape)
        lat_grid = np.broadcast_to(centre_lat[:, None], array.shape)
        x, y = transform_points(wgs, albers, lon_grid.ravel().tolist(), lat_grid.ravel().tolist())
        self._x = np.asarray(x).reshape(array.shape)
        self._y = np.asarray(y).reshape(array.shape)
        outside = (self._x < west) | (self._x > east) | (self._y < south) | (self._y > north)
        array[outside] = np.nan
        self.array: np.ndarray = array

    def lowest_within(self, west: float, south: float, east: float, north: float) -> int | None:
        """The flat index of the lowest source cell centred in a projected box."""
        inside = (
            (self._x >= west) & (self._x <= east) & (self._y >= south) & (self._y <= north)
            & ~np.isnan(self.array)
        )
        if not inside.any():
            return None
        return int(np.argmin(np.where(inside, self.array, np.inf)))

    def cell_latlon(self, index: int) -> tuple[float, float]:
        """(lat, lon) of a cell's centre, from its flat index."""
        row, col = divmod(int(index), self.array.shape[1])
        return (
            float(self.transform.f + (row + 0.5) * self.transform.e),
            float(self.transform.c + (col + 0.5) * self.transform.a),
        )
