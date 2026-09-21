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
        col, row = self._inverse * (xs[0], ys[0])
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
        height, width = self.array.shape
        reach = self._reach(radius_km * 1000)
        c0, c1 = max(0, int(col) - reach), min(width, int(col) + reach + 1)
        r0, r1 = max(0, int(row) - reach), min(height, int(row) + reach + 1)
        if c0 >= c1 or r0 >= r1:
            return float("nan")
        return float(self.array[r0:r1, c0:c1].min())

    def disc_stats(self, lat: float, lon: float, radius_km: float) -> tuple[float, float]:
        """(mean, standard deviation) over a disc — for the lake flatness probe."""
        col, row = self.to_pixel(lat, lon)
        height, width = self.array.shape
        reach = self._reach(radius_km * 1000)
        c0, c1 = max(0, int(col) - reach), min(width, int(col) + reach + 1)
        r0, r1 = max(0, int(row) - reach), min(height, int(row) + reach + 1)
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
        col, row = self.to_pixel(lat, lon)
        height, width = self.array.shape
        reach = self._reach(radius_km * 1000)
        c0, c1 = max(0, int(col) - reach), min(width, int(col) + reach + 1)
        r0, r1 = max(0, int(row) - reach), min(height, int(row) + reach + 1)
        if c0 >= c1 or r0 >= r1:
            return float("nan")
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
